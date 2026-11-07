-- M18 통합 신청 링크 · 유입 경로 필수 · 신청서 질문 편집 · 상담 이력 연결
-- 1) 상담 신청은 /apply 하나, 캠프 신청은 /register 하나(모집 중인 캠프를 고른다)로 받을 수 있게 공개 캠프 목록을 연다.
-- 2) "어디서 알게 되셨나요?"(유입 경로)를 관리자가 고칠 수 있는 목록으로 바꾸고, 두 신청서 모두 필수로 받는다.
--    학원 소개를 고르면 기존처럼 학원·선생님을 고르고(커미션 소개 경로), 그 밖의 경로는 이름·추가 내용만 기록한다.
-- 3) 기본 질문의 문구·안내·필수 여부를 바꾸고, 추가 질문(주관식·객관식·날짜·숫자 등)을 만들 수 있다.
--    상담 신청서 / 캠프 신청서(모든 캠프 공통 + 캠프별) 각각. 답변은 질문 문구와 함께 신청 건에 저장한다.
-- 4) 캠프 신청서에서 "상담을 신청한 적이 있나요?"를 묻고, 같은 학부모 번호 + 같은 학생 이름의 상담 기록이 있으면 자동 연결한다.
--    애매하면(번호만 같음, '예'라고 했는데 못 찾음) "상담 연결 확인 필요"로 표시하고 담당자가 직접 연결·해제한다.
-- 5) 두 신청서 모두 "카카오톡을 쓰시나요?"를 묻는다(상담 일정·등록 완료 안내를 카카오톡으로 보내기 때문).
--    안 쓰면 대신 받을 카카오톡 번호 또는 다른 SNS·연락처를 받고, 직원 화면에 "카카오톡 미사용"으로 표시한다.
--    대신 받을 카카오톡 번호가 있으면 알림톡은 그 번호로 보낸다.
-- 추가 질문 답변·유입 경로 추가 내용은 개인정보가 섞일 수 있어 감사 기록에 값을 남기지 않고, 파기 때 함께 지운다.

