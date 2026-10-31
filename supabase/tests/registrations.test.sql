-- M7: 캠프 등록 신청서 — 공개 조회·제출·납부 일정·동의 기록·정원/대기·상담 기록 연결·고객 확인 링크·권한
begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

-- 오류 hint 꺼내기
create function pg_temp.hint_of(p_sql text)
returns text
language plpgsql
as $$
declare
  v_hint text;
begin
  execute p_sql;
  return 'NO_ERROR';
exception when others then
  get stacked diagnostics v_hint = pg_exception_hint;
  return v_hint;
end;
$$;

insert into auth.users (id, email) values
  ('a7000000-0000-0000-0000-000000000001', 'm7-admin@test.local'),
  ('a7000000-0000-0000-0000-000000000002', 'm7-staff@test.local');
insert into public.staff_profiles (id, name, email, role) values
  ('a7000000-0000-0000-0000-000000000001', '관리자', 'm7-admin@test.local', 'admin'),
  ('a7000000-0000-0000-0000-000000000002', '직원', 'm7-staff@test.local', 'staff');

insert into public.partners (id, name, code) values
  ('d7000000-0000-0000-0000-000000000001', '대전인투학원', 'm7-daejeon'),
  ('d7000000-0000-0000-0000-000000000002', '세종영어학원', 'm7-sejong');
insert into public.partner_contacts (id, partner_id, name, role, code) values
  ('e7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000002', '박실장', 'counselor', 'park');

-- 정원 2명, 여권·건강 정보 사용, 학교는 숨김
insert into public.programs (id, type, name, season, country, start_date, end_date, capacity, total_price, slug,
  passport_upload_enabled, health_field_enabled, form_config, commission_amount, third_party_recipients)
values ('c7100000-0000-0000-0000-000000000001', 'camp', '미국 스쿨링 캠프', '2027 겨울', '미국',
  public.kst_today() + 60, public.kst_today() + 85, 2, 5000000, 'us-school-t7', true, true,
  '{"fields":{"school":"hidden","address":"required"}}', 300000,
  '{"ticketing":"하나투어","school":{"name":"Lincoln School","country":"미국"}}');
insert into public.program_payment_rules (program_id, kind, label, amount, due_rule_type, due_offset_days, due_fixed_date) values
  ('c7100000-0000-0000-0000-000000000001', 'deposit', '예약금', 1000000, 'after_registration', 7, null),
  ('c7100000-0000-0000-0000-000000000001', 'balance', '잔금', 4000000, 'before_start', 30, null),
  ('c7100000-0000-0000-0000-000000000001', 'extra', '항공권', 1500000, 'fixed', null, public.kst_today() - 3);
update public.programs set status = 'open' where id = 'c7100000-0000-0000-0000-000000000001';

-- 모집 전 프로그램
insert into public.programs (id, type, name, start_date, end_date, total_price, slug)
values ('c7100000-0000-0000-0000-000000000002', 'camp', '모집 전 캠프', '2027-07-01', '2027-07-20', 0, 'before-t7');

-- 상담 기록 + 미리 채움 토큰 (세종학원 박실장 소개, 확인 완료)
insert into public.leads (id, partner_id, partner_contact_id, attribution_source, attribution_confirmed_at,
  student_name, student_grade, parent_name, parent_phone, status)
values ('f7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000002', 'e7000000-0000-0000-0000-000000000001',
  'link', now(), '김하늘', '초5', '김엄마', '01077778888', 'consulted');
insert into public.access_tokens (token_hash, purpose, lead_id, expires_at) values
  (encode(extensions.digest('prefill-good', 'sha256'), 'hex'), 'prefill', 'f7000000-0000-0000-0000-000000000001', now() + interval '10 days'),
  (encode(extensions.digest('prefill-expired', 'sha256'), 'hex'), 'prefill', 'f7000000-0000-0000-0000-000000000001', now() - interval '1 day');

-- 기본 제출값
create temp table base (v jsonb);
insert into base values ($${
  "slug": "us-school-t7",
  "student_name_ko": "이바다", "student_name_en": "lee  bada", "birth_date": "2015-03-02", "gender": "female",
  "school": "숨긴 항목", "grade": "초6", "english_level": "중급",
  "parent_name": "이엄마", "parent_phone": "010-1111-2222", "parent_email": "Mom@Example.com", "address": "대전 서구",
  "emergency_name": "이아빠", "emergency_relation": "아버지", "emergency_phone": "010-3333-4444",
  "health_notes": "땅콩 알레르기",
  "partner_code": "m7-daejeon",
  "agree": {"reg_privacy": true, "reg_passport": true, "reg_third_party": true, "reg_health": true,
            "reg_guardian": true, "refund": true, "destruction_notice": true, "reg_partner_share": false}
}$$);
grant select on base to service_role, anon;

