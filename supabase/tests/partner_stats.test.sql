-- M14: 학원별 통계 — 기간·건수·직접/기타·권한
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);
insert into auth.users (id, email) values ('da100000-0000-0000-0000-000000000001', 'm14-staff@test.local'), ('da100000-0000-0000-0000-000000000002', 'm14-viewer@test.local');
insert into public.staff_profiles (id, name, email, role) values
  ('da100000-0000-0000-0000-000000000001', '직원', 'm14-staff@test.local', 'staff'),
  ('da100000-0000-0000-0000-000000000002', '현지', 'm14-viewer@test.local', 'viewer');
insert into public.partners (id, name, code) values ('db100000-0000-0000-0000-000000000001', '통계학원', 'stats-t14');
insert into public.programs (id, type, name, start_date, end_date, total_price, slug) values ('dc100000-0000-0000-0000-000000000001', 'camp', '통계 캠프', '2027-01-05', '2027-01-30', 0, 'stats-camp-t14');
insert into public.leads (partner_id, student_name, parent_name, parent_phone, status, created_at) values
  ('db100000-0000-0000-0000-000000000001', 'a', 'p', '01011110001', 'consulted', '2026-11-03 10:00+09'),
  ('db100000-0000-0000-0000-000000000001', 'b', 'p', '01011110002', 'new', '2026-11-04 10:00+09'),
  ('db100000-0000-0000-0000-000000000001', 'c', 'p', '01011110003', 'new', '2026-10-31 23:30+09'),
  (null, 'd', 'p', '01011110004', 'new', '2026-11-05 10:00+09');
insert into public.registrations (program_id, partner_id, student_name_ko, parent_name, parent_phone, status, registered_on, destroy_due_date) values
  ('dc100000-0000-0000-0000-000000000001', 'db100000-0000-0000-0000-000000000001', 'a', 'p', '01011110001', 'confirmed', '2026-11-10', '2027-02-04'),
  ('dc100000-0000-0000-0000-000000000001', 'db100000-0000-0000-0000-000000000001', 'e', 'p', '01011110005', 'canceled', '2026-11-11', '2027-02-04');
set local role authenticated;
set local request.jwt.claims to '{"sub":"da100000-0000-0000-0000-000000000001","role":"authenticated"}';
select is((select leads || '/' || consulted || '/' || registrations || '/' || confirmed || '/' || canceled from public.partner_stats('2026-11-01', '2026-11-30') where partner_id = 'db100000-0000-0000-0000-000000000001'),
  '2/1/1/1/1', '11월: 상담 2(10/31 23:30 KST 제외)·완료 1·등록 1·확정 1·취소 1');
select is((select programs -> 0 ->> 'count' from public.partner_stats('2026-11-01', '2026-11-30') where partner_id = 'db100000-0000-0000-0000-000000000001'), '1', '등록 프로그램별 인원(취소 제외)');
select is((select leads from public.partner_stats('2026-11-01', '2026-11-30') where partner_id is null), 1::bigint, '학원 없이 들어온 신청은 "직접·기타"');
select ok(not exists (select 1 from public.partner_stats('2026-11-01', '2026-11-30') s where s::text ~ '010'), '통계에 개인정보 없음');
set local request.jwt.claims to '{"sub":"da100000-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.partner_stats('2026-11-01', '2026-11-30')), 0, '현지 팀: 통계 안 보임');
select * from finish();
rollback;
