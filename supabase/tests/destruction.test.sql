-- M11: 개인정보 파기 — 승인 대기 생성·[중요] 일정·승인(확인 문구)·보류·예정일 전 실행 불가·파기 내용·권한
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (id, email) values
  ('ae100000-0000-0000-0000-000000000001', 'm11-admin@test.local'),
  ('ae100000-0000-0000-0000-000000000002', 'm11-staff@test.local');
insert into public.staff_profiles (id, name, email, role) values
  ('ae100000-0000-0000-0000-000000000001', '관리자', 'm11-admin@test.local', 'admin'),
  ('ae100000-0000-0000-0000-000000000002', '직원', 'm11-staff@test.local', 'staff');

-- 어제 끝난 캠프(파기 예정일 = 종료 + 5일 = 오늘 + 4일), 7일 전 끝난 캠프(예정일 = 2일 전)
insert into public.programs (id, type, name, season, start_date, end_date, total_price, slug, destroy_after_days) values
  ('af100000-0000-0000-0000-000000000001', 'camp', '겨울 캠프', '2027', public.kst_today() - 20, public.kst_today() - 1, 0, 'destroy-a-t11', 5),
  ('af100000-0000-0000-0000-000000000002', 'camp', '가을 캠프', null, public.kst_today() - 30, public.kst_today() - 7, 0, 'destroy-b-t11', 5),
  ('af100000-0000-0000-0000-000000000003', 'camp', '진행 캠프', null, public.kst_today() + 10, public.kst_today() + 30, 0, 'destroy-c-t11', 5);
insert into public.leads (id, student_name, parent_name, parent_phone, status, destroy_due_date) values
  ('a0100000-0000-0000-0000-000000000001', '상담학생', '상담부모', '01070000001', 'converted', public.kst_today() + 300),
  ('a0100000-0000-0000-0000-000000000002', '오래된상담', '상담부모2', '01070000002', 'closed', public.kst_today() - 1);
insert into public.registrations (id, program_id, lead_id, student_name_ko, student_name_en, parent_name, parent_phone, parent_email, address,
  emergency_name, emergency_phone, special_notes, status, destroy_due_date) values
  ('b0100000-0000-0000-0000-000000000001', 'af100000-0000-0000-0000-000000000001', null, '가학생', 'GA', '가부모', '01080000001', 'a@x.com', '대전', '비상', '01011112222', '메모', 'confirmed', public.kst_today() + 4),
  ('b0100000-0000-0000-0000-000000000002', 'af100000-0000-0000-0000-000000000002', 'a0100000-0000-0000-0000-000000000001', '나학생', 'NA', '나부모', '01080000002', 'b@x.com', '세종', '비상', '01011113333', null, 'confirmed', public.kst_today() - 2),
  ('b0100000-0000-0000-0000-000000000003', 'af100000-0000-0000-0000-000000000003', null, '다학생', 'DA', '다부모', '01080000003', null, null, null, null, null, 'confirmed', public.kst_today() + 35);
insert into public.registration_health_notes values ('b0100000-0000-0000-0000-000000000002', '땅콩 알레르기');
insert into public.notes (entity_type, entity_id, author_id, body) values
  ('registration', 'b0100000-0000-0000-0000-000000000002', 'ae100000-0000-0000-0000-000000000002', '학부모 요청 메모'),
  ('lead', 'a0100000-0000-0000-0000-000000000001', 'ae100000-0000-0000-0000-000000000002', '상담 메모');
insert into public.payment_schedules (id, registration_id, kind, label, amount_due, due_date)
values ('b1100000-0000-0000-0000-000000000002', 'b0100000-0000-0000-0000-000000000002', 'balance', '참가비', 1000000, public.kst_today() - 40);
insert into public.payments (schedule_id, amount, method, paid_at, memo) values ('b1100000-0000-0000-0000-000000000002', 1000000, 'transfer', public.kst_today() - 40, '입금자 나부모');
insert into public.access_tokens (token_hash, purpose, registration_id, expires_at) values ('h-m11', 'my_view', 'b0100000-0000-0000-0000-000000000002', now() + interval '10 days');
insert into public.message_logs (channel, purpose, to_masked, to_hash, status, related_type, related_id)
values ('alimtalk', 'registration_payment_notice', '010-****-0002', 'hash', 'sent', 'registration', 'b0100000-0000-0000-0000-000000000002');

-- 승인 대기 생성
select is(public.queue_destruction_requests(), 3, '종료된 캠프 등록 2건 + 1년 지난 상담 1건 대기 생성');
select is((select count(*)::int from public.destruction_requests where registration_id = 'b0100000-0000-0000-0000-000000000003'), 0, '진행 중 캠프는 대상 아님');
select is((select count(*)::int from public.destruction_requests where lead_id = 'a0100000-0000-0000-0000-000000000001'), 0, '등록으로 이어진 상담은 등록과 함께 파기');
select is((select count(*)::int from public.important_events where category = 'privacy_destruction' and priority = 'critical' and is_system), 3, '[중요] 파기 승인 일정(프로그램별 + 상담)');
select is(public.queue_destruction_requests(), 0, '다시 실행해도 중복 생성 없음');

