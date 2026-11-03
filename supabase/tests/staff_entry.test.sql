-- M16: 관리자·직원 직접 입력 — 상담 신청·캠프 등록 (같은 검증·납부 일정·할인, 입력자·동의 확인 기록, 알림 선택, 권한)
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email) values
  ('a1600000-0000-0000-0000-000000000001', 'm16-staff@test.local'),
  ('a1600000-0000-0000-0000-000000000002', 'm16-viewer@test.local'),
  ('a1600000-0000-0000-0000-000000000003', 'm16-nobody@test.local');
insert into public.staff_profiles (id, name, email, role) values
  ('a1600000-0000-0000-0000-000000000001', '김직원', 'm16-staff@test.local', 'staff'),
  ('a1600000-0000-0000-0000-000000000002', '현지', 'm16-viewer@test.local', 'viewer');
insert into public.partners (id, name, code) values ('d1600000-0000-0000-0000-000000000001', '직접학원', 'm16-direct');
insert into public.partner_contacts (id, partner_id, name, code) values
  ('e1600000-0000-0000-0000-000000000001', 'd1600000-0000-0000-0000-000000000001', '박실장', 'park');

-- 모집 전(before) 캠프 — 학부모 신청서로는 신청 불가, 직원 직접 입력은 가능
insert into public.programs (id, type, name, start_date, end_date, capacity, total_price, slug, early_bird_discount, early_bird_until)
values ('c1600000-0000-0000-0000-000000000001', 'camp', '직접 입력 캠프', public.kst_today() + 60, public.kst_today() + 80, 5, 5000000,
  'direct-t16', 300000, public.kst_today() + 5);
insert into public.program_payment_rules (program_id, kind, label, amount, due_rule_type, due_offset_days) values
  ('c1600000-0000-0000-0000-000000000001', 'deposit', '계약금', 1000000, 'after_registration', 7),
  ('c1600000-0000-0000-0000-000000000001', 'balance', '원금', 4000000, 'before_start', 30);
insert into public.program_partner_discounts (program_id, partner_id, amount)
values ('c1600000-0000-0000-0000-000000000001', 'd1600000-0000-0000-0000-000000000001', 200000);

create temp table reg (v jsonb);
insert into reg values ($${
  "program_id": "c1600000-0000-0000-0000-000000000001",
  "student_name_ko": "직접학생", "student_name_en": "JIKJEOP KID", "birth_date": "2015-05-05", "gender": "male",
  "grade": "초6", "parent_name": "직접부모", "parent_phone": "010-1600-0001", "parent_email": "p@example.com",
  "emergency_name": "보호자", "emergency_relation": "아버지", "emergency_phone": "010-1600-0009",
  "partner_id": "d1600000-0000-0000-0000-000000000001", "contact_id": "e1600000-0000-0000-0000-000000000001",
  "entry_method": "paper", "consent_confirmed": true
}$$);
grant select on reg to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 권한
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok($$select public.admin_create_lead('{}')$$, '42501', null, '비로그인: 상담 직접 등록 불가');
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"a1600000-0000-0000-0000-000000000003","role":"authenticated"}';
select throws_ok($$select public.admin_create_lead('{"student_name":"x","parent_name":"y","parent_phone":"01012345678","consent_confirmed":true}')$$,
  '42501', null, '직원 등록 없는 가입자: 상담 직접 등록 불가');
select throws_ok($$select public.admin_create_registration((select v from reg))$$, '42501', null, '직원 등록 없는 가입자: 등록 직접 추가 불가');
set local request.jwt.claims to '{"sub":"a1600000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok($$select public.admin_create_registration((select v from reg))$$, '42501', null, '현지 팀: 등록 직접 추가 불가');

-- ---------------------------------------------------------------------------
-- 상담 신청 직접 등록 (직원)
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"a1600000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$select public.admin_create_lead('{"student_name":"x","parent_name":"y","parent_phone":"01012345678"}')$$,
  'P0001', '고객에게 개인정보 수집·이용 동의를 받았는지 확인해 주세요', '동의 확인 없으면 거부');
select set_config('test.lead', public.admin_create_lead($${
  "student_name":"전화학생","student_grade":"중1","parent_name":"전화부모","parent_phone":"010-1600-0100",
  "partner_id":"d1600000-0000-0000-0000-000000000001","program_ids":["c1600000-0000-0000-0000-000000000001"],
  "message":"전화 문의","entry_method":"phone","consent_confirmed":true,"slot_id":"not-used"}$$) ->> 'lead_id', true);
