-- M5: 캠프 만들기 — 모집 시작일·커미션(내부 전용)·신청서 링크 잠금·복제

alter table public.programs
  add column recruit_start_date date,
  -- 1인당 커미션(학원 실수령액). null = 아직 정하지 않음(고지 필요). 공개 함수로는 절대 노출하지 않는다.
  add column commission_amount bigint check (commission_amount >= 0),
  -- 협약서 제8조: 개시 30일 전까지 서면 고지 → 고지한 날 기록
  add column commission_notice_sent_on date,
  add column slug_locked boolean not null default false;

-- 배포된 신청서 링크(slug)는 관리자만 바꿀 수 있다
create or replace function public.guard_locked_slug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.slug_locked and new.slug is distinct from old.slug and not public.is_admin() then
    raise exception '배포된 신청서 링크는 관리자만 바꿀 수 있습니다' using errcode = '42501';
  end if;
  if old.slug_locked and not new.slug_locked and not public.is_admin() then
    raise exception '링크 잠금은 관리자만 풀 수 있습니다' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_locked_slug before update of slug, slug_locked on public.programs
  for each row execute function public.guard_locked_slug();

-- ---------------------------------------------------------------------------
-- 캠프 복제: 다음 기수를 빠르게 만든다. 날짜는 출국일 차이만큼 함께 이동하고,
-- "신청 후 N일·출국 N일 전" 규칙은 그대로 다시 계산된다. 커미션 고지 기록·링크 잠금은 초기화.
-- ---------------------------------------------------------------------------
create or replace function public.duplicate_program(
  p_program_id uuid,
  p_new_start date,
  p_new_season text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_src public.programs;
  v_delta integer;
  v_new_id uuid;
  v_slug text;
  v_try integer := 1;
begin
  select * into v_src from public.programs where id = p_program_id;
  if not found then
    raise exception '원본 프로그램을 찾을 수 없습니다' using errcode = 'P0001';
  end if;
  v_delta := p_new_start - v_src.start_date;

  -- 새 링크 주소: 원본 + 출국 연월, 겹치면 번호를 붙인다
  v_slug := left(regexp_replace(v_src.slug, '-[0-9]{6}(-[0-9]+)?$', ''), 50) || '-' || to_char(p_new_start, 'YYYYMM');
  while exists (select 1 from public.programs where slug = v_slug || case when v_try = 1 then '' else '-' || v_try end) loop
    v_try := v_try + 1;
  end loop;
  if v_try > 1 then
    v_slug := v_slug || '-' || v_try;
  end if;

  insert into public.programs (
    type, name, season, country, start_date, end_date, capacity, total_price, status, slug, description,
    form_config, waitlist_enabled, refund_policy_text, refund_policy_version, refund_rules, third_party_recipients,
    passport_upload_enabled, health_field_enabled, destroy_after_days, copied_from, created_by,
    recruit_start_date, commission_amount
  ) values (
    v_src.type, v_src.name, coalesce(nullif(trim(p_new_season), ''), v_src.season), v_src.country,
    p_new_start, v_src.end_date + v_delta, v_src.capacity, v_src.total_price, 'before', v_slug, v_src.description,
    v_src.form_config, v_src.waitlist_enabled, v_src.refund_policy_text, 1, v_src.refund_rules, v_src.third_party_recipients,
    v_src.passport_upload_enabled, v_src.health_field_enabled, v_src.destroy_after_days, v_src.id, (select auth.uid()),
    v_src.recruit_start_date + v_delta, v_src.commission_amount
  )
  returning id into v_new_id;

  insert into public.program_payment_rules (program_id, kind, label, amount, due_rule_type, due_fixed_date, due_offset_days, sort)
  select v_new_id, kind, label, amount, due_rule_type, due_fixed_date + v_delta, due_offset_days, sort
  from public.program_payment_rules where program_id = p_program_id;

  insert into public.program_milestones (program_id, title, date, category, show_dday, memo)
  select v_new_id, title, date + v_delta, category, show_dday, memo
  from public.program_milestones where program_id = p_program_id;

  return v_new_id;
end;
$$;

-- 등록 인원(정원 대비 현황) — 대기·취소·환불 제외
create or replace function public.program_enrollment_counts()
returns table (program_id uuid, enrolled bigint, waitlisted bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id,
    (select count(*) from public.registrations r
      where r.program_id = p.id and r.deleted_at is null and r.status not in ('waitlisted', 'canceled', 'refunded')),
    (select count(*) from public.registrations r
      where r.program_id = p.id and r.deleted_at is null and r.status = 'waitlisted')
  from public.programs p;
$$;

revoke execute on function
  public.guard_locked_slug(),
  public.duplicate_program(uuid, date, text),
  public.program_enrollment_counts()
from public, anon, authenticated;

grant execute on function
  public.duplicate_program(uuid, date, text),
  public.program_enrollment_counts()
to authenticated;
