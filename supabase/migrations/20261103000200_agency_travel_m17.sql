-- M17 항공권·ESTA·여행자보험 대행 + 출국 서류(ESTA·항공) 정보 수집
-- 1) 캠프별로 대행 안내를 켜면, 신청서(학부모·직원 입력)에서 "대행 / 직접 준비"와 대행 항목을 고른다.
--    대행료는 고른 개수로 정한다(설정 agency_fees, 기본 1개 3만·2개 5만·3개 6만 — 08 비자·항공권 매뉴얼). 항공권 요금 자체는 별도.
--    대행료는 납부 일정에 "추가 항목"으로 들어간다(기한 = 원금 기한, 할인 대상 아님).
-- 2) 대행을 고른 학부모는 신청 내용 확인 화면에서 출국 서류 정보(여권과 같은 영문 이름, ESTA 신청 항목)를 낸다.
--    별도 동의(개인정보 수집·이용·국외 제공 / 고유식별정보)를 받고, 여권 열람 권한이 있는 담당자만 본다.
--    주민등록번호와 ESTA 적격성 질문(건강·범죄 이력 등)은 받지 않는다 — 신청 시 담당자가 학부모와 직접 확인.
-- 3) 개인정보 파기 시 출국 서류 정보도 함께 지운다.

-- ---------------------------------------------------------------------------
-- 설정·캠프·등록 컬럼
-- ---------------------------------------------------------------------------
insert into public.settings (key, value) values ('agency_fees', '{"1": 30000, "2": 50000, "3": 60000}'::jsonb)
on conflict (key) do nothing;

alter table public.programs
  add column agency_enabled boolean not null default false,
  add column us_contact jsonb not null default '{}'::jsonb;
comment on column public.programs.agency_enabled is '신청서에서 항공권·ESTA·여행자보험 대행 여부를 묻는다';
comment on column public.programs.us_contact is 'ESTA의 미국 내 연락처·체류 주소 {name, address, phone} — 담당자가 입력';

alter table public.registrations
  add column agency_choice text check (agency_choice in ('agency', 'self')),
  add column agency_services text[] not null default '{}'
    check (agency_services <@ array['flight', 'esta', 'insurance']::text[]),
  add column agency_fee bigint not null default 0 check (agency_fee >= 0),
  add column travel_info_submitted_at timestamptz;
comment on column public.registrations.agency_choice is 'agency=대행 원함, self=직접 준비, null=묻지 않은 캠프';

alter table public.payment_schedules
  add column agency_fee boolean not null default false;
comment on column public.payment_schedules.agency_fee is '대행료 항목(대행 선택 변경 시 이 줄을 고친다)';

-- 대행 항목 → 대행료
create or replace function public.agency_fee_for(p_count integer)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case when coalesce(p_count, 0) <= 0 then 0
    else coalesce((select (value ->> least(p_count, 3)::text)::bigint from public.settings where key = 'agency_fees'),
                  case least(p_count, 3) when 1 then 30000 when 2 then 50000 else 60000 end)
  end;
$$;

create or replace function public.agency_label(p_services text[])
returns text
language sql
immutable
set search_path = ''
as $$
  select '대행료(' || array_to_string(array(
    select case s when 'flight' then '항공권' when 'esta' then 'ESTA' when 'insurance' then '여행자보험' end
    from unnest(array['flight', 'esta', 'insurance']) s where s = any (p_services)
  ), '·') || ')';
$$;

