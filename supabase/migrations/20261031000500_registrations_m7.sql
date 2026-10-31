-- M7: 캠프 등록 신청서 — 공개 조회(개인정보 없음)·제출(한 트랜잭션)·납부 일정 자동 생성·
--     동의 기록(치환된 문구 스냅샷)·파기 안내·정원/대기 접수·소개 학원 제공 동의(선택)·고객용 확인 링크

-- ---------------------------------------------------------------------------
-- 등록 테이블 보강
-- ---------------------------------------------------------------------------
alter table public.registrations
  -- 학원 링크·상담 기록 없이 들어온 경우 "알게 된 경로" 직접 입력
  add column source_other text,
  -- 소개 학원에 학생 이름·진행 상황을 알려도 되는지(선택 동의). 없으면 학원용 문구에서 이름을 가린다.
  add column partner_share_agreed boolean not null default false;

-- source_other도 개인정보가 섞일 수 있어 감사 기록에 값을 남기지 않는다
create or replace trigger audit after insert or update or delete on public.registrations
  for each row execute function public.audit_row(
    'student_name_ko', 'student_name_en', 'birth_date', 'gender', 'school', 'grade', 'english_level',
    'parent_name', 'parent_phone', 'parent_email', 'address',
    'emergency_name', 'emergency_relation', 'emergency_phone', 'special_notes', 'source_other'
  );

-- 같은 프로그램에 같은 학생·번호로 중복 신청 방지(취소·환불 건 제외)는 함수에서 검사

-- ---------------------------------------------------------------------------
-- 동의 문구: 소개 학원 제공 동의(선택) 추가
-- ---------------------------------------------------------------------------
alter table public.consent_documents drop constraint consent_documents_kind_check;
alter table public.consent_documents add constraint consent_documents_kind_check check (kind in (
  'lead_privacy', 'lead_guardian',
  'reg_privacy', 'reg_passport', 'reg_third_party', 'reg_health', 'reg_guardian', 'reg_partner_share',
  'refund_default', 'destruction_notice'
));

insert into public.consent_documents (kind, version, title, body) values (
  'reg_partner_share', 1, '[선택] 6. 소개 학원에 등록 사실 제공 동의',
$doc$1. 제공받는 자: {{partner_name}} (인투유학을 소개한 학원)
2. 제공 항목: 학생 이름, 신청 프로그램명, 등록·납부 진행 상태(납부 금액·계좌 등 세부 정보 제외)
3. 제공 목적: 소개 학원의 학생 등록 현황 확인
4. 보유·이용 기간: 제공 목적 달성 시까지(프로그램 종료 시까지)
5. 동의를 거부할 권리 및 불이익
   동의하지 않으셔도 등록에는 아무런 불이익이 없습니다.
   동의하지 않으시면 학원에는 이름을 가린 형태(예: 홍*동)로만 안내합니다.$doc$
)
on conflict (kind, version) do nothing;

-- ---------------------------------------------------------------------------
-- 공통 도우미
-- ---------------------------------------------------------------------------

