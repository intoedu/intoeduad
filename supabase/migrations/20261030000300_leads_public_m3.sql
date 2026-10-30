-- M3: 상담 시간 일괄 생성 · 공개 신청 폼용 조회(개인정보 없음) · 상담 신청 저장(트랜잭션)

-- ---------------------------------------------------------------------------
-- 상담 시간 일괄 생성 (직원 권한으로 실행 → RLS 적용). 시간은 모두 KST 기준.
-- p_breaks 예: [{"start":"12:00","end":"13:00"}]
-- ---------------------------------------------------------------------------
create or replace function public.generate_consultation_slots(
  p_from date,
  p_to date,
  p_weekdays integer[],          -- ISO 요일: 1=월 … 7=일
  p_start time,
  p_end time,
  p_interval_minutes integer,
  p_breaks jsonb default '[]'::jsonb,
  p_capacity integer default 1
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_day date;
  v_t time;
  v_next time;
  v_count integer := 0;
  v_inserted integer;
  v_in_break boolean;
begin
  if p_to < p_from then
    raise exception '종료일이 시작일보다 빠릅니다' using errcode = 'P0001';
  end if;
  if p_to - p_from > 183 then
    raise exception '한 번에 최대 6개월까지 만들 수 있습니다' using errcode = 'P0001';
  end if;
  if p_interval_minutes < 10 or p_interval_minutes > 240 then
    raise exception '상담 간격은 10~240분입니다' using errcode = 'P0001';
  end if;
  if p_end <= p_start then
    raise exception '종료 시각이 시작 시각보다 빨라야 합니다' using errcode = 'P0001';
  end if;

  v_day := p_from;
  while v_day <= p_to loop
    if extract(isodow from v_day)::int = any (p_weekdays) then
      v_t := p_start;
      loop
        v_next := v_t + make_interval(mins => p_interval_minutes);
        exit when v_next > p_end or v_next <= v_t;

        select exists (
          select 1 from jsonb_array_elements(coalesce(p_breaks, '[]'::jsonb)) b
          where v_t < (b ->> 'end')::time and v_next > (b ->> 'start')::time
        ) into v_in_break;

        if not v_in_break then
          insert into public.consultation_slots (starts_at, ends_at, capacity)
          values (
            (v_day + v_t) at time zone 'Asia/Seoul',
            (v_day + v_next) at time zone 'Asia/Seoul',
            greatest(p_capacity, 1)
          )
          on conflict (starts_at) do nothing;
          get diagnostics v_inserted = row_count;
          v_count := v_count + v_inserted;
        end if;
        v_t := v_next;
      end loop;
    end if;
    v_day := v_day + 1;
  end loop;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 공개 신청 폼용 조회 함수 — 학생·학부모 개인정보를 돌려주지 않는다
-- ---------------------------------------------------------------------------

-- 링크의 학원 코드 → 학원명 + 담당자(이름·역할) 목록
create or replace function public.public_partner_by_code(p_code text)
returns table (id uuid, name text, contacts jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'role', c.role, 'code', c.code) order by c.name)
      from public.partner_contacts c
      where c.partner_id = p.id and c.active
    ), '[]'::jsonb)
  from public.partners p
  where p.code = lower(p_code) and p.active and p.deleted_at is null;
$$;

