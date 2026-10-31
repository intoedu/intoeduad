-- M5: 캠프 복제 · 링크 잠금 · 커미션 비공개
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email) values
  ('a5000000-0000-0000-0000-000000000001', 'm5-admin@test.local'),
  ('a5000000-0000-0000-0000-000000000002', 'm5-staff@test.local');
insert into public.staff_profiles (id, name, email, role) values
  ('a5000000-0000-0000-0000-000000000001', '관리자', 'm5-admin@test.local', 'admin'),
  ('a5000000-0000-0000-0000-000000000002', '직원', 'm5-staff@test.local', 'staff');

insert into public.programs (id, type, name, season, start_date, end_date, total_price, slug, status, recruit_start_date, commission_amount)
values ('b5000000-0000-0000-0000-000000000001', 'camp', '겨울 스쿨링', '2027 겨울 1차', '2027-01-02', '2027-01-29', 5990000, 'winter-schooling', 'open', '2026-10-01', 700000);
insert into public.program_payment_rules (program_id, kind, label, amount, due_rule_type, due_fixed_date, due_offset_days) values
  ('b5000000-0000-0000-0000-000000000001', 'deposit', '예약금', 1000000, 'after_registration', null, 7),
  ('b5000000-0000-0000-0000-000000000001', 'balance', '잔금', 4990000, 'before_start', null, 30),
  ('b5000000-0000-0000-0000-000000000001', 'extra', '항공권', 1800000, 'fixed', '2026-11-20', null);
insert into public.program_milestones (program_id, title, date, category)
values ('b5000000-0000-0000-0000-000000000001', '항공권 발권', '2026-12-01', 'flight_ticketing');

set local role authenticated;
set local request.jwt.claims to '{"sub":"a5000000-0000-0000-0000-000000000002","role":"authenticated"}';

-- 복제: 출국일 4주 뒤(2차)
select set_config('test.copy', public.duplicate_program('b5000000-0000-0000-0000-000000000001', '2027-01-30', '2027 겨울 2차')::text, true);
select is((select end_date from public.programs where id = current_setting('test.copy')::uuid), '2027-02-26'::date, '복제: 종료일도 같은 간격으로 이동');
select is((select status from public.programs where id = current_setting('test.copy')::uuid), 'before', '복제본은 모집 전 상태');
select is((select season from public.programs where id = current_setting('test.copy')::uuid), '2027 겨울 2차', '복제: 새 시즌명');
select is((select slug from public.programs where id = current_setting('test.copy')::uuid), 'winter-schooling-202701', '복제: 새 링크 주소');
select is((select count(*)::int from public.program_payment_rules where program_id = current_setting('test.copy')::uuid), 3, '복제: 납부 규칙 3개');
select is((select due_fixed_date from public.program_payment_rules where program_id = current_setting('test.copy')::uuid and kind = 'extra'), '2026-12-18'::date, '복제: 고정 기한도 같은 간격으로 이동');
select is((select due_offset_days from public.program_payment_rules where program_id = current_setting('test.copy')::uuid and kind = 'balance'), 30, '복제: 출국 N일 전 규칙은 그대로');
select is((select date from public.program_milestones where program_id = current_setting('test.copy')::uuid), '2026-12-29'::date, '복제: 주요 일정 이동');
select is((select commission_notice_sent_on from public.programs where id = current_setting('test.copy')::uuid), null, '복제: 커미션 고지 기록은 초기화');
select is((select copied_from from public.programs where id = current_setting('test.copy')::uuid), 'b5000000-0000-0000-0000-000000000001'::uuid, '복제 원본 기록');

-- 링크 잠금
update public.programs set slug_locked = true where id = 'b5000000-0000-0000-0000-000000000001';
select throws_ok($$update public.programs set slug = 'changed-slug' where id = 'b5000000-0000-0000-0000-000000000001'$$, '42501', null, '직원: 배포된 링크 변경 불가');

-- 커미션은 공개 함수로 노출되지 않음
reset role;
set local role anon;
select throws_ok($$select commission_amount from public.programs$$, '42501', null, '비로그인: 프로그램 테이블(커미션) 직접 조회 불가');
select ok(
  not exists (select 1 from jsonb_each((select to_jsonb(p) from public.public_programs() p limit 1)) where key like 'commission%'),
  '공개 프로그램 목록에 커미션 정보 없음'
);

select * from finish();
rollback;
