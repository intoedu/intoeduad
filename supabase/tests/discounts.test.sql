-- M15: 캠프비 할인 — 얼리버드·학원별 할인이 신청·승격 시 납부 일정에 반영되고 기록되며, 권한이 지켜짐
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (id, email) values
  ('a1500000-0000-0000-0000-000000000001', 'm15-admin@test.local'),
  ('a1500000-0000-0000-0000-000000000002', 'm15-staff@test.local'),
  ('a1500000-0000-0000-0000-000000000003', 'm15-viewer@test.local'),
  ('a1500000-0000-0000-0000-000000000004', 'm15-nobody@test.local');
insert into public.staff_profiles (id, name, email, role) values
  ('a1500000-0000-0000-0000-000000000001', '관리자', 'm15-admin@test.local', 'admin'),
  ('a1500000-0000-0000-0000-000000000002', '직원', 'm15-staff@test.local', 'staff'),
  ('a1500000-0000-0000-0000-000000000003', '현지', 'm15-viewer@test.local', 'viewer');

insert into public.partners (id, name, code) values
  ('d1500000-0000-0000-0000-000000000001', '할인학원', 'm15-disc'),
  ('d1500000-0000-0000-0000-000000000002', '일반학원', 'm15-plain');

-- 캠프비 500만 = 예약금 100만 + 잔금 400만, 항공권 별도. 얼리버드 30만(오늘+10일까지)
insert into public.programs (id, type, name, start_date, end_date, capacity, waitlist_enabled, total_price, slug,
  early_bird_discount, early_bird_until)
values ('c1500000-0000-0000-0000-000000000001', 'camp', '할인 캠프', public.kst_today() + 60, public.kst_today() + 80, 2, true, 5000000,
  'disc-t15', 300000, public.kst_today() + 10);
insert into public.program_payment_rules (program_id, kind, label, amount, due_rule_type, due_offset_days) values
  ('c1500000-0000-0000-0000-000000000001', 'deposit', '예약금', 1000000, 'after_registration', 7),
  ('c1500000-0000-0000-0000-000000000001', 'balance', '잔금', 4000000, 'before_start', 30),
  ('c1500000-0000-0000-0000-000000000001', 'extra', '항공권', 1500000, 'before_start', 45);
update public.programs set status = 'open' where id = 'c1500000-0000-0000-0000-000000000001';

select throws_ok($$update public.programs set early_bird_until = null where id = 'c1500000-0000-0000-0000-000000000001'$$,
  '23514', null, '얼리버드 금액과 마감일은 함께 입력');
select throws_ok($$update public.programs set early_bird_discount = 6000000 where id = 'c1500000-0000-0000-0000-000000000001'$$,
  '23514', null, '얼리버드 할인은 총 참가비보다 작아야 함');

-- ---------------------------------------------------------------------------
-- 학원별 할인: 직원·관리자만 관리
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"a1500000-0000-0000-0000-000000000002","role":"authenticated"}';
select lives_ok($$insert into public.program_partner_discounts (program_id, partner_id, amount, note)
  values ('c1500000-0000-0000-0000-000000000001', 'd1500000-0000-0000-0000-000000000001', 200000, 'MOU 특별 할인')$$, '직원: 학원별 할인 등록');
select is((select created_by::text from public.program_partner_discounts limit 1), 'a1500000-0000-0000-0000-000000000002', '등록한 직원 기록');
select throws_ok($$insert into public.program_partner_discounts (program_id, partner_id, amount)
  values ('c1500000-0000-0000-0000-000000000001', 'd1500000-0000-0000-0000-000000000001', 100000)$$, '23505', null, '같은 캠프·학원 중복 불가');
select throws_ok($$insert into public.program_partner_discounts (program_id, partner_id, amount)
  values ('c1500000-0000-0000-0000-000000000001', 'd1500000-0000-0000-0000-000000000002', 0)$$, '23514', null, '할인 금액은 0보다 커야 함');

set local request.jwt.claims to '{"sub":"a1500000-0000-0000-0000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.program_partner_discounts), 0, '현지 팀: 학원별 할인 안 보임');
select throws_ok($$insert into public.program_partner_discounts (program_id, partner_id, amount)
  values ('c1500000-0000-0000-0000-000000000001', 'd1500000-0000-0000-0000-000000000002', 1000)$$, '42501', null, '현지 팀: 등록 불가');

set local request.jwt.claims to '{"sub":"a1500000-0000-0000-0000-000000000004","role":"authenticated"}';
select is((select count(*)::int from public.program_partner_discounts), 0, '직원 등록 없는 가입자: 안 보임');
select throws_ok($$select * from public.registration_discounts('c1500000-0000-0000-0000-000000000001', 'd1500000-0000-0000-0000-000000000001', public.kst_today())$$,
  '42501', null, '로그인 사용자도 할인 계산 함수 직접 호출 불가');
