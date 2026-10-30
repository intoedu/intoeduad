-- M2: MOU 학원 관리 확장 — 상담실장(담당자)·협약·커미션 지급 계좌·학원 간 소개·소개 경로 확인
-- 근거: 운영 매뉴얼 06 MOU 학원 관리 v2 (B2B 학원 업무협약서)

-- ---------------------------------------------------------------------------
-- 학원 기본 정보 확장 (협약서 제1조 기재 사항 + 서면 고지용 이메일)
-- ---------------------------------------------------------------------------
alter table public.partners
  add column email text,
  add column address text,
  add column business_registration_no text
    check (business_registration_no ~ '^[0-9]{10}$'),
  -- 학원 간 소개 수수료(1단계만): 이 학원을 소개한 학원
  add column referred_by_partner_id uuid references public.partners (id) on delete set null,
  add constraint partners_not_self_referred check (referred_by_partner_id is null or referred_by_partner_id <> id);

create index on public.partners (referred_by_partner_id);

-- ---------------------------------------------------------------------------
-- 학원 담당자(원장·상담실장 등) — 실장별 신청 링크·QR로 소개 경로를 자동 기록
-- ---------------------------------------------------------------------------
create table public.partner_contacts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  name text not null,
  role text not null default 'counselor' check (role in ('director', 'counselor', 'staff', 'other')),
  phone text check (phone ~ '^[0-9]{9,11}$'),
  email text,
  -- 링크용 코드: /apply/{학원코드}?c={담당자코드}
  code text not null check (code ~ '^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$'),
  code_locked boolean not null default false,
  active boolean not null default true,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partner_id, code)
);
create index on public.partner_contacts (partner_id);

-- ---------------------------------------------------------------------------
-- 협약 (기본형/독점권형, 인투유학판/상담실장판)
-- ---------------------------------------------------------------------------
create table public.partner_agreements (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  -- 상담실장판 협약(개인과 계약)인 경우 상대방 담당자
  contact_id uuid references public.partner_contacts (id) on delete set null,
  agreement_type text not null default 'basic' check (agreement_type in ('basic', 'exclusive')),
  form text not null default 'into' check (form in ('into', 'counselor')),
  start_date date not null,
  end_date date not null,
  -- 제4조②: 종료 14일 전까지 서면 해지 통보가 없으면 1년씩 자동 연장
  auto_renew boolean not null default true,
  exclusive_region text,
  signed_on date,
  termination_notified_on date,
  terminated_on date,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agreement_dates check (end_date >= start_date),
  constraint agreement_exclusive_region check (agreement_type <> 'exclusive' or nullif(trim(exclusive_region), '') is not null),
  constraint agreement_counselor_contact check (form <> 'counselor' or contact_id is not null)
);
create index on public.partner_agreements (partner_id);

-- 협약 상태 계산: 자동 연장을 반영한 "현재 유효 종료일"과 상태
create or replace function public.agreement_effective_end(
  p_end date,
  p_auto_renew boolean,
  p_terminated_on date,
  p_today date default public.kst_today()
)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when p_terminated_on is not null then least(p_end, p_terminated_on)
    when not p_auto_renew or p_end >= p_today then p_end
    -- 지난 종료일을 1년 단위로 오늘 이후까지 연장
    else (p_end + make_interval(years => (extract(year from age(p_today - 1, p_end))::int + 1)))::date
  end;
$$;

create view public.v_partner_agreements
with (security_invoker = true)
as
select
  a.*,
  public.agreement_effective_end(a.end_date, a.auto_renew, a.terminated_on) as effective_end_date,
  case
    when a.terminated_on is not null and a.terminated_on <= public.kst_today() then 'terminated'
    when a.start_date > public.kst_today() then 'scheduled'
    when public.agreement_effective_end(a.end_date, a.auto_renew, a.terminated_on) < public.kst_today() then 'expired'
    -- 해지 통보 기한(종료 14일 전) 안쪽이면 갱신 검토 필요
    when public.agreement_effective_end(a.end_date, a.auto_renew, a.terminated_on) - public.kst_today() <= 14 then 'renewal_window'
    else 'active'
  end as status
from public.partner_agreements a;

-- ---------------------------------------------------------------------------
-- 커미션 지급 계좌 (학원 또는 개인 담당자)
-- ---------------------------------------------------------------------------
create table public.payout_accounts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid unique references public.partners (id) on delete cascade,
  contact_id uuid unique references public.partner_contacts (id) on delete cascade,
  bank_name text not null,
  account_number text not null check (account_number ~ '^[0-9-]{6,30}$'),
  account_holder text not null,
  -- 원천징수(본사 부담) / 세금계산서 / 계산서 — 세무 확인 후 확정
  settlement_method text not null default 'withholding'
    check (settlement_method in ('withholding', 'tax_invoice', 'invoice')),
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payout_subject check (num_nonnulls(partner_id, contact_id) = 1)
);

-- ---------------------------------------------------------------------------
-- 상담 신청·등록의 소개 경로 확인 (커미션 대상 확정의 전제)
-- ---------------------------------------------------------------------------
alter table public.leads
  add column partner_contact_id uuid references public.partner_contacts (id) on delete set null,
  add column attribution_source text check (attribution_source in ('link', 'form', 'staff')),
  add column attribution_confirmed_at timestamptz,
  add column attribution_confirmed_by uuid references public.staff_profiles (id) on delete set null;

