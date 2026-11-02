-- M15 캠프비 할인: 얼리버드(기한 내 신청) + 학원별 할인(특정 MOU 학원 소개 등록생)
-- 할인은 캠프비(예약금+잔금)에서만 뺀다: 잔금에서 먼저, 잔금보다 크면 예약금에서. 추가 항목(항공권 등)은 그대로.
-- 신청(또는 대기 → 승격) 시점에 한 번 계산해 납부 일정을 그 금액으로 만들고, 적용 내역을 등록에 남긴다.
-- 이미 신청한 등록생에게는 소급 적용하지 않는다(필요하면 담당자가 납부 일정을 수정 → 변경 안내).

-- ---------------------------------------------------------------------------
-- 얼리버드
-- ---------------------------------------------------------------------------
alter table public.programs
  add column early_bird_discount bigint check (early_bird_discount is null or early_bird_discount > 0),
  add column early_bird_until date,
  add constraint programs_early_bird_pair check ((early_bird_discount is null) = (early_bird_until is null)),
  add constraint programs_early_bird_amount check (early_bird_discount is null or early_bird_discount < total_price or total_price = 0);

comment on column public.programs.early_bird_discount is '얼리버드 할인 금액(원). 이 날짜(포함)까지 신청하면 캠프비에서 뺀다';
comment on column public.programs.early_bird_until is '얼리버드 적용 마지막 날(한국 날짜, 포함)';

-- ---------------------------------------------------------------------------
-- 학원별 할인 (캠프마다 학원별 금액)
-- ---------------------------------------------------------------------------
create table public.program_partner_discounts (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  partner_id uuid not null references public.partners (id),
  amount bigint not null check (amount > 0),
  note text check (note is null or char_length(note) <= 200),
  created_by uuid references public.staff_profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, partner_id)
);
create index on public.program_partner_discounts (partner_id);
create index on public.program_partner_discounts (created_by);
create trigger set_updated_at before update on public.program_partner_discounts
  for each row execute function public.set_updated_at();
create trigger audit after insert or update or delete on public.program_partner_discounts
  for each row execute function public.audit_row();

alter table public.program_partner_discounts enable row level security;
-- 관리자·직원만(현지 팀·비로그인 불가)
create policy partner_discounts_select on public.program_partner_discounts for select to authenticated
  using (public.is_staff_or_admin());
create policy partner_discounts_insert on public.program_partner_discounts for insert to authenticated
  with check (public.is_staff_or_admin());
create policy partner_discounts_update on public.program_partner_discounts for update to authenticated
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());
create policy partner_discounts_delete on public.program_partner_discounts for delete to authenticated
  using (public.is_staff_or_admin());
grant select, insert, update, delete on public.program_partner_discounts to authenticated;

-- ---------------------------------------------------------------------------
-- 등록에 적용된 할인 기록
-- ---------------------------------------------------------------------------
alter table public.registrations
  add column discount_amount bigint not null default 0 check (discount_amount >= 0),
  add column discount_detail jsonb not null default '[]'::jsonb;
comment on column public.registrations.discount_amount is '신청(승격) 시점에 적용된 캠프비 할인 합계(원)';
comment on column public.registrations.discount_detail is '[{kind: early_bird|partner, label, amount}]';

