-- M17: 항공권·ESTA·보험 대행 — 신청 시 선택 필수(대행 사용 캠프), 대행료 납부 일정, 담당자 변경, 출국 서류 정보 제출·권한·파기
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

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
  ('a1700000-0000-0000-0000-000000000001', 'm17-admin@test.local'),
  ('a1700000-0000-0000-0000-000000000002', 'm17-staff@test.local'),
  ('a1700000-0000-0000-0000-000000000003', 'm17-viewer@test.local');
insert into public.staff_profiles (id, name, email, role, can_view_passport) values
  ('a1700000-0000-0000-0000-000000000001', '관리자', 'm17-admin@test.local', 'admin', false),
  ('a1700000-0000-0000-0000-000000000002', '직원', 'm17-staff@test.local', 'staff', false),
  ('a1700000-0000-0000-0000-000000000003', '현지', 'm17-viewer@test.local', 'viewer', false);

insert into public.programs (id, type, name, start_date, end_date, capacity, waitlist_enabled, total_price, slug, agency_enabled)
values ('c1700000-0000-0000-0000-000000000001', 'camp', '대행 캠프', public.kst_today() + 60, public.kst_today() + 80, 2, true, 5000000, 'agency-t17', true),
       ('c1700000-0000-0000-0000-000000000002', 'camp', '대행 없는 캠프', public.kst_today() + 60, public.kst_today() + 80, 10, false, 3000000, 'noagency-t17', false);
insert into public.program_payment_rules (program_id, kind, label, amount, due_rule_type, due_offset_days) values
  ('c1700000-0000-0000-0000-000000000001', 'deposit', '계약금', 1000000, 'after_registration', 7),
  ('c1700000-0000-0000-0000-000000000001', 'balance', '원금', 4000000, 'before_start', 30),
  ('c1700000-0000-0000-0000-000000000002', 'balance', '원금', 3000000, 'before_start', 30);
update public.programs set status = 'open' where id in ('c1700000-0000-0000-0000-000000000001', 'c1700000-0000-0000-0000-000000000002');

create temp table base (v jsonb);
insert into base values ($${
  "slug": "agency-t17", "kakao_use": true, "source_other": "검색", "student_name_ko": "대행학생", "student_name_en": "AGENCY KID", "birth_date": "2014-02-02", "gender": "male",
  "grade": "초6", "parent_name": "대행부모", "parent_phone": "010-1700-0001", "parent_email": "a@b.co",
  "emergency_name": "x", "emergency_relation": "부", "emergency_phone": "010-1700-0009",
  "agree": {"reg_privacy": true, "reg_third_party": true, "reg_guardian": true, "refund": true, "destruction_notice": true}
}$$);
grant select on base to service_role;

