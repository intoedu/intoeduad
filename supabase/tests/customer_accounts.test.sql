-- M19: 고객(학부모) 회원 — 본인 정보만, 저장은 함수로만(형식·동의), 직원 계정 제외, 탈퇴(계정 삭제) 시 함께 삭제, 직원 데이터 접근 불가
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, email) values
  ('a1900000-0000-0000-0000-000000000001', 'parent1@test.local'),
  ('a1900000-0000-0000-0000-000000000002', 'parent2@test.local'),
  ('a1900000-0000-0000-0000-000000000003', 'm19-staff@test.local');
insert into public.staff_profiles (id, name, email, role) values
  ('a1900000-0000-0000-0000-000000000003', '직원', 'm19-staff@test.local', 'staff');
insert into public.leads (student_name, parent_name, parent_phone) values ('남의학생', '남의부모', '01090000000');

set local role anon;
select throws_ok($$select count(*) from public.customer_profiles$$, '42501', null, '비로그인: 회원 정보 조회 불가');
select throws_ok($$select public.customer_save_profile('{}')$$, '42501', null, '비로그인: 저장 함수 호출 불가');
select ok((public.public_member_consent() ->> 'title') like '%회원 개인정보%', '회원 동의 문구는 공개');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"a1900000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$insert into public.customer_profiles (id, parent_name, parent_phone, privacy_version, privacy_text, privacy_agreed_at)
  values ('a1900000-0000-0000-0000-000000000001', 'x', '01011112222', 1, 'x', now())$$, '42501', null, '표에 직접 쓰기 불가(함수로만)');
select throws_ok($$select public.customer_save_student('{"name_ko":"자녀"}')$$, '42501', null, '회원 정보 없이 자녀 저장 불가');
select throws_ok($$select public.customer_save_profile('{"parent_name":"부모1","parent_phone":"010-1900-0001"}')$$, 'P0001',
  '회원 개인정보 수집·이용에 동의해 주세요', '처음 저장은 동의 필수');
select throws_ok($$select public.customer_save_profile('{"parent_name":"부모1","parent_phone":"010-1900-0001","kakao_use":false,"agree_privacy":true}')$$, 'P0001',
  null, '카카오톡 미사용이면 대신 받을 방법 필수');
select lives_ok($$select public.customer_save_profile('{"parent_name":"부모1","parent_phone":"010-1900-0001","kakao_use":true,"parent_email":"P1@Example.com","agree_privacy":true}')$$,
  '동의하고 회원 정보 저장');
select is((select parent_phone || '|' || parent_email || '|' || privacy_version from public.customer_profiles), '01019000001|p1@example.com|1',
  '번호 숫자만·이메일 소문자·동의 버전 기록');
select lives_ok($$select public.customer_save_profile('{"parent_name":"부모1 수정","parent_phone":"01019000001","kakao_use":true}')$$, '두 번째부터는 동의 없이 수정');
select set_config('t.s1', public.customer_save_student('{"name_ko":"자녀1","name_en":"ja nyeo  one","grade":"초6","birth_date":"2015-01-01"}')::text, true);
select is((select name_en from public.customer_students where id = current_setting('t.s1')::uuid), 'JA NYEO ONE', '영문 이름 대문자 정리');
select throws_ok($$select public.customer_save_student('{"name_ko":"자녀2","name_en":"홍길동"}')$$, 'P0001', null, '영문 이름 형식 검사');
select is((select count(*)::int from public.leads), 0, '회원 계정은 상담 신청 기록을 볼 수 없음');
select is((select count(*)::int from public.staff_profiles), 0, '회원 계정은 직원 목록을 볼 수 없음');

-- 다른 회원은 볼 수도 고칠 수도 없음
set local request.jwt.claims to '{"sub":"a1900000-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.customer_profiles) + (select count(*)::int from public.customer_students), 0, '다른 회원 정보 안 보임');
select throws_ok(format($$select public.customer_save_student('{"id":"%s","name_ko":"가로채기"}')$$, current_setting('t.s1')), '42501', null,
  '다른 회원의 자녀 정보 수정 불가');

-- 직원 계정은 회원 정보 불가
set local request.jwt.claims to '{"sub":"a1900000-0000-0000-0000-000000000003","role":"authenticated"}';
select throws_ok($$select public.customer_save_profile('{"parent_name":"직원","parent_phone":"01019000003","agree_privacy":true,"kakao_use":true}')$$, '42501', null,
  '직원 계정으로 회원 정보 불가');
reset role;

-- 탈퇴(계정 삭제) → 회원 정보 함께 삭제
delete from auth.users where id = 'a1900000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.customer_profiles) + (select count(*)::int from public.customer_students), 0, '계정 삭제 시 회원 정보도 삭제');

select * from finish();
rollback;
