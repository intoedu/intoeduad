-- M13: 발송 대기열 — 자동 등록(1회성)·직원 알림 수신자·정정 안내·대기열 처리·매일 알림·권한
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, email) values
  ('ca100000-0000-0000-0000-000000000001', 'm13-admin@test.local'),
  ('ca100000-0000-0000-0000-000000000002', 'm13-staff@test.local'),
  ('ca100000-0000-0000-0000-000000000003', 'm13-viewer@test.local');
insert into public.staff_profiles (id, name, email, role, phone, notify_channels) values
  ('ca100000-0000-0000-0000-000000000001', '관리자', 'm13-admin@test.local', 'admin', '01011110000', '{sms,email}'),
  ('ca100000-0000-0000-0000-000000000002', '직원', 'm13-staff@test.local', 'staff', null, '{sms}'),
  ('ca100000-0000-0000-0000-000000000003', '현지', 'm13-viewer@test.local', 'viewer', '01011112222', '{sms}');

-- 직원 알림 꺼짐 → 학부모 안내만
insert into public.leads (id, student_name, parent_name, parent_phone) values ('cb100000-0000-0000-0000-000000000001', '학생', '부모', '01020000001');
select is((select string_agg(purpose, ',') from public.message_logs where related_id = 'cb100000-0000-0000-0000-000000000001'), 'lead_received', '상담 신청 → 접수 안내 대기');
select ok((select to_hash is null and to_masked is null from public.message_logs where related_id = 'cb100000-0000-0000-0000-000000000001'), '대기열에 번호 없음');

-- 직원 알림 켬(신규 상담·여권·파기 지연)
update public.settings set value = '{"enabled": true, "events": ["new_lead", "passport_uploaded", "destruction_overdue"]}' where key = 'staff_notifications';
insert into public.leads (id, student_name, parent_name, parent_phone) values ('cb100000-0000-0000-0000-000000000002', '학생2', '부모2', '01020000002');
select is((select string_agg(channel || ':' || coalesce(recipient_staff_id::text, '-'), ',' order by channel) from public.message_logs
  where related_id = 'cb100000-0000-0000-0000-000000000002' and purpose = 'staff_new_lead'),
  'email:ca100000-0000-0000-0000-000000000001,sms:ca100000-0000-0000-0000-000000000001', '직원 알림: 번호 있는 문자·이메일 수신자만(현지 팀 제외)');

-- 등록: 접수 → 납부 안내 / 대기 → 대기 안내 / 승격 → 납부 안내(1회)
insert into public.programs (id, type, name, start_date, end_date, total_price, slug, capacity, passport_upload_enabled)
values ('cc100000-0000-0000-0000-000000000001', 'camp', '알림 캠프', public.kst_today() + 30, public.kst_today() + 50, 0, 'msg-t13', 1, true);
insert into public.registrations (id, program_id, student_name_ko, parent_name, parent_phone, status, destroy_due_date) values
  ('cd100000-0000-0000-0000-000000000001', 'cc100000-0000-0000-0000-000000000001', '가', '부모', '01030000001', 'received', public.kst_today() + 55),
  ('cd100000-0000-0000-0000-000000000002', 'cc100000-0000-0000-0000-000000000001', '나', '부모', '01030000002', 'waitlisted', public.kst_today() + 55);
select is((select purpose from public.message_logs where related_id = 'cd100000-0000-0000-0000-000000000001' and recipient_staff_id is null), 'registration_payment_notice', '등록 → 납부 안내');
select is((select purpose from public.message_logs where related_id = 'cd100000-0000-0000-0000-000000000002' and recipient_staff_id is null), 'registration_waitlisted', '대기 → 대기 안내');
update public.registrations set status = 'received' where id = 'cd100000-0000-0000-0000-000000000002';
select is((select count(*)::int from public.message_logs where related_id = 'cd100000-0000-0000-0000-000000000002' and purpose = 'registration_payment_notice'), 1, '대기 → 승격 시 납부 안내');
update public.registrations set status = 'waitlisted' where id = 'cd100000-0000-0000-0000-000000000002';
update public.registrations set status = 'received' where id = 'cd100000-0000-0000-0000-000000000002';
select is((select count(*)::int from public.message_logs where related_id = 'cd100000-0000-0000-0000-000000000002' and purpose = 'registration_payment_notice'), 1, '1회성: 다시 승격해도 한 번만');

-- 여권 업로드 → 직원 알림(학생 정보 없이)
insert into public.passport_files (registration_id, storage_path, iv, mime_type, size_bytes) values ('cd100000-0000-0000-0000-000000000001', 'x.bin', 'iv', 'image/jpeg', 10);
select is((select count(*)::int from public.message_logs where purpose = 'staff_passport_uploaded'), 2, '여권 업로드 → 직원 알림');

-- 정정 안내: 변경 없으면 거부 → 변경 후 1회 → 대기 중 중복 거부 → 보냄 처리 시 기록
set local role authenticated;
set local request.jwt.claims to '{"sub":"ca100000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok($$select public.request_payment_correction('cd100000-0000-0000-0000-000000000001')$$, 'P0001', null, '변경 없으면 정정 안내 불가');
reset role;
update public.registrations set payment_changed_at = now() where id = 'cd100000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims to '{"sub":"ca100000-0000-0000-0000-000000000002","role":"authenticated"}';
select set_config('test.corr', public.request_payment_correction('cd100000-0000-0000-0000-000000000001')::text, true);
select throws_ok($$select public.request_payment_correction('cd100000-0000-0000-0000-000000000001')$$, 'P0001', null, '대기 중이면 중복 요청 불가');
select ok((select count(*) from public.message_logs) > 0, '직원: 발송 기록 열람');
select throws_ok($$select public.retry_message(current_setting('test.corr')::uuid)$$, '42501', null, '직원: 다시 보내기 불가(관리자)');
select throws_ok($$insert into public.message_logs (channel, purpose, status) values ('sms', 'x', 'queued')$$, '42501', null, '직원: 발송 기록 직접 쓰기 불가');
set local request.jwt.claims to '{"sub":"ca100000-0000-0000-0000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.message_logs), 0, '현지 팀: 발송 기록 안 보임');
reset role;

set local role service_role;
select ok((select count(*) from public.claim_messages(100)) >= 8, '대기 건 가져오기');
select is((select count(*)::int from public.claim_messages(100)), 0, '방금 시도한 건은 2분 동안 다시 안 가져옴');
select ok((public.message_context(current_setting('test.corr')::uuid) #>> '{data,phone}') = '01030000001', '보낼 때 DB에서 번호를 읽음');
select public.complete_message(current_setting('test.corr')::uuid, 'sent', 'G1', null, '010-****-0001', 'h');
reset role;
select ok((select payment_correction_sent_at is not null from public.registrations where id = 'cd100000-0000-0000-0000-000000000001'), '정정 안내 보냄 기록');

-- 매일 관리자 알림(하루 한 번)
insert into public.destruction_requests (registration_id, program_id, due_date) values ('cd100000-0000-0000-0000-000000000002', 'cc100000-0000-0000-0000-000000000001', public.kst_today() - 1);
set local role service_role;
select is(public.enqueue_daily_staff_alerts(), 2, '파기 미승인 기한 초과 → 관리자 문자·이메일');
select is(public.enqueue_daily_staff_alerts(), 0, '같은 날 다시 실행해도 한 번만');
reset role;

select * from finish();
rollback;