-- 코드 없이 들어온 경우의 학원 선택 목록
create or replace function public.public_partners()
returns table (id uuid, name text, region text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, p.region
  from public.partners p
  where p.active and p.deleted_at is null
  order by p.name;
$$;

-- 학원을 직접 고른 경우의 담당자 목록
create or replace function public.public_partner_contacts(p_partner_id uuid)
returns table (id uuid, name text, role text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.role
  from public.partner_contacts c
  join public.partners p on p.id = c.partner_id
  where c.partner_id = p_partner_id and c.active and p.active and p.deleted_at is null
  order by c.name;
$$;

-- 관심 프로그램 목록 (모집 전·모집 중)
create or replace function public.public_programs()
returns table (id uuid, name text, season text, type text)
language sql
stable
security definer
set search_path = ''
as $$
  select id, name, season, type
  from public.programs
  where deleted_at is null and status in ('before', 'open')
  order by start_date;
$$;

-- 예약 가능한 상담 시간 (예약 인원은 노출하지 않음)
create or replace function public.public_available_slots(p_from date, p_to date)
returns table (id uuid, starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.starts_at, s.ends_at
  from public.consultation_slots s
  where s.is_open
    and s.booked_count < s.capacity
    and s.starts_at > now()
    and s.starts_at < now() + interval '90 days'
    and (s.starts_at at time zone 'Asia/Seoul')::date between p_from and least(p_to, p_from + 62)
  order by s.starts_at;
$$;

-- 신청 폼 설정: 카카오톡 채널 URL + 최신 동의 문구(치환 완료)
create or replace function public.public_lead_form_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'kakao_channel_url', (select value #>> '{}' from public.settings where key = 'kakao_channel_url'),
    'consents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', d.kind,
        'version', d.version,
        'title', d.title,
        'body', replace(d.body, '{{lead_retention}}',
          coalesce((select value ->> 'lead_label' from public.settings where key = 'retention'), '1년'))
      ) order by d.kind desc)
      from (
        select distinct on (kind) kind, version, title, body
        from public.consent_documents
        where kind in ('lead_privacy', 'lead_guardian')
        order by kind, version desc
      ) d
    ), '[]'::jsonb)
  );
$$;

-- JSON 배열 → text[] (배열이 아니면 빈 배열)
create or replace function public.jsonb_text_array(p jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p) = 'array'
    then coalesce(array(select jsonb_array_elements_text(p)), '{}')
    else '{}'::text[] end;
$$;

