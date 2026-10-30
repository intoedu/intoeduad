-- 인투유학 CRM 기본 스키마
-- 규칙: 순간은 timestamptz, 날짜만 의미 있는 값은 date(KST 기준), 금액은 원 단위 bigint,
--       상태값은 영문 코드 text + CHECK (화면에서 한국어로 표시)

-- ---------------------------------------------------------------------------
-- 공통 함수
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 오늘 날짜(KST)
create or replace function public.kst_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Seoul')::date;
$$;

-- 수정·삭제 금지 테이블용
create or replace function public.prevent_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% 테이블은 수정·삭제할 수 없습니다', tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;

-- ---------------------------------------------------------------------------
-- 직원
-- ---------------------------------------------------------------------------
create table public.staff_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  phone text check (phone ~ '^[0-9]{9,11}$'),
  role text not null check (role in ('admin', 'staff', 'viewer')),
  team text,
  can_view_passport boolean not null default false,
  notify_channels text[] not null default '{}'
    check (notify_channels <@ array['sms', 'email']::text[]),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 현지 팀(viewer)은 여권 열람 불가
  constraint staff_viewer_no_passport check (not (role = 'viewer' and can_view_passport))
);

-- ---------------------------------------------------------------------------
-- MOU 학원
-- ---------------------------------------------------------------------------
create table public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region text,
  director_name text,
  phone text check (phone ~ '^[0-9]{9,11}$'),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  -- QR·링크 배포 후에는 코드 변경 금지
  code_locked boolean not null default false,
  memo text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------------------------------------------------------------------------
-- 프로그램(캠프·유학) = 신청서
-- ---------------------------------------------------------------------------
create table public.programs (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('camp', 'study_abroad')),
  name text not null,
  season text,
  country text,
  start_date date not null,
  end_date date not null,
  capacity integer check (capacity > 0),
  total_price bigint not null default 0 check (total_price >= 0),
  status text not null default 'before' check (status in ('before', 'open', 'closed')),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$'),
  description text,
  form_config jsonb not null default '{}'::jsonb,
  waitlist_enabled boolean not null default false,
  refund_policy_text text,
  refund_policy_version integer not null default 1,
  -- 공제율 표: [{"min_days":30,"max_days":null,"rate":0}, ...]
  refund_rules jsonb not null default '[]'::jsonb,
  -- 제3자 제공·국외 이전 대상: {"ticketing":"...","school":{"name":"...","country":"..."},"lodging":{...}}
  third_party_recipients jsonb not null default '{}'::jsonb,
  passport_upload_enabled boolean not null default false,
  health_field_enabled boolean not null default false,
  -- 개인정보 파기: 종료일 + N일 (기본 5일)
  destroy_after_days integer not null default 5 check (destroy_after_days between 0 and 365),
  copied_from uuid references public.programs (id) on delete set null,
  created_by uuid references public.staff_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint programs_dates check (end_date >= start_date)
);

