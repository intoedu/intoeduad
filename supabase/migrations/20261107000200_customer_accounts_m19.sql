-- M19 고객(학부모) 회원 — 카카오·구글·이메일로 가입하고 학부모·자녀 정보를 저장해 두면 상담·캠프 신청서에 자동으로 채운다.
-- · 회원 정보는 본인만 읽고 고친다(직원도 보지 않는다). 직원 화면은 지금처럼 신청 건(상담·등록) 기록만 본다.
-- · 저장·수정은 아래 함수로만(형식 검사, 첫 저장 때 회원 개인정보 동의 기록). 탈퇴는 Edge Function(customer-account)이 계정을 지우면 함께 삭제.
-- · 직원 계정으로는 회원 정보를 만들 수 없다.
-- 함께: 상담·캠프 신청서 개인정보 동의 문구 새 버전(M18에서 새로 받는 항목 추가) — 법률 검토 전 초안.

-- ---------------------------------------------------------------------------
-- 동의 문구
-- ---------------------------------------------------------------------------
alter table public.consent_documents drop constraint consent_documents_kind_check;
alter table public.consent_documents add constraint consent_documents_kind_check check (kind in (
  'lead_privacy', 'lead_guardian',
  'reg_privacy', 'reg_passport', 'reg_third_party', 'reg_health', 'reg_guardian', 'reg_partner_share',
  'refund_default', 'destruction_notice',
  'travel_privacy', 'travel_unique_id',
  'member_privacy'
));

-- 상담 신청서: 유입 경로·카카오톡 대신 연락처·추가 질문 답변 추가 (초안)
insert into public.consent_documents (kind, version, title, body)
select 'lead_privacy', coalesce(max(version), 0) + 1, '[필수] 개인정보 수집·이용 동의',
$doc$인투유학은 상담 진행을 위해 아래와 같이 개인정보를 수집·이용합니다.

1. 수집 항목
   학부모: 이름, 휴대폰 번호, 자녀와의 관계, 카카오톡 사용 여부
           (카카오톡을 쓰지 않는 경우) 대신 안내받을 카카오톡 번호 또는 다른 연락 방법
   자녀: 이름, 학년, 관심 분야 및 프로그램
   기타: 상담 희망 일시, 상담 희망 내용, 알게 된 경로(학원명·소개해 준 분 등), 신청서 추가 질문에 적어 주신 답변
2. 수집·이용 목적
   유학·캠프 상담 진행, 상담 일정 안내, 문의 응대
3. 보유·이용 기간
   상담 신청일로부터 {{lead_retention}}간 보관 후 파기
   (캠프·유학 등록 시에는 등록 정보로 이관되어 해당 보유 기간을 따릅니다)
4. 동의를 거부할 권리 및 불이익
   개인정보 수집·이용에 동의하지 않으실 수 있습니다.
   다만 동의하지 않으시면 상담 신청이 제한됩니다.$doc$
from public.consent_documents where kind = 'lead_privacy';

-- 캠프 신청서: 유입 경로·상담 신청 여부·카카오톡 대신 연락처·추가 질문 답변 추가 (초안)
insert into public.consent_documents (kind, version, title, body)
select 'reg_privacy', coalesce(max(version), 0) + 1, '[필수] 1. 개인정보 수집·이용 동의',
$doc$1. 수집 항목
   학생: 한글·영문 이름, 생년월일, 성별, 학교·학년, 영어 수준
   학부모: 이름, 연락처, 이메일, 주소, 카카오톡 사용 여부
           (카카오톡을 쓰지 않는 경우) 대신 안내받을 카카오톡 번호 또는 다른 연락 방법
   비상 연락처: 이름, 관계, 연락처
   기타: 알게 된 경로, 인투유학 상담 신청 여부(같은 학생의 상담 기록과 연결), 신청서 추가 질문에 적어 주신 답변
2. 수집·이용 목적
   {{program_name}} 참가 등록 및 운영, 비용 안내 및 납부 확인, 비상시 연락