reset role;

select is((select entered_by::text || '|' || entry_method || '|' || attribution_source from public.leads where id = current_setting('test.lead')::uuid),
  'a1600000-0000-0000-0000-000000000001|phone|staff', '입력 직원·방법·소개 경로(직원 기록) 저장');
select is((select count(*)::int from public.lead_program_interests where lead_id = current_setting('test.lead')::uuid), 1, '관심 캠프 연결');
select is((select string_agg(kind, ',' order by kind) from public.consent_records where lead_id = current_setting('test.lead')::uuid),
  'lead_guardian,lead_privacy,staff_entry', '동의 문구 원문 + 담당자 동의 확인 기록');
select ok((select rendered_text from public.consent_records where lead_id = current_setting('test.lead')::uuid and kind = 'staff_entry') ~ '김직원.*전화',
  '동의 확인 기록에 담당자 이름·방법');
select is((select status from public.message_logs where related_id = current_setting('test.lead')::uuid and purpose = 'lead_received'),
  'skipped', '접수 안내 보내지 않음(선택 안 함)');
select ok(not exists (select 1 from public.message_logs where related_id = current_setting('test.lead')::uuid and purpose like 'staff_%' and status = 'queued'),
  '직원 알림 대기 없음');
select ok(not exists (select 1 from public.activity_logs where entity_id = current_setting('test.lead')::uuid
  and (coalesce(before::text, '') || coalesce(after::text, '')) ~ '01016000100|전화부모'), '감사 기록에 개인정보 값 없음');

-- ---------------------------------------------------------------------------
-- 캠프 등록 직접 추가 (직원)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"a1600000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$select public.admin_create_registration((select v from reg) - 'consent_confirmed')$$, 'P0001', null, '동의 확인 없으면 거부');
select throws_ok($$select public.admin_create_registration((select v from reg) || '{"program_id":"nope"}')$$, 'P0001', '캠프를 선택해 주세요', '캠프 선택 필수');
select set_config('test.reg', public.admin_create_registration((select v from reg) || '{"notify": true}') ->> 'registration_id', true);
select throws_ok($$select public.submit_registration((select v from reg) || '{"slug":"direct-t16"}')$$, '42501', null,
  '직원도 학부모용 저장 함수를 직접 부를 수는 없음');
reset role;

select is((select status || '|' || entered_by::text || '|' || entry_method || '|' || attribution_source || '|' ||
  (select name from public.partner_contacts where id = partner_contact_id) from public.registrations where id = current_setting('test.reg')::uuid),
  'received|a1600000-0000-0000-0000-000000000001|paper|staff|박실장', '모집 전 캠프에도 등록, 입력자·방법·학원·실장 기록');
select is((select array_agg(amount_due order by sort)::text from public.payment_schedules where registration_id = current_setting('test.reg')::uuid),
  '{1000000,3500000}', '납부 일정 자동 생성 + 얼리버드·학원 할인 반영');
select ok(exists (select 1 from public.consent_records where registration_id = current_setting('test.reg')::uuid and kind = 'staff_entry'
  and rendered_text ~ '종이 신청서'), '담당자 동의 확인 기록');
select ok((select count(*) from public.consent_records where registration_id = current_setting('test.reg')::uuid and kind = 'reg_privacy' and agreed) = 1,
  '개인정보 동의 원문 기록');
select is((select status from public.message_logs where related_id = current_setting('test.reg')::uuid and purpose = 'registration_payment_notice'),
  'queued', '납부 안내 보내기 선택 → 발송 대기');
select is((select programs.status from public.programs where id = 'c1600000-0000-0000-0000-000000000001'), 'before', '캠프 모집 상태는 그대로');

-- 학부모 신청서(서비스 역할)는 여전히 모집 중인 캠프만
set local role service_role;
select throws_ok($$select public.submit_registration((select v from reg) || '{"slug":"direct-t16","student_name_ko":"학부모직접","agree":{"reg_privacy":true,"reg_third_party":true,"reg_guardian":true,"refund":true,"destruction_notice":true}}')$$,
  'P0001', '지금은 신청을 받지 않습니다', '학부모 신청서: 모집 전 캠프는 여전히 거부');
reset role;

select * from finish();
rollback;