-- ---------------------------------------------------------------------------
-- 공개 조회 (비로그인)
-- ---------------------------------------------------------------------------
select set_config('test.today', public.kst_today()::text, true);
set local role anon;
select ok((public.public_register_form('us-school-t7') ->> 'status') = 'open', '비로그인: 모집 중 신청서 조회');
select ok(public.public_register_form('US-SCHOOL-T7') is not null, '링크 대소문자 무시');
select ok(public.public_register_form('us-school-t7')::text !~ 'commission|300000', '커미션 정보 없음');
select ok(public.public_register_form('us-school-t7')::text !~ 'after_registration|before_start|due_offset', '내부 납부 규칙 없음(계산된 기한만)');
select is(jsonb_array_length(public.public_register_form('us-school-t7') -> 'schedule'), 3, '오늘 기준 납부 일정 3건');
select is((public.public_register_form('us-school-t7') #>> '{schedule,2,due_date}')::date, current_setting('test.today')::date,
  '이미 지난 고정 기한은 신청일로 당김');
select is(public.public_register_form('us-school-t7') #>> '{fields,school}', 'hidden', '항목 설정 반영(숨김)');
select ok(public.public_register_form('us-school-t7')::text ~ 'Lincoln School', '제3자 제공 대상 치환');
select is(public.public_register_form('before-t7') ->> 'status', 'before', '모집 전: 상태만');
select ok(public.public_register_form('before-t7') -> 'consents' is null, '모집 전: 동의 문구·일정 미노출');
select is(public.public_register_form('no-such-slug'), null, '없는 링크 → null');
select throws_ok($$select public.submit_registration('{}')$$, '42501', null, '비로그인은 저장 함수 직접 호출 불가');
select throws_ok($$select public.registration_prefill('prefill-good')$$, '42501', null, '비로그인은 미리 채움 함수 직접 호출 불가');
select throws_ok($$select public.registration_summary_by_token('x')$$, '42501', null, '비로그인은 확인 함수 직접 호출 불가');
select throws_ok($$select count(*) from public.registrations$$, '42501', null, '비로그인은 등록 테이블 조회 불가');
reset role;

-- ---------------------------------------------------------------------------
-- 제출 (Edge Function = service role)
-- ---------------------------------------------------------------------------
set local role service_role;

select is(pg_temp.hint_of($$select public.submit_registration((select v from base) || '{"slug":"before-t7"}')$$), 'NOT_OPEN', '모집 전 → 신청 불가');
select is(pg_temp.hint_of($$select public.submit_registration((select v from base) || '{"slug":"nope"}')$$), 'NOT_FOUND', '없는 신청서');
select is(pg_temp.hint_of($$select public.submit_registration(jsonb_set((select v from base), '{agree,reg_third_party}', 'false'))$$),
  'CONSENT_REQUIRED', '제3자 제공 동의 필수');
select is(pg_temp.hint_of($$select public.submit_registration(jsonb_set((select v from base), '{agree,reg_passport}', 'false'))$$),
  'CONSENT_REQUIRED', '여권 사용 캠프: 고유식별정보 동의 필수');
select is(pg_temp.hint_of($$select public.submit_registration(jsonb_set((select v from base), '{agree,reg_health}', 'false'))$$),
  'CONSENT_REQUIRED', '건강 특이사항 입력 시 민감정보 동의 필수');
select is(pg_temp.hint_of($$select public.submit_registration(jsonb_set((select v from base), '{agree,destruction_notice}', 'false'))$$),
  'CONSENT_REQUIRED', '파기 안내 확인 필수');
select is(pg_temp.hint_of($$select public.submit_registration((select v from base) || '{"address":""}')$$),
  'INVALID_INPUT', '캠프별 필수 항목(주소) 누락');
select is(pg_temp.hint_of($$select public.submit_registration((select v from base) || '{"student_name_en":"이바다"}')$$),
  'INVALID_INPUT', '영문 이름 형식');

select set_config('test.r1', public.submit_registration((select v from base) || '{"phone_hash":"h1"}') ->> 'registration_id', true);
reset role;

select is((select status from public.registrations where id = current_setting('test.r1')::uuid), 'received', '등록 상태 = 신청 접수');
select is((select student_name_en from public.registrations where id = current_setting('test.r1')::uuid), 'LEE BADA', '영문 이름 대문자·공백 정리');
select is((select school from public.registrations where id = current_setting('test.r1')::uuid), null, '숨긴 항목은 저장하지 않음');
select is((select parent_phone || '/' || parent_email from public.registrations where id = current_setting('test.r1')::uuid),
  '01011112222/mom@example.com', '번호 숫자만·이메일 소문자');
select is((select passport_status from public.registrations where id = current_setting('test.r1')::uuid), 'pending', '여권 미제출 상태');
select is((select destroy_due_date from public.registrations where id = current_setting('test.r1')::uuid), public.kst_today() + 90,
  '파기 예정일 = 종료일 + 5일');
select is((select partner_id::text || '/' || attribution_source from public.registrations where id = current_setting('test.r1')::uuid),
  'd7000000-0000-0000-0000-000000000001/link', '학원 링크(?ref=) 소개 경로 기록');
select is((select array_agg(due_date - public.kst_today() order by sort)::text from public.payment_schedules where registration_id = current_setting('test.r1')::uuid),
  '{7,30,0}', '납부 일정 자동 생성(신청 후 7일·출국 30일 전·지난 고정일은 오늘)');
select is((select count(*)::int from public.registration_health_notes where registration_id = current_setting('test.r1')::uuid), 1, '건강 정보 별도 저장');
select is((select array_agg(kind || ':' || agreed order by kind)::text from public.consent_records where registration_id = current_setting('test.r1')::uuid),
  '{destruction_notice:true,refund_policy:true,reg_guardian:true,reg_health:true,reg_partner_share:false,reg_passport:true,reg_privacy:true,reg_third_party:true}',
  '동의 기록(항목별 동의 여부, 선택 동의 거부도 기록)');
select ok((select rendered_text from public.consent_records where registration_id = current_setting('test.r1')::uuid and kind = 'reg_partner_share') ~ '대전인투학원',
  '저장된 동의 문구에 실제 학원명 치환');
select ok(not exists (select 1 from public.activity_logs where entity_id = current_setting('test.r1')::uuid
  and (after::text ~ '이바다|01011112222|대전 서구')), '감사 기록에 개인정보 값 없음');

set local role service_role;
select is(pg_temp.hint_of($$select public.submit_registration((select v from base) || '{"phone_hash":"h1","student_name_ko":"다른학생"}')$$),
  'TOO_MANY_REQUESTS', '같은 번호 단시간 중복 제출 제한');
select is(pg_temp.hint_of($$select public.submit_registration((select v from base))$$), 'DUPLICATE', '같은 학생 중복 신청 방지');

-- 상담 기록 링크: 먼저 기록된 학원(세종·박실장)이 링크의 학원보다 우선, 상담 → 등록 전환
select is(public.registration_prefill('prefill-good') ->> 'parent_phone', '01077778888', '미리 채움: 상담 기록 정보');
select is(public.registration_prefill('prefill-expired'), null, '만료된 링크는 미리 채움 불가');
select set_config('test.r2', public.submit_registration((select v from base) || $${"token":"prefill-good","student_name_ko":"김하늘","parent_phone":"01077778888",
  "agree":{"reg_privacy":true,"reg_passport":true,"reg_third_party":true,"reg_health":true,"reg_guardian":true,"refund":true,"destruction_notice":true,"reg_partner_share":true}}$$) ->> 'my_token', true);
reset role;
select is((select partner_id::text || '/' || partner_contact_id::text || '/' || partner_share_agreed from public.registrations where lead_id = 'f7000000-0000-0000-0000-000000000001'),
  'd7000000-0000-0000-0000-000000000002/e7000000-0000-0000-0000-000000000001/true', '상담 기록의 학원·실장 우선 + 학원 제공 동의');
select is((select status from public.leads where id = 'f7000000-0000-0000-0000-000000000001'), 'converted', '상담 고객 → 등록 전환');

-- 정원(2명) 도달 → 마감, 대기 사용 시 대기 접수(납부 일정 없음)
set local role service_role;
select is(pg_temp.hint_of($$select public.submit_registration((select v from base) || '{"student_name_ko":"세번째","parent_phone":"01099990000"}')$$), 'FULL', '정원 마감');
reset role;
update public.programs set waitlist_enabled = true where id = 'c7100000-0000-0000-0000-000000000001';
set local role service_role;
select set_config('test.r3', public.submit_registration((select v from base) || '{"student_name_ko":"세번째","parent_phone":"01099990000"}') ->> 'registration_id', true);
select is((public.registration_summary_by_token(current_setting('test.r2')) ->> 'student_name'), '김하늘', '고객 확인 링크로 요약 조회');
reset role;
select is((select status || '/' || (select count(*) from public.payment_schedules where registration_id = r.id) from public.registrations r where id = current_setting('test.r3')::uuid),
  'waitlisted/0', '대기 접수: 납부 일정 미생성');

-- 동의 문구 새 버전: 관리자만, 기존 버전은 수정 불가
set local role authenticated;
set local request.jwt.claims to '{"sub":"a7000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok($$select public.add_consent_version('reg_privacy', '제목', '본문')$$, '42501', null, '직원은 동의 문구 변경 불가');
set local request.jwt.claims to '{"sub":"a7000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(public.add_consent_version('reg_privacy', '[필수] 1. 개인정보 수집·이용 동의', '새 문구 {{program_name}}'), 2, '관리자: 새 버전(v2) 추가');

select * from finish();
rollback;