-- ---------------------------------------------------------------------------
-- 유입 경로 목록
-- ---------------------------------------------------------------------------
create table public.inflow_channels (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(trim(label)) between 1 and 40),
  -- partner: 학원 소개(학원·선생님 선택) / plain: 고르기만 / detail: 추가 내용 입력칸
  kind text not null default 'plain' check (kind in ('partner', 'plain', 'detail')),
  detail_label text check (detail_label is null or char_length(detail_label) <= 60),
  detail_required boolean not null default false,
  sort integer not null default 0,
  active boolean not null default true,
  -- 지울 수 없는 기본 항목(학원 소개·기타)
  system_key text unique check (system_key in ('partner', 'other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index inflow_channels_one_partner on public.inflow_channels ((true)) where kind = 'partner';
create trigger set_updated_at before update on public.inflow_channels
  for each row execute function public.set_updated_at();
create trigger audit after insert or update or delete on public.inflow_channels
  for each row execute function public.audit_row();

create or replace function public.guard_inflow_channel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.system_key = 'partner' and new.kind <> 'partner' then
    raise exception '학원 소개 항목의 종류는 바꿀 수 없습니다' using errcode = 'P0001';
  end if;
  if old.system_key is not null and new.system_key is distinct from old.system_key then
    raise exception '기본 항목은 바꿀 수 없습니다' using errcode = 'P0001';
  end if;
  if old.system_key is null and new.system_key is not null then
    raise exception '기본 항목은 새로 만들 수 없습니다' using errcode = 'P0001';
  end if;
  if new.kind = 'partner' and new.system_key is distinct from 'partner' then
    raise exception '학원 소개 항목은 하나만 둘 수 있습니다' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger guard_inflow_channel before update on public.inflow_channels
  for each row execute function public.guard_inflow_channel();

create or replace function public.guard_inflow_channel_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- 기본 항목(학원 소개·기타)은 이 마이그레이션에서만 만든다
  if (new.system_key is not null or new.kind = 'partner') and (select auth.uid()) is not null then
    raise exception '학원 소개 항목은 하나만 둘 수 있습니다' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger guard_inflow_channel_insert before insert on public.inflow_channels
  for each row execute function public.guard_inflow_channel_insert();

insert into public.inflow_channels (label, kind, detail_label, detail_required, sort, system_key) values
  ('학원 소개', 'partner', null, false, 10, 'partner'),
  ('지인 소개', 'detail', '소개해 주신 분 (선택)', false, 20, null),
  ('인스타그램', 'plain', null, false, 30, null),
  ('네이버 블로그·카페', 'plain', null, false, 40, null),
  ('유튜브', 'plain', null, false, 50, null),
  ('인터넷 검색', 'plain', null, false, 60, null),
  ('설명회·박람회', 'plain', null, false, 70, null),
  ('이전에 참가한 적 있음', 'plain', null, false, 80, null),
  ('기타', 'detail', '알게 된 경로', true, 90, 'other');

alter table public.inflow_channels enable row level security;
create policy inflow_channels_select on public.inflow_channels for select to authenticated
  using (public.is_active_staff());
create policy inflow_channels_insert on public.inflow_channels for insert to authenticated
  with check (public.is_admin());
create policy inflow_channels_update on public.inflow_channels for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- 지우지 않고 "사용 안 함"으로 둔다(지난 기록의 경로 이름 유지)
revoke all on public.inflow_channels from anon;
grant select, insert, update on public.inflow_channels to authenticated;

-- ---------------------------------------------------------------------------
-- 신청서 추가 질문 (상담 신청서 / 캠프 신청서: 모든 캠프 공통 또는 캠프별)
-- ---------------------------------------------------------------------------
create or replace function public.text_array_max_len(p text[])
returns integer
language sql
immutable
set search_path = ''
as $$
  select coalesce(max(char_length(x)), 0) from unnest(p) x;
$$;

create table public.form_questions (
  id uuid primary key default gen_random_uuid(),
  form text not null check (form in ('lead', 'registration')),
  program_id uuid references public.programs (id) on delete cascade,
  label text not null check (char_length(trim(label)) between 1 and 200),
  help text check (help is null or char_length(help) <= 500),
  type text not null check (type in ('short_text', 'long_text', 'single_choice', 'multi_choice', 'dropdown', 'yes_no', 'date', 'number')),
  options text[] not null default '{}' check (cardinality(options) <= 30 and public.text_array_max_len(options) <= 100),
  required boolean not null default false,
  sort integer not null default 0,
  active boolean not null default true,
  created_by uuid references public.staff_profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint form_questions_lead_global check (form = 'registration' or program_id is null),
  constraint form_questions_choice_options check (type not in ('single_choice', 'multi_choice', 'dropdown') or cardinality(options) >= 1)
);
create index on public.form_questions (form, program_id);
create trigger set_updated_at before update on public.form_questions
  for each row execute function public.set_updated_at();
create trigger audit after insert or update or delete on public.form_questions
  for each row execute function public.audit_row();

-- 선택지 정리: 앞뒤 공백·빈 항목·중복 제거
create or replace function public.normalize_form_question()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.label := trim(new.label);
  new.help := nullif(trim(coalesce(new.help, '')), '');
  new.options := coalesce(array(
    select o from (
      select distinct on (trim(x)) trim(x) as o, ord
      from unnest(new.options) with ordinality as t(x, ord)
      where trim(x) <> ''
      order by trim(x), ord
    ) s order by ord
  ), '{}');
  if new.type not in ('single_choice', 'multi_choice', 'dropdown') then
    new.options := '{}';
  end if;
  return new;
end;
$$;
create trigger normalize_form_question before insert or update on public.form_questions
  for each row execute function public.normalize_form_question();

alter table public.form_questions enable row level security;
create policy form_questions_select on public.form_questions for select to authenticated
  using (public.is_active_staff());
-- 공통 질문은 관리자, 캠프별 질문은 관리자·직원
create policy form_questions_insert on public.form_questions for insert to authenticated
  with check ((program_id is null and public.is_admin()) or (program_id is not null and public.is_staff_or_admin()));
create policy form_questions_update on public.form_questions for update to authenticated
  using ((program_id is null and public.is_admin()) or (program_id is not null and public.is_staff_or_admin()))
  with check ((program_id is null and public.is_admin()) or (program_id is not null and public.is_staff_or_admin()));
create policy form_questions_delete on public.form_questions for delete to authenticated
  using ((program_id is null and public.is_admin()) or (program_id is not null and public.is_staff_or_admin()));
revoke all on public.form_questions from anon;
grant select, insert, update, delete on public.form_questions to authenticated;

-- ---------------------------------------------------------------------------
-- 신청서 문구 설정 (기본 질문 문구·안내·필수 여부, 상담 신청서 제목·소개)
-- ---------------------------------------------------------------------------
insert into public.settings (key, value) values ('form_settings', jsonb_build_object(
  'lead', jsonb_build_object(
    'title', '유학·캠프 상담 신청',
    'intro', '아래 내용을 남겨 주시면 인투유학 담당자가 확인 후 연락드립니다. 입력은 2~3분이면 충분합니다.',
    'fields', '{}'::jsonb
  ),
  'registration', jsonb_build_object('intro', '', 'fields', '{}'::jsonb),
  'inflow_label', '어디서 알게 되셨나요?',
  'consulted_label', '인투유학 상담을 신청하신 적이 있나요?'
))
on conflict (key) do nothing;

-- 상담 신청서 기본 질문의 필수/선택/숨김 (기본값은 src/domain/formSettings.ts 의 LEAD_FIELDS 와 같게 유지)
create or replace function public.lead_field_modes()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'grade', 'required', 'interests', 'optional', 'programs', 'optional', 'relation', 'required',
    'slot', 'optional', 'topics', 'optional', 'message', 'optional'
  ) || coalesce((
    select jsonb_object_agg(e.key, e.value -> 'mode')
    from jsonb_each(coalesce((select value #> '{lead,fields}' from public.settings where key = 'form_settings'), '{}'::jsonb)) e
    where jsonb_typeof(e.value) = 'object'
      and (
        (e.key in ('grade', 'interests', 'programs', 'relation', 'topics', 'message') and e.value ->> 'mode' in ('required', 'optional', 'hidden'))
        -- 상담 시간은 비어 있을 수 있어 필수로 둘 수 없다
        or (e.key = 'slot' and e.value ->> 'mode' in ('optional', 'hidden'))
      )
  ), '{}'::jsonb);
$$;

-- 캠프 신청서 항목: 기본값 → 설정(새 캠프 기본값) → 캠프별 설정 순으로 덮어쓴다
create or replace function public.registration_field_modes(p_config jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'student_name_en', 'required', 'birth_date', 'required', 'gender', 'required',
    'school', 'optional', 'grade', 'required', 'english_level', 'optional',
    'parent_email', 'required', 'address', 'optional', 'emergency', 'required', 'special_notes', 'optional'
  ) || coalesce((
    select jsonb_object_agg(e.key, e.value -> 'mode')
    from jsonb_each(coalesce((select value #> '{registration,fields}' from public.settings where key = 'form_settings'), '{}'::jsonb)) e
    where jsonb_typeof(e.value) = 'object' and e.value ->> 'mode' in ('required', 'optional', 'hidden')
      and e.key in ('student_name_en', 'birth_date', 'gender', 'school', 'grade', 'english_level',
                    'parent_email', 'address', 'emergency', 'special_notes')
  ), '{}'::jsonb) || coalesce((
    select jsonb_object_agg(e.key, e.value)
    from jsonb_each(case when jsonb_typeof(p_config -> 'fields') = 'object' then p_config -> 'fields' else '{}'::jsonb end) e
    where e.value #>> '{}' in ('required', 'optional', 'hidden')
      and e.key in ('student_name_en', 'birth_date', 'gender', 'school', 'grade', 'english_level',
                    'parent_email', 'address', 'emergency', 'special_notes')
  ), '{}'::jsonb);
$$;

-- 기본 질문의 문구·안내(공개 신청서용): {key: {label, help}}
create or replace function public.form_field_texts(p_form text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(e.key, jsonb_strip_nulls(jsonb_build_object(
      'label', nullif(trim(left(e.value ->> 'label', 200)), ''),
      'help', nullif(trim(left(e.value ->> 'help', 500)), '')
    ))), '{}'::jsonb)
  from jsonb_each(coalesce((select value -> p_form -> 'fields' from public.settings where key = 'form_settings'), '{}'::jsonb)) e
  where jsonb_typeof(e.value) = 'object';
$$;

-- 유입 경로 질문(공개 신청서용)
create or replace function public.public_inflow()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'label', coalesce(nullif(trim((select value ->> 'inflow_label' from public.settings where key = 'form_settings')), ''), '어디서 알게 되셨나요?'),
    'channels', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'label', c.label, 'kind', c.kind, 'detail_label', c.detail_label, 'detail_required', c.detail_required
      ) order by c.sort, c.created_at)
      from public.inflow_channels c where c.active
    ), '[]'::jsonb)
  );
$$;

-- 추가 질문(공개 신청서용): 상담 신청서 / 캠프 신청서(공통 + 해당 캠프)
create or replace function public.public_form_questions(p_form text, p_program_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', q.id, 'label', q.label, 'help', q.help, 'type', q.type, 'options', to_jsonb(q.options), 'required', q.required
    ) order by (q.program_id is not null), q.sort, q.created_at), '[]'::jsonb)
  from public.form_questions q
  where q.active and q.form = p_form
    and (q.program_id is null or (p_form = 'registration' and q.program_id = p_program_id));
