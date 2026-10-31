-- M10: 커미션 정산 (근거: MOU 업무협약서 제6~8조, PLAN 기능 C)
-- - 산정: 소개 경로가 확인된 등록이 "등록 확정"(최종 등록 + 참가비 완납)이 되면 자동 생성
-- - 금액: 학원·프로그램별 특별 합의 금액 > 프로그램 1인당 금액 (학원 실수령액, 세무 비용은 본사 부담)
-- - 지급 예정일: 캠프 = 캠프 시작일 / 유학 = 완납일 후 영업일 10일(주말·공휴일 제외)
-- - 지급 제외(제7조⑤): 참가 전 취소 + 전액 환불 → 자동 제외, 부분 환불 → 보류(대표 판단), 허위·과장 분쟁 → 관리자 제외(사유)
-- - 학부모 화면·알림에는 커미션 정보를 절대 노출하지 않는다(내부 전용)

-- ---------------------------------------------------------------------------
-- 공휴일 (영업일 계산용) — 공식 자료로 확인해 입력, 관리자가 추가·수정
-- ---------------------------------------------------------------------------
create table public.holidays (
  date date primary key,
  name text not null,
  source text,
  verified boolean not null default true,
  created_by uuid references public.staff_profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- 2027년: 우주항공청 「2027년 월력요항」 보도자료(2026-06-29)에 날짜가 명시된 것은 verified,
-- 어린이날·부처님오신날은 보도자료 본문에 날짜가 없어 2차 자료 기준 → 관보로 확인 필요(verified = false)
insert into public.holidays (date, name, source, verified) values
  ('2026-12-25', '기독탄신일', '관공서의 공휴일에 관한 규정(고정 공휴일)', true),
  ('2027-01-01', '1월 1일', '우주항공청 2027 월력요항 보도자료', true),
  ('2027-02-06', '설 연휴', '우주항공청 2027 월력요항 보도자료', true),
  ('2027-02-07', '설날', '우주항공청 2027 월력요항 보도자료', true),
  ('2027-02-08', '설 연휴', '우주항공청 2027 월력요항 보도자료', true),
  ('2027-02-09', '설 연휴 대체공휴일', '우주항공청 2027 월력요항 보도자료', true),
  ('2027-03-01', '3·1절', '우주항공청 2027 월력요항 보도자료', true),
  ('2027-05-01', '노동절', '우주항공청 2027 월력요항 보도자료', true),
  ('2027-05-03', '노동절 대체공휴일', '우주항공청 2027 월력요항 보도자료', true),
  ('2027-05-05', '어린이날', '2차 자료 — 관보 확인 필요', false),
  ('2027-05-13', '부처님오신날', '2차 자료 — 관보 확인 필요', false),
  ('2027-06-06', '현충일', '우주항공청 2027 월력요항 보도자료', true),
  ('2027-07-17', '제헌절', '우주항공청 2027 월력요항 보도자료', true),
  ('2027-07-19', '제헌절 대체공휴일', '우주항공청 2027 월력요항 보도자료', true),
  ('2027-08-15', '광복절', '우주항공청 2027 월력요항 보도자료', true),
  ('2027-08-16', '광복절 대체공휴일', '우주항공청 2027 월력요항 보도자료', true),
  ('2027-09-14', '추석 연휴', '우주항공청 2027 월력요항 보도자료', true),
  ('2027-09-15', '추석', '우주항공청 2027 월력요항 보도자료', true),
  ('2027-09-16', '추석 연휴', '우주항공청 2027 월력요항 보도자료', true),
  ('2027-10-03', '개천절', '우주항공청 2027 월력요항 보도자료', true),
  ('2027-10-04', '개천절 대체공휴일', '우주항공청 2027 월력요항 보도자료', true),
  ('2027-10-09', '한글날', '우주항공청 2027 월력요항 보도자료', true),
  ('2027-10-11', '한글날 대체공휴일', '우주항공청 2027 월력요항 보도자료', true),
  ('2027-12-25', '기독탄신일', '우주항공청 2027 월력요항 보도자료', true),
  ('2027-12-27', '기독탄신일 대체공휴일', '우주항공청 2027 월력요항 보도자료', true)
on conflict (date) do nothing;

-- 영업일 더하기: 시작일 다음 날부터 주말·공휴일을 빼고 n번째 영업일 (src/domain/businessDays.ts 와 같다)
create or replace function public.add_business_days(p_from date, p_days integer)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  v_d date := p_from;
  v_left integer := greatest(p_days, 0);
begin
  while v_left > 0 loop
    v_d := v_d + 1;
    if extract(isodow from v_d) < 6 and not exists (select 1 from public.holidays where date = v_d) then
      v_left := v_left - 1;
    end if;
  end loop;
  return v_d;
end;
$$;

-- ---------------------------------------------------------------------------
-- 학원·프로그램별 특별 합의 금액 (단체 3인 이상 인센티브 등)
-- ---------------------------------------------------------------------------
create table public.commission_overrides (
  partner_id uuid not null references public.partners (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  amount bigint not null check (amount >= 0),
  memo text,
  created_by uuid references public.staff_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (partner_id, program_id)
);

insert into public.settings (key, value) values
  ('commission', '{"referral_rate": 0, "study_business_days": 10, "objection_days": 7}'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 커미션
-- ---------------------------------------------------------------------------
create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations (id) on delete restrict,
  program_id uuid not null references public.programs (id) on delete restrict,
  -- base: 소개 학원 커미션 / referral: 학원 간 소개 수수료(소개해 준 학원, 1단계만)
  kind text not null default 'base' check (kind in ('base', 'referral')),
  partner_id uuid not null references public.partners (id) on delete restrict,
  partner_contact_id uuid references public.partner_contacts (id) on delete set null,
  -- 받는 사람: 학원(기본) 또는 상담실장 개인 (PLAN C1)
  recipient_type text not null default 'partner' check (recipient_type in ('partner', 'contact')),
  amount bigint check (amount >= 0),
  basis_date date,          -- 완납일
  due_date date,            -- 지급 예정일
  status text not null default 'scheduled' check (status in ('scheduled', 'paid', 'held', 'excluded', 'canceled')),
  status_reason text,
  -- true: 시스템이 정한 상태(완납·취소·환불에 따라 자동으로 바뀜) / false: 관리자가 직접 정함
  auto_status boolean not null default true,
  paid_on date,
  paid_by uuid references public.staff_profiles (id) on delete set null,
  pay_memo text,
  -- 지급 후 취소·환불 등 관리자 검토가 필요한 사항
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (registration_id, kind),
  constraint commissions_paid check (status <> 'paid' or paid_on is not null),
  constraint commissions_reason check (status not in ('held', 'excluded', 'canceled') or status_reason is not null)
);
create index on public.commissions (partner_id);
create index on public.commissions (status, due_date);
create index on public.commissions (program_id);

create trigger set_updated_at before update on public.commissions for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.commission_overrides for each row execute function public.set_updated_at();
create trigger audit after insert or update or delete on public.commissions for each row execute function public.audit_row('pay_memo');
create trigger audit after insert or update or delete on public.commission_overrides for each row execute function public.audit_row();
create trigger audit after insert or update or delete on public.holidays for each row execute function public.audit_row();

-- ---------------------------------------------------------------------------
-- 자동 산정·상태 동기화
-- ---------------------------------------------------------------------------
create or replace function public.sync_commissions(p_registration_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.registrations;
  p public.programs;
  v_amount bigint;
  v_basis date;
  v_due date;
  v_rate numeric;
  v_days integer;
  v_referrer uuid;
  v_refund public.refunds;
  v_status text;
  v_reason text;
begin
  select * into r from public.registrations where id = p_registration_id;
  if not found then
    return;
  end if;
  select * into p from public.programs where id = r.program_id;
  select coalesce((value ->> 'referral_rate')::numeric, 0), coalesce((value ->> 'study_business_days')::int, 10)
    into v_rate, v_days from public.settings where key = 'commission';

  if r.status = 'confirmed' and r.partner_id is not null and r.attribution_confirmed_at is not null then
    -- 완납일 = 예약금·잔금 마지막 납부일
    select max(pm.paid_at) into v_basis
    from public.payments pm join public.payment_schedules s on s.id = pm.schedule_id
    where s.registration_id = r.id and s.kind in ('deposit', 'balance') and pm.status = 'confirmed' and s.canceled_at is null;
    v_due := case when p.type = 'camp' then p.start_date
                  else public.add_business_days(coalesce(v_basis, public.kst_today()), coalesce(v_days, 10)) end;
    select coalesce(
      (select amount from public.commission_overrides where partner_id = r.partner_id and program_id = p.id),
      p.commission_amount
    ) into v_amount;
    v_status := case when v_amount is null then 'held' else 'scheduled' end;
    v_reason := case when v_amount is null then '1인당 커미션 금액 미정 — 캠프 설정에서 입력' end;

    insert into public.commissions (registration_id, program_id, kind, partner_id, partner_contact_id, amount, basis_date, due_date, status, status_reason)
    values (r.id, p.id, 'base', r.partner_id, r.partner_contact_id, v_amount, v_basis, v_due, v_status, v_reason)
    on conflict (registration_id, kind) do update
      set partner_id = excluded.partner_id, partner_contact_id = excluded.partner_contact_id,
          amount = excluded.amount, basis_date = excluded.basis_date, due_date = excluded.due_date,
          status = excluded.status, status_reason = excluded.status_reason
      where public.commissions.auto_status and public.commissions.status in ('scheduled', 'held', 'canceled');

    -- 학원 간 소개 수수료 (1단계, 요율이 정해진 경우만)
    select referred_by_partner_id into v_referrer from public.partners where id = r.partner_id;
    if v_referrer is not null and v_rate > 0 then
      insert into public.commissions (registration_id, program_id, kind, partner_id, amount, basis_date, due_date, status, status_reason)
      values (r.id, p.id, 'referral', v_referrer, case when v_amount is null then null else round(v_amount * v_rate)::bigint end,
              v_basis, v_due, v_status, v_reason)
      on conflict (registration_id, kind) do update
        set partner_id = excluded.partner_id, amount = excluded.amount, basis_date = excluded.basis_date,
            due_date = excluded.due_date, status = excluded.status, status_reason = excluded.status_reason
        where public.commissions.auto_status and public.commissions.status in ('scheduled', 'held', 'canceled');
    end if;
    return;
  end if;

  if r.status in ('canceled', 'refunded') then
    select * into v_refund from public.refunds where registration_id = r.id order by created_at desc limit 1;
    if r.status = 'refunded' and v_refund.final_amount >= v_refund.paid_total and v_refund.requested_at < p.start_date then
      v_status := 'canceled';
      v_reason := '참가 전 취소·전액 환불 — 지급 제외(협약서 제7조⑤)';
    elsif r.status = 'refunded' then
      v_status := 'held';
      v_reason := '부분 환불 — 대표 판단 필요';
    elsif not exists (
      select 1 from public.payments pm join public.payment_schedules s on s.id = pm.schedule_id
      where s.registration_id = r.id and pm.status = 'confirmed'
    ) then
      v_status := 'canceled';
      v_reason := '참가 취소(납부 없음) — 지급 제외';
    else
      v_status := 'held';
      v_reason := '취소 — 환불 처리 대기';
    end if;
    update public.commissions set status = v_status, status_reason = v_reason
    where registration_id = r.id and auto_status and status in ('scheduled', 'held', 'canceled');
    update public.commissions set review_note = '지급 후 ' || case when r.status = 'refunded' then '환불' else '취소' end || ' — 환수 여부 검토'
    where registration_id = r.id and status = 'paid' and review_note is null;
    return;
  end if;

  -- 확정에서 내려간 경우(납부 무효 등): 아직 지급 전이면 보류
  update public.commissions set status = 'held', status_reason = '등록 확정 해제(완납 아님·소개 경로 확인 해제)'
  where registration_id = r.id and auto_status and status = 'scheduled';
end;
$$;

create or replace function public.registrations_after_status_commission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sync_commissions(new.id);
  return null;
end;
$$;
create trigger registrations_after_status_commission
  after update of status, partner_id, partner_contact_id, attribution_confirmed_at on public.registrations
  for each row execute function public.registrations_after_status_commission();

-- 환불 완료가 기록되면(등록 상태 변경 전후 모두) 다시 판단
create or replace function public.refunds_after_commission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sync_commissions(new.registration_id);
  return null;
end;
$$;
create trigger refunds_after_commission after insert or update on public.refunds
  for each row execute function public.refunds_after_commission();

-- 1인당 금액·특별 합의 금액이 바뀌면 지급 전 커미션 다시 계산
create or replace function public.resync_program_commissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  for v_id in
    select r.id from public.registrations r
    where r.program_id = new.id and r.status = 'confirmed'
  loop
    perform public.sync_commissions(v_id);
  end loop;
  return null;
end;
$$;
create trigger programs_after_commission after update of commission_amount, start_date, type on public.programs
  for each row execute function public.resync_program_commissions();

create or replace function public.overrides_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  for v_id in
    select r.id from public.registrations r
    where r.program_id = coalesce(new.program_id, old.program_id)
      and r.partner_id = coalesce(new.partner_id, old.partner_id) and r.status = 'confirmed'
  loop
    perform public.sync_commissions(v_id);
  end loop;
  return null;
end;
$$;
create trigger overrides_after_change after insert or update or delete on public.commission_overrides
  for each row execute function public.overrides_after_change();

-- ---------------------------------------------------------------------------
-- 관리자 처리: 지급 / 보류 / 제외 / 보류 해제. 사유 필수.
-- ---------------------------------------------------------------------------
create or replace function public.pay_commissions(p_ids uuid[], p_paid_on date, p_memo text)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_n integer;
begin
  if not public.is_admin() then
    raise exception '커미션 지급 처리는 관리자만 할 수 있습니다' using errcode = '42501';
  end if;
  if p_paid_on is null or p_paid_on > public.kst_today() then
    raise exception '지급일을 확인해 주세요' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.commissions where id = any (p_ids) and (status <> 'scheduled' or amount is null)) then
    raise exception '지급 예정 상태이고 금액이 정해진 건만 지급 처리할 수 있습니다' using errcode = 'P0001';
  end if;
  update public.commissions
     set status = 'paid', paid_on = p_paid_on, paid_by = (select auth.uid()), pay_memo = nullif(trim(p_memo), ''),
         status_reason = null, auto_status = false
   where id = any (p_ids);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public.set_commission_status(p_id uuid, p_status text, p_reason text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c public.commissions;
begin
  if not public.is_admin() then
    raise exception '커미션 상태는 관리자만 바꿀 수 있습니다' using errcode = '42501';
  end if;
  select * into c from public.commissions where id = p_id for update;
  if not found then
    raise exception '커미션을 찾을 수 없습니다' using errcode = 'P0001';
  end if;
  if c.status = 'paid' then
    raise exception '지급 완료된 건은 바꿀 수 없습니다(검토 메모로 남겨 주세요)' using errcode = 'P0001';
  end if;
  if p_status in ('held', 'excluded') then
    if coalesce(trim(p_reason), '') = '' then
      raise exception '사유를 적어 주세요' using errcode = 'P0001';
    end if;
    update public.commissions set status = p_status, status_reason = trim(p_reason), auto_status = false where id = p_id;
  elsif p_status = 'scheduled' then
    if c.amount is null then
      raise exception '금액이 정해지지 않아 지급 예정으로 바꿀 수 없습니다' using errcode = 'P0001';
    end if;
    update public.commissions set status = 'scheduled', status_reason = null, auto_status = false where id = p_id;
  else
    raise exception '바꿀 수 없는 상태입니다' using errcode = 'P0001';
  end if;
end;
$$;

-- 관리자: 자동 판단으로 되돌리기
create or replace function public.reset_commission_auto(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있습니다' using errcode = '42501';
  end if;
  update public.commissions set auto_status = true where id = p_id and status <> 'paid';
  perform public.sync_commissions((select registration_id from public.commissions where id = p_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- 조회 뷰 (내부 전용). 학생 이름은 파기 후 남지 않는다(등록에서 지워지므로).
-- ---------------------------------------------------------------------------
create view public.v_commissions
with (security_invoker = true)
as
select
  c.*,
  (c.status = 'scheduled' and c.due_date < public.kst_today()) as overdue,
  pa.name as partner_name, pa.code as partner_code,
  pc.name as contact_name,
  pr.name as program_name, pr.season as program_season, pr.type as program_type, pr.start_date as program_start,
  r.student_name_ko, r.partner_share_agreed, r.registered_on, r.status as registration_status, r.destroyed_at,
  (select min(s.due_date) from public.payment_schedules s where s.registration_id = r.id and s.kind = 'deposit') as deposit_due,
  (select coalesce(sum(pm.amount), 0) from public.payments pm join public.payment_schedules s on s.id = pm.schedule_id
     where s.registration_id = r.id and s.kind = 'deposit' and pm.status = 'confirmed')::bigint as deposit_paid
from public.commissions c
join public.partners pa on pa.id = c.partner_id
left join public.partner_contacts pc on pc.id = c.partner_contact_id
join public.programs pr on pr.id = c.program_id
join public.registrations r on r.id = c.registration_id;

-- ---------------------------------------------------------------------------
-- RLS·권한: 직원 열람, 관리자 처리(함수). 직접 쓰기 없음. 현지 팀·비로그인 불가.
-- ---------------------------------------------------------------------------
alter table public.holidays enable row level security;
alter table public.commission_overrides enable row level security;
alter table public.commissions enable row level security;

create policy holidays_select on public.holidays for select to authenticated using (public.is_staff_or_admin());
create policy holidays_write on public.holidays for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy overrides_select on public.commission_overrides for select to authenticated using (public.is_staff_or_admin());
create policy overrides_write on public.commission_overrides for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy commissions_select on public.commissions for select to authenticated using (public.is_staff_or_admin());
create policy commissions_update on public.commissions for update to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.holidays, public.commission_overrides, public.commissions, public.v_commissions from anon;
revoke insert, delete on public.commissions from authenticated;
grant select on public.v_commissions to authenticated;

revoke execute on function
  public.add_business_days(date, integer),
  public.sync_commissions(uuid),
  public.registrations_after_status_commission(),
  public.refunds_after_commission(),
  public.resync_program_commissions(),
  public.overrides_after_change(),
  public.pay_commissions(uuid[], date, text),
  public.set_commission_status(uuid, text, text),
  public.reset_commission_auto(uuid)
from public, anon, authenticated;

grant execute on function
  public.add_business_days(date, integer),
  public.pay_commissions(uuid[], date, text),
  public.set_commission_status(uuid, text, text),
  public.reset_commission_auto(uuid)
to authenticated;
