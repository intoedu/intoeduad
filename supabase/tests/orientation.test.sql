-- M21: 1:1 오리엔테이션·최종 오리엔테이션 안내 — 권한(현지 팀은 담당 프로그램만), 같은 내용 재발송 막기, 변경 안내 판단, 대상 제외(취소·대기), 캠프 일정 연동
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users (id, email) values
  ('a2100000-0000-0000-0000-000000000001', 'm21-staff@test.local'),
  ('a2100000-0000-0000-0000-000000000002', 'm21-viewer@test.local'),
  ('a2100000-0000-0000-0000-000000000003', 'm21-viewer2@test.local');
insert into public.staff_profiles (id, name, email, role) values
  ('a2100000-0000-0000-0000-000000000001', '직원', 'm21-staff@test.local', 'staff'),
  ('a2100000-0000-0000-0000-000000000002', '줄리엣', 'm21-viewer@test.local', 'viewer'),
  ('a2100000-0000-0000-0000-000000000003', '다른현지', 'm21-viewer2@test.local', 'viewer');
insert into public.programs (id, type, name, start_date, end_date, capacity, total_price, slug) values
  ('c2100000-0000-0000-0000-000000000001', 'camp', '미국 캠프', public.kst_today() + 60, public.kst_today() + 80, 10, 5000000, 'us-t21'),
  ('c2100000-0000-0000-0000-000000000002', 'camp', '필리핀 캠프', public.kst_today() + 60, public.kst_today() + 80, 10, 3000000, 'ph-t21');
insert into public.staff_program_assignments values ('a2100000-0000-0000-0000-000000000002', 'c2100000-0000-0000-0000-000000000001');
insert into public.registrations (id, program_id, status, student_name_ko, parent_name, parent_phone) values
  ('d2100000-0000-0000-0000-000000000001', 'c2100000-0000-0000-0000-000000000001', 'received', '학생1', '부모1', '01021000001'),
  ('d2100000-0000-0000-0000-000000000002', 'c2100000-0000-0000-0000-000000000001', 'confirmed', '학생2', '부모2', '01021000002'),
  ('d2100000-0000-0000-0000-000000000003', 'c2100000-0000-0000-0000-000000000001', 'waitlisted', '대기학생', '부모3', '01021000003'),
  ('d2100000-0000-0000-0000-000000000004', 'c2100000-0000-0000-0000-000000000001', 'canceled', '취소학생', '부모4', '01021000004'),
  ('d2100000-0000-0000-0000-000000000005', 'c2100000-0000-0000-0000-000000000002', 'received', '필리핀학생', '부모5', '01021000005');
delete from public.message_logs;

-- 비로그인·표 직접 쓰기 불가
set local role anon;
select throws_ok($$select count(*) from public.registration_orientations$$, '42501', null, '비로그인: 1:1 일정 조회 불가');
reset role;

-- 현지 팀(줄리엣): 담당 프로그램 등록생만
set local role authenticated;
set local request.jwt.claims to '{"sub":"a2100000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok($$insert into public.registration_orientations (registration_id, starts_at, method, host_name)
  values ('d2100000-0000-0000-0000-000000000001', now(), 'x', 'y')$$, '42501', null, '표에 직접 쓰기 불가(함수로만)');
select throws_ok($$select public.save_registration_orientation('d2100000-0000-0000-0000-000000000005', now() + interval '10 days', 'Zoom', '줄리엣')$$,
  '42501', null, '담당 아닌 캠프 등록생은 불가');
select throws_ok($$select public.save_registration_orientation('d2100000-0000-0000-0000-000000000003', now() + interval '10 days', 'Zoom', '줄리엣')$$,
  'P0001', null, '대기 등록생은 오리엔테이션 불가');
select throws_ok($$select public.save_registration_orientation('d2100000-0000-0000-0000-000000000001', now() + interval '10 days', ' ', '줄리엣')$$,
  'P0001', '진행 방식을 100자 이내로 입력해 주세요', '진행 방식 필수');
select throws_ok($$select public.send_registration_orientation('d2100000-0000-0000-0000-000000000001')$$, 'P0001',
  '먼저 오리엔테이션 일정을 저장해 주세요', '일정 없이 안내 불가');
select is(public.save_registration_orientation('d2100000-0000-0000-0000-000000000001', '2027-01-05 01:00+00', 'Zoom 화상', '줄리엣 선생님') ->> 'queued',
  null, '저장만(안내 안 보냄)');
select is(public.save_registration_orientation('d2100000-0000-0000-0000-000000000001', '2027-01-05 01:00+00', 'Zoom 화상', '줄리엣 선생님', null, true) ->> 'queued',
  'orientation_scheduled', '저장하고 안내 → 일정 안내');
select throws_ok($$select public.send_registration_orientation('d2100000-0000-0000-0000-000000000001')$$, 'P0001', null, '발송 대기 중이면 다시 못 보냄');
reset role;
update public.message_logs set status = 'sent';
set local role authenticated;
set local request.jwt.claims to '{"sub":"a2100000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok($$select public.send_registration_orientation('d2100000-0000-0000-0000-000000000001')$$, 'P0001', '이미 같은 내용으로 안내했습니다',
  '같은 내용 재발송 막기');