$$;

-- ---------------------------------------------------------------------------
-- 신청 건 컬럼
-- ---------------------------------------------------------------------------
alter table public.leads
  add column inflow_channel_id uuid references public.inflow_channels (id) on delete set null,
  add column inflow_label text check (inflow_label is null or char_length(inflow_label) <= 40),
  add column inflow_detail text check (inflow_detail is null or char_length(inflow_detail) <= 100),
  add column answers jsonb not null default '[]'::jsonb check (jsonb_typeof(answers) = 'array'),
  add column kakao_use boolean,
  add column kakao_alt_phone text check (kakao_alt_phone is null or kakao_alt_phone ~ '^[0-9]{9,11}$'),
  add column alt_contact text check (alt_contact is null or char_length(alt_contact) <= 100);
alter table public.registrations
  add column inflow_channel_id uuid references public.inflow_channels (id) on delete set null,
  add column inflow_label text check (inflow_label is null or char_length(inflow_label) <= 40),
  add column inflow_detail text check (inflow_detail is null or char_length(inflow_detail) <= 100),
  add column answers jsonb not null default '[]'::jsonb check (jsonb_typeof(answers) = 'array'),
  add column consulted_before text check (consulted_before in ('yes', 'no', 'unsure')),
  add column lead_link_method text check (lead_link_method in ('token', 'auto', 'staff')),
  add column lead_check_needed boolean not null default false,
  add column kakao_use boolean,
  add column kakao_alt_phone text check (kakao_alt_phone is null or kakao_alt_phone ~ '^[0-9]{9,11}$'),
  add column alt_contact text check (alt_contact is null or char_length(alt_contact) <= 100);
comment on column public.registrations.kakao_use is '카카오톡 사용 여부(false = 미사용 — 안내를 다른 방법으로)';
comment on column public.registrations.kakao_alt_phone is '카카오톡 미사용 시 대신 받을 카카오톡 계정 전화번호(알림톡 수신)';
comment on column public.registrations.alt_contact is '카카오톡 미사용 시 다른 SNS 아이디·연락처';
create index on public.leads (inflow_channel_id);
create index on public.registrations (inflow_channel_id);
comment on column public.leads.inflow_label is '신청 시점의 유입 경로 이름(경로 이름을 바꿔도 기록 유지)';
comment on column public.registrations.answers is '추가 질문 답변 [{id, label, type, value}] — 질문 문구를 함께 저장';
comment on column public.registrations.lead_link_method is '상담 기록 연결 방법: token=상담 기록 링크, auto=번호·이름 자동, staff=담당자';
comment on column public.registrations.lead_check_needed is '상담 기록 연결을 담당자가 확인해야 함';