-- ---------------------------------------------------------------------------
-- 공개 신청서·신청 저장
-- ---------------------------------------------------------------------------
set local role anon;
select is(public.public_register_form('agency-t17') #>> '{agency,fees,2}', '50000', '공개 신청서: 대행료 표(2개 5만 원)');
select is(public.public_register_form('noagency-t17') ->> 'agency', null, '대행 없는 캠프: 대행 안내 없음');
reset role;

set local role service_role;
select is(pg_temp.hint_of($$select public.submit_registration((select v from base))$$), 'AGENCY_REQUIRED', '대행 사용 캠프: 대행 여부 선택 필수');
select is(pg_temp.hint_of($$select public.submit_registration((select v from base) || '{"agency_choice":"agency","agency_services":[]}')$$),
  'AGENCY_REQUIRED', '대행 선택 시 항목 하나 이상');
select set_config('test.r1', public.submit_registration((select v from base) || '{"agency_choice":"agency","agency_services":["esta","flight","flight","bogus"]}') ->> 'registration_id', true);
select set_config('test.r2', public.submit_registration((select v from base) || '{"student_name_ko":"직접학생","parent_phone":"010-1700-0002","agency_choice":"self","agency_services":["esta"]}') ->> 'registration_id', true);
select set_config('test.r3', public.submit_registration((select v from base) || '{"student_name_ko":"대기학생","parent_phone":"010-1700-0003","agency_choice":"agency","agency_services":["flight","esta","insurance"]}') ->> 'registration_id', true);
select set_config('test.r4', public.submit_registration((select v from base) || '{"slug":"noagency-t17","student_name_ko":"없음학생","parent_phone":"010-1700-0004","agency_choice":"agency","agency_services":["esta"]}') ->> 'registration_id', true);
reset role;

select is((select agency_choice || '|' || array_to_string(agency_services, ',') || '|' || agency_fee from public.registrations where id = current_setting('test.r1')::uuid),
  'agency|esta,flight|50000', '대행 2개(중복·잘못된 값 정리) → 5만 원');
select is((select label || '|' || amount_due || '|' || (due_date = (select due_date from public.payment_schedules p2 where p2.registration_id = s.registration_id and p2.kind = 'balance'))
  from public.payment_schedules s where registration_id = current_setting('test.r1')::uuid and agency_fee),
  '대행료(항공권·ESTA)|50000|true', '대행료 납부 줄(기한 = 원금 기한)');
select is((select agency_choice || '|' || cardinality(agency_services) || '|' || agency_fee from public.registrations where id = current_setting('test.r2')::uuid),
  'self|0|0', '직접 준비: 항목·대행료 없음');
select is((select count(*)::int from public.payment_schedules where registration_id = current_setting('test.r2')::uuid and agency_fee), 0, '직접 준비: 대행료 줄 없음');
select is((select status || '|' || agency_fee from public.registrations where id = current_setting('test.r3')::uuid), 'waitlisted|60000', '대기 접수도 선택 기록(3개 6만 원)');
select is((select count(*)::int from public.payment_schedules where registration_id = current_setting('test.r3')::uuid), 0, '대기 접수: 납부 일정 없음');
select is((select agency_choice from public.registrations where id = current_setting('test.r4')::uuid), null, '대행 없는 캠프: 선택 무시');

-- ---------------------------------------------------------------------------
-- 담당자: 대행 변경 / 대기 승격
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"a1700000-0000-0000-0000-000000000003","role":"authenticated"}';
select throws_ok(format('select public.set_registration_agency(%L, %L, %L)', current_setting('test.r1'), 'self', '{}'), '42501', null, '현지 팀: 대행 변경 불가');
set local request.jwt.claims to '{"sub":"a1700000-0000-0000-0000-000000000002","role":"authenticated"}';
select lives_ok(format('select public.set_registration_agency(%L, %L, %L)', current_setting('test.r1'), 'agency', '{flight,esta,insurance}'), '직원: 대행 3개로 변경');
reset role;
select is((select amount_due || '|' || label || '|' || coalesce(change_reason, '') from public.payment_schedules where registration_id = current_setting('test.r1')::uuid and agency_fee and canceled_at is null),
  '60000|대행료(항공권·ESTA·여행자보험)|대행 항목 변경', '대행료 줄 금액·이름 변경(변경 사유 기록)');
select ok((select payment_changed_at is not null from public.registrations where id = current_setting('test.r1')::uuid), '금액 변경 → 학부모 정정 안내 필요 표시');

set local role authenticated;
set local request.jwt.claims to '{"sub":"a1700000-0000-0000-0000-000000000002","role":"authenticated"}';
select lives_ok(format('select public.set_registration_agency(%L, %L, %L)', current_setting('test.r2'), 'agency', '{insurance}'), '직접 → 대행(보험 1개)');
reset role;
select is((select amount_due from public.payment_schedules where registration_id = current_setting('test.r2')::uuid and agency_fee and canceled_at is null),
  30000::bigint, '대행료 줄 새로 생성(3만 원)');

update public.registrations set status = 'canceled' where id = current_setting('test.r2')::uuid;
set local role authenticated;
set local request.jwt.claims to '{"sub":"a1700000-0000-0000-0000-000000000002","role":"authenticated"}';
select lives_ok(format('select public.promote_waitlisted(%L)', current_setting('test.r3')), '대기 승격');
reset role;
select is((select amount_due from public.payment_schedules where registration_id = current_setting('test.r3')::uuid and agency_fee), 60000::bigint, '승격 시 대행료 줄 생성');