select is(public.save_registration_orientation('d2100000-0000-0000-0000-000000000001', '2027-01-06 01:00+00', 'Zoom 화상', '줄리엣 선생님', null, true) ->> 'queued',
  'orientation_rescheduled', '일시가 바뀌면 변경 안내');
reset role;
select is((select (context ->> 'previous_starts_at')::timestamptz from public.message_logs where purpose = 'orientation_rescheduled'),
  '2027-01-05 01:00+00'::timestamptz, '변경 안내에 이전 일시 기록');
select is((select count(*)::int from public.message_logs where context::text ~ '부모|0102100'), 0, '대기열에 개인정보 없음');
update public.message_logs set status = 'sent';
set local role authenticated;
set local request.jwt.claims to '{"sub":"a2100000-0000-0000-0000-000000000002","role":"authenticated"}';
select is(public.save_registration_orientation('d2100000-0000-0000-0000-000000000001', '2027-01-06 01:00+00', 'Zoom 화상 · 회의 ID 123', '줄리엣 선생님', null, true) ->> 'queued',
  'orientation_scheduled', '시간은 같고 방식만 바뀌면 일정 안내 다시');

-- 최종 오리엔테이션
select throws_ok($$select public.save_final_orientation('c2100000-0000-0000-0000-000000000002', now() + interval '20 days', '센터')$$, '42501', null,
  '담당 아닌 캠프 최종 OT 불가');
select throws_ok($$select public.send_final_orientation('c2100000-0000-0000-0000-000000000001', array['d2100000-0000-0000-0000-000000000001']::uuid[])$$,
  'P0001', '먼저 최종 오리엔테이션 일정을 저장해 주세요', '일정 없이 일괄 안내 불가');
select lives_ok($$select public.save_final_orientation('c2100000-0000-0000-0000-000000000001', '2027-01-10 05:00+00', '인투유학 대전 센터', '학생·학부모 함께')$$,
  '최종 OT 저장');
select is((select category || '|' || date::text || '|' || memo from public.program_milestones where program_id = 'c2100000-0000-0000-0000-000000000001'),
  'orientation|2027-01-10|14:00 (한국 시간) · 인투유학 대전 센터', '캠프 일정(캘린더)에 최종 OT 표시');
select is(public.send_final_orientation('c2100000-0000-0000-0000-000000000001',
  array['d2100000-0000-0000-0000-000000000001', 'd2100000-0000-0000-0000-000000000002', 'd2100000-0000-0000-0000-000000000003',
        'd2100000-0000-0000-0000-000000000004', 'd2100000-0000-0000-0000-000000000005']::uuid[]),
  '{"queued": 2, "already": 0, "pending": 0, "skipped": 3}'::jsonb, '고른 학부모 중 등록생만(대기·취소·다른 캠프 제외)');
select is((select count(*)::int from public.program_orientation_board('c2100000-0000-0000-0000-000000000001')), 2, '화면 목록: 등록생 2명');
select is((select count(*)::int from public.program_orientation_board('c2100000-0000-0000-0000-000000000002')), 0, '담당 아닌 캠프 목록 안 보임');
reset role;
update public.message_logs set status = 'sent';
set local role authenticated;
set local request.jwt.claims to '{"sub":"a2100000-0000-0000-0000-000000000002","role":"authenticated"}';
select is(public.send_final_orientation('c2100000-0000-0000-0000-000000000001', array['d2100000-0000-0000-0000-000000000001']::uuid[]) ->> 'already',
  '1', '같은 내용은 다시 보내지 않음');
select lives_ok($$select public.save_final_orientation('c2100000-0000-0000-0000-000000000001', '2027-01-11 10:00+00', '인투유학 대전 센터', '학생·학부모 함께')$$,
  '최종 OT 일시 변경');
select is(public.send_final_orientation('c2100000-0000-0000-0000-000000000001', array['d2100000-0000-0000-0000-000000000001']::uuid[]) ->> 'queued',
  '1', '바뀐 일정은 다시 보냄');
reset role;
select is((select purpose from public.message_logs where related_id = 'd2100000-0000-0000-0000-000000000001' and status = 'queued'),
  'final_orientation_changed', '받은 사람에게는 변경 안내');
select is((select count(*)::int from public.program_milestones where program_id = 'c2100000-0000-0000-0000-000000000001'), 1, '캠프 일정은 하나로 갱신');

-- 다른 현지 팀(담당 없음)은 아무것도 못 함
set local role authenticated;
set local request.jwt.claims to '{"sub":"a2100000-0000-0000-0000-000000000003","role":"authenticated"}';
select throws_ok($$select public.send_final_orientation('c2100000-0000-0000-0000-000000000001', array['d2100000-0000-0000-0000-000000000002']::uuid[])$$,
  '42501', null, '담당 없는 현지 팀은 일괄 안내 불가');
reset role;

select * from finish();
rollback;