-- 대행료 납부 일정 줄 만들기(대기 접수는 승격 때). 기한 = 이 등록의 원금(잔금) 기한, 없으면 신청일 + 7일
create or replace function public.add_agency_fee_schedule(p_registration_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.registrations;
  v_due date;
begin
  select * into r from public.registrations where id = p_registration_id;
  if not found or r.status = 'waitlisted' or r.agency_fee <= 0 then
    return;
  end if;
  if exists (select 1 from public.payment_schedules where registration_id = r.id and agency_fee and canceled_at is null) then
    return;
  end if;
  select s.due_date into v_due from public.compute_payment_schedule(r.program_id, r.registered_on) s where s.kind = 'balance' limit 1;
  insert into public.payment_schedules (registration_id, kind, label, amount_due, due_date, sort, agency_fee)
  values (r.id, 'extra', public.agency_label(r.agency_services), r.agency_fee, coalesce(v_due, r.registered_on + 7), 90, true);
end;
$$;

-- 신청 저장 시 대행 선택 반영 (submit_registration 안에서 호출)
create or replace function public.apply_registration_agency(p_registration_id uuid, p_services jsonb, p_choice text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
  v_services text[];
begin
  select p.agency_enabled into v_enabled
  from public.registrations r join public.programs p on p.id = r.program_id where r.id = p_registration_id;
  if not coalesce(v_enabled, false) then
    return;
  end if;
  if p_choice is null or p_choice not in ('agency', 'self') then
    raise exception '항공권·ESTA·여행자보험 대행 여부를 선택해 주세요' using errcode = 'P0001', hint = 'AGENCY_REQUIRED';
  end if;
  select coalesce(array_agg(distinct s order by s), '{}') into v_services
  from jsonb_array_elements_text(case when jsonb_typeof(p_services) = 'array' then p_services else '[]'::jsonb end) s
  where s in ('flight', 'esta', 'insurance');
  if p_choice = 'agency' and cardinality(v_services) = 0 then
    raise exception '대행할 항목(항공권·ESTA·여행자보험)을 하나 이상 골라 주세요' using errcode = 'P0001', hint = 'AGENCY_REQUIRED';
  end if;
  if p_choice = 'self' then
    v_services := '{}';
  end if;
  update public.registrations
     set agency_choice = p_choice, agency_services = v_services, agency_fee = public.agency_fee_for(cardinality(v_services))
   where id = p_registration_id;
  perform public.add_agency_fee_schedule(p_registration_id);
end;
$$;

-- submit_registration: 등록 행을 만든 직후 대행 선택 반영 (본문의 한 줄 뒤에 호출 추가)
do $$
declare
  v text := pg_get_functiondef('public.submit_registration(jsonb)'::regprocedure);
  v_old text := 'returning id into v_reg_id;';
begin
  if (length(v) - length(replace(v, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'submit_registration 본문이 예상과 다릅니다';
  end if;
  execute replace(v, v_old, v_old || E'\n\n  -- M17 항공권·ESTA·보험 대행 선택\n  perform public.apply_registration_agency(v_reg_id, p -> ''agency_services'', nullif(p ->> ''agency_choice'', ''''));');
end $$;

-- promote_waitlisted: 승격 때 대행료 줄도 만든다
do $$
declare
  v text := pg_get_functiondef('public.promote_waitlisted(uuid)'::regprocedure);
  v_old text := 'from public.compute_registration_schedule(v_prog.id, public.kst_today(), v_reg.partner_id) s;';
begin
  if position(v_old in v) = 0 then
    raise exception 'promote_waitlisted 본문이 예상과 다릅니다';
  end if;
  execute replace(v, v_old, v_old || E'\n  perform public.add_agency_fee_schedule(p_registration_id);');
end $$;

-- 담당자: 대행 선택 변경 (대행료 줄을 고치거나 만들거나 취소)
create or replace function public.set_registration_agency(p_registration_id uuid, p_choice text, p_services text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.registrations;
  v_services text[];
  v_fee bigint;
  s public.payment_schedules;
begin
  if not public.is_staff_or_admin() then
    raise exception '권한이 없습니다' using errcode = '42501';
  end if;
  select * into r from public.registrations where id = p_registration_id for update;
  if not found or r.destroyed_at is not null then
    raise exception '등록을 찾을 수 없습니다' using errcode = 'P0001';
  end if;
  if p_choice is not null and p_choice not in ('agency', 'self') then
    raise exception '대행 여부를 확인해 주세요' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(distinct x order by x), '{}') into v_services
  from unnest(coalesce(p_services, '{}')) x where x in ('flight', 'esta', 'insurance');
  if p_choice = 'agency' and cardinality(v_services) = 0 then
    raise exception '대행할 항목을 하나 이상 골라 주세요' using errcode = 'P0001';
  end if;
  if p_choice is distinct from 'agency' then
    v_services := '{}';
  end if;
  v_fee := public.agency_fee_for(cardinality(v_services));

  select * into s from public.payment_schedules where registration_id = r.id and agency_fee and canceled_at is null;
  if found and s.amount_due <> v_fee then
    if exists (select 1 from public.payments pm where pm.schedule_id = s.id and pm.status <> 'void') then
      raise exception '이미 대행료 납부 기록이 있어 바꿀 수 없습니다. 납부 기록을 먼저 정리해 주세요' using errcode = 'P0001';
    end if;
    if v_fee = 0 then
      update public.payment_schedules set canceled_at = now() where id = s.id;
    else
      update public.payment_schedules
         set amount_due = v_fee, label = public.agency_label(v_services), change_reason = '대행 항목 변경'
       where id = s.id;
    end if;
  elsif found then
    update public.payment_schedules set label = public.agency_label(v_services) where id = s.id;
  end if;

  update public.registrations
     set agency_choice = p_choice, agency_services = v_services, agency_fee = v_fee
   where id = r.id;
  perform public.add_agency_fee_schedule(r.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 출국 서류 정보 (학생 + 함께 출국하는 보호자) — 여권 열람 권한자만
-- ---------------------------------------------------------------------------
create table public.registration_travelers (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations (id) on delete cascade,
  traveler_type text not null check (traveler_type in ('student', 'guardian')),
  relation text check (relation is null or char_length(relation) <= 20),
  -- 여권과 같은 영문 이름
  surname_en text not null check (surname_en ~ '^[A-Z][A-Z \-]{0,39}$'),
  given_name_en text not null check (given_name_en ~ '^[A-Z][A-Z \-]{0,59}$'),
  gender text check (gender in ('male', 'female')),
  birth_date date,
  birth_city_en text check (birth_city_en is null or char_length(birth_city_en) <= 60),
  birth_country text default '대한민국' check (birth_country is null or char_length(birth_country) <= 40),
  other_citizenship text check (other_citizenship is null or char_length(other_citizenship) <= 60),
  passport_no text check (passport_no is null or passport_no ~ '^[A-Z0-9]{7,12}$'),
  passport_issue_date date,
  passport_expiry_date date,
  father_name_en text check (father_name_en is null or char_length(father_name_en) <= 80),
  mother_name_en text check (mother_name_en is null or char_length(mother_name_en) <= 80),
  home_address_en text check (home_address_en is null or char_length(home_address_en) <= 300),
  phone text check (phone is null or phone ~ '^[0-9]{9,11}$'),
  email text check (email is null or char_length(email) <= 120),
  employer text check (employer is null or char_length(employer) <= 120),
  job_title text check (job_title is null or char_length(job_title) <= 60),
  emergency_name text check (emergency_name is null or char_length(emergency_name) <= 50),
  emergency_phone text check (emergency_phone is null or emergency_phone ~ '^[0-9]{9,11}$'),
  memo text check (memo is null or char_length(memo) <= 500),
  -- 담당자 진행 기록
  esta_status text not null default 'not_started' check (esta_status in ('not_started', 'submitted', 'approved', 'denied', 'not_needed')),
  esta_application_no text check (esta_application_no is null or char_length(esta_application_no) <= 40),
  flight_status text not null default 'not_started' check (flight_status in ('not_started', 'booked', 'not_needed')),
  insurance_status text not null default 'not_started' check (insurance_status in ('not_started', 'enrolled', 'not_needed')),
  staff_note text check (staff_note is null or char_length(staff_note) <= 500),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint traveler_passport_dates check (passport_expiry_date is null or passport_issue_date is null or passport_expiry_date > passport_issue_date)
);
create index on public.registration_travelers (registration_id);
create unique index registration_travelers_one_student on public.registration_travelers (registration_id) where traveler_type = 'student';
create trigger set_updated_at before update on public.registration_travelers
  for each row execute function public.set_updated_at();
create trigger audit after insert or update or delete on public.registration_travelers
  for each row execute function public.audit_row(
    'surname_en', 'given_name_en', 'birth_date', 'birth_city_en', 'birth_country', 'other_citizenship',
    'passport_no', 'passport_issue_date', 'passport_expiry_date', 'father_name_en', 'mother_name_en',
    'home_address_en', 'phone', 'email', 'employer', 'job_title', 'emergency_name', 'emergency_phone', 'memo', 'relation'
  );

alter table public.registration_travelers enable row level security;
create policy travelers_select on public.registration_travelers for select to authenticated
  using (public.can_view_passport());
create policy travelers_update on public.registration_travelers for update to authenticated
  using (public.can_view_passport()) with check (public.can_view_passport());
grant select, update on public.registration_travelers to authenticated;

-- 파기: 등록 파기 시 출국 서류 정보도 삭제
create or replace function public.registrations_destroy_travelers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.registration_travelers where registration_id = new.id;
  return null;
end;
$$;
create trigger destroy_travelers after update of destroyed_at on public.registrations
  for each row when (old.destroyed_at is null and new.destroyed_at is not null)
  execute function public.registrations_destroy_travelers();

-- ---------------------------------------------------------------------------
-- 동의 문구: 출국 서류(대행) — 법률 검토 전 초안, 설정 → 동의·안내 문구에서 새 버전으로 수정
-- ---------------------------------------------------------------------------
alter table public.consent_documents drop constraint consent_documents_kind_check;
alter table public.consent_documents add constraint consent_documents_kind_check check (kind in (
  'lead_privacy', 'lead_guardian',
  'reg_privacy', 'reg_passport', 'reg_third_party', 'reg_health', 'reg_guardian', 'reg_partner_share',
  'refund_default', 'destruction_notice',
  'travel_privacy', 'travel_unique_id'
));

insert into public.consent_documents (kind, version, title, body) values (
  'travel_privacy', 1, '[필수] 출국 서류 대행을 위한 개인정보 수집·이용 및 국외 제공 동의',
$doc$1. 수집 항목
   출국자(학생·함께 출국하는 보호자): 여권상 영문 성명, 성별, 생년월일, 출생 도시·국가, 다른 국적,
   여권 발급일·만료일, 부모 영문 성명, 영문 주소, 연락처, 이메일, 직장·직위(보호자), 비상 연락처
2. 수집·이용 목적
   {{program_name}} 참가를 위한 항공권 예약, 미국 전자여행허가(ESTA) 신청, 여행자보험 가입 대행
3. 제공받는 자 / 국가 / 제공 항목
   미국 국토안보부 세관국경보호청(CBP) / 미국 / ESTA 신청에 필요한 위 항목과 여권번호
   항공권 발권처({{ticketing_agent}}) / 대한민국 / 영문 성명, 생년월일, 성별, 여권 정보, 연락처
   여행자보험사(가입 시 안내) / 대한민국 / 영문 성명, 생년월일, 성별, 여권 정보
4. 이전 일시 및 방법
   대행 진행 시 각 기관의 온라인 신청 화면 입력 또는 이메일 전송
5. 보유·이용 기간
   프로그램 종료일로부터 {{destroy_after_days}}일이 지난 후 파기
   (제공받는 자의 보유 기간은 각 기관의 정책에 따릅니다)
6. 동의를 거부할 권리 및 불이익
   동의하지 않으실 수 있으나, 동의하지 않으시면 인투유학을 통한 대행이 불가합니다(직접 준비는 가능).

※ 주민등록번호와 ESTA 신청서의 자격 확인 질문(건강·범죄 이력 등)은 이 화면에서 받지 않으며,
   신청할 때 담당자가 학부모님께 직접 확인합니다.$doc$
), (
  'travel_unique_id', 1, '[필수] 고유식별정보(여권번호) 처리 동의',
$doc$1. 처리 항목: 출국자의 여권번호
2. 처리 목적: 항공권 예약, ESTA 신청, 여행자보험 가입 대행
3. 보유·이용 기간: 프로그램 종료일로부터 {{destroy_after_days}}일이 지난 후 파기
4. 동의를 거부할 권리 및 불이익
   동의하지 않으실 수 있으나, 동의하지 않으시면 인투유학을 통한 대행이 불가합니다(직접 준비는 가능).

※ 입력하신 여권번호는 지정된 담당자만 열람할 수 있습니다.$doc$
);

create or replace function public.travel_consents(p_program_id uuid)
returns table (kind text, version integer, title text, body text)
language sql
stable
security definer
set search_path = ''
as $$
  select l.kind, l.version, l.title, public.fill_placeholders(l.body, public.registration_consent_values(p_program_id, null))
  from (
    select distinct on (d.kind) d.kind, d.version, d.title, d.body
    from public.consent_documents d
    where d.kind in ('travel_privacy', 'travel_unique_id')
    order by d.kind, d.version desc
  ) l
  order by array_position(array['travel_privacy', 'travel_unique_id'], l.kind);
$$;

create unique index registration_travelers_slot on public.registration_travelers (registration_id, traveler_type, sort);

-- ---------------------------------------------------------------------------
-- 학부모: 출국 서류 정보 화면(신청 내용 확인 링크) — Edge Function(service role)만
-- ---------------------------------------------------------------------------
create or replace function public.travel_target(p_token text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.registration_id
  from public.access_tokens t
  where t.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and t.purpose in ('my_view', 'passport_upload') and t.revoked_at is null and t.expires_at > now();
$$;

create or replace function public.travel_form_by_token(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'allowed', pr.agency_enabled and r.agency_choice = 'agency'
      and r.status not in ('canceled', 'refunded') and r.destroyed_at is null and r.deleted_at is null
      and public.kst_today() <= r.destroy_due_date,
    'program', jsonb_build_object('name', pr.name, 'season', pr.season, 'start_date', pr.start_date, 'end_date', pr.end_date),
    'agency', jsonb_build_object('choice', r.agency_choice, 'services', to_jsonb(r.agency_services), 'fee', r.agency_fee),
    'student', jsonb_build_object('name_ko', r.student_name_ko, 'name_en', r.student_name_en, 'birth_date', r.birth_date, 'gender', r.gender),
    'parent', jsonb_build_object('name', r.parent_name, 'phone', r.parent_phone, 'email', r.parent_email),
    'emergency', jsonb_build_object('name', r.emergency_name, 'phone', r.emergency_phone),
    'submitted_at', r.travel_info_submitted_at,
    'travelers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'traveler_type', x.traveler_type, 'sort', x.sort, 'relation', x.relation,
        'surname_en', x.surname_en, 'given_name_en', x.given_name_en, 'gender', x.gender, 'birth_date', x.birth_date,
        'birth_city_en', x.birth_city_en, 'birth_country', x.birth_country, 'other_citizenship', x.other_citizenship,
        -- 여권번호는 끝 3자리만 돌려준다(다시 입력하지 않으면 기존 값 유지)
        'passport_no_masked', case when x.passport_no is null then null else repeat('*', greatest(length(x.passport_no) - 3, 0)) || right(x.passport_no, 3) end,
        'passport_issue_date', x.passport_issue_date, 'passport_expiry_date', x.passport_expiry_date,
        'father_name_en', x.father_name_en, 'mother_name_en', x.mother_name_en, 'home_address_en', x.home_address_en,
        'phone', x.phone, 'email', x.email, 'employer', x.employer, 'job_title', x.job_title,
        'emergency_name', x.emergency_name, 'emergency_phone', x.emergency_phone, 'memo', x.memo
      ) order by x.traveler_type desc, x.sort)
      from public.registration_travelers x where x.registration_id = r.id
    ), '[]'::jsonb),
    'consents', coalesce((
      select jsonb_agg(jsonb_build_object('kind', c.kind, 'version', c.version, 'title', c.title, 'body', c.body))
      from public.travel_consents(pr.id) c
    ), '[]'::jsonb)
  )
  from public.registrations r
  join public.programs pr on pr.id = r.program_id
  where r.id = public.travel_target(p_token);
$$;

create or replace function public.travel_submit(p_token text, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg_id uuid := public.travel_target(p_token);
  v_form jsonb;
  t jsonb;
  v_type text;
  v_sort integer;
  v_guardians integer := 0;
  v_students integer := 0;
  v_keep text[] := '{}';
  v_passport text;
  v_birth date;
  v_issue date;
  v_expiry date;
  v_phone text;
  v_em_phone text;
begin
  if v_reg_id is null then
    raise exception '링크가 올바르지 않거나 만료되었습니다' using errcode = 'P0001', hint = 'NOT_FOUND';
  end if;
  v_form := public.travel_form_by_token(p_token);
  if not coalesce((v_form ->> 'allowed')::boolean, false) then
    raise exception '대행을 신청한 등록만 출국 서류 정보를 낼 수 있습니다' using errcode = 'P0001', hint = 'NOT_ALLOWED';
  end if;
  if coalesce((p #>> '{agree,travel_privacy}')::boolean, false) is not true
     or coalesce((p #>> '{agree,travel_unique_id}')::boolean, false) is not true then
    raise exception '필수 동의가 필요합니다' using errcode = 'P0001', hint = 'CONSENT_REQUIRED';
  end if;
  if jsonb_typeof(p -> 'travelers') <> 'array' then
    raise exception '입력값을 확인해 주세요' using errcode = 'P0001', hint = 'INVALID_INPUT';
  end if;

  for t in select * from jsonb_array_elements(p -> 'travelers') loop
    v_type := t ->> 'traveler_type';
    if v_type = 'student' then
      v_students := v_students + 1;
      v_sort := 0;
    elsif v_type = 'guardian' then
      v_guardians := v_guardians + 1;
      v_sort := v_guardians;
    else
      raise exception '입력값을 확인해 주세요' using errcode = 'P0001', hint = 'INVALID_INPUT';
    end if;
    if v_students > 1 or v_guardians > 2 then
      raise exception '출국자는 학생 1명과 보호자 2명까지 입력할 수 있습니다' using errcode = 'P0001', hint = 'INVALID_INPUT';
    end if;

    begin
      v_birth := nullif(t ->> 'birth_date', '')::date;
      v_issue := nullif(t ->> 'passport_issue_date', '')::date;
      v_expiry := nullif(t ->> 'passport_expiry_date', '')::date;
    exception when others then
      raise exception '날짜 형식을 확인해 주세요' using errcode = 'P0001', hint = 'INVALID_INPUT';
    end;
    v_passport := nullif(upper(regexp_replace(coalesce(t ->> 'passport_no', ''), '\s', '', 'g')), '');
    v_phone := nullif(regexp_replace(coalesce(t ->> 'phone', ''), '\D', '', 'g'), '');
    v_em_phone := nullif(regexp_replace(coalesce(t ->> 'emergency_phone', ''), '\D', '', 'g'), '');

    insert into public.registration_travelers as x (
      registration_id, traveler_type, sort, relation, surname_en, given_name_en, gender, birth_date,
      birth_city_en, birth_country, other_citizenship, passport_no, passport_issue_date, passport_expiry_date,
      father_name_en, mother_name_en, home_address_en, phone, email, employer, job_title,
      emergency_name, emergency_phone, memo
    ) values (
      v_reg_id, v_type, v_sort,
      case when v_type = 'guardian' then nullif(trim(left(t ->> 'relation', 20)), '') end,
      upper(regexp_replace(trim(coalesce(t ->> 'surname_en', '')), '\s+', ' ', 'g')),
      upper(regexp_replace(trim(coalesce(t ->> 'given_name_en', '')), '\s+', ' ', 'g')),
      nullif(t ->> 'gender', ''), v_birth,
      nullif(upper(trim(left(t ->> 'birth_city_en', 60))), ''),
      coalesce(nullif(trim(left(t ->> 'birth_country', 40)), ''), '대한민국'),
      nullif(trim(left(t ->> 'other_citizenship', 60)), ''),
      v_passport, v_issue, v_expiry,
      nullif(upper(trim(left(t ->> 'father_name_en', 80))), ''),
      nullif(upper(trim(left(t ->> 'mother_name_en', 80))), ''),
      nullif(trim(left(t ->> 'home_address_en', 300)), ''),
      v_phone, nullif(lower(trim(left(t ->> 'email', 120))), ''),
      nullif(trim(left(t ->> 'employer', 120)), ''), nullif(trim(left(t ->> 'job_title', 60)), ''),
      nullif(trim(left(t ->> 'emergency_name', 50)), ''), v_em_phone,
      nullif(trim(left(t ->> 'memo', 500)), '')
    )
    on conflict (registration_id, traveler_type, sort) do update set
      relation = excluded.relation, surname_en = excluded.surname_en, given_name_en = excluded.given_name_en,
      gender = excluded.gender, birth_date = excluded.birth_date, birth_city_en = excluded.birth_city_en,
      birth_country = excluded.birth_country, other_citizenship = excluded.other_citizenship,
      -- 여권번호를 다시 입력하지 않았으면 기존 값 유지
      passport_no = coalesce(excluded.passport_no, x.passport_no),
      passport_issue_date = excluded.passport_issue_date, passport_expiry_date = excluded.passport_expiry_date,
      father_name_en = excluded.father_name_en, mother_name_en = excluded.mother_name_en,
      home_address_en = excluded.home_address_en, phone = excluded.phone, email = excluded.email,
      employer = excluded.employer, job_title = excluded.job_title,
      emergency_name = excluded.emergency_name, emergency_phone = excluded.emergency_phone, memo = excluded.memo;
    v_keep := v_keep || (v_type || ':' || v_sort);
  end loop;

  if v_students <> 1 then
    raise exception '학생 정보를 입력해 주세요' using errcode = 'P0001', hint = 'INVALID_INPUT';
  end if;
  -- 이번에 빠진 보호자 정보는 삭제
  delete from public.registration_travelers x
  where x.registration_id = v_reg_id and not ((x.traveler_type || ':' || x.sort) = any (v_keep));

  -- 필수 항목(여권번호·만료일·생년월일·성별)은 각 출국자마다
  if exists (select 1 from public.registration_travelers x where x.registration_id = v_reg_id
             and (x.passport_no is null or x.passport_expiry_date is null or x.birth_date is null or x.gender is null)) then
    raise exception '여권번호·여권 만료일·생년월일·성별을 모두 입력해 주세요' using errcode = 'P0001', hint = 'INVALID_INPUT';
  end if;

  -- 동의 기록(이번에 보여 준 문구 원문)
  insert into public.consent_records (registration_id, kind, document_version, rendered_text, agreed, agreed_at)
  select v_reg_id, c ->> 'kind', (c ->> 'version')::int, c ->> 'body', true, now()
  from jsonb_array_elements(v_form -> 'consents') c
  where not exists (select 1 from public.consent_records cr where cr.registration_id = v_reg_id
                    and cr.kind = c ->> 'kind' and cr.document_version = (c ->> 'version')::int and cr.agreed and cr.withdrawn_at is null);

  update public.registrations set travel_info_submitted_at = now() where id = v_reg_id;
  return jsonb_build_object('ok', true);
exception
  when check_violation or invalid_text_representation or datetime_field_overflow then
    raise exception '입력 형식을 확인해 주세요(영문 이름은 여권과 같은 영문 대문자, 여권번호는 영문·숫자)' using errcode = 'P0001', hint = 'INVALID_INPUT';
end;
$$;

-- ---------------------------------------------------------------------------
-- 공개 신청서·고객 확인 화면에 대행 정보 추가 (M15 정의 + 대행 항목)
-- ---------------------------------------------------------------------------
create or replace function public.public_register_form(p_slug text, p_partner_code text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_prog public.programs;
  v_full boolean;
  v_partner_id uuid;
begin
  select * into v_prog from public.programs
  where slug = lower(p_slug) and deleted_at is null;
  if not found then
    return null;
  end if;

  if v_prog.status <> 'open' then
    return jsonb_build_object(
      'status', v_prog.status,
      'program', jsonb_build_object('name', v_prog.name, 'season', v_prog.season),
      'kakao_channel_url', (select value #>> '{}' from public.settings where key = 'kakao_channel_url')
    );
  end if;

  if nullif(trim(coalesce(p_partner_code, '')), '') is not null then
    select id into v_partner_id from public.partners
    where code = lower(trim(p_partner_code)) and active and deleted_at is null;
  end if;

  v_full := v_prog.capacity is not null and public.program_enrolled_count(v_prog.id) >= v_prog.capacity;

  return jsonb_build_object(
    'status', v_prog.status,
    'is_full', v_full,
    'waitlist_enabled', v_prog.waitlist_enabled,
    'program', jsonb_build_object(
      'slug', v_prog.slug, 'type', v_prog.type, 'name', v_prog.name, 'season', v_prog.season,
      'country', v_prog.country, 'start_date', v_prog.start_date, 'end_date', v_prog.end_date,
      'total_price', v_prog.total_price, 'description', v_prog.description,
      'passport_upload_enabled', v_prog.passport_upload_enabled,
      'health_field_enabled', v_prog.health_field_enabled
    ),
    'fields', public.registration_field_modes(v_prog.form_config),
    'schedule', coalesce((
      select jsonb_agg(jsonb_build_object('kind', s.kind, 'label', s.label, 'amount', s.amount, 'due_date', s.due_date) order by s.sort)
      from public.compute_registration_schedule(v_prog.id, public.kst_today(), v_partner_id) s
    ), '[]'::jsonb),
    'discounts', coalesce((
      select jsonb_agg(jsonb_build_object('kind', d.kind, 'label', d.label, 'amount', d.amount))
      from public.registration_discounts(v_prog.id, v_partner_id, public.kst_today()) d
    ), '[]'::jsonb),
    -- M17 항공권·ESTA·보험 대행 안내
    'agency', case when v_prog.agency_enabled then jsonb_build_object(
      'fees', coalesce((select value from public.settings where key = 'agency_fees'), '{"1": 30000, "2": 50000, "3": 60000}'::jsonb)
    ) end,
    'destroy_date', v_prog.end_date + v_prog.destroy_after_days,
    'consents', coalesce((
      select jsonb_agg(jsonb_build_object('kind', c.kind, 'version', c.version, 'title', c.title, 'body', c.body, 'required', c.required))
      from public.registration_consents(v_prog.id, '{{partner_name}}') c
    ), '[]'::jsonb),
    'refund', jsonb_build_object('version', v_prog.refund_policy_version, 'body', public.registration_refund_text(v_prog.id)),
    'kakao_channel_url', (select value #>> '{}' from public.settings where key = 'kakao_channel_url')
  );
end;
$$;


create or replace function public.registration_summary(p_registration_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', r.status,
    'destroyed', r.destroyed_at is not null,
    'student_name', r.student_name_ko,
    'parent_name', r.parent_name,
    'registered_on', r.registered_on,
    'passport_status', r.passport_status,
    'destroy_date', r.destroy_due_date,
    'program', jsonb_build_object(
      'name', pr.name, 'season', pr.season, 'country', pr.country,
      'start_date', pr.start_date, 'end_date', pr.end_date, 'end_plus_days', pr.destroy_after_days
    ),
    'schedule', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', s.kind, 'label', s.label, 'amount', s.amount_due, 'due_date', s.due_date,
        'paid', s.paid_amount, 'status', s.status) order by s.sort, s.due_date)
      from public.v_payment_schedules s
      where s.registration_id = r.id and s.canceled_at is null
    ), '[]'::jsonb),
    'discounts', r.discount_detail,
    'agency', case when r.agency_choice is null then null else jsonb_build_object(
      'choice', r.agency_choice, 'services', to_jsonb(r.agency_services), 'fee', r.agency_fee,
      'travel_submitted_at', r.travel_info_submitted_at, 'travel_allowed', pr.agency_enabled and r.agency_choice = 'agency'
    ) end,
    'bank_account', (select value from public.settings where key = 'bank_account'),
    'kakao_channel_url', (select value #>> '{}' from public.settings where key = 'kakao_channel_url')
  )
  from public.registrations r
  join public.programs pr on pr.id = r.program_id
  where r.id = p_registration_id and r.deleted_at is null;
$$;


-- 등록생 목록: 대행/직접 구분
create or replace view public.v_registration_board
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
  coalesce(s.core_paid, false) as core_paid,
  -- M17 대행·출국 서류 (기존 열 순서 유지, 끝에 추가)
  r.agency_choice, r.agency_services, r.travel_info_submitted_at
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

-- ---------------------------------------------------------------------------
-- 실행 권한
-- ---------------------------------------------------------------------------
revoke execute on function
  public.agency_fee_for(integer),
  public.agency_label(text[]),
  public.add_agency_fee_schedule(uuid),
  public.apply_registration_agency(uuid, jsonb, text),
  public.set_registration_agency(uuid, text, text[]),
  public.registrations_destroy_travelers(),
  public.travel_consents(uuid),
  public.travel_target(text),
  public.travel_form_by_token(text),
  public.travel_submit(text, jsonb)
from public, anon, authenticated;

-- 담당자 화면
grant execute on function public.set_registration_agency(uuid, text, text[]), public.agency_fee_for(integer) to authenticated;
-- 학부모 출국 서류 화면: Edge Function(service role)만
grant execute on function public.travel_form_by_token(text), public.travel_submit(text, jsonb) to service_role;