-- 현지 팀 담당 프로그램
create table public.staff_program_assignments (
  staff_id uuid not null references public.staff_profiles (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (staff_id, program_id)
);
create index on public.staff_program_assignments (program_id);

create table public.program_payment_rules (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  kind text not null check (kind in ('deposit', 'balance', 'extra')),
  label text not null,
  amount bigint not null check (amount >= 0),
  due_rule_type text not null check (due_rule_type in ('fixed', 'after_registration', 'before_start')),
  due_fixed_date date,
  due_offset_days integer check (due_offset_days >= 0),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_rule_shape check (
    (due_rule_type = 'fixed' and due_fixed_date is not null)
    or (due_rule_type <> 'fixed' and due_offset_days is not null)
  )
);
create index on public.program_payment_rules (program_id);
-- 예약금·잔금은 프로그램당 하나
create unique index program_payment_rules_one_deposit_balance
  on public.program_payment_rules (program_id, kind)
  where kind in ('deposit', 'balance');

create table public.program_milestones (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  title text not null,
  date date not null,
  category text not null default 'other' check (category in (
    'document_deadline', 'visa', 'flight_ticketing', 'orientation', 'departure', 'return', 'other'
  )),
  show_dday boolean not null default true,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.program_milestones (program_id);
create index on public.program_milestones (date);

-- ---------------------------------------------------------------------------
-- 상담 신청
-- ---------------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid references public.partners (id) on delete set null,
  source_other text,
  student_name text,
  student_grade text,
  interests text[] not null default '{}'
    check (interests <@ array['study_abroad', 'camp']::text[]),
  parent_name text,
  parent_phone text check (parent_phone ~ '^01[0-9]{8,9}$'),
  relation text,
  topics text[] not null default '{}'
    check (topics <@ array['camp', 'study_abroad', 'cost', 'schedule', 'other']::text[]),
  message text,
  status text not null default 'new' check (status in (
    'new', 'contacting', 'scheduled', 'consulted', 'converted', 'on_hold', 'closed'
  )),
  assigned_to uuid references public.staff_profiles (id) on delete set null,
  destroy_due_date date,
  destroyed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- 파기 전에는 필수 개인정보가 있어야 함
  constraint leads_pii_required check (
    destroyed_at is not null
    or (student_name is not null and parent_name is not null and parent_phone is not null)
  )
);
create index on public.leads (status);
create index on public.leads (partner_id);
create index on public.leads (assigned_to);
create index on public.leads (created_at);
create index on public.leads (parent_phone);

create table public.lead_program_interests (
  lead_id uuid not null references public.leads (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  primary key (lead_id, program_id)
);
create index on public.lead_program_interests (program_id);

create table public.consultation_slots (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null unique,
  ends_at timestamptz not null,
  capacity integer not null default 1 check (capacity >= 1),
  booked_count integer not null default 0,
  is_open boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint slot_time check (ends_at > starts_at),
  -- 정원 초과 예약을 DB 레벨에서 차단
  constraint slot_capacity check (booked_count >= 0 and booked_count <= capacity)
);

create table public.consultations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  slot_id uuid references public.consultation_slots (id) on delete restrict,
  scheduled_at timestamptz,
  method text not null default 'undecided' check (method in ('undecided', 'phone', 'video')),
  meeting_url text,
  status text not null default 'scheduled' check (status in ('scheduled', 'done', 'canceled', 'no_show')),
  notes text,
  decided_by uuid references public.staff_profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.consultations (lead_id);
create index on public.consultations (slot_id);
create index on public.consultations (scheduled_at);

-- ---------------------------------------------------------------------------
-- 등록
-- ---------------------------------------------------------------------------
create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete restrict,
  lead_id uuid references public.leads (id) on delete set null,
  partner_id uuid references public.partners (id) on delete set null,
  status text not null default 'received' check (status in (
    'received', 'deposit_pending', 'deposit_paid', 'balance_pending', 'confirmed',
    'waitlisted', 'canceled', 'refunded'
  )),
  student_name_ko text,
  student_name_en text,
  birth_date date,
  gender text check (gender in ('male', 'female')),
  school text,
  grade text,
  english_level text,
  parent_name text,
  parent_phone text check (parent_phone ~ '^01[0-9]{8,9}$'),
  parent_email text,
  address text,
  emergency_name text,
  emergency_relation text,
  emergency_phone text check (emergency_phone ~ '^[0-9]{9,11}$'),
  special_notes text,
  assigned_to uuid references public.staff_profiles (id) on delete set null,
  registered_on date not null default public.kst_today(),
  passport_status text not null default 'not_required'
    check (passport_status in ('not_required', 'pending', 'submitted', 'deleted')),
  canceled_at timestamptz,
  destroy_due_date date,
  destroyed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint registrations_pii_required check (
    destroyed_at is not null
    or (student_name_ko is not null and parent_name is not null and parent_phone is not null)
  )
);
create index on public.registrations (program_id);
create index on public.registrations (status);
create index on public.registrations (lead_id);
create index on public.registrations (partner_id);
create index on public.registrations (destroy_due_date) where destroyed_at is null;

-- 민감정보(건강) — 별도 동의 시에만 생성
create table public.registration_health_notes (
  registration_id uuid primary key references public.registrations (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 동의 문구(버전) · 동의 기록
-- ---------------------------------------------------------------------------
create table public.consent_documents (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in (
    'lead_privacy', 'lead_guardian',
    'reg_privacy', 'reg_passport', 'reg_third_party', 'reg_health', 'reg_guardian',
    'refund_default', 'destruction_notice'
  )),
  version integer not null check (version >= 1),
  title text not null,
  body text not null,
  created_by uuid references public.staff_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (kind, version)
);

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads (id) on delete cascade,
  registration_id uuid references public.registrations (id) on delete cascade,
  kind text not null,
  document_version integer not null,
  -- 신청 시점에 실제로 보여 준 문구(치환 완료본)
  rendered_text text not null,
  agreed boolean not null,
  agreed_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  constraint consent_subject check (num_nonnulls(lead_id, registration_id) = 1)
);
create index on public.consent_records (lead_id);
create index on public.consent_records (registration_id);

-- ---------------------------------------------------------------------------
-- 여권 파일 · 접속기록
-- ---------------------------------------------------------------------------
create table public.passport_files (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations (id) on delete restrict,
  storage_path text not null unique,
  iv text not null,
  key_version integer not null default 1,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  uploaded_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_reason text check (deleted_reason in (
    'manual', 'consent_withdrawn', 'canceled', 'destruction', 'replaced'
  ))
);
-- 등록생당 유효한 여권 파일은 하나
create unique index passport_files_one_active
  on public.passport_files (registration_id)
  where deleted_at is null;

create table public.passport_access_logs (
  id bigint generated always as identity primary key,
  passport_file_id uuid not null references public.passport_files (id) on delete restrict,
  registration_id uuid not null,
  actor_id uuid,           -- null = 학부모 업로드 또는 자동 작업
  actor_name text,         -- 기록 시점의 직원 이름
  action text not null check (action in ('upload', 'view', 'download', 'delete', 'auto_delete')),
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create index on public.passport_access_logs (passport_file_id);
create index on public.passport_access_logs (created_at);

-- ---------------------------------------------------------------------------
-- 납부 · 환불
-- ---------------------------------------------------------------------------
create table public.payment_schedules (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations (id) on delete cascade,
  kind text not null check (kind in ('deposit', 'balance', 'extra')),
  label text not null,
  amount_due bigint not null check (amount_due >= 0),
  due_date date not null,
  created_from_rule_id uuid references public.program_payment_rules (id) on delete set null,
  sort integer not null default 0,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.payment_schedules (registration_id);
create index on public.payment_schedules (due_date);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.payment_schedules (id) on delete restrict,
  paid_at date not null default public.kst_today(),
  amount bigint not null check (amount > 0),
  method text not null check (method in ('card', 'transfer', 'cash', 'other')),
  memo text,
  recorded_by uuid references public.staff_profiles (id) on delete set null,
  status text not null default 'confirmed' check (status in ('confirmed', 'void')),
  voided_at timestamptz,
  voided_by uuid references public.staff_profiles (id) on delete set null,
  -- 향후 온라인 결제(PG) 연동 대비
  external_payment_id text,
  pg_provider text,
  method_detail jsonb,
  created_at timestamptz not null default now()
);
create index on public.payments (schedule_id);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations (id) on delete cascade,
  reason_type text not null check (reason_type in ('customer', 'company', 'force_majeure', 'mid_return')),
  requested_at date not null,
  days_before_start integer,
  deduction_rate numeric(5, 4) check (deduction_rate between 0 and 1),
  paid_total bigint,
  expected_amount bigint,
  final_amount bigint,
  processed_at timestamptz,
  processed_by uuid references public.staff_profiles (id) on delete set null,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.refunds (registration_id);

-- ---------------------------------------------------------------------------
-- 중요 일정 · 파기 요청
-- ---------------------------------------------------------------------------
create table public.important_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date not null,
  category text not null default 'general' check (category in (
    'general', 'deadline', 'meeting', 'privacy_destruction', 'other'
  )),
  priority text not null default 'normal' check (priority in ('normal', 'critical')),
  program_id uuid references public.programs (id) on delete cascade,
  owner_id uuid references public.staff_profiles (id) on delete set null,
  memo text,
  show_dday boolean not null default true,
  -- 시스템 자동 생성 일정(파기 승인 등)은 직원이 지울 수 없음
  is_system boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.important_events (date);
create index on public.important_events (program_id);

create table public.destruction_requests (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid unique references public.leads (id) on delete cascade,
  registration_id uuid unique references public.registrations (id) on delete cascade,
  program_id uuid references public.programs (id) on delete set null,
  due_date date not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'held', 'executed', 'failed')),
  approved_by uuid references public.staff_profiles (id) on delete set null,
  approved_at timestamptz,
  hold_reason text,
  held_by uuid references public.staff_profiles (id) on delete set null,
  held_at timestamptz,
  executed_at timestamptz,
  destroyed_items jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint destruction_subject check (num_nonnulls(lead_id, registration_id) = 1),
  constraint destruction_hold_reason check (status <> 'held' or hold_reason is not null)
);
create index on public.destruction_requests (status, due_date);