3. 보유·이용 기간
   프로그램 종료일로부터 {{destroy_after_days}}일이 지난 후 파기
   (관계 법령에 따라 보관이 필요한 거래 기록은 해당 법령이 정한 기간 동안 분리하여 보관)
4. 동의를 거부할 권리 및 불이익
   동의하지 않으실 수 있으나, 동의하지 않으시면 프로그램 등록이 제한됩니다.$doc$
from public.consent_documents where kind = 'reg_privacy';

-- 회원 가입 (초안)
insert into public.consent_documents (kind, version, title, body) values (
  'member_privacy', 1, '[필수] 회원 개인정보 수집·이용 동의',
$doc$인투유학은 회원님이 상담·캠프 신청서를 매번 새로 적지 않으시도록 아래 정보를 저장합니다.

1. 수집 항목
   계정: 로그인 수단(카카오·구글·이메일), 이메일 주소(로그인 수단이 제공하는 경우)
   학부모: 이름, 휴대폰 번호, 이메일, 주소, 자녀와의 관계, 카카오톡 사용 여부와 대신 안내받을 연락 방법, 비상 연락처
   자녀: 한글·영문 이름, 생년월일, 성별, 학교·학년, 영어 수준
2. 수집·이용 목적
   회원 식별, 상담·캠프 신청서 자동 입력
3. 보유·이용 기간
   회원 탈퇴 시까지 (탈퇴하시면 저장된 회원 정보를 바로 삭제합니다)
   ※ 이미 접수된 상담·캠프 신청 기록은 각 신청서에서 동의하신 보유 기간을 따릅니다.
4. 동의를 거부할 권리 및 불이익
   동의하지 않으실 수 있으며, 이 경우 회원 가입 없이 비회원으로 신청하실 수 있습니다.$doc$
);

-- 공개: 회원 동의 문구(최신)
create or replace function public.public_member_consent()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('kind', d.kind, 'version', d.version, 'title', d.title, 'body', d.body)
  from public.consent_documents d
  where d.kind = 'member_privacy'
  order by d.version desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 회원 정보 (본인만)