-- 감사 기록: 답변·추가 내용 값은 남기지 않는다
create or replace trigger audit after insert or update or delete on public.leads
  for each row execute function public.audit_row(
    'student_name', 'parent_name', 'parent_phone', 'relation', 'message', 'source_other', 'answers', 'inflow_detail',
    'kakao_alt_phone', 'alt_contact'
  );
create or replace trigger audit after insert or update or delete on public.registrations
  for each row execute function public.audit_row(
    'student_name_ko', 'student_name_en', 'birth_date', 'gender', 'school', 'grade', 'english_level',
    'parent_name', 'parent_phone', 'parent_email', 'address',
    'emergency_name', 'emergency_relation', 'emergency_phone', 'special_notes', 'source_other', 'answers', 'inflow_detail',
    'kakao_alt_phone', 'alt_contact'
  );

-- 파기: 답변·추가 내용도 함께 지운다
create or replace function public.clear_form_answers_on_destroy()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.destroyed_at is null and new.destroyed_at is not null then
    new.answers := '[]'::jsonb;
    new.inflow_detail := null;
    new.kakao_alt_phone := null;
    new.alt_contact := null;
  end if;
  return new;
end;
$$;
create trigger clear_form_answers before update of destroyed_at on public.leads
  for each row execute function public.clear_form_answers_on_destroy();
create trigger clear_form_answers before update of destroyed_at on public.registrations
  for each row execute function public.clear_form_answers_on_destroy();

