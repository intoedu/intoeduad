-- M9: 등록생·납부·환불 관리
-- 등록 상태 자동 갱신(PLAN 결정 5): 신청 접수 →(직원 접수 확인) 예약금 대기 → 예약금 완료 → 잔금 기한 D-14 잔금 대기
--   → 예약금+잔금 완납 + 소개 경로 확인 시 등록 확정. 대기·취소·환불은 직원 처리.

create extension if not exists pg_cron;

alter table public.payment_schedules
  -- 금액·기한을 바꾼 이유(필수). 변경 전후 값은 activity_logs에 남는다.
  add column change_reason text;

alter table public.registrations
  -- 납부 안내 이후 금액·기한이 바뀐 시각 / 정정 안내를 보낸 시각(M13 알림톡 정정 1회)
  add column payment_changed_at timestamptz,
  add column payment_correction_sent_at timestamptz;

alter table public.refunds
  add constraint refunds_final_nonneg check (final_amount is null or final_amount >= 0);

-- ---------------------------------------------------------------------------
-- 상태 계산 (src/domain/registrationStatus.ts 와 같은 규칙)
-- ---------------------------------------------------------------------------
create or replace function public.compute_registration_status(p_registration_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_reg public.registrations;
  v_dep_paid boolean;
  v_all_paid boolean;
  v_bal_due date;
  v_days integer;
begin
  if (select auth.uid()) is not null and not public.is_staff_or_admin() then
    return null;
  end if;
  select * into v_reg from public.registrations where id = p_registration_id;
  if not found then
    return null;
  end if;
  -- 직원 처리 상태는 그대로
  if v_reg.status not in ('deposit_pending', 'deposit_paid', 'balance_pending', 'confirmed') then
    return v_reg.status;
  end if;

  select
    coalesce(bool_and(paid_amount >= amount_due) filter (where kind = 'deposit'), true),
    coalesce(bool_and(paid_amount >= amount_due) filter (where kind in ('deposit', 'balance')), false),
    min(due_date) filter (where kind = 'balance')
  into v_dep_paid, v_all_paid, v_bal_due
  from public.v_payment_schedules
  where registration_id = p_registration_id and canceled_at is null;

  select coalesce((value ->> 'balance_pending_days_before_due')::int, 14) into v_days
  from public.settings where key = 'registration_status_rules';

  if v_all_paid and v_reg.attribution_confirmed_at is not null then
    return 'confirmed';
  elsif v_dep_paid and (v_all_paid or (v_bal_due is not null and v_bal_due - public.kst_today() <= coalesce(v_days, 14))) then
    return 'balance_pending';
  elsif v_dep_paid then
    return 'deposit_paid';
  end if;
  return 'deposit_pending';
end;
$$;

create or replace function public.apply_registration_status(p_registration_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next text := public.compute_registration_status(p_registration_id);
begin
  if v_next is null then
    return;
  end if;
  update public.registrations set status = v_next
  where id = p_registration_id and status is distinct from v_next;
end;
$$;

-- 납부·납부 일정이 바뀌면 상태 재계산
create or replace function public.payments_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.apply_registration_status(
    (select registration_id from public.payment_schedules where id = coalesce(new.schedule_id, old.schedule_id))
  );
  return null;
end;
$$;
-- 메모만 바뀔 때(파기 등)는 다시 계산하지 않는다
create trigger payments_after_change after insert or update of status, amount, schedule_id on public.payments
  for each row execute function public.payments_after_change();

create or replace function public.schedules_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.apply_registration_status(coalesce(new.registration_id, old.registration_id));
  return null;
end;
$$;
create trigger schedules_after_change after insert or update or delete on public.payment_schedules
  for each row execute function public.schedules_after_change();

-- 소개 경로 확인이 바뀌면 상태 재계산(완납 + 확인 → 등록 확정)
create or replace function public.registrations_after_attribution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.apply_registration_status(new.id);
  return null;
end;
$$;
create trigger registrations_after_attribution after update of attribution_confirmed_at on public.registrations
  for each row execute function public.registrations_after_attribution();

-- 매일 잔금 D-14 등 날짜 기준 상태 갱신 (KST 00:10)
create or replace function public.refresh_registration_statuses()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_n integer := 0;
begin
  for v_id in
    select r.id from public.registrations r
    join public.programs p on p.id = r.program_id
    where r.status in ('deposit_pending', 'deposit_paid', 'balance_pending', 'confirmed')
      and r.deleted_at is null and p.end_date >= public.kst_today() - 1
  loop
    perform public.apply_registration_status(v_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

select cron.schedule('refresh-registration-statuses', '10 15 * * *', $$select public.refresh_registration_statuses()$$);

-- ---------------------------------------------------------------------------
-- 납부 기록: 기록자 자동, 기록 후에는 무효 처리만 가능
-- ---------------------------------------------------------------------------
create or replace function public.guard_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.recorded_by := coalesce((select auth.uid()), new.recorded_by);
    new.status := 'confirmed';
    new.voided_at := null;
    new.voided_by := null;
    return new;
  end if;
  if new.amount is distinct from old.amount or new.schedule_id is distinct from old.schedule_id
     or new.paid_at is distinct from old.paid_at or new.method is distinct from old.method then
    raise exception '기록된 납부는 고칠 수 없습니다. 무효 처리 후 다시 기록해 주세요' using errcode = 'P0001';
  end if;
  if old.status = 'void' and new.status <> 'void' then
    raise exception '무효 처리된 납부는 되돌릴 수 없습니다' using errcode = 'P0001';
  end if;
  if new.status = 'void' and old.status <> 'void' then
    new.voided_at := now();
    new.voided_by := (select auth.uid());
  end if;
  return new;
end;
$$;
create trigger guard_payment before insert or update on public.payments
  for each row execute function public.guard_payment();

-- 납부 일정 금액·기한 변경: 사유 필수 + 정정 안내 필요 표시
create or replace function public.guard_schedule_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.amount_due is distinct from old.amount_due or new.due_date is distinct from old.due_date)
     and (select auth.uid()) is not null then
    if coalesce(trim(new.change_reason), '') = '' or new.change_reason is not distinct from old.change_reason then
      raise exception '금액·기한을 바꾼 이유를 적어 주세요' using errcode = 'P0001';
    end if;
    update public.registrations set payment_changed_at = now() where id = new.registration_id;
  end if;
  return new;
end;
$$;
create trigger guard_schedule_change before update on public.payment_schedules
  for each row execute function public.guard_schedule_change();

-- ---------------------------------------------------------------------------
-- 환불 공제율 (src/domain/refund.ts 와 같은 규칙)
-- 출국까지 남은 일수(출국 당일 = 0)가 [min_days, max_days] 구간에 드는 첫 규칙. null은 제한 없음.
-- ---------------------------------------------------------------------------
create or replace function public.refund_deduction_rate(p_rules jsonb, p_days integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select (r ->> 'rate')::numeric
  from jsonb_array_elements(case when jsonb_typeof(p_rules) = 'array' then p_rules else '[]'::jsonb end) with ordinality as t(r, i)
  where (r ->> 'min_days' is null or p_days >= (r ->> 'min_days')::int)
    and (r ->> 'max_days' is null or p_days <= (r ->> 'max_days')::int)
  order by i
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 직원 처리
-- ---------------------------------------------------------------------------

-- 접수 확인: 신청 접수 → 예약금 대기(이후 자동)
create or replace function public.confirm_registration_receipt(p_registration_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.registrations set status = 'deposit_pending'
  where id = p_registration_id and status = 'received';
  if not found then
    raise exception '신청 접수 상태에서만 접수 확인할 수 있습니다' using errcode = 'P0001';
  end if;
  perform public.apply_registration_status(p_registration_id);
  return (select status from public.registrations where id = p_registration_id);
end;
$$;

-- 대기 → 승격: 정원 확인(프로그램 잠금), 승격일을 등록일로 납부 일정 생성(PLAN 결정 6)
create or replace function public.promote_waitlisted(p_registration_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_reg public.registrations;
  v_prog public.programs;
begin
  select * into v_reg from public.registrations where id = p_registration_id;
  if not found or v_reg.status <> 'waitlisted' then
    raise exception '대기 상태인 신청만 승격할 수 있습니다' using errcode = 'P0001';
  end if;
  select * into v_prog from public.programs where id = v_reg.program_id for update;
  if v_prog.capacity is not null and public.program_enrolled_count(v_prog.id) >= v_prog.capacity then
    raise exception '정원이 차 있어 승격할 수 없습니다. 정원을 늘리거나 취소 건을 먼저 처리해 주세요' using errcode = 'P0001';
  end if;
  update public.registrations
     set status = 'received', registered_on = public.kst_today(),
         passport_status = case when v_prog.passport_upload_enabled then 'pending' else 'not_required' end
   where id = p_registration_id;
  insert into public.payment_schedules (registration_id, kind, label, amount_due, due_date, created_from_rule_id, sort)
  select p_registration_id, s.kind, s.label, s.amount, s.due_date, s.rule_id, s.sort
  from public.compute_payment_schedule(v_prog.id, public.kst_today()) s;
end;
$$;

-- 취소: 미납 일정 취소 + 납부액이 있으면 환불 예상액 계산(최종 금액은 담당자가 확정)
create or replace function public.cancel_registration(
  p_registration_id uuid,
  p_requested_on date,
  p_reason_type text,
  p_memo text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_reg public.registrations;
  v_prog public.programs;
  v_paid bigint;
  v_days integer;
  v_rate numeric;
  v_expected bigint;
  v_refund uuid;
begin
  if p_reason_type not in ('customer', 'company', 'force_majeure', 'mid_return') then
    raise exception '취소 사유를 선택해 주세요' using errcode = 'P0001';
  end if;
  select * into v_reg from public.registrations where id = p_registration_id for update;
  if not found or v_reg.status in ('canceled', 'refunded') then
    raise exception '이미 취소된 신청입니다' using errcode = 'P0001';
  end if;
  select * into v_prog from public.programs where id = v_reg.program_id;

  select coalesce(sum(p.amount), 0) into v_paid
  from public.payments p join public.payment_schedules s on s.id = p.schedule_id
  where s.registration_id = p_registration_id and p.status = 'confirmed';

  v_days := v_prog.start_date - p_requested_on;
  if p_reason_type = 'customer' then
    v_rate := coalesce(public.refund_deduction_rate(v_prog.refund_rules, v_days), 0);
    -- 공제 기준은 총 참가비(추가 항목 제외, PLAN 결정 7)
    v_expected := greatest(v_paid - round(v_prog.total_price * v_rate)::bigint, 0);
  elsif p_reason_type = 'company' then
    v_rate := 0;
    v_expected := v_paid;
  else
    -- 불가항력(실비 공제)·중도 귀국(현지 기관 규정)은 담당자가 금액을 정한다
    v_rate := null;
    v_expected := null;
  end if;

  update public.registrations set status = 'canceled', canceled_at = now(),
    destroy_due_date = case when v_paid = 0 then least(destroy_due_date, public.kst_today() + v_prog.destroy_after_days) else destroy_due_date end
  where id = p_registration_id;
  update public.payment_schedules set canceled_at = now()
  where registration_id = p_registration_id and canceled_at is null;

  if v_paid > 0 then
    insert into public.refunds (registration_id, reason_type, requested_at, days_before_start, deduction_rate, paid_total, expected_amount, memo)
    values (p_registration_id, p_reason_type, p_requested_on, v_days, v_rate, v_paid, v_expected, nullif(trim(p_memo), ''))
    returning id into v_refund;
  end if;
  return v_refund;
end;
$$;

-- 환불 완료: 최종 금액 확정 → 등록 상태 "환불", 파기 기준일 = 환불 완료 + N일(PLAN 결정 N7)
create or replace function public.process_refund(p_refund_id uuid, p_final_amount bigint, p_memo text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_refund public.refunds;
begin
  select * into v_refund from public.refunds where id = p_refund_id for update;
  if not found or v_refund.processed_at is not null then
    raise exception '이미 처리된 환불입니다' using errcode = 'P0001';
  end if;
  if p_final_amount is null or p_final_amount < 0 or p_final_amount > coalesce(v_refund.paid_total, 0) then
    raise exception '환불 금액은 0원 이상, 납부 합계 이하여야 합니다' using errcode = 'P0001';
  end if;
  update public.refunds
     set final_amount = p_final_amount, processed_at = now(), processed_by = (select auth.uid()),
         memo = coalesce(nullif(trim(p_memo), ''), memo)
   where id = p_refund_id;
  update public.registrations r
     set status = 'refunded',
         destroy_due_date = least(r.destroy_due_date, public.kst_today() + p.destroy_after_days)
    from public.programs p
   where r.id = v_refund.registration_id and p.id = r.program_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 목록용 뷰 (호출자 권한 → RLS 그대로: 현지 팀은 볼 수 없음)
-- ---------------------------------------------------------------------------
create view public.v_registration_board
with (security_invoker = true)
as
select
  r.id, r.program_id, r.status, r.registered_on, r.created_at,
  r.student_name_ko, r.parent_name, r.parent_phone, r.passport_status,
  r.partner_id, r.attribution_confirmed_at, r.destroyed_at, r.lead_id,
  p.name as program_name, p.season as program_season, p.start_date as program_start,
  pa.name as partner_name,
  coalesce(s.total_due, 0)::bigint as total_due,
  coalesce(s.total_paid, 0)::bigint as total_paid,
  coalesce(s.overdue_count, 0)::int as overdue_count,
  s.next_due_date,
  coalesce(s.core_paid, false) as core_paid
from public.registrations r
join public.programs p on p.id = r.program_id
left join public.partners pa on pa.id = r.partner_id
left join lateral (
  select
    sum(v.amount_due) as total_due,
    sum(v.paid_amount) as total_paid,
    count(*) filter (where v.status = 'overdue') as overdue_count,
    min(v.due_date) filter (where v.status in ('scheduled', 'partial', 'overdue')) as next_due_date,
    bool_and(v.paid_amount >= v.amount_due) filter (where v.kind in ('deposit', 'balance')) as core_paid
  from public.v_payment_schedules v
  where v.registration_id = r.id and v.canceled_at is null
) s on true
where r.deleted_at is null;

-- 납부 상태 뷰에 변경 사유 추가(기존 열 순서 유지, 끝에 추가)
create or replace view public.v_payment_schedules
with (security_invoker = true)
as
select
  s.id, s.registration_id, s.kind, s.label, s.amount_due, s.due_date, s.created_from_rule_id, s.sort,
  s.canceled_at, s.created_at, s.updated_at,
  coalesce(p.paid, 0)::bigint as paid_amount,
  case
    when s.canceled_at is not null then 'canceled'
    when coalesce(p.paid, 0) >= s.amount_due then 'paid'
    when s.due_date < public.kst_today() then 'overdue'
    when coalesce(p.paid, 0) > 0 then 'partial'
    else 'scheduled'
  end as status,
  s.change_reason
from public.payment_schedules s
left join (
  select schedule_id, sum(amount) as paid
  from public.payments
  where status = 'confirmed'
  group by schedule_id
) p on p.schedule_id = s.id;

create view public.v_payment_board
with (security_invoker = true)
as
select
  v.id, v.registration_id, v.kind, v.label, v.amount_due, v.due_date, v.paid_amount, v.status, v.canceled_at, v.change_reason,
  r.student_name_ko, r.parent_name, r.status as registration_status, r.destroyed_at,
  r.program_id, p.name as program_name, p.season as program_season
from public.v_payment_schedules v
join public.registrations r on r.id = v.registration_id and r.deleted_at is null
join public.programs p on p.id = r.program_id;

-- ---------------------------------------------------------------------------
-- 권한
-- ---------------------------------------------------------------------------
revoke execute on function
  public.compute_registration_status(uuid),
  public.apply_registration_status(uuid),
  public.payments_after_change(),
  public.schedules_after_change(),
  public.registrations_after_attribution(),
  public.refresh_registration_statuses(),
  public.guard_payment(),
  public.guard_schedule_change(),
  public.refund_deduction_rate(jsonb, integer),
  public.confirm_registration_receipt(uuid),
  public.promote_waitlisted(uuid),
  public.cancel_registration(uuid, date, text, text),
  public.process_refund(uuid, bigint, text)
from public, anon, authenticated;

grant execute on function
  public.compute_registration_status(uuid),
  public.apply_registration_status(uuid),
  public.program_enrolled_count(uuid),
  public.refund_deduction_rate(jsonb, integer),
  public.confirm_registration_receipt(uuid),
  public.promote_waitlisted(uuid),
  public.cancel_registration(uuid, date, text, text),
  public.process_refund(uuid, bigint, text)
to authenticated;

revoke all on public.v_registration_board, public.v_payment_board from anon;
grant select on public.v_registration_board, public.v_payment_board to authenticated;