-- ---------------------------------------------------------------------------
create table public.customer_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  parent_name text not null check (char_length(parent_name) between 1 and 50),
  parent_phone text not null check (parent_phone ~ '^01[0-9]{8,9}$'),
  parent_email text check (parent_email is null or (char_length(parent_email) <= 120 and parent_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  relation text check (relation is null or char_length(relation) <= 20),
  address text check (address is null or char_length(address) <= 200),
  kakao_use boolean,
  kakao_alt_phone text check (kakao_alt_phone is null or kakao_alt_phone ~ '^01[0-9]{8,9}$'),
  alt_contact text check (alt_contact is null or char_length(alt_contact) <= 100),
  emergency_name text check (emergency_name is null or char_length(emergency_name) <= 50),
  emergency_relation text check (emergency_relation is null or char_length(emergency_relation) <= 20),
  emergency_phone text check (emergency_phone is null or emergency_phone ~ '^[0-9]{9,11}$'),
  privacy_version integer not null,
  privacy_text text not null,
  privacy_agreed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.customer_profiles
  for each row execute function public.set_updated_at();

create table public.customer_students (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles (id) on delete cascade,
  name_ko text not null check (char_length(name_ko) between 1 and 50),
  name_en text check (name_en is null or name_en ~ '^[A-Z][A-Z \-]{0,59}$'),
  birth_date date check (birth_date is null or birth_date >= date '1950-01-01'),
  gender text check (gender in ('male', 'female')),
  school text check (school is null or char_length(school) <= 60),
  grade text check (grade is null or char_length(grade) <= 10),
  english_level text check (english_level is null or char_length(english_level) <= 20),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.customer_students (customer_id);
create trigger set_updated_at before update on public.customer_students
  for each row execute function public.set_updated_at();

alter table public.customer_profiles enable row level security;
alter table public.customer_students enable row level security;
create policy customer_profiles_own on public.customer_profiles for select to authenticated
  using (id = (select auth.uid()));
create policy customer_students_own on public.customer_students for select to authenticated
  using (customer_id = (select auth.uid()));
-- 쓰기는 아래 함수로만
revoke all on public.customer_profiles, public.customer_students from anon, authenticated;
grant select on public.customer_profiles, public.customer_students to authenticated;

-- 회원 정보 저장(처음 저장 = 가입 완료: 회원 개인정보 동의 필수)
create or replace function public.customer_save_profile(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_doc_version integer;
  v_doc_body text;
  v_exists boolean;
  v_phone text := regexp_replace(coalesce(p ->> 'parent_phone', ''), '\D', '', 'g');
  v_em_phone text := nullif(regexp_replace(coalesce(p ->> 'emergency_phone', ''), '\D', '', 'g'), '');
  v_alt_phone text := nullif(regexp_replace(coalesce(p ->> 'kakao_alt_phone', ''), '\D', '', 'g'), '');
  v_kakao boolean := case when jsonb_typeof(p -> 'kakao_use') = 'boolean' then (p ->> 'kakao_use')::boolean end;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;
  if exists (select 1 from public.staff_profiles where id = v_uid) then
    raise exception '직원 계정으로는 회원 정보를 만들 수 없습니다' using errcode = '42501';
  end if;
  if coalesce(trim(p ->> 'parent_name'), '') = '' or v_phone !~ '^01[0-9]{8,9}$' then
    raise exception '학부모 이름과 휴대폰 번호를 확인해 주세요' using errcode = 'P0001', hint = 'INVALID_INPUT';
  end if;
  if v_kakao is false and v_alt_phone is null and nullif(trim(coalesce(p ->> 'alt_contact', '')), '') is null then
    raise exception '카카오톡을 쓰지 않으시면 대신 받을 카카오톡 번호나 다른 연락 방법을 적어 주세요' using errcode = 'P0001', hint = 'INVALID_INPUT';
  end if;

  select exists (select 1 from public.customer_profiles where id = v_uid) into v_exists;
  if not v_exists then
    if coalesce((p ->> 'agree_privacy')::boolean, false) is not true then
      raise exception '회원 개인정보 수집·이용에 동의해 주세요' using errcode = 'P0001', hint = 'CONSENT_REQUIRED';
    end if;
    select d.version, d.body into v_doc_version, v_doc_body from public.consent_documents d
    where d.kind = 'member_privacy' order by d.version desc limit 1;
  end if;

  insert into public.customer_profiles as c (
    id, parent_name, parent_phone, parent_email, relation, address, kakao_use, kakao_alt_phone, alt_contact,
    emergency_name, emergency_relation, emergency_phone, privacy_version, privacy_text, privacy_agreed_at
  ) values (
    v_uid, trim(left(p ->> 'parent_name', 50)), v_phone,
    nullif(lower(trim(left(coalesce(p ->> 'parent_email', ''), 120))), ''),
    nullif(trim(left(coalesce(p ->> 'relation', ''), 20)), ''),
    nullif(trim(left(coalesce(p ->> 'address', ''), 200)), ''),
    v_kakao,
    case when v_kakao is false then v_alt_phone end,
    case when v_kakao is false then nullif(trim(left(coalesce(p ->> 'alt_contact', ''), 100)), '') end,
    nullif(trim(left(coalesce(p ->> 'emergency_name', ''), 50)), ''),
    nullif(trim(left(coalesce(p ->> 'emergency_relation', ''), 20)), ''),
    v_em_phone,
    coalesce(v_doc_version, 1), coalesce(v_doc_body, ''), now()
  )
  on conflict (id) do update set
    parent_name = excluded.parent_name, parent_phone = excluded.parent_phone, parent_email = excluded.parent_email,
    relation = excluded.relation, address = excluded.address, kakao_use = excluded.kakao_use,
    kakao_alt_phone = excluded.kakao_alt_phone, alt_contact = excluded.alt_contact,
    emergency_name = excluded.emergency_name, emergency_relation = excluded.emergency_relation,
    emergency_phone = excluded.emergency_phone;
exception
  when check_violation then
    raise exception '입력 형식을 확인해 주세요' using errcode = 'P0001', hint = 'INVALID_INPUT';
end;
$$;

-- 자녀 정보 저장(id 없으면 추가). 돌려주는 값: 자녀 id
create or replace function public.customer_save_student(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_birth date;
  v_name_en text := nullif(upper(regexp_replace(trim(coalesce(p ->> 'name_en', '')), '\s+', ' ', 'g')), '');
begin
  if v_uid is null or not exists (select 1 from public.customer_profiles where id = v_uid) then
    raise exception '회원 정보를 먼저 저장해 주세요' using errcode = '42501';
  end if;
  if coalesce(trim(p ->> 'name_ko'), '') = '' then
    raise exception '자녀 이름을 입력해 주세요' using errcode = 'P0001', hint = 'INVALID_INPUT';
  end if;
  begin
    v_birth := nullif(trim(coalesce(p ->> 'birth_date', '')), '')::date;
  exception when others then
    raise exception '생년월일을 확인해 주세요' using errcode = 'P0001', hint = 'INVALID_INPUT';
  end;
  if (select count(*) from public.customer_students where customer_id = v_uid) >= 10 and nullif(p ->> 'id', '') is null then
    raise exception '자녀는 10명까지 저장할 수 있습니다' using errcode = 'P0001', hint = 'INVALID_INPUT';
  end if;

  if nullif(p ->> 'id', '') is not null then
    update public.customer_students set
      name_ko = trim(left(p ->> 'name_ko', 50)), name_en = v_name_en, birth_date = v_birth,
      gender = nullif(p ->> 'gender', ''), school = nullif(trim(left(coalesce(p ->> 'school', ''), 60)), ''),
      grade = nullif(trim(left(coalesce(p ->> 'grade', ''), 10)), ''),
      english_level = nullif(trim(left(coalesce(p ->> 'english_level', ''), 20)), '')
    where id = (p ->> 'id')::uuid and customer_id = v_uid
    returning id into v_id;
    if v_id is null then
      raise exception '자녀 정보를 찾을 수 없습니다' using errcode = 'P0001';
    end if;
  else
    insert into public.customer_students (customer_id, name_ko, name_en, birth_date, gender, school, grade, english_level, sort)
    values (
      v_uid, trim(left(p ->> 'name_ko', 50)), v_name_en, v_birth, nullif(p ->> 'gender', ''),
      nullif(trim(left(coalesce(p ->> 'school', ''), 60)), ''), nullif(trim(left(coalesce(p ->> 'grade', ''), 10)), ''),
      nullif(trim(left(coalesce(p ->> 'english_level', ''), 20)), ''),
      coalesce((select max(sort) + 1 from public.customer_students where customer_id = v_uid), 0)
    )
    returning id into v_id;
  end if;
  return v_id;
exception
  when check_violation or invalid_text_representation then
    raise exception '입력 형식을 확인해 주세요(영문 이름은 여권과 같은 영문 대문자)' using errcode = 'P0001', hint = 'INVALID_INPUT';
end;
$$;

create or replace function public.customer_delete_student(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.customer_students where id = p_id and customer_id = (select auth.uid());
$$;

revoke execute on function
  public.public_member_consent(),
  public.customer_save_profile(jsonb),
  public.customer_save_student(jsonb),
  public.customer_delete_student(uuid)
from public, anon, authenticated;
grant execute on function public.public_member_consent() to anon, authenticated;
grant execute on function public.customer_save_profile(jsonb), public.customer_save_student(jsonb), public.customer_delete_student(uuid) to authenticated;