-- 권한: 직원은 승인·보류 불가, 직접 수정 불가
set local role authenticated;
set local request.jwt.claims to '{"sub":"ae100000-0000-0000-0000-000000000002","role":"authenticated"}';
select ok((select count(*) from public.v_destruction_board) = 3, '직원: 파기 대기 열람');
select throws_ok($$select public.approve_destruction(array(select id from public.destruction_requests where program_id = 'af100000-0000-0000-0000-000000000002'), '가을 캠프')$$,
  '42501', null, '직원: 승인 불가');
select throws_ok($$update public.destruction_requests set status = 'approved'$$, '42501', null, '직원: 직접 수정 불가');

-- 관리자: 확인 문구 = 프로그램명
set local request.jwt.claims to '{"sub":"ae100000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$select public.approve_destruction(array(select id from public.destruction_requests where program_id = 'af100000-0000-0000-0000-000000000002'), '가을')$$,
  'P0001', null, '확인 문구가 다르면 승인 불가');
select throws_ok($$select public.approve_destruction(array(select id from public.destruction_requests where registration_id is not null), '가을 캠프')$$,
  'P0001', null, '여러 프로그램을 한꺼번에 승인 불가');
select is(public.approve_destruction(array(select id from public.destruction_requests where program_id = 'af100000-0000-0000-0000-000000000002'), '가을 캠프'), 1, '프로그램명 입력 후 승인');
select is(public.approve_destruction(array(select id from public.destruction_requests where program_id = 'af100000-0000-0000-0000-000000000001'), '겨울 캠프'), 1, '예정일 전 승인(예정일에 실행)');
select throws_ok($$select public.hold_destruction((select id from public.destruction_requests where lead_id is not null), '')$$, 'P0001', null, '보류 사유 필수');
select public.hold_destruction((select id from public.destruction_requests where lead_id is not null), '분쟁 대응 중');
select is((select status || '/' || hold_reason from public.destruction_requests where lead_id is not null), 'held/분쟁 대응 중', '보류 + 사유');
reset role;

-- 실행 대상: 승인 + 예정일 도래 → 가을 캠프만
select set_config('test.status', (select status from public.registrations where id = 'b0100000-0000-0000-0000-000000000002'), true);
set local role service_role;
select is((select count(*)::int from public.destruction_due_requests()), 1, '예정일이 된 승인 건만 실행 대상');
select throws_ok($$select public.execute_destruction((select id from public.destruction_requests where program_id = 'af100000-0000-0000-0000-000000000001'))$$,
  'P0001', null, '예정일 전에는 실행 불가');
select ok((public.execute_destruction((select id from public.destruction_requests where program_id = 'af100000-0000-0000-0000-000000000002')) ->> 'registration')::boolean, '파기 실행');
reset role;

select is((select concat_ws(',', student_name_ko, student_name_en, parent_name, parent_phone, parent_email, address, emergency_name, emergency_phone)
  from public.registrations where id = 'b0100000-0000-0000-0000-000000000002'), '', '학생·학부모·비상연락처 개인정보 삭제');
select is((select status || '/' || (destroyed_at is not null) from public.registrations where id = 'b0100000-0000-0000-0000-000000000002'),
  current_setting('test.status') || '/true', '상태·통계용 값은 유지(파기로 상태가 바뀌지 않음)');
select is((select count(*)::int from public.registration_health_notes where registration_id = 'b0100000-0000-0000-0000-000000000002')
  + (select count(*)::int from public.notes where entity_id in ('b0100000-0000-0000-0000-000000000002', 'a0100000-0000-0000-0000-000000000001'))
  + (select count(*)::int from public.access_tokens where registration_id = 'b0100000-0000-0000-0000-000000000002'), 0, '건강 정보·메모·고객 링크 삭제');
select is((select concat_ws(',', student_name, parent_name, parent_phone) from public.leads where id = 'a0100000-0000-0000-0000-000000000001'), '', '연결된 상담 신청 개인정보 삭제');
select is((select coalesce(to_hash, '') || coalesce(to_masked, '') from public.message_logs where related_id = 'b0100000-0000-0000-0000-000000000002'), '', '발송 기록 번호 해시 삭제');
select is((select count(*)::int from public.payments where memo is not null and schedule_id = 'b1100000-0000-0000-0000-000000000002'), 0, '납부 메모(입금자명) 삭제');
select is((select amount::text from public.payments where schedule_id = 'b1100000-0000-0000-0000-000000000002'), '1000000', '금액(정산·통계)은 유지');

select * from finish();
rollback;
