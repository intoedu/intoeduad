-- M9: 등록 상태 자동 갱신·납부 기록·일정 변경 사유·취소/환불·대기 승격·권한
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

insert into auth.users (id, email) values
  ('a9000000-0000-0000-0000-000000000001', 'm9-admin@test.local'),
  ('a9000000-0000-0000-0000-000000000002', 'm9-staff@test.local'),
  ('a9000000-0000-0000-0000-000000000003', 'm9-viewer@test.local');
insert into public.staff_profiles (id, name, email, role) values
  ('a9000000-0000-0000-0000-000000000001', '관리자', 'm9-admin@test.local', 'admin'),
  ('a9000000-0000-0000-0000-000000000002', '직원', 'm9-staff@test.local', 'staff'),
  ('a9000000-0000-0000-0000-000000000003', '현지', 'm9-viewer@test.local', 'viewer');

-- 출국 20일 뒤 → 잔금 기한(출국 10일 전) = 오늘+10 → D-14 안
insert into public.programs (id, type, name, start_date, end_date, capacity, total_price, slug, refund_rules)
values ('b9000000-0000-0000-0000-000000000001', 'camp', '상태 캠프', public.kst_today() + 20, public.kst_today() + 40, 2, 5000000, 'status-t9',
  '[{"min_days":30,"max_days":null,"rate":0},{"min_days":20,"max_days":29,"rate":0.1},{"min_days":10,"max_days":19,"rate":0.15},{"min_days":null,"max_days":9,"rate":0.3}]');
insert into public.program_payment_rules (program_id, kind, label, amount, due_rule_type, due_offset_days) values
  ('b9000000-0000-0000-0000-000000000001', 'deposit', '예약금', 1000000, 'after_registration', 3),
  ('b9000000-0000-0000-0000-000000000001', 'balance', '잔금', 4000000, 'before_start', 10);
insert into public.staff_program_assignments values ('a9000000-0000-0000-0000-000000000003', 'b9000000-0000-0000-0000-000000000001');

insert into public.registrations (id, program_id, student_name_ko, parent_name, parent_phone, status, destroy_due_date) values
  ('c9000000-0000-0000-0000-000000000001', 'b9000000-0000-0000-0000-000000000001', '가학생', '부모', '01011110001', 'received', public.kst_today() + 45),
  ('c9000000-0000-0000-0000-000000000002', 'b9000000-0000-0000-0000-000000000001', '나학생', '부모', '01011110002', 'received', public.kst_today() + 45),
  ('c9000000-0000-0000-0000-000000000003', 'b9000000-0000-0000-0000-000000000001', '다학생', '부모', '01011110003', 'waitlisted', public.kst_today() + 45);
insert into public.payment_schedules (registration_id, kind, label, amount_due, due_date, sort)
select r.id, s.kind, s.label, s.amount, s.due_date, s.sort
from public.registrations r cross join public.compute_payment_schedule('b9000000-0000-0000-0000-000000000001', public.kst_today()) s
where r.status = 'received';

set local role authenticated;
set local request.jwt.claims to '{"sub":"a9000000-0000-0000-0000-000000000002","role":"authenticated"}';

-- 상태 흐름
select is(public.confirm_registration_receipt('c9000000-0000-0000-0000-000000000001'), 'deposit_pending', '접수 확인 → 예약금 대기');
select throws_ok($$select public.confirm_registration_receipt('c9000000-0000-0000-0000-000000000001')$$, 'P0001', null, '접수 확인은 한 번만');
insert into public.payments (schedule_id, amount, method)
select id, 500000, 'transfer' from public.payment_schedules where registration_id = 'c9000000-0000-0000-0000-000000000001' and kind = 'deposit';
select is((select status from public.registrations where id = 'c9000000-0000-0000-0000-000000000001'), 'deposit_pending', '일부 납부는 예약금 대기 유지');
select is((select p.recorded_by from public.payments p join public.payment_schedules s on s.id = p.schedule_id where s.registration_id = 'c9000000-0000-0000-0000-000000000001' limit 1), 'a9000000-0000-0000-0000-000000000002'::uuid, '납부 기록자 자동');
insert into public.payments (schedule_id, amount, method)
select id, 500000, 'card' from public.payment_schedules where registration_id = 'c9000000-0000-0000-0000-000000000001' and kind = 'deposit';
select is((select status from public.registrations where id = 'c9000000-0000-0000-0000-000000000001'), 'balance_pending', '예약금 완납 + 잔금 기한 D-14 이내 → 잔금 대기');
insert into public.payments (schedule_id, amount, method)
select id, 4000000, 'transfer' from public.payment_schedules where registration_id = 'c9000000-0000-0000-0000-000000000001' and kind = 'balance';
select is((select status from public.registrations where id = 'c9000000-0000-0000-0000-000000000001'), 'balance_pending', '완납이어도 소개 경로 확인 전이면 확정 안 됨');
update public.registrations set attribution_confirmed_at = now() where id = 'c9000000-0000-0000-0000-000000000001';
select is((select status from public.registrations where id = 'c9000000-0000-0000-0000-000000000001'), 'confirmed', '소개 경로 확인 → 등록 확정');
select is((select balance from (select attribution_confirmed_by as balance from public.registrations where id = 'c9000000-0000-0000-0000-000000000001') x),
  'a9000000-0000-0000-0000-000000000002'::uuid, '확인자 자동 기록');