-- ---------------------------------------------------------------------------
-- 상담 신청 저장 — Edge Function(service role)만 호출. 한 트랜잭션으로 처리해
-- 슬롯이 이미 찼으면 신청 전체가 취소된다.
-- 오류 hint: SLOT_UNAVAILABLE / TOO_MANY_REQUESTS / INVALID_INPUT / CONSENT_REQUIRED
-- ---------------------------------------------------------------------------
create or replace function public.submit_lead(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner_id uuid;
  v_contact_id uuid;
  v_source text;
  v_lead_id uuid;
  v_scheduled timestamptz;
  v_window integer;
  v_lead_days integer;
  v_lead_label text;
  v_phone text := regexp_replace(coalesce(p ->> 'parent_phone', ''), '\D', '', 'g');
begin
  -- 필수 입력·동의
  if coalesce(trim(p ->> 'student_name'), '') = '' or coalesce(trim(p ->> 'parent_name'), '') = ''
     or v_phone !~ '^01[0-9]{8,9}$' then
    raise exception '필수 입력값을 확인해 주세요' using errcode = 'P0001', hint = 'INVALID_INPUT';
  end if;
  if coalesce((p ->> 'agree_privacy')::boolean, false) is not true
     or coalesce((p ->> 'agree_guardian')::boolean, false) is not true then
    raise exception '필수 동의가 필요합니다' using errcode = 'P0001', hint = 'CONSENT_REQUIRED';
  end if;

  -- 같은 번호의 단시간 중복 제출 제한
  select coalesce((value ->> 'same_phone_window_minutes')::int, 10) into v_window
  from public.settings where key = 'spam_guard';
  if p ->> 'phone_hash' is not null and exists (
    select 1 from public.submission_throttle
    where kind = 'lead' and phone_hash = p ->> 'phone_hash'
      and created_at > now() - make_interval(mins => coalesce(v_window, 10))
  ) then
    raise exception '잠시 후 다시 신청해 주세요' using errcode = 'P0001', hint = 'TOO_MANY_REQUESTS';
  end if;

  -- 소개 경로: 링크의 코드가 우선, 없으면 신청서에서 고른 학원
  if nullif(p ->> 'partner_code', '') is not null then
    select id into v_partner_id from public.partners
    where code = lower(p ->> 'partner_code') and active and deleted_at is null;
    if v_partner_id is not null then
      v_source := 'link';
    end if;
  end if;
  if v_partner_id is null and nullif(p ->> 'partner_id', '') is not null then
    select id into v_partner_id from public.partners
    where id = (p ->> 'partner_id')::uuid and active and deleted_at is null;
    if v_partner_id is not null then
      v_source := 'form';
    end if;
  end if;
  if v_partner_id is not null then
    if nullif(p ->> 'contact_code', '') is not null then
      select id into v_contact_id from public.partner_contacts
      where partner_id = v_partner_id and code = lower(p ->> 'contact_code') and active;
    end if;
    if v_contact_id is null and nullif(p ->> 'contact_id', '') is not null then
      select id into v_contact_id from public.partner_contacts
      where partner_id = v_partner_id and id = (p ->> 'contact_id')::uuid and active;
    end if;
  end if;

  select coalesce((value ->> 'lead_days')::int, 365), coalesce(value ->> 'lead_label', '1년')
    into v_lead_days, v_lead_label
  from public.settings where key = 'retention';

  insert into public.leads (
    partner_id, partner_contact_id, attribution_source, source_other,
    student_name, student_grade, interests,
    parent_name, parent_phone, relation, topics, message, destroy_due_date
  ) values (
    v_partner_id, v_contact_id, v_source,
    case when v_partner_id is null then nullif(trim(p ->> 'source_other'), '') end,
    trim(p ->> 'student_name'),
    nullif(p ->> 'student_grade', ''),
    public.jsonb_text_array(p -> 'interests'),
    trim(p ->> 'parent_name'),
    v_phone,
    nullif(p ->> 'relation', ''),
    public.jsonb_text_array(p -> 'topics'),
    nullif(trim(p ->> 'message'), ''),
    public.kst_today() + coalesce(v_lead_days, 365)
  )
  returning id into v_lead_id;

  insert into public.lead_program_interests (lead_id, program_id)
  select v_lead_id, pr.id
  from public.programs pr
  where pr.deleted_at is null
    and pr.id::text = any (public.jsonb_text_array(p -> 'program_ids'));

  -- 동의 기록: 신청 시점의 최신 문구를 치환해 원문 그대로 저장
  insert into public.consent_records (lead_id, kind, document_version, rendered_text, agreed, agreed_at)
  select v_lead_id, d.kind, d.version, replace(d.body, '{{lead_retention}}', coalesce(v_lead_label, '1년')), true, now()
  from (
    select distinct on (kind) kind, version, body
    from public.consent_documents
    where kind in ('lead_privacy', 'lead_guardian')
    order by kind, version desc
  ) d;

  -- 상담 시간 예약 (정원 초과 시 트리거가 예외 → 전체 취소)
  if nullif(p ->> 'slot_id', '') is not null then
    insert into public.consultations (lead_id, slot_id)
    values (v_lead_id, (p ->> 'slot_id')::uuid)
    returning scheduled_at into v_scheduled;
  end if;

  if p ->> 'phone_hash' is not null then
    insert into public.submission_throttle (kind, phone_hash) values ('lead', p ->> 'phone_hash');
  end if;
  delete from public.submission_throttle where created_at < now() - interval '1 day';

  return jsonb_build_object('lead_id', v_lead_id, 'scheduled_at', v_scheduled);
exception
  when foreign_key_violation or invalid_text_representation then
    raise exception '입력값을 확인해 주세요' using errcode = 'P0001', hint = 'INVALID_INPUT';
end;
$$;

-- ---------------------------------------------------------------------------
-- 실행 권한 (기본 회수 후 명시적 허용)
-- ---------------------------------------------------------------------------
revoke execute on function
  public.generate_consultation_slots(date, date, integer[], time, time, integer, jsonb, integer),
  public.public_partner_by_code(text),
  public.public_partners(),
  public.public_partner_contacts(uuid),
  public.public_programs(),
  public.public_available_slots(date, date),
  public.public_lead_form_config(),
  public.submit_lead(jsonb),
  public.jsonb_text_array(jsonb)
from public, anon, authenticated;

grant execute on function
  public.generate_consultation_slots(date, date, integer[], time, time, integer, jsonb, integer)
to authenticated;

-- 공개 폼용 조회: 비로그인 허용 (개인정보 없음)
grant execute on function
  public.public_partner_by_code(text),
  public.public_partners(),
  public.public_partner_contacts(uuid),
  public.public_programs(),
  public.public_available_slots(date, date),
  public.public_lead_form_config()
to anon, authenticated;

-- 신청 저장은 Edge Function(service role)만
grant execute on function public.submit_lead(jsonb) to service_role;