-- {{키}} 치환 (값이 없는 키는 그대로 둔다)
create or replace function public.fill_placeholders(p_text text, p_values jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key text;
  v_val text;
  v_out text := coalesce(p_text, '');
begin
  for v_key, v_val in select key, value from jsonb_each_text(coalesce(p_values, '{}'::jsonb)) loop
    v_out := replace(v_out, '{{' || v_key || '}}', coalesce(v_val, ''));
  end loop;
  return v_out;
end;
$$;

-- 2027-07-20 → 2027년 7월 20일(화)
create or replace function public.format_date_ko(p date)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p is null then null else
    extract(year from p)::int || '년 ' || extract(month from p)::int || '월 ' || extract(day from p)::int || '일('
    || (array['일', '월', '화', '수', '목', '금', '토'])[extract(dow from p)::int + 1] || ')'
  end;
$$;

-- 신청서 항목 설정: 필수 / 선택 / 숨김
-- 기본값은 src/features/programs/api.ts 의 FORM_FIELDS 와 같게 유지한다.
create or replace function public.registration_field_modes(p_config jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'student_name_en', 'required', 'birth_date', 'required', 'gender', 'required',
    'school', 'optional', 'grade', 'required', 'english_level', 'optional',
    'parent_email', 'required', 'address', 'optional', 'emergency', 'required', 'special_notes', 'optional'
  ) || coalesce((
    select jsonb_object_agg(e.key, e.value)
    from jsonb_each(case when jsonb_typeof(p_config -> 'fields') = 'object' then p_config -> 'fields' else '{}'::jsonb end) e
    where e.value #>> '{}' in ('required', 'optional', 'hidden')
      and e.key in ('student_name_en', 'birth_date', 'gender', 'school', 'grade', 'english_level',
                    'parent_email', 'address', 'emergency', 'special_notes')
  ), '{}'::jsonb);
$$;

-- 납부 일정 계산: 고정일 / 신청 후 N일 / 출국 N일 전. 이미 지난 기한은 신청일로 당긴다.
-- 계산 규칙은 src/domain/paymentRules.ts 의 computeSchedule 과 같다.
create or replace function public.compute_payment_schedule(p_program_id uuid, p_registered_on date)
returns table (rule_id uuid, kind text, label text, amount bigint, due_date date, sort integer, adjusted boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.id, r.kind, r.label, r.amount,
    greatest(d.raw, p_registered_on),
    (row_number() over (order by case r.kind when 'deposit' then 0 when 'balance' then 1 else 2 end, r.sort, r.created_at))::int,
    d.raw < p_registered_on
  from public.program_payment_rules r
  join public.programs pr on pr.id = r.program_id
  cross join lateral (
    select case r.due_rule_type
      when 'fixed' then r.due_fixed_date
      when 'after_registration' then p_registered_on + r.due_offset_days
      else pr.start_date - r.due_offset_days
    end as raw
  ) d
  where r.program_id = p_program_id;
$$;

-- 정원에 포함되는 등록(대기·취소·환불 제외)
create or replace function public.program_enrolled_count(p_program_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.registrations
  where program_id = p_program_id and deleted_at is null
    and status not in ('waitlisted', 'canceled', 'refunded');
$$;

-- 동의 문구 치환값 (프로그램·설정 기준)
create or replace function public.registration_consent_values(p_program_id uuid, p_partner_name text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'program_name', p_program.name || coalesce(' (' || nullif(p_program.season, '') || ')', ''),
    'program_end_date', public.format_date_ko(p_program.end_date),
    'destroy_after_days', p_program.destroy_after_days::text,
    'destroy_date', public.format_date_ko(p_program.end_date + p_program.destroy_after_days),
    'ticketing_agent', coalesce(nullif(trim(p_program.third_party_recipients ->> 'ticketing'), ''), '항공권 발권처(확정 후 안내)'),
    'school_name', coalesce(nullif(trim(p_program.third_party_recipients #>> '{school,name}'), ''), '현지 학교·기관(확정 후 안내)'),
    'school_country', coalesce(nullif(trim(p_program.third_party_recipients #>> '{school,country}'), ''), coalesce(p_program.country, '')),
    'lodging_name', coalesce(nullif(trim(p_program.third_party_recipients #>> '{lodging,name}'), ''), '숙소 기관(확정 후 안내)'),
    'lodging_country', coalesce(nullif(trim(p_program.third_party_recipients #>> '{lodging,country}'), ''), coalesce(p_program.country, '')),
    'partner_name', coalesce(nullif(trim(p_partner_name), ''), '소개 학원')
  )
  from public.programs p_program
  where p_program.id = p_program_id;
$$;

-- 이 프로그램 신청서에 보여 줄 동의 문구(최신 버전, 치환 완료)
create or replace function public.registration_consents(p_program_id uuid, p_partner_name text)
returns table (kind text, version integer, title text, body text, required boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with latest as (
    select distinct on (d.kind) d.kind, d.version, d.title, d.body
    from public.consent_documents d
    where d.kind in ('reg_privacy', 'reg_passport', 'reg_third_party', 'reg_health', 'reg_guardian',
                     'reg_partner_share', 'destruction_notice')
    order by d.kind, d.version desc
  )
  select l.kind, l.version, l.title,
    public.fill_placeholders(l.body, public.registration_consent_values(p_program.id, p_partner_name)),
    l.kind in ('reg_privacy', 'reg_third_party', 'reg_guardian', 'reg_passport')
  from latest l
  join public.programs p_program on p_program.id = p_program_id
  where (l.kind <> 'reg_passport' or p_program.passport_upload_enabled)
    and (l.kind <> 'reg_health' or p_program.health_field_enabled)
  order by array_position(array['reg_privacy', 'reg_passport', 'reg_third_party', 'reg_health', 'reg_guardian',
                                'reg_partner_share', 'destruction_notice'], l.kind);
$$;

-- 환불 규정 본문: 캠프별 문구가 없으면 기본안을 치환해 사용
create or replace function public.registration_refund_text(p_program_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(trim(p.refund_policy_text), ''),
    public.fill_placeholders(
      (select body from public.consent_documents where kind = 'refund_default' order by version desc limit 1),
      public.registration_consent_values(p.id, null)
    )
  )
  from public.programs p
  where p.id = p_program_id;
$$;

-- ---------------------------------------------------------------------------
-- 공개 신청서 조회 — 비로그인 허용. 학생·학부모 개인정보, 커미션, 내부 규칙은 돌려주지 않는다.
-- 납부 규칙은 "오늘 신청하면" 계산된 금액·기한만 보낸다.
-- ---------------------------------------------------------------------------
create or replace function public.public_register_form(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_prog public.programs;
  v_full boolean;
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
      from public.compute_payment_schedule(v_prog.id, public.kst_today()) s
    ), '[]'::jsonb),
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

-- ---------------------------------------------------------------------------
-- 상담 기록 링크(prefill 토큰) → 신청서 미리 채움. 개인정보를 돌려주므로 Edge Function(service role)만.
-- ---------------------------------------------------------------------------
create or replace function public.registration_prefill(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'student_name', l.student_name,
    'student_grade', l.student_grade,
    'parent_name', l.parent_name,
    'parent_phone', l.parent_phone,
    'partner', case when p.id is null then null else jsonb_build_object('id', p.id, 'name', p.name) end,
    'contact', case when c.id is null then null else jsonb_build_object('id', c.id, 'name', c.name) end
  )
  from public.access_tokens t
  join public.leads l on l.id = t.lead_id and l.deleted_at is null and l.destroyed_at is null
  left join public.partners p on p.id = l.partner_id
  left join public.partner_contacts c on c.id = l.partner_contact_id
  where t.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and t.purpose = 'prefill' and t.revoked_at is null and t.expires_at > now();
$$;

-- ---------------------------------------------------------------------------
-- 등록 신청 저장 — Edge Function(service role)만 호출. 한 트랜잭션:
--   검증 → 소개 경로 → 정원(프로그램 행 잠금) → 등록 → 건강 정보 → 동의 기록 → 납부 일정 → 상담 기록 연결 → 확인 링크
-- 오류 hint: NOT_FOUND / NOT_OPEN / FULL / DUPLICATE / TOO_MANY_REQUESTS / INVALID_INPUT / CONSENT_REQUIRED
-- ---------------------------------------------------------------------------
create or replace function public.submit_registration(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prog public.programs;
  v_modes jsonb;
  v_agree jsonb := coalesce(p -> 'agree', '{}'::jsonb);
  v_phone text := regexp_replace(coalesce(p ->> 'parent_phone', ''), '\D', '', 'g');
  v_em_phone text := nullif(regexp_replace(coalesce(p ->> 'emergency_phone', ''), '\D', '', 'g'), '');
  v_name_en text := nullif(upper(regexp_replace(trim(coalesce(p ->> 'student_name_en', '')), '\s+', ' ', 'g')), '');
  v_birth date;
  v_health text := nullif(trim(coalesce(p ->> 'health_notes', '')), '');
  v_window integer;
  v_token_id uuid;
  v_lead public.leads;
  v_partner_id uuid;
  v_contact_id uuid;
  v_source text;
  v_confirmed_at timestamptz;
  v_confirmed_by uuid;
  v_partner_name text;
  v_status text := 'received';
  v_reg_id uuid;
  v_today date := public.kst_today();
  v_my_token text;
  v_missing text[] := '{}';
  v_field text;
begin
  -- 프로그램 (정원 계산이 겹치지 않도록 행 잠금)
  select * into v_prog from public.programs
  where slug = lower(coalesce(p ->> 'slug', '')) and deleted_at is null
  for update;
  if not found then
    raise exception '신청서를 찾을 수 없습니다' using errcode = 'P0001', hint = 'NOT_FOUND';
  end if;
  if v_prog.status <> 'open' then
    raise exception '지금은 신청을 받지 않습니다' using errcode = 'P0001', hint = 'NOT_OPEN';
  end if;

  v_modes := public.registration_field_modes(v_prog.form_config);

  -- 항상 필수
  if coalesce(trim(p ->> 'student_name_ko'), '') = '' or coalesce(trim(p ->> 'parent_name'), '') = ''
     or v_phone !~ '^01[0-9]{8,9}$' then
    raise exception '필수 입력값을 확인해 주세요' using errcode = 'P0001', hint = 'INVALID_INPUT';
  end if;

  -- 캠프별 필수 항목
  foreach v_field in array array['student_name_en', 'birth_date', 'gender', 'school', 'grade', 'english_level',
                                 'parent_email', 'address', 'special_notes'] loop
    if v_modes ->> v_field = 'required' and coalesce(trim(p ->> v_field), '') = '' then
      v_missing := v_missing || v_field;
    end if;
  end loop;
  if v_modes ->> 'emergency' = 'required'
     and (coalesce(trim(p ->> 'emergency_name'), '') = '' or v_em_phone is null) then
    v_missing := v_missing || 'emergency'::text;
  end if;
  if cardinality(v_missing) > 0 then
    raise exception '필수 입력값을 확인해 주세요: %', array_to_string(v_missing, ', ')
      using errcode = 'P0001', hint = 'INVALID_INPUT';
  end if;

  -- 형식
  begin
    v_birth := nullif(trim(coalesce(p ->> 'birth_date', '')), '')::date;
  exception when others then
    raise exception '생년월일을 확인해 주세요' using errcode = 'P0001', hint = 'INVALID_INPUT';
  end;
  if (v_birth is not null and (v_birth > v_today or v_birth < date '1950-01-01'))
     or (v_name_en is not null and v_name_en !~ '^[A-Z][A-Z \-]{0,59}$')
     or (nullif(p ->> 'gender', '') is not null and p ->> 'gender' not in ('male', 'female'))
     or (nullif(trim(p ->> 'parent_email'), '') is not null and trim(p ->> 'parent_email') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
     or (v_em_phone is not null and v_em_phone !~ '^[0-9]{9,11}$') then
    raise exception '입력 형식을 확인해 주세요' using errcode = 'P0001', hint = 'INVALID_INPUT';
  end if;

  -- 동의: 개인정보·제3자·법정대리인·환불 규정·파기 안내 확인은 필수, 여권 사용 캠프는 고유식별정보도 필수,
  --       건강 특이사항을 적었으면 민감정보 동의 필수
  if coalesce((v_agree ->> 'reg_privacy')::boolean, false) is not true
     or coalesce((v_agree ->> 'reg_third_party')::boolean, false) is not true
     or coalesce((v_agree ->> 'reg_guardian')::boolean, false) is not true
     or coalesce((v_agree ->> 'refund')::boolean, false) is not true
     or coalesce((v_agree ->> 'destruction_notice')::boolean, false) is not true
     or (v_prog.passport_upload_enabled and coalesce((v_agree ->> 'reg_passport')::boolean, false) is not true)
     or (v_prog.health_field_enabled and v_health is not null and coalesce((v_agree ->> 'reg_health')::boolean, false) is not true)
  then
    raise exception '필수 동의가 필요합니다' using errcode = 'P0001', hint = 'CONSENT_REQUIRED';
  end if;
  if not v_prog.health_field_enabled then
    v_health := null;
  end if;

  -- 같은 번호의 단시간 중복 제출 제한
  select coalesce((value ->> 'same_phone_window_minutes')::int, 10) into v_window
  from public.settings where key = 'spam_guard';
  if p ->> 'phone_hash' is not null and exists (
    select 1 from public.submission_throttle
    where kind = 'registration' and phone_hash = p ->> 'phone_hash'
      and created_at > now() - make_interval(mins => coalesce(v_window, 10))
  ) then
    raise exception '잠시 후 다시 신청해 주세요' using errcode = 'P0001', hint = 'TOO_MANY_REQUESTS';
  end if;

  -- 같은 학생 중복 신청
  if exists (
    select 1 from public.registrations
    where program_id = v_prog.id and deleted_at is null and destroyed_at is null
      and parent_phone = v_phone and student_name_ko = trim(p ->> 'student_name_ko')
      and status not in ('canceled', 'refunded')
  ) then
    raise exception '이미 신청된 학생입니다' using errcode = 'P0001', hint = 'DUPLICATE';
  end if;

  -- 상담 기록 링크(prefill 토큰): 유효하면 상담 고객과 연결, 아니면 무시(신청은 계속)
  if nullif(p ->> 'token', '') is not null then
    select t.id into v_token_id
    from public.access_tokens t
    where t.token_hash = encode(extensions.digest(p ->> 'token', 'sha256'), 'hex')
      and t.purpose = 'prefill' and t.revoked_at is null and t.expires_at > now();
    if v_token_id is not null then
      select l.* into v_lead
      from public.access_tokens t
      join public.leads l on l.id = t.lead_id and l.deleted_at is null and l.destroyed_at is null
      where t.id = v_token_id;
    end if;
  end if;

  -- 소개 경로: 먼저 기록된 학원 기준(PLAN C5) → 상담 기록 > 링크(?ref=) > 신청서 선택
  if v_lead.id is not null and v_lead.partner_id is not null then
    v_partner_id := v_lead.partner_id;
    v_contact_id := v_lead.partner_contact_id;
    v_source := v_lead.attribution_source;
    v_confirmed_at := v_lead.attribution_confirmed_at;
    v_confirmed_by := v_lead.attribution_confirmed_by;
  end if;
  if v_partner_id is null and nullif(p ->> 'partner_code', '') is not null then
    select id into v_partner_id from public.partners
    where code = lower(p ->> 'partner_code') and active and deleted_at is null;
    if v_partner_id is not null then
      v_source := 'link';
      if nullif(p ->> 'contact_code', '') is not null then
        select id into v_contact_id from public.partner_contacts
        where partner_id = v_partner_id and code = lower(p ->> 'contact_code') and active;
      end if;
    end if;
  end if;
  if v_partner_id is null and nullif(p ->> 'partner_id', '') is not null then
    select id into v_partner_id from public.partners
    where id = (p ->> 'partner_id')::uuid and active and deleted_at is null;
    if v_partner_id is not null then
      v_source := 'form';
    end if;
  end if;
  if v_partner_id is not null and v_contact_id is null and nullif(p ->> 'contact_id', '') is not null then
    select id into v_contact_id from public.partner_contacts
    where partner_id = v_partner_id and id = (p ->> 'contact_id')::uuid and active;
  end if;
  if v_partner_id is not null then
    select name into v_partner_name from public.partners where id = v_partner_id;
  end if;

  -- 정원: 차면 대기 접수(사용 시) 또는 마감
  if v_prog.capacity is not null and public.program_enrolled_count(v_prog.id) >= v_prog.capacity then
    if not v_prog.waitlist_enabled then
      raise exception '정원이 마감되었습니다' using errcode = 'P0001', hint = 'FULL';
    end if;
    v_status := 'waitlisted';
  end if;

  insert into public.registrations (
    program_id, lead_id, partner_id, partner_contact_id, attribution_source,
    attribution_confirmed_at, attribution_confirmed_by, source_other, status,
    student_name_ko, student_name_en, birth_date, gender, school, grade, english_level,
    parent_name, parent_phone, parent_email, address,
    emergency_name, emergency_relation, emergency_phone, special_notes,
    registered_on, passport_status, destroy_due_date, partner_share_agreed
  ) values (
    v_prog.id, v_lead.id, v_partner_id, v_contact_id, v_source,
    v_confirmed_at, v_confirmed_by,
    case when v_partner_id is null then nullif(trim(left(p ->> 'source_other', 100)), '') end,
    v_status,
    trim(p ->> 'student_name_ko'),
    case when v_modes ->> 'student_name_en' <> 'hidden' then v_name_en end,
    case when v_modes ->> 'birth_date' <> 'hidden' then v_birth end,
    case when v_modes ->> 'gender' <> 'hidden' then nullif(p ->> 'gender', '') end,
    case when v_modes ->> 'school' <> 'hidden' then nullif(trim(p ->> 'school'), '') end,
    case when v_modes ->> 'grade' <> 'hidden' then nullif(trim(p ->> 'grade'), '') end,
    case when v_modes ->> 'english_level' <> 'hidden' then nullif(trim(p ->> 'english_level'), '') end,
    trim(p ->> 'parent_name'),
    v_phone,
    case when v_modes ->> 'parent_email' <> 'hidden' then nullif(lower(trim(p ->> 'parent_email')), '') end,
    case when v_modes ->> 'address' <> 'hidden' then nullif(trim(p ->> 'address'), '') end,
    case when v_modes ->> 'emergency' <> 'hidden' then nullif(trim(p ->> 'emergency_name'), '') end,
    case when v_modes ->> 'emergency' <> 'hidden' then nullif(trim(p ->> 'emergency_relation'), '') end,
    case when v_modes ->> 'emergency' <> 'hidden' then v_em_phone end,
    case when v_modes ->> 'special_notes' <> 'hidden' then nullif(trim(p ->> 'special_notes'), '') end,
    v_today,
    case when v_prog.passport_upload_enabled then 'pending' else 'not_required' end,
    v_prog.end_date + v_prog.destroy_after_days,
    v_partner_id is not null and coalesce((v_agree ->> 'reg_partner_share')::boolean, false)
  )
  returning id into v_reg_id;

  -- 건강 정보(민감정보 동의 시에만)
  if v_health is not null then
    insert into public.registration_health_notes (registration_id, body) values (v_reg_id, v_health);
  end if;

  -- 동의 기록: 신청 시점에 실제로 보여 준 문구(치환 완료)를 그대로 저장
  insert into public.consent_records (registration_id, kind, document_version, rendered_text, agreed, agreed_at)
  select v_reg_id, c.kind, c.version, c.body,
    coalesce((v_agree ->> c.kind)::boolean, false),
    case when coalesce((v_agree ->> c.kind)::boolean, false) then now() end
  from public.registration_consents(v_prog.id, v_partner_name) c
  where c.kind <> 'reg_partner_share' or v_partner_id is not null;

  insert into public.consent_records (registration_id, kind, document_version, rendered_text, agreed, agreed_at)
  values (v_reg_id, 'refund_policy', v_prog.refund_policy_version, public.registration_refund_text(v_prog.id), true, now());

  -- 납부 일정 (대기 접수는 승격 시 생성)
  if v_status <> 'waitlisted' then
    insert into public.payment_schedules (registration_id, kind, label, amount_due, due_date, created_from_rule_id, sort)
    select v_reg_id, s.kind, s.label, s.amount, s.due_date, s.rule_id, s.sort
    from public.compute_payment_schedule(v_prog.id, v_today) s;
  end if;

  -- 상담 기록 연결: 등록 전환 + 관심 프로그램 추가 + 링크 사용 시각
  if v_lead.id is not null then
    update public.leads set status = 'converted' where id = v_lead.id and status <> 'converted';
    insert into public.lead_program_interests (lead_id, program_id) values (v_lead.id, v_prog.id)
    on conflict do nothing;
    update public.access_tokens set used_at = coalesce(used_at, now()) where id = v_token_id;
  end if;

  -- 고객용 신청 내용 확인 링크(원문은 이번 한 번만 돌려준다) — 파기일 다음 날까지
  v_my_token := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
  insert into public.access_tokens (token_hash, purpose, registration_id, expires_at)
  values (
    encode(extensions.digest(v_my_token, 'sha256'), 'hex'), 'my_view', v_reg_id,
    greatest(((v_prog.end_date + v_prog.destroy_after_days + 1)::timestamp at time zone 'Asia/Seoul'), now() + interval '1 day')
  );

  if p ->> 'phone_hash' is not null then
    insert into public.submission_throttle (kind, phone_hash) values ('registration', p ->> 'phone_hash');
  end if;

  return jsonb_build_object(
    'registration_id', v_reg_id,
    'status', v_status,
    'my_token', v_my_token
  );
exception
  when foreign_key_violation or invalid_text_representation or check_violation then
    raise exception '입력값을 확인해 주세요' using errcode = 'P0001', hint = 'INVALID_INPUT';
end;
$$;

-- ---------------------------------------------------------------------------
-- 고객용 신청 내용 확인(/my/:token) — 읽기 전용 요약. 여권 이미지·주소·커미션은 없음.
-- Edge Function(service role)만 호출.
-- ---------------------------------------------------------------------------
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
    'bank_account', (select value from public.settings where key = 'bank_account'),
    'kakao_channel_url', (select value #>> '{}' from public.settings where key = 'kakao_channel_url')
  )
  from public.registrations r
  join public.programs pr on pr.id = r.program_id
  where r.id = p_registration_id and r.deleted_at is null;
$$;

create or replace function public.registration_summary_by_token(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.registration_summary(t.registration_id)
  from public.access_tokens t
  where t.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and t.purpose = 'my_view' and t.revoked_at is null and t.expires_at > now();
$$;

-- ---------------------------------------------------------------------------
-- 동의 문구 새 버전 (관리자). 기존 버전은 수정 불가 → 항상 새 버전으로 추가된다.
-- ---------------------------------------------------------------------------
create or replace function public.add_consent_version(p_kind text, p_title text, p_body text)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_next integer;
begin
  if not public.is_admin() then
    raise exception '동의 문구는 관리자만 바꿀 수 있습니다' using errcode = '42501';
  end if;
  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_body), '') = '' then
    raise exception '제목과 본문을 입력해 주세요' using errcode = 'P0001';
  end if;
  -- 같은 종류의 동시 추가를 순서대로 처리
  perform pg_advisory_xact_lock(hashtext('consent_documents:' || p_kind));
  select coalesce(max(version), 0) + 1 into v_next from public.consent_documents where kind = p_kind;
  insert into public.consent_documents (kind, version, title, body, created_by)
  values (p_kind, v_next, trim(p_title), p_body, (select auth.uid()));
  return v_next;
end;
$$;

-- ---------------------------------------------------------------------------
-- 실행 권한
-- ---------------------------------------------------------------------------
revoke execute on function
  public.fill_placeholders(text, jsonb),
  public.format_date_ko(date),
  public.registration_field_modes(jsonb),
  public.compute_payment_schedule(uuid, date),
  public.program_enrolled_count(uuid),
  public.registration_consent_values(uuid, text),
  public.registration_consents(uuid, text),
  public.registration_refund_text(uuid),
  public.public_register_form(text),
  public.registration_prefill(text),
  public.submit_registration(jsonb),
  public.registration_summary(uuid),
  public.registration_summary_by_token(text),
  public.add_consent_version(text, text, text)
from public, anon, authenticated;

-- 직원 화면용
grant execute on function
  public.format_date_ko(date),
  public.registration_field_modes(jsonb),
  public.compute_payment_schedule(uuid, date),
  public.add_consent_version(text, text, text)
to authenticated;

-- 공개 신청서 조회: 비로그인 허용(개인정보 없음)
grant execute on function public.public_register_form(text) to anon, authenticated;

-- 개인정보를 다루는 함수는 Edge Function(service role)만
grant execute on function
  public.registration_prefill(text),
  public.submit_registration(jsonb),
  public.registration_summary_by_token(text)
to service_role;