-- ---------------------------------------------------------------------------
-- 출국 서류 정보 (학부모 링크 = service role)
-- ---------------------------------------------------------------------------
insert into public.access_tokens (token_hash, purpose, registration_id, expires_at) values
  (encode(extensions.digest('travel-agency-token', 'sha256'), 'hex'), 'my_view', current_setting('test.r1')::uuid, now() + interval '30 days'),
  (encode(extensions.digest('travel-self-token', 'sha256'), 'hex'), 'my_view', current_setting('test.r4')::uuid, now() + interval '30 days');
create temp table trav (v jsonb);
insert into trav values ($${
  "agree": {"travel_privacy": true, "travel_unique_id": true},
  "travelers": [
    {"traveler_type": "student", "surname_en": "kim", "given_name_en": "ha neul", "gender": "male", "birth_date": "2014-02-02",
     "birth_city_en": "seoul", "passport_no": "m1234 5678", "passport_issue_date": "2022-01-01", "passport_expiry_date": "2032-01-01",
     "father_name_en": "kim dad", "mother_name_en": "lee mom", "home_address_en": "1 Teheran-ro, Seoul", "phone": "010-1700-0001"},
    {"traveler_type": "guardian", "relation": "어머니", "surname_en": "LEE", "given_name_en": "MOM", "gender": "female", "birth_date": "1985-05-05",
     "passport_no": "M87654321", "passport_expiry_date": "2030-05-05", "employer": "Self-employed"}
  ]
}$$);
grant select on trav to service_role;

set local role service_role;
select ok((public.travel_form_by_token('travel-agency-token') ->> 'allowed')::boolean, '대행 신청자: 출국 서류 화면 열림');
select is(public.travel_form_by_token('travel-self-token') ->> 'allowed', 'false', '대행 아닌 등록: 출국 서류 제출 불가');
select is(pg_temp.hint_of($$select public.travel_submit('travel-agency-token', (select v from trav) - 'agree')$$), 'CONSENT_REQUIRED', '별도 동의 필수');
select lives_ok($$select public.travel_submit('travel-agency-token', (select v from trav))$$, '출국 서류 정보 제출');
select is((public.travel_form_by_token('travel-agency-token') #>> '{travelers,0,passport_no_masked}'), '******678', '다시 열면 여권번호는 끝 3자리만');
-- 다시 제출(여권번호 비워 둠 → 기존 값 유지, 보호자 빼면 삭제)
select lives_ok($$select public.travel_submit('travel-agency-token', jsonb_set((select v from trav), '{travelers}', jsonb_build_array(((select v from trav) #> '{travelers,0}') - 'passport_no')))$$, '수정 제출');
reset role;

select is((select surname_en || '|' || given_name_en || '|' || passport_no || '|' || birth_city_en || '|' || father_name_en
  from public.registration_travelers where registration_id = current_setting('test.r1')::uuid and traveler_type = 'student'),
  'KIM|HA NEUL|M12345678|SEOUL|KIM DAD', '여권 영문 이름·번호 대문자 정리, 여권번호 유지');
select is((select count(*)::int from public.registration_travelers where registration_id = current_setting('test.r1')::uuid), 1, '빠진 보호자 정보 삭제');
select is((select string_agg(kind, ',' order by kind) from public.consent_records where registration_id = current_setting('test.r1')::uuid and kind like 'travel%'),
  'travel_privacy,travel_unique_id', '별도 동의 원문 기록(중복 없이)');

-- 권한: 여권 열람 권한자만
set local role authenticated;
set local request.jwt.claims to '{"sub":"a1700000-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.registration_travelers), 0, '열람 권한 없는 직원: 출국 서류 정보 안 보임');
set local request.jwt.claims to '{"sub":"a1700000-0000-0000-0000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.registration_travelers), 1, '관리자: 보임');
reset role;
select ok(not exists (select 1 from public.activity_logs where entity_type = 'registration_travelers'
  and (coalesce(before::text, '') || coalesce(after::text, '')) ~ 'M12345678|KIM DAD|Teheran'), '감사 기록에 여권번호·부모 이름·주소 없음');

-- 파기 시 함께 삭제
update public.registrations set destroyed_at = now() where id = current_setting('test.r1')::uuid;
select is((select count(*)::int from public.registration_travelers where registration_id = current_setting('test.r1')::uuid), 0, '파기 시 출국 서류 정보 삭제');

select * from finish();
rollback;
