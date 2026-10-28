-- 역할별 접근 권한(RLS) 테스트 — `npx supabase test db`
begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

-- ---------------------------------------------------------------------------
-- 테스트 데이터 (postgres 권한으로 생성)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 't-admin@test.local'),
  ('a0000000-0000-0000-0000-000000000002', 't-staff@test.local'),
  ('a0000000-0000-0000-0000-000000000003', 't-staff-pass@test.local'),
  ('a0000000-0000-0000-0000-000000000004', 't-viewer@test.local'),
  ('a0000000-0000-0000-0000-000000000005', 't-inactive@test.local');

insert into public.staff_profiles (id, name, email, role, can_view_passport, active) values
  ('a0000000-0000-0000-0000-000000000001', '관리자', 't-admin@test.local', 'admin', false, true),
  ('a0000000-0000-0000-0000-000000000002', '직원', 't-staff@test.local', 'staff', false, true),
  ('a0000000-0000-0000-0000-000000000003', '여권직원', 't-staff-pass@test.local', 'staff', true, true),
  ('a0000000-0000-0000-0000-000000000004', '현지팀', 't-viewer@test.local', 'viewer', false, true),
  ('a0000000-0000-0000-0000-000000000005', '퇴사자', 't-inactive@test.local', 'admin', false, false);

insert into public.programs (id, type, name, start_date, end_date, total_price, slug) values
  ('b0000000-0000-0000-0000-000000000001', 'camp', '담당 캠프', '2027-01-05', '2027-02-02', 1000000, 'test-assigned'),
  ('b0000000-0000-0000-0000-000000000002', 'camp', '다른 캠프', '2027-01-05', '2027-02-02', 1000000, 'test-other');

insert into public.staff_program_assignments (staff_id, program_id)
values ('a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001');

insert into public.leads (id, student_name, parent_name, parent_phone)
values ('c0000000-0000-0000-0000-000000000001', '김학생', '김부모', '01012345678');

insert into public.registrations (id, program_id, student_name_ko, parent_name, parent_phone, address) values
  ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '이학생', '이부모', '01011112222', '서울시 비밀주소'),
  ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', '박학생', '박부모', '01033334444', '부산시 비밀주소');

insert into public.registration_health_notes (registration_id, body)
values ('d0000000-0000-0000-0000-000000000001', '땅콩 알레르기');

insert into public.passport_files (id, registration_id, storage_path, iv, mime_type, size_bytes)
values ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'test/p1.bin', 'iv', 'image/jpeg', 100);

insert into public.passport_access_logs (passport_file_id, registration_id, action)
values ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'upload');

insert into public.payment_schedules (registration_id, kind, label, amount_due, due_date)
values ('d0000000-0000-0000-0000-000000000001', 'deposit', '예약금', 500000, '2026-12-01');

-- ---------------------------------------------------------------------------
-- 비로그인(anon): 어떤 테이블에도 접근 불가
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select throws_ok('select * from public.leads', '42501', null, 'anon: 상담 신청 조회 불가');
select throws_ok('select * from public.registrations', '42501', null, 'anon: 등록생 조회 불가');
select throws_ok('select * from public.passport_files', '42501', null, 'anon: 여권 파일 조회 불가');
select throws_ok(
  $$insert into public.leads (student_name, parent_name, parent_phone) values ('a','b','01000000000')$$,
  '42501', null, 'anon: 상담 신청 직접 INSERT 불가(Edge Function 경유만)'
);
select throws_ok('select * from public.viewer_list_registrations(''b0000000-0000-0000-0000-000000000001'')',
  '42501', null, 'anon: 현지 팀 조회 함수 실행 불가');

-- ---------------------------------------------------------------------------
-- 관리자
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is((select count(*)::int from public.leads), 1, '관리자: 상담 신청 열람');
select is((select count(*)::int from public.registrations), 2, '관리자: 등록생 전체 열람');
select is((select count(*)::int from public.passport_files), 1, '관리자: 여권 메타데이터 열람');
select is((select count(*)::int from public.passport_access_logs), 1, '관리자: 여권 접속기록 열람');

-- ---------------------------------------------------------------------------
-- 직원(여권 권한 없음)
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is((select count(*)::int from public.leads), 1, '직원: 상담 신청 열람');
select is((select count(*)::int from public.registrations), 2, '직원: 등록생 열람');
select is((select count(*)::int from public.v_payment_schedules), 1, '직원: 납부 일정 열람');
select is((select count(*)::int from public.passport_files), 0, '직원(권한 없음): 여권 메타데이터 열람 불가');
select is((select count(*)::int from public.passport_access_logs), 0, '직원: 여권 접속기록 열람 불가');

-- 자기 역할·여권 권한 올리기 시도 → 반영 안 됨
update public.staff_profiles set role = 'admin', can_view_passport = true
where id = 'a0000000-0000-0000-0000-000000000002';
select is(
  (select role from public.staff_profiles where id = 'a0000000-0000-0000-0000-000000000002'),
  'staff', '직원: 자신의 역할 변경 불가'
);