-- 납부 기록은 수정 불가, 무효 처리만 → 상태 되돌림
select throws_ok($$update public.payments set amount = 1 where amount = 4000000$$, 'P0001', null, '기록된 납부 금액 수정 불가');
update public.payments p set status = 'void' from public.payment_schedules s where s.id = p.schedule_id and s.registration_id = 'c9000000-0000-0000-0000-000000000001' and p.amount = 4000000;
select is((select p.voided_by from public.payments p join public.payment_schedules s on s.id = p.schedule_id where s.registration_id = 'c9000000-0000-0000-0000-000000000001' and p.amount = 4000000), 'a9000000-0000-0000-0000-000000000002'::uuid, '무효 처리자 자동');
select is((select status from public.registrations where id = 'c9000000-0000-0000-0000-000000000001'), 'balance_pending', '무효 처리 → 상태 재계산');
select throws_ok($$update public.payments set status = 'confirmed' where amount = 4000000$$, 'P0001', null, '무효 처리는 되돌릴 수 없음');

-- 일정 금액·기한 변경: 사유 필수, 정정 안내 필요 표시
select throws_ok($$update public.payment_schedules set amount_due = 3800000
  where registration_id = 'c9000000-0000-0000-0000-000000000001' and kind = 'balance'$$, 'P0001', null, '사유 없이 금액 변경 불가');
update public.payment_schedules set amount_due = 3800000, change_reason = '숙소 변경 감액'
 where registration_id = 'c9000000-0000-0000-0000-000000000001' and kind = 'balance';
select ok((select payment_changed_at is not null from public.registrations where id = 'c9000000-0000-0000-0000-000000000001'), '변경 시각 기록(정정 안내 대상)');
select ok(exists (select 1 from public.activity_logs where entity_type = 'payment_schedules' and 'amount_due' = any (changed_fields)
  and (before ->> 'amount_due') = '4000000' and (after ->> 'amount_due') = '3800000'), '금액 변경 이력(전·후) 기록');

-- 정원 2명 중 2명(가·나) → 대기 승격 불가
select throws_ok($$select public.promote_waitlisted('c9000000-0000-0000-0000-000000000003')$$, 'P0001', null, '정원이 차면 승격 불가');

-- 취소(고객 사정, 출국 20일 전 → 10% 공제) — 나학생은 납부 없음
select public.confirm_registration_receipt('c9000000-0000-0000-0000-000000000002');
insert into public.payments (schedule_id, amount, method)
select id, 1000000, 'transfer' from public.payment_schedules where registration_id = 'c9000000-0000-0000-0000-000000000002' and kind = 'deposit';
select set_config('test.refund', public.cancel_registration('c9000000-0000-0000-0000-000000000002', public.kst_today(), 'customer', '개인 사정')::text, true);
select is((select days_before_start || '/' || deduction_rate || '/' || paid_total || '/' || expected_amount from public.refunds where id = current_setting('test.refund')::uuid),
  '20/0.1000/1000000/500000', '환불 예상액 = 납부 100만 - 총액 500만×10%');
select is((select status from public.registrations where id = 'c9000000-0000-0000-0000-000000000002'), 'canceled', '취소 상태');
select is((select count(*)::int from public.payment_schedules where registration_id = 'c9000000-0000-0000-0000-000000000002' and canceled_at is null), 0, '남은 일정 취소');
select throws_ok($$select public.process_refund(current_setting('test.refund')::uuid, 2000000, null)$$, 'P0001', null, '납부액보다 큰 환불 불가');
select public.process_refund(current_setting('test.refund')::uuid, 500000, '계좌 환불');
select is((select status from public.registrations where id = 'c9000000-0000-0000-0000-000000000002'), 'refunded', '환불 완료 → 환불 상태');
select is((select destroy_due_date from public.registrations where id = 'c9000000-0000-0000-0000-000000000002'), public.kst_today() + 5, '파기 기준 = 환불 완료 + 5일');

-- 자리가 나면 대기 승격: 승격일 기준 납부 일정 생성
select lives_ok($$select public.promote_waitlisted('c9000000-0000-0000-0000-000000000003')$$, '취소로 자리가 나면 승격');
select is((select status || '/' || registered_on from public.registrations where id = 'c9000000-0000-0000-0000-000000000003'),
  'received/' || public.kst_today(), '승격: 신청 접수 + 등록일 = 승격일');
select is((select count(*)::int from public.payment_schedules where registration_id = 'c9000000-0000-0000-0000-000000000003'), 2, '승격 시 납부 일정 생성');

-- 목록 뷰
select is((select total_paid from public.v_registration_board where id = 'c9000000-0000-0000-0000-000000000001'), 1000000::bigint, '목록: 납부 합계(무효 제외)');

-- 현지 팀: 목록 뷰·납부 조회 불가, 상태 계산 함수도 값 없음
set local request.jwt.claims to '{"sub":"a9000000-0000-0000-0000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.v_registration_board) + (select count(*)::int from public.v_payment_board), 0, '현지 팀: 등록·납부 목록 안 보임');
select is(public.compute_registration_status('c9000000-0000-0000-0000-000000000001'), null, '현지 팀: 상태 계산 결과 없음');

select * from finish();
rollback;