-- ---------------------------------------------------------------------------
-- 답변 검사·정리 → [{id, label, type, value}]
-- p_answers: {질문 id: 값} (값은 글자 또는 글자 배열)
-- p_enforce: 필수 질문 검사(직원 직접 입력은 하지 않음)
-- 오류 hint: QUESTION_REQUIRED / QUESTION_INVALID (메시지를 그대로 보여 준다)
-- ---------------------------------------------------------------------------
create or replace function public.collect_form_answers(p_form text, p_program_id uuid, p_answers jsonb, p_enforce boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q public.form_questions;
  v_raw jsonb;
  v_text text;
  v_list text[];
  v_value jsonb;
  v_out jsonb := '[]'::jsonb;
  v_src jsonb := case when jsonb_typeof(p_answers) = 'object' then p_answers else '{}'::jsonb end;
begin
  for q in
    select * from public.form_questions x
    where x.active and x.form = p_form
      and (x.program_id is null or (p_form = 'registration' and x.program_id = p_program_id))
    order by (x.program_id is not null), x.sort, x.created_at
  loop
    v_raw := v_src -> q.id::text;
    v_value := null;
    if q.type = 'multi_choice' then
      v_list := case when jsonb_typeof(v_raw) = 'array'
        then array(select distinct trim(x) from jsonb_array_elements_text(v_raw) x where trim(x) <> '')
        else '{}'::text[] end;
      if cardinality(v_list) > 0 then
        if not (v_list <@ q.options) then
          raise exception '「%」 답변을 다시 골라 주세요', q.label using errcode = 'P0001', hint = 'QUESTION_INVALID';
        end if;
        -- 선택지 순서대로 저장
        v_value := to_jsonb(array(select o from unnest(q.options) with ordinality t(o, n) where o = any (v_list) order by n));
      end if;
    else
      v_text := case when jsonb_typeof(v_raw) in ('string', 'number', 'boolean') then trim(v_raw #>> '{}') else '' end;
      if v_text <> '' then
        case q.type
          when 'short_text' then v_value := to_jsonb(left(v_text, 300));
          when 'long_text' then v_value := to_jsonb(left(v_text, 2000));
          when 'number' then
            if v_text !~ '^-?[0-9]{1,12}(\.[0-9]{1,4})?$' then
              raise exception '「%」에는 숫자만 입력해 주세요', q.label using errcode = 'P0001', hint = 'QUESTION_INVALID';
            end if;
            v_value := to_jsonb(v_text);
          when 'date' then
            begin
              v_value := to_jsonb(v_text::date::text);
            exception when others then
              raise exception '「%」 날짜를 확인해 주세요', q.label using errcode = 'P0001', hint = 'QUESTION_INVALID';
            end;
          when 'yes_no' then
            if v_text not in ('예', '아니오') then
              raise exception '「%」 답변을 다시 골라 주세요', q.label using errcode = 'P0001', hint = 'QUESTION_INVALID';
            end if;
            v_value := to_jsonb(v_text);
          else
            -- single_choice / dropdown
            if not (v_text = any (q.options)) then
              raise exception '「%」 답변을 다시 골라 주세요', q.label using errcode = 'P0001', hint = 'QUESTION_INVALID';
            end if;
            v_value := to_jsonb(v_text);
        end case;
      end if;
    end if;

    if v_value is null then
      if q.required and p_enforce then
        raise exception '「%」에 답해 주세요', q.label using errcode = 'P0001', hint = 'QUESTION_REQUIRED';
      end if;
      continue;
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object('id', q.id, 'label', q.label, 'type', q.type, 'value', v_value));
  end loop;
  return v_out;
end;
$$;

-- 유입 경로 정하기. 학원이 정해졌으면 "학원 소개", 아니면 신청서에서 고른 경로.
-- (지난 화면에서 보낸 source_other만 있으면 "기타"로 받는다)
-- 오류 hint: INFLOW_REQUIRED (메시지를 그대로 보여 준다)
create or replace function public.resolve_inflow(p jsonb, p_partner_id uuid, p_enforce boolean)
returns table (channel_id uuid, label text, detail text, source_text text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.inflow_channels;
  v_detail text := nullif(trim(left(coalesce(p ->> 'inflow_detail', ''), 100)), '');
  v_legacy text := nullif(trim(left(coalesce(p ->> 'source_other', ''), 100)), '');
begin
  if p_partner_id is not null then
    select * into c from public.inflow_channels where system_key = 'partner';
    return query select c.id, c.label, null::text, null::text;
    return;
  end if;

  if nullif(p ->> 'inflow_channel_id', '') is not null then
    begin
      select * into c from public.inflow_channels x where x.id = (p ->> 'inflow_channel_id')::uuid and x.active;
    exception when invalid_text_representation then
      c := null;
    end;
  end if;
  if c.id is null and v_legacy is not null then
    select * into c from public.inflow_channels where system_key = 'other';
    v_detail := coalesce(v_detail, v_legacy);
  end if;

  if c.id is null then
    if p_enforce then
      raise exception '알게 된 경로를 선택해 주세요' using errcode = 'P0001', hint = 'INFLOW_REQUIRED';
    end if;
    return query select null::uuid, null::text, v_detail, v_detail;
    return;
  end if;

  if c.kind = 'plain' then
    v_detail := null;
  elsif c.kind = 'partner' and v_detail is null and p_enforce then
    -- 학원 소개인데 목록에서 못 고른 경우: 학원 이름을 적게 한다
    raise exception '소개해 준 학원 이름을 적어 주세요' using errcode = 'P0001', hint = 'INFLOW_REQUIRED';
  elsif c.kind = 'detail' and c.detail_required and v_detail is null and p_enforce then
    raise exception '%을(를) 적어 주세요', coalesce(c.detail_label, '알게 된 경로') using errcode = 'P0001', hint = 'INFLOW_REQUIRED';
  end if;

  return query select c.id, c.label, v_detail,
    left(c.label || coalesce(': ' || v_detail, ''), 100);
end;
$$;

-- 카카오톡 사용 여부: 안 쓰면 대신 받을 카카오톡 번호나 다른 SNS·연락처 중 하나는 필수
-- 오류 hint: KAKAO_REQUIRED (메시지를 그대로 보여 준다)
create or replace function public.resolve_kakao(p jsonb, p_enforce boolean)
returns table (kakao_use boolean, alt_phone text, alt_contact text)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_use boolean;
  v_phone text := nullif(regexp_replace(coalesce(p ->> 'kakao_alt_phone', ''), '\D', '', 'g'), '');
  v_contact text := nullif(trim(left(coalesce(p ->> 'alt_contact', ''), 100)), '');
begin
  if jsonb_typeof(p -> 'kakao_use') = 'boolean' then
    v_use := (p ->> 'kakao_use')::boolean;
  end if;
  if v_use is null and p_enforce then
    raise exception '카카오톡 사용 여부를 골라 주세요' using errcode = 'P0001', hint = 'KAKAO_REQUIRED';
  end if;
  if v_use is distinct from false then
    return query select v_use, null::text, null::text;
    return;
  end if;
  if v_phone is not null and v_phone !~ '^01[0-9]{8,9}$' then
    raise exception '대신 받을 카카오톡 번호를 확인해 주세요' using errcode = 'P0001', hint = 'KAKAO_REQUIRED';
  end if;
  if v_phone is null and v_contact is null and p_enforce then
    raise exception '카카오톡을 쓰지 않으시면 대신 받을 카카오톡 번호나 다른 연락 방법을 적어 주세요' using errcode = 'P0001', hint = 'KAKAO_REQUIRED';
  end if;
  return query select false, v_phone, v_contact;
end;
$$;

-- ---------------------------------------------------------------------------
-- 상담 신청 저장 (M3 정의 + 유입 경로·추가 질문·기본 질문 필수 여부)
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
  v_staff boolean := coalesce(current_setting('app.staff_entry', true), '') = 'on';
  v_modes jsonb := public.lead_field_modes();
  v_inflow record;
  v_answers jsonb;
  v_kakao record;
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

  -- 기본 질문 중 "필수"로 정한 항목 (직원 직접 입력은 검사하지 않음)
  if not v_staff then
    if (v_modes ->> 'grade' = 'required' and coalesce(trim(p ->> 'student_grade'), '') = '')
       or (v_modes ->> 'relation' = 'required' and coalesce(trim(p ->> 'relation'), '') = '')
       or (v_modes ->> 'message' = 'required' and coalesce(trim(p ->> 'message'), '') = '')
       or (v_modes ->> 'interests' = 'required' and cardinality(public.jsonb_text_array(p -> 'interests')) = 0)
       or (v_modes ->> 'topics' = 'required' and cardinality(public.jsonb_text_array(p -> 'topics')) = 0)
       or (v_modes ->> 'programs' = 'required' and cardinality(public.jsonb_text_array(p -> 'program_ids')) = 0
           and exists (select 1 from public.programs where deleted_at is null and status in ('before', 'open'))) then
      raise exception '필수 입력값을 확인해 주세요' using errcode = 'P0001', hint = 'INVALID_INPUT';
    end if;
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

  -- 유입 경로(필수) · 추가 질문
  select * into v_inflow from public.resolve_inflow(p, v_partner_id, not v_staff);
  v_answers := public.collect_form_answers('lead', null, p -> 'answers', not v_staff);
  select * into v_kakao from public.resolve_kakao(p, not v_staff);

  select coalesce((value ->> 'lead_days')::int, 365), coalesce(value ->> 'lead_label', '1년')
    into v_lead_days, v_lead_label
  from public.settings where key = 'retention';

  insert into public.leads (
    partner_id, partner_contact_id, attribution_source, source_other,
    student_name, student_grade, interests,
    parent_name, parent_phone, relation, topics, message, destroy_due_date,
    inflow_channel_id, inflow_label, inflow_detail, answers, kakao_use, kakao_alt_phone, alt_contact
  ) values (
    v_partner_id, v_contact_id, v_source,
    case when v_partner_id is null then v_inflow.source_text end,
    trim(p ->> 'student_name'),
    case when v_modes ->> 'grade' <> 'hidden' or v_staff then nullif(p ->> 'student_grade', '') end,
    case when v_modes ->> 'interests' <> 'hidden' or v_staff then public.jsonb_text_array(p -> 'interests') else '{}' end,
    trim(p ->> 'parent_name'),
    v_phone,
    case when v_modes ->> 'relation' <> 'hidden' or v_staff then nullif(p ->> 'relation', '') end,
    case when v_modes ->> 'topics' <> 'hidden' or v_staff then public.jsonb_text_array(p -> 'topics') else '{}' end,
    case when v_modes ->> 'message' <> 'hidden' or v_staff then nullif(trim(p ->> 'message'), '') end,
    public.kst_today() + coalesce(v_lead_days, 365),
    v_inflow.channel_id, v_inflow.label, case when v_partner_id is null then v_inflow.detail end, v_answers,
    v_kakao.kakao_use, v_kakao.alt_phone, v_kakao.alt_contact
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

-- 직원 직접 입력(상담)도 필수 검사를 건너뛰도록 표시
do $$
declare
  v text := pg_get_functiondef('public.admin_create_lead(jsonb)'::regprocedure);
  v_old text := 'v_res := public.submit_lead(';
begin
  if (length(v) - length(replace(v, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'admin_create_lead 본문이 예상과 다릅니다';
  end if;
  execute replace(v, v_old, 'perform set_config(''app.staff_entry'', ''on'', true);' || E'\n  ' || v_old);
end $$;

-- ---------------------------------------------------------------------------
-- 캠프 신청 저장: 상담 기록 자동 연결 · 유입 경로 · 추가 질문 · 상담 이력 답변 (기존 본문에 덧붙임)
-- ---------------------------------------------------------------------------
do $$
declare
  v text := pg_get_functiondef('public.submit_registration(jsonb)'::regprocedure);
  a1 text := 'v_field text;';
  a2 text := '-- 소개 경로: 먼저 기록된 학원 기준(PLAN C5)';
  a3 text := '-- 정원: 차면 대기 접수(사용 시) 또는 마감';
  a4 text := 'case when v_partner_id is null then nullif(trim(left(p ->> ''source_other'', 100)), '''') end,';
  a5 text := 'returning id into v_reg_id;';
  x text;
begin
  foreach x in array array[a1, a2, a3, a4, a5] loop
    if (length(v) - length(replace(v, x, ''))) / length(x) <> 1 then
      raise exception 'submit_registration 본문이 예상과 다릅니다: %', x;
    end if;
  end loop;

  v := replace(v, a1, a1 || '
  -- M18
  v_staff boolean := coalesce(current_setting(''app.staff_entry'', true), '''') = ''on'';
  v_link text;
  v_check boolean := false;
  v_consulted text := nullif(p ->> ''consulted_before'', '''');
  v_inflow record;
  v_answers jsonb;
  v_kakao record;');

  v := replace(v, a2, '-- M18 상담 기록 자동 연결: 상담 기록 링크가 없으면 같은 학부모 번호 + 같은 학생 이름(띄어쓰기 무시)의 최근 상담 기록
  if v_consulted is not null and v_consulted not in (''yes'', ''no'', ''unsure'') then
    v_consulted := null;
  end if;
  if v_lead.id is not null then
    v_link := ''token'';
  else
    select l.* into v_lead from public.leads l
    where l.parent_phone = v_phone and l.deleted_at is null and l.destroyed_at is null
      and regexp_replace(l.student_name, ''\s'', '''', ''g'') = regexp_replace(trim(p ->> ''student_name_ko''), ''\s'', '''', ''g'')
    order by l.created_at desc
    limit 1;
    if v_lead.id is not null then
      v_link := ''auto'';
    else
      -- 번호는 같은데 이름이 다르거나(형제·별명), 상담했다고 했는데 기록을 못 찾으면 담당자 확인
      v_check := coalesce(v_consulted in (''yes'', ''unsure''), false) or exists (
        select 1 from public.leads l where l.parent_phone = v_phone and l.deleted_at is null and l.destroyed_at is null);
    end if;
  end if;

  ' || a2);

  v := replace(v, a3, '-- M18 유입 경로(필수) · 추가 질문
  select * into v_inflow from public.resolve_inflow(p, v_partner_id, not v_staff);
  v_answers := public.collect_form_answers(''registration'', v_prog.id, p -> ''answers'', not v_staff);
  select * into v_kakao from public.resolve_kakao(p, not v_staff);

  ' || a3);

  v := replace(v, a4, 'case when v_partner_id is null then v_inflow.source_text end,');

  v := replace(v, a5, a5 || '

  -- M18 유입 경로 · 추가 질문 · 상담 이력
  update public.registrations
     set inflow_channel_id = v_inflow.channel_id, inflow_label = v_inflow.label,
         inflow_detail = case when v_partner_id is null then v_inflow.detail end,
         answers = v_answers, consulted_before = v_consulted,
         lead_link_method = v_link, lead_check_needed = v_check,
         kakao_use = v_kakao.kakao_use, kakao_alt_phone = v_kakao.alt_phone, alt_contact = v_kakao.alt_contact
   where id = v_reg_id;');

  execute v;
end $$;

-- 알림 받을 번호: 카카오톡을 안 쓰고 대신 받을 카카오톡 번호를 적었으면 그 번호로
do $$
declare
  v text := pg_get_functiondef('public.message_context(uuid)'::regprocedure);
  a1 text := '''phone'', l.parent_phone,';
  a2 text := '''phone'', r.parent_phone,';
begin
  if (length(v) - length(replace(v, a1, ''))) / length(a1) <> 1 or (length(v) - length(replace(v, a2, ''))) / length(a2) <> 1 then
    raise exception 'message_context 본문이 예상과 다릅니다';
  end if;
  v := replace(v, a1, '''phone'', case when l.kakao_use = false and l.kakao_alt_phone is not null then l.kakao_alt_phone else l.parent_phone end, ''kakao_use'', l.kakao_use,');
  v := replace(v, a2, '''phone'', case when r.kakao_use = false and r.kakao_alt_phone is not null then r.kakao_alt_phone else r.parent_phone end, ''kakao_use'', r.kakao_use,');
  execute v;
end $$;

-- ---------------------------------------------------------------------------
-- 담당자: 등록 ↔ 상담 기록 연결·해제
-- ---------------------------------------------------------------------------
create or replace function public.set_registration_lead(p_registration_id uuid, p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.registrations;
  l public.leads;
  v_attr text := 'none';
begin
  if not public.is_staff_or_admin() then
    raise exception '권한이 없습니다' using errcode = '42501';
  end if;
  select * into r from public.registrations where id = p_registration_id and deleted_at is null for update;
  if not found or r.destroyed_at is not null then
    raise exception '등록을 찾을 수 없습니다' using errcode = 'P0001';
  end if;

  if p_lead_id is null then
    update public.registrations set lead_id = null, lead_link_method = null, lead_check_needed = false where id = r.id;
    return jsonb_build_object('linked', false, 'attribution', 'none');
  end if;

  select * into l from public.leads where id = p_lead_id and deleted_at is null and destroyed_at is null;
  if not found then
    raise exception '상담 기록을 찾을 수 없습니다' using errcode = 'P0001';
  end if;

  update public.registrations set lead_id = l.id, lead_link_method = 'staff', lead_check_needed = false where id = r.id;
  update public.leads set status = 'converted' where id = l.id and status <> 'converted';
  insert into public.lead_program_interests (lead_id, program_id) values (l.id, r.program_id) on conflict do nothing;

  -- 소개 경로: 등록에 학원이 없으면 상담 기록의 학원·선생님을 이어받는다(확인 처리는 담당자가 따로)
  if l.partner_id is not null then
    if r.partner_id is null then
      update public.registrations set partner_id = l.partner_id, partner_contact_id = l.partner_contact_id where id = r.id;
      v_attr := 'copied';
    elsif r.partner_id <> l.partner_id then
      v_attr := 'different';
    end if;
  end if;
  return jsonb_build_object('linked', true, 'attribution', v_attr);
end;
$$;

-- ---------------------------------------------------------------------------
-- 공개 캠프 목록(통합 캠프 신청 링크 /register) — 모집 중인 캠프만, 개인정보 없음
-- ---------------------------------------------------------------------------
create or replace function public.public_open_programs()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'slug', p.slug, 'type', p.type, 'name', p.name, 'season', p.season, 'country', p.country,
      'start_date', p.start_date, 'end_date', p.end_date, 'total_price', p.total_price,
      'is_full', p.capacity is not null and public.program_enrolled_count(p.id) >= p.capacity,
      'waitlist_enabled', p.waitlist_enabled,
      'early_bird', case when p.early_bird_discount is not null and p.early_bird_until is not null
                          and public.kst_today() <= p.early_bird_until
        then jsonb_build_object('amount', p.early_bird_discount, 'until', p.early_bird_until) end
    ) order by p.start_date, p.name), '[]'::jsonb)
  from public.programs p
  where p.deleted_at is null and p.status = 'open';
$$;

-- 상담 신청서 설정 (M3 + 제목·소개·기본 질문 문구·필수 여부·유입 경로·추가 질문)
create or replace function public.public_lead_form_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'kakao_channel_url', (select value #>> '{}' from public.settings where key = 'kakao_channel_url'),
    'title', coalesce(nullif(trim((select value #>> '{lead,title}' from public.settings where key = 'form_settings')), ''), '유학·캠프 상담 신청'),
    'intro', coalesce((select value #>> '{lead,intro}' from public.settings where key = 'form_settings'), ''),
    'modes', public.lead_field_modes(),
    'texts', public.form_field_texts('lead'),
    'inflow', public.public_inflow(),
    'questions', public.public_form_questions('lead', null),
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

-- 캠프 신청서 (M17 정의 + 문구·유입 경로·추가 질문·상담 이력 질문)
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
    'texts', public.form_field_texts('registration'),
    'intro', coalesce((select value #>> '{registration,intro}' from public.settings where key = 'form_settings'), ''),
    'inflow', public.public_inflow(),
    'consulted_label', coalesce(nullif(trim((select value ->> 'consulted_label' from public.settings where key = 'form_settings')), ''),
                                '인투유학 상담을 신청하신 적이 있나요?'),
    'questions', public.public_form_questions('registration', v_prog.id),
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

-- ---------------------------------------------------------------------------
-- 다음 기수로 복제: 캠프 전용 추가 질문·얼리버드·학원별 할인·대행 안내도 복사
-- ---------------------------------------------------------------------------
do $$
declare
  v text := pg_get_functiondef('public.duplicate_program(uuid, date, text)'::regprocedure);
  v_old text := 'return v_new_id;';
begin
  if (length(v) - length(replace(v, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'duplicate_program 본문이 예상과 다릅니다';
  end if;
  execute replace(v, v_old, '-- M18 캠프 전용 추가 질문 · 얼리버드 · 학원별 할인 · 대행 안내
  insert into public.form_questions (form, program_id, label, help, type, options, required, sort, active)
  select form, v_new_id, label, help, type, options, required, sort, active
  from public.form_questions where program_id = p_program_id;

  update public.programs
     set early_bird_discount = v_src.early_bird_discount,
         early_bird_until = v_src.early_bird_until + v_delta,
         agency_enabled = v_src.agency_enabled,
         us_contact = v_src.us_contact
   where id = v_new_id;

  insert into public.program_partner_discounts (program_id, partner_id, amount, note)
  select v_new_id, partner_id, amount, note
  from public.program_partner_discounts where program_id = p_program_id;

  ' || v_old);
end $$;

-- ---------------------------------------------------------------------------
-- 유입 경로 통계 (상담 신청·캠프 등록 건수) — 화면 권한(RLS) 그대로
-- ---------------------------------------------------------------------------
create or replace function public.inflow_stats(p_from date, p_to date)
returns table (label text, leads bigint, registrations bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with src as (
    select coalesce(l.inflow_label, case when l.partner_id is not null then '학원 소개' else '(이전 기록) 기타·미기록' end) as label,
           1 as is_lead, 0 as is_reg
    from public.leads l
    where l.deleted_at is null
      and (l.created_at at time zone 'Asia/Seoul')::date between p_from and p_to
    union all
    select coalesce(r.inflow_label, case when r.partner_id is not null then '학원 소개' else '(이전 기록) 기타·미기록' end),
           0, 1
    from public.registrations r
    where r.deleted_at is null and r.status not in ('canceled', 'refunded')
      and r.registered_on between p_from and p_to
  )
  select s.label, sum(s.is_lead)::bigint, sum(s.is_reg)::bigint
  from src s
  group by s.label
  order by sum(s.is_lead) + sum(s.is_reg) desc, s.label;
$$;

-- ---------------------------------------------------------------------------
-- 등록생 목록: 유입 경로 · 상담 연결 확인 필요 (기존 열 순서 유지, 끝에 추가)
-- ---------------------------------------------------------------------------
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
  -- M17 대행·출국 서류
  r.agency_choice, r.agency_services, r.travel_info_submitted_at,
  -- M18 유입 경로·상담 연결
  r.inflow_label, r.lead_check_needed, r.consulted_before, r.lead_link_method, r.kakao_use
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
  public.guard_inflow_channel(),
  public.guard_inflow_channel_insert(),
  public.text_array_max_len(text[]),
  public.normalize_form_question(),
  public.lead_field_modes(),
  public.registration_field_modes(jsonb),
  public.form_field_texts(text),
  public.public_inflow(),
  public.public_form_questions(text, uuid),
  public.clear_form_answers_on_destroy(),
  public.collect_form_answers(text, uuid, jsonb, boolean),
  public.resolve_inflow(jsonb, uuid, boolean),
  public.resolve_kakao(jsonb, boolean),
  public.set_registration_lead(uuid, uuid),
  public.public_open_programs(),
  public.inflow_stats(date, date)
from public, anon, authenticated;

-- 체크 제약에서 쓰는 함수(누구나 실행 가능해야 insert가 된다 — 개인정보 없음)
grant execute on function public.text_array_max_len(text[]) to authenticated, service_role;
-- 공개 신청서용 조회(개인정보 없음)
grant execute on function public.public_open_programs() to anon, authenticated;
-- 담당자 화면
grant execute on function public.set_registration_lead(uuid, uuid), public.inflow_stats(date, date) to authenticated;
-- 캠프 신청서 항목 기본값 확인(캠프 편집 화면)
grant execute on function public.registration_field_modes(jsonb), public.lead_field_modes() to authenticated;