select throws_ok(format('select public.promote_waitlisted(%L)', gen_random_uuid()), '42501', null, '직원 등록 없는 가입자: 대기 승격 불가');
reset role;

-- ---------------------------------------------------------------------------
-- 공개 신청서(비로그인): 얼리버드는 모두에게, 학원 할인은 그 학원 링크로 들어온 경우만
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select is(public.public_register_form('disc-t15') #>> '{schedule,1,amount}', '3700000', '공개: 잔금에 얼리버드 반영');
select is(public.public_register_form('disc-t15') #>> '{schedule,1,label}', '잔금 (할인 반영)', '공개: 할인 반영 표시');
select is(jsonb_array_length(public.public_register_form('disc-t15') -> 'discounts'), 1, '공개: 학원 코드 없으면 얼리버드만');
select is(public.public_register_form('disc-t15', 'm15-disc') #>> '{schedule,1,amount}', '3500000', '공개: 할인학원 링크 → 얼리버드 + 학원 할인');
select is(public.public_register_form('disc-t15', 'm15-disc') #>> '{schedule,2,amount}', '1500000', '공개: 항공권 등 추가 항목은 할인 없음');
select throws_ok($$select count(*) from public.program_partner_discounts$$, '42501', null, '비로그인: 할인 표 직접 조회 불가');
reset role;

-- ---------------------------------------------------------------------------
-- 신청 저장(Edge Function = service role)
-- ---------------------------------------------------------------------------
create temp table base (v jsonb);
insert into base values ($${
  "slug": "disc-t15", "student_name_ko": "할인학생", "student_name_en": "DC KID", "birth_date": "2015-03-02", "gender": "male",
  "grade": "초6", "parent_name": "부모", "parent_phone": "010-1500-0001", "parent_email": "a@b.co",
  "emergency_name": "x", "emergency_relation": "부", "emergency_phone": "010-1500-0009",
  "agree": {"reg_privacy": true, "reg_third_party": true, "reg_guardian": true, "refund": true, "destruction_notice": true}
}$$);
grant select on base to service_role;

set local role service_role;
select set_config('test.r1', public.submit_registration((select v from base) || '{"partner_code":"m15-disc"}') ->> 'registration_id', true);
select set_config('test.r2', public.submit_registration((select v from base) || '{"student_name_ko":"일반학생","parent_phone":"010-1500-0002","partner_code":"m15-plain"}') ->> 'registration_id', true);
-- 정원 2명 → 세 번째는 대기
select set_config('test.r3', public.submit_registration((select v from base) || '{"student_name_ko":"대기학생","parent_phone":"010-1500-0003","partner_code":"m15-disc"}') ->> 'registration_id', true);
reset role;

select is((select array_agg(amount_due order by sort)::text from public.payment_schedules where registration_id = current_setting('test.r1')::uuid),
  '{1000000,3500000,1500000}', '할인학원 등록생: 잔금 = 400만 − 30만 − 20만');
select is((select discount_amount from public.registrations where id = current_setting('test.r1')::uuid), 500000::bigint, '적용 할인 합계 기록');
select is((select string_agg(x ->> 'kind', ',' order by x ->> 'kind') from public.registrations r, jsonb_array_elements(r.discount_detail) x
  where r.id = current_setting('test.r1')::uuid), 'early_bird,partner', '할인 내역 기록(얼리버드·학원)');
select is((select array_agg(amount_due order by sort)::text from public.payment_schedules where registration_id = current_setting('test.r2')::uuid),
  '{1000000,3700000,1500000}', '다른 학원 등록생: 얼리버드만');
select is((select payment_changed_at from public.registrations where id = current_setting('test.r1')::uuid), null,
  '할인 반영은 "납부 안내 변경"으로 잡히지 않음(처음부터 할인 금액으로 생성)');
select is((select summary -> 'discounts' -> 0 ->> 'amount' from (select public.registration_summary(current_setting('test.r1')::uuid) as summary) s),
  '300000', '고객 확인 화면에 할인 내역');

-- ---------------------------------------------------------------------------
-- 대기 → 승격: 승격일 기준(얼리버드 기한이 지났으면 학원 할인만)
-- ---------------------------------------------------------------------------
update public.programs set early_bird_until = public.kst_today() - 1 where id = 'c1500000-0000-0000-0000-000000000001';
update public.registrations set status = 'canceled' where id = current_setting('test.r2')::uuid;
set local role authenticated;
set local request.jwt.claims to '{"sub":"a1500000-0000-0000-0000-000000000002","role":"authenticated"}';
select lives_ok(format('select public.promote_waitlisted(%L)', current_setting('test.r3')), '직원: 대기 승격');
reset role;
select is((select array_agg(amount_due order by sort)::text from public.payment_schedules where registration_id = current_setting('test.r3')::uuid),
  '{1000000,3800000,1500000}', '승격: 얼리버드 기한 지나 학원 할인만');

select * from finish();
rollback;
