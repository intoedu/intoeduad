-- M12: 통합 캘린더·D-Day·대시보드 요약·중요 일정 권한
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email) values
  ('ba100000-0000-0000-0000-000000000001', 'm12-staff@test.local'),
  ('ba100000-0000-0000-0000-000000000002', 'm12-viewer@test.local');
insert into public.staff_profiles (id, name, email, role) values
  ('ba100000-0000-0000-0000-000000000001', '직원', 'm12-staff@test.local', 'staff'),
  ('ba100000-0000-0000-0000-000000000002', '현지', 'm12-viewer@test.local', 'viewer');

insert into public.programs (id, type, name, start_date, end_date, total_price, slug, recruit_start_date) values
  ('bb100000-0000-0000-0000-000000000001', 'camp', '담당 캠프', public.kst_today() + 10, public.kst_today() + 30, 0, 'cal-a-t12', public.kst_today() - 1),
  ('bb100000-0000-0000-0000-000000000002', 'camp', '다른 캠프', public.kst_today() + 12, public.kst_today() + 32, 0, 'cal-b-t12', null);
insert into public.staff_program_assignments values ('ba100000-0000-0000-0000-000000000002', 'bb100000-0000-0000-0000-000000000001');
insert into public.program_milestones (program_id, title, date, category) values
  ('bb100000-0000-0000-0000-000000000001', '항공권 발권', public.kst_today() + 3, 'flight_ticketing');
insert into public.leads (id, student_name, parent_name, parent_phone) values ('bc100000-0000-0000-0000-000000000001', '상담학생', '부모', '01012340000');
insert into public.consultation_slots (id, starts_at, ends_at) values ('bd100000-0000-0000-0000-000000000001', now() + interval '1 day', now() + interval '1 day 30 minutes');
insert into public.consultations (lead_id, slot_id) values ('bc100000-0000-0000-0000-000000000001', 'bd100000-0000-0000-0000-000000000001');
insert into public.registrations (id, program_id, student_name_ko, parent_name, parent_phone, status, passport_status, destroy_due_date)
values ('be100000-0000-0000-0000-000000000001', 'bb100000-0000-0000-0000-000000000001', '등록학생', '부모', '01012340001', 'deposit_pending', 'pending', public.kst_today() + 35);
insert into public.payment_schedules (registration_id, kind, label, amount_due, due_date)
values ('be100000-0000-0000-0000-000000000001', 'deposit', '예약금', 100, public.kst_today() - 1);
insert into public.important_events (id, title, date, priority, is_system, category) values
  ('bf100000-0000-0000-0000-000000000001', '[중요] 파기 승인', public.kst_today() - 2, 'critical', true, 'privacy_destruction'),
  ('bf100000-0000-0000-0000-000000000002', '설명회', public.kst_today() + 5, 'normal', false, 'meeting'),
  ('bf100000-0000-0000-0000-000000000003', '끝난 일', public.kst_today() + 2, 'normal', false, 'general');
update public.important_events set done_at = now() where id = 'bf100000-0000-0000-0000-000000000003';

set local role authenticated;
set local request.jwt.claims to '{"sub":"ba100000-0000-0000-0000-000000000001","role":"authenticated"}';
select ok(exists (select 1 from public.calendar_items(public.kst_today() - 5, public.kst_today() + 40) where kind = 'consultation' and critical), '상담 예약(방식 미정 강조)');
select ok(exists (select 1 from public.calendar_items(public.kst_today() - 5, public.kst_today() + 40) where kind = 'payment' and critical), '기한 지난 납부');
select ok(exists (select 1 from public.calendar_items(public.kst_today() - 5, public.kst_today() + 40) where kind = 'program_start'), '출국일');
select ok(exists (select 1 from public.calendar_items(public.kst_today() - 5, public.kst_today() + 40) where kind = 'milestone'), '프로그램 주요 일정(복사 없이 조회)');
select ok(exists (select 1 from public.calendar_items(public.kst_today() - 30, public.kst_today() + 40) where kind = 'prep'), '준비물 마감');
select ok(exists (select 1 from public.calendar_items(public.kst_today() - 30, public.kst_today() + 40) where kind = 'commission_notice'), '커미션 고지 기한');
select ok(exists (select 1 from public.dday_items(60) where title = '[중요] 파기 승인' and overdue), 'D-Day: 지난 중요 일정은 남김(처리 전)');
select ok(not exists (select 1 from public.dday_items(60) where title = '끝난 일'), 'D-Day: 완료한 일정은 정리');
select ok(exists (select 1 from public.dday_items(60) where kind = 'prep' and overdue), 'D-Day: 마감 지난 준비물');
select is((public.dashboard_summary() -> 'passport_missing' -> 0 ->> 'deadline')::date, public.kst_today() + 3, '여권 미제출: 발권 일정 기준');
select throws_ok($$update public.important_events set deleted_at = now() where id = 'bf100000-0000-0000-0000-000000000001'$$, 'P0001', null, '자동 생성 일정은 삭제 불가');
select lives_ok($$update public.important_events set done_at = now() where id = 'bf100000-0000-0000-0000-000000000001'$$, '자동 생성 일정 완료 처리는 가능');
select throws_ok($$insert into public.important_events (title, date, is_system) values ('가짜 시스템', public.kst_today(), true)$$, '42501', null, '직원은 시스템 일정 생성 불가');

-- 현지 팀: 담당 프로그램 일정만, 상담·납부·커미션 없음
set local request.jwt.claims to '{"sub":"ba100000-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select string_agg(distinct kind, ',' order by kind) from public.calendar_items(public.kst_today() - 30, public.kst_today() + 40)),
  'milestone,program_end,program_start', '현지 팀: 담당 프로그램 일정만');
select ok(not exists (select 1 from public.calendar_items(public.kst_today() - 30, public.kst_today() + 40) where title like '%다른 캠프%'), '현지 팀: 다른 프로그램 안 보임');
select is(public.dashboard_summary(), '{}'::jsonb, '현지 팀: 대시보드 숫자 없음');

select * from finish();
rollback;