-- ---------------------------------------------------------------------------
-- 이 신청에 적용되는 할인
-- ---------------------------------------------------------------------------
create or replace function public.registration_discounts(p_program_id uuid, p_partner_id uuid, p_registered_on date)
returns table (kind text, label text, amount bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select 'early_bird'::text,
         '얼리버드 할인 (' || public.format_date_ko(p.early_bird_until) || '까지 신청)',
         p.early_bird_discount
  from public.programs p
  where p.id = p_program_id and p.early_bird_discount is not null and p_registered_on <= p.early_bird_until
  union all
  select 'partner'::text, '학원 연계 할인', d.amount
  from public.program_partner_discounts d
  join public.partners pa on pa.id = d.partner_id and pa.deleted_at is null
  where d.program_id = p_program_id and p_partner_id is not null and d.partner_id = p_partner_id;
$$;

-- 할인을 반영한 납부 일정 (캠프비 = 예약금 + 잔금 범위 안에서만 뺀다)
create or replace function public.compute_registration_schedule(p_program_id uuid, p_registered_on date, p_partner_id uuid)
returns table (rule_id uuid, kind text, label text, amount bigint, due_date date, sort integer, adjusted boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_disc bigint;
  v_bal bigint;
  v_bal_cut bigint;
  v_dep_cut bigint;
begin
  select coalesce(sum(d.amount), 0) into v_disc
  from public.registration_discounts(p_program_id, p_partner_id, p_registered_on) d;
  select coalesce(sum(s.amount) filter (where s.kind = 'balance'), 0) into v_bal
  from public.compute_payment_schedule(p_program_id, p_registered_on) s;
  v_bal_cut := least(v_disc, v_bal);
  v_dep_cut := v_disc - v_bal_cut;
  return query
  select s.rule_id, s.kind,
    case when (s.kind = 'balance' and v_bal_cut > 0) or (s.kind = 'deposit' and v_dep_cut > 0)
      then s.label || ' (할인 반영)' else s.label end,
    case s.kind
      when 'balance' then s.amount - v_bal_cut
      when 'deposit' then greatest(s.amount - v_dep_cut, 0)
      else s.amount
    end,
    s.due_date, s.sort, s.adjusted
  from public.compute_payment_schedule(p_program_id, p_registered_on) s;
end;
$$;

-- ---------------------------------------------------------------------------
-- 공개 신청서: 얼리버드(오늘 기준)와, 학원 링크로 들어온 경우 그 학원 할인을 반영해 보여 준다
-- ---------------------------------------------------------------------------
drop function if exists public.public_register_form(text);
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
-- 신청 저장·대기 승격: 처음부터 할인 반영 금액으로 납부 일정을 만든다(본문은 M7·M9와 같고 일정 계산·할인 기록만 다름)
-- (만든 뒤 금액을 고치면 '변경 사유 필수·정정 안내' 장치가 작동하므로 생성 시점에 반영)
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
    from public.compute_registration_schedule(v_prog.id, v_today, v_partner_id) s;
    -- 적용된 할인 기록(M15)
    update public.registrations r
       set discount_amount = d.total, discount_detail = d.detail
      from (
        select coalesce(sum(x.amount), 0) as total,
               coalesce(jsonb_agg(jsonb_build_object('kind', x.kind, 'label', x.label, 'amount', x.amount)), '[]'::jsonb) as detail
        from public.registration_discounts(v_prog.id, v_partner_id, v_today) x
      ) d
     where r.id = v_reg_id;
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


create or replace function public.promote_waitlisted(p_registration_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg public.registrations;
  v_prog public.programs;
begin
  -- M15: 할인 계산 함수(직접 호출 불가)를 쓰기 위해 definer로 바꾸고, 권한은 여기서 확인(M9에서는 RLS로 확인)
  if not public.is_staff_or_admin() then
    raise exception '권한이 없습니다' using errcode = '42501';
  end if;
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
  from public.compute_registration_schedule(v_prog.id, public.kst_today(), v_reg.partner_id) s;
  -- 적용된 할인 기록(M15) — 할인은 승격일(= 새 등록일) 기준
  update public.registrations r
     set discount_amount = d.total, discount_detail = d.detail
    from (
      select coalesce(sum(x.amount), 0) as total,
             coalesce(jsonb_agg(jsonb_build_object('kind', x.kind, 'label', x.label, 'amount', x.amount)), '[]'::jsonb) as detail
      from public.registration_discounts(v_prog.id, v_reg.partner_id, public.kst_today()) x
    ) d
   where r.id = p_registration_id;
end;
$$;


-- ---------------------------------------------------------------------------
-- 고객용 신청 내용 확인에 할인 내역 추가
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
    'discounts', r.discount_detail,
    'bank_account', (select value from public.settings where key = 'bank_account'),
    'kakao_channel_url', (select value #>> '{}' from public.settings where key = 'kakao_channel_url')
  )
  from public.registrations r
  join public.programs pr on pr.id = r.program_id
  where r.id = p_registration_id and r.deleted_at is null;
$$;

-- ---------------------------------------------------------------------------
-- 실행 권한
-- ---------------------------------------------------------------------------
revoke execute on function
  public.registration_discounts(uuid, uuid, date),
  public.compute_registration_schedule(uuid, date, uuid),
  public.public_register_form(text, text),
  public.registration_summary(uuid)
from public, anon, authenticated;

-- 공개 신청서 조회: 비로그인 허용(개인정보 없음 — 학원 코드로는 할인 금액만 보인다)
grant execute on function public.public_register_form(text, text) to anon, authenticated;