alter table public.registrations
  add column partner_contact_id uuid references public.partner_contacts (id) on delete set null,
  add column attribution_source text check (attribution_source in ('link', 'form', 'staff')),
  add column attribution_confirmed_at timestamptz,
  add column attribution_confirmed_by uuid references public.staff_profiles (id) on delete set null;

create index on public.leads (partner_contact_id);
create index on public.registrations (partner_contact_id);

-- 담당자는 반드시 해당 학원 소속이어야 함
create or replace function public.check_contact_belongs_to_partner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.partner_contact_id is not null and not exists (
    select 1 from public.partner_contacts
    where id = new.partner_contact_id and partner_id is not distinct from new.partner_id
  ) then
    raise exception '선택한 담당자가 해당 학원 소속이 아닙니다' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger check_contact_partner before insert or update of partner_id, partner_contact_id on public.leads
  for each row execute function public.check_contact_belongs_to_partner();
create trigger check_contact_partner before insert or update of partner_id, partner_contact_id on public.registrations
  for each row execute function public.check_contact_belongs_to_partner();

-- 소개 경로가 확인된 뒤에는 관리자만 바꿀 수 있다 (변경 내역은 감사 기록에 남음)
create or replace function public.guard_confirmed_attribution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.attribution_confirmed_at is not null
     and (new.partner_id is distinct from old.partner_id
          or new.partner_contact_id is distinct from old.partner_contact_id)
     and not public.is_admin()
     -- 예약 작업·Edge Function(service role)의 파기 처리 등은 허용
     and (select auth.uid()) is not null
  then
    raise exception '소개 경로가 확인된 건은 관리자만 변경할 수 있습니다' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_confirmed_attribution before update of partner_id, partner_contact_id on public.leads
  for each row execute function public.guard_confirmed_attribution();
create trigger guard_confirmed_attribution before update of partner_id, partner_contact_id on public.registrations
  for each row execute function public.guard_confirmed_attribution();

-- ---------------------------------------------------------------------------
-- 배포된 링크 코드 잠금: 잠긴 코드는 관리자만 바꿀 수 있다
-- ---------------------------------------------------------------------------
create or replace function public.guard_locked_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.code_locked and new.code is distinct from old.code and not public.is_admin() then
    raise exception '배포된 링크의 코드는 관리자만 바꿀 수 있습니다' using errcode = '42501';
  end if;
  if old.code_locked and not new.code_locked and not public.is_admin() then
    raise exception '코드 잠금은 관리자만 풀 수 있습니다' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_locked_code before update of code, code_locked on public.partners
  for each row execute function public.guard_locked_code();
create trigger guard_locked_code before update of code, code_locked on public.partner_contacts
  for each row execute function public.guard_locked_code();

-- ---------------------------------------------------------------------------
-- updated_at · 감사 기록 · RLS
-- ---------------------------------------------------------------------------
create trigger set_updated_at before update on public.partner_contacts
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.partner_agreements
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.payout_accounts
  for each row execute function public.set_updated_at();

create trigger audit after insert or update or delete on public.partner_contacts
  for each row execute function public.audit_row('name', 'phone', 'email', 'memo');
create trigger audit after insert or update or delete on public.partner_agreements
  for each row execute function public.audit_row('memo');
create trigger audit after insert or update or delete on public.payout_accounts
  for each row execute function public.audit_row('account_number', 'account_holder', 'memo');

-- 학원 감사 기록에서 새 연락처 컬럼도 값 미기록
create or replace trigger audit after insert or update or delete on public.partners
  for each row execute function public.audit_row('phone', 'director_name', 'memo', 'email', 'address', 'business_registration_no');

alter table public.partner_contacts enable row level security;
alter table public.partner_agreements enable row level security;
alter table public.payout_accounts enable row level security;

revoke all on public.partner_contacts, public.partner_agreements, public.payout_accounts, public.v_partner_agreements from anon;

create policy contacts_select on public.partner_contacts for select to authenticated
  using (public.is_staff_or_admin());
create policy contacts_insert on public.partner_contacts for insert to authenticated
  with check (public.is_staff_or_admin());
create policy contacts_update on public.partner_contacts for update to authenticated
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

create policy agreements_select on public.partner_agreements for select to authenticated
  using (public.is_staff_or_admin());
create policy agreements_insert on public.partner_agreements for insert to authenticated
  with check (public.is_staff_or_admin());
create policy agreements_update on public.partner_agreements for update to authenticated
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

create policy payout_select on public.payout_accounts for select to authenticated
  using (public.is_staff_or_admin());
create policy payout_insert on public.payout_accounts for insert to authenticated
  with check (public.is_staff_or_admin());
create policy payout_update on public.payout_accounts for update to authenticated
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

grant execute on function public.agreement_effective_end(date, boolean, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 학원 목록용 집계 (소개 현황 건수 — 학생 개인정보 없음)
-- ---------------------------------------------------------------------------
create or replace function public.partner_referral_counts()
returns table (partner_id uuid, lead_count bigint, registration_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id,
    (select count(*) from public.leads l where l.partner_id = p.id and l.deleted_at is null),
    (select count(*) from public.registrations r
      where r.partner_id = p.id and r.deleted_at is null and r.status not in ('canceled', 'refunded', 'waitlisted'))
  from public.partners p;
$$;

revoke execute on function public.partner_referral_counts() from public, anon;
grant execute on function public.partner_referral_counts() to authenticated;