-- 동의 문구 수정 불가 (관리자만 새 버전 추가)
select throws_ok(
  $$insert into public.consent_documents (kind, version, title, body) values ('lead_privacy', 99, 't', 'b')$$,
  '42501', null, '직원: 동의 문구 새 버전 추가 불가'
);

-- 감사 기록에 직접 쓰기 불가
select throws_ok(
  $$insert into public.activity_logs (entity_type, action) values ('x', 'y')$$,
  '42501', null, '직원: 감사 기록 직접 쓰기 불가'
);

-- ---------------------------------------------------------------------------
-- 직원(여권 권한 있음)
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}';

select is((select count(*)::int from public.passport_files), 1, '여권 권한 직원: 여권 메타데이터 열람');
select is((select count(*)::int from public.passport_access_logs), 0, '여권 권한 직원: 접속기록은 관리자만');

-- ---------------------------------------------------------------------------
-- 현지 팀(viewer)
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';

select is((select count(*)::int from public.leads), 0, '현지 팀: 상담 신청 열람 불가');
select is((select count(*)::int from public.registrations), 0, '현지 팀: 등록생 테이블 직접 열람 불가(주소 보호)');
select is((select count(*)::int from public.payment_schedules), 0, '현지 팀: 납부 정보 열람 불가');
select is((select count(*)::int from public.passport_files), 0, '현지 팀: 여권 열람 불가');
select is((select count(*)::int from public.programs), 1, '현지 팀: 담당 프로그램만 열람');
select is(
  (select count(*)::int from public.viewer_list_registrations('b0000000-0000-0000-0000-000000000001')),
  1, '현지 팀: 담당 프로그램 등록생 조회'
);
select is(
  (select health_note from public.viewer_list_registrations('b0000000-0000-0000-0000-000000000001')),
  '땅콩 알레르기', '현지 팀: 담당 등록생 건강 특이사항 조회'
);
select is(
  (select count(*)::int from public.viewer_list_registrations('b0000000-0000-0000-0000-000000000002')),
  0, '현지 팀: 다른 프로그램 등록생 조회 불가'
);
select lives_ok(
  $$insert into public.notes (entity_type, entity_id, author_id, body)
    values ('registration', 'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', '현지 도착 확인')$$,
  '현지 팀: 담당 등록생 메모 작성'
);
select throws_ok(
  $$insert into public.notes (entity_type, entity_id, author_id, body)
    values ('registration', 'd0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', 'x')$$,
  '42501', null, '현지 팀: 다른 프로그램 등록생 메모 작성 불가'
);

-- ---------------------------------------------------------------------------
-- 비활성 직원: 아무것도 볼 수 없음
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-000000000005","role":"authenticated"}';

select is((select count(*)::int from public.leads), 0, '비활성 관리자: 상담 신청 열람 불가');
select is((select count(*)::int from public.registrations), 0, '비활성 관리자: 등록생 열람 불가');

-- ---------------------------------------------------------------------------
-- DB 규칙 (postgres)
-- ---------------------------------------------------------------------------
reset role;

-- 슬롯 정원 초과 예약 차단
insert into public.consultation_slots (id, starts_at, ends_at, capacity)
values ('f0000000-0000-0000-0000-000000000001', now() + interval '1 day', now() + interval '1 day 30 minutes', 1);
select lives_ok(
  $$insert into public.consultations (lead_id, slot_id) values ('c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001')$$,
  '슬롯: 첫 예약 성공'
);
select throws_ok(
  $$insert into public.consultations (lead_id, slot_id) values ('c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001')$$,
  'P0001', null, '슬롯: 정원 초과 예약 차단'
);
update public.consultations set status = 'canceled' where slot_id = 'f0000000-0000-0000-0000-000000000001';
select is(
  (select booked_count from public.consultation_slots where id = 'f0000000-0000-0000-0000-000000000001'),
  0, '슬롯: 취소하면 자리가 다시 열림'
);

-- 감사 기록에 개인정보 값이 남지 않음
update public.registrations set parent_phone = '01099998888', status = 'deposit_pending'
where id = 'd0000000-0000-0000-0000-000000000001';
select ok(
  (select bool_and(coalesce(before::text, '') not like '%01011112222%' and coalesce(after::text, '') not like '%01099998888%')
     from public.activity_logs where entity_type = 'registrations'),
  '감사 기록: 개인정보 값 미기록'
);
select ok(
  (select 'parent_phone' = any (changed_fields) from public.activity_logs
    where entity_type = 'registrations' and action = 'update' order by id desc limit 1),
  '감사 기록: 바뀐 필드 이름은 기록'
);

-- 여권 접속기록 수정·삭제 불가
select throws_ok(
  $$delete from public.passport_access_logs$$,
  '42501', null, '여권 접속기록: 삭제 불가(추가만 가능)'
);

select * from finish();
rollback;