-- ---------------------------------------------------------------------------
-- 메모 · 감사 기록 · 발송 기록 · 설정 · 토큰
-- ---------------------------------------------------------------------------
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('lead', 'registration', 'program', 'partner')),
  entity_id uuid not null,
  author_id uuid not null references public.staff_profiles (id) on delete restrict,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.notes (entity_type, entity_id);

create table public.activity_logs (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id uuid,
  actor_id uuid,
  action text not null,
  changed_fields text[],
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index on public.activity_logs (entity_type, entity_id);
create index on public.activity_logs (created_at);

create table public.message_logs (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('alimtalk', 'sms', 'lms', 'email')),
  purpose text not null,
  template_code text,
  to_masked text,
  to_hash text,
  status text not null check (status in ('queued', 'sent', 'failed', 'skipped')),
  provider_message_id text,
  error text,
  related_type text,
  related_id uuid,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index on public.message_logs (created_at);
create index on public.message_logs (related_type, related_id);

create table public.settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.staff_profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.access_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  purpose text not null check (purpose in ('prefill', 'my_view', 'passport_upload')),
  lead_id uuid references public.leads (id) on delete cascade,
  registration_id uuid references public.registrations (id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references public.staff_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint access_token_subject check (num_nonnulls(lead_id, registration_id) = 1)
);

-- 같은 번호의 단시간 중복 제출 방지
create table public.submission_throttle (
  id bigint generated always as identity primary key,
  kind text not null,
  phone_hash text not null,
  created_at timestamptz not null default now()
);
create index on public.submission_throttle (kind, phone_hash, created_at);

-- ---------------------------------------------------------------------------
-- updated_at 트리거
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'staff_profiles', 'partners', 'programs', 'program_payment_rules', 'program_milestones',
    'leads', 'consultation_slots', 'consultations', 'registrations', 'registration_health_notes',
    'payment_schedules', 'refunds', 'important_events', 'destruction_requests', 'notes'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      t
    );
  end loop;
end;
$$;

-- 수정·삭제 금지
create trigger consent_documents_immutable
  before update or delete on public.consent_documents
  for each row execute function public.prevent_mutation();

create trigger passport_access_logs_append_only
  before update or delete on public.passport_access_logs
  for each row execute function public.prevent_mutation();

-- ---------------------------------------------------------------------------
-- 납부 상태 계산 뷰 (호출자 권한으로 실행 → RLS 그대로 적용)
-- ---------------------------------------------------------------------------
create view public.v_payment_schedules
with (security_invoker = true)
as
select
  s.*,
  coalesce(p.paid, 0)::bigint as paid_amount,
  case
    when s.canceled_at is not null then 'canceled'
    when coalesce(p.paid, 0) >= s.amount_due then 'paid'
    when s.due_date < public.kst_today() then 'overdue'
    when coalesce(p.paid, 0) > 0 then 'partial'
    else 'scheduled'
  end as status
from public.payment_schedules s
left join (
  select schedule_id, sum(amount) as paid
  from public.payments
  where status = 'confirmed'
  group by schedule_id
) p on p.schedule_id = s.id;
