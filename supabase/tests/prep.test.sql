-- M6: 캠프 준비사항 — 자동 생성·마감 계산·교차 검수·재확인·모집 시작 경고·권한
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

insert into auth.users (id, email) values
  ('a6000000-0000-0000-0000-000000000001', 'm6-admin@test.local'),
  ('a6000000-0000-0000-0000-000000000002', 'm6-staff@test.local'),
  ('a6000000-0000-0000-0000-000000000003', 'm6-staff2@test.local'),
  ('a6000000-0000-0000-0000-000000000004', 'm6-viewer@test.local');
insert into public.staff_profiles (id, name, email, role) values
  ('a6000000-0000-0000-0000-000000000001', '관리자', 'm6-admin@test.local', 'admin'),
  ('a6000000-0000-0000-0000-000000000002', '제작자', 'm6-staff@test.local', 'staff'),
  ('a6000000-0000-0000-0000-000000000003', '검수자', 'm6-staff2@test.local', 'staff'),
  ('a6000000-0000-0000-0000-000000000004', '현지', 'm6-viewer@test.local', 'viewer');

insert into public.programs (id, type, name, season, start_date, end_date, total_price, capacity, slug, recruit_start_date)
values ('b6000000-0000-0000-0000-000000000001', 'camp', '여름 캠프', '2027 여름', '2027-07-20', '2027-08-10', 4500000, 20, 'summer-camp-m6', '2027-03-02');
insert into public.staff_program_assignments (staff_id, program_id)
values ('a6000000-0000-0000-0000-000000000004', 'b6000000-0000-0000-0000-000000000001');

-- 자동 생성
select is((select count(*)::int from public.program_prep_items where program_id = 'b6000000-0000-0000-0000-000000000001'),
  (select count(*)::int from public.prep_item_templates where active), '캠프를 만들면 기본 목록대로 준비물 생성');
select is((select due_date from public.program_prep_items where program_id = 'b6000000-0000-0000-0000-000000000001' and template_key = 'poster'),
  '2027-02-23'::date, '포스터 마감 = 모집 시작 7일 전');
select is((select due_date from public.program_prep_items where program_id = 'b6000000-0000-0000-0000-000000000001' and template_key = 'commission_notice'),
  '2027-06-20'::date, '커미션 고지 마감 = 출국 30일 전');
select is((select status from public.program_prep_items where program_id = 'b6000000-0000-0000-0000-000000000001' and template_key = 'partner_drive_share'),
  'todo', '할 일 항목은 "할 일" 상태로 시작');

set local role authenticated;
set local request.jwt.claims to '{"sub":"a6000000-0000-0000-0000-000000000002","role":"authenticated"}';

-- 날짜 변경 → 자동 마감 재계산, 직접 정한 마감은 유지
update public.program_prep_items set due_date = '2027-02-01', due_manual = true
 where program_id = 'b6000000-0000-0000-0000-000000000001' and template_key = 'brochure';
update public.programs set recruit_start_date = '2027-03-09' where id = 'b6000000-0000-0000-0000-000000000001';
select is((select due_date from public.program_prep_items where program_id = 'b6000000-0000-0000-0000-000000000001' and template_key = 'poster'),
  '2027-03-02'::date, '모집 시작일 변경 → 마감 다시 계산');
select is((select due_date from public.program_prep_items where program_id = 'b6000000-0000-0000-0000-000000000001' and template_key = 'brochure'),
  '2027-02-01'::date, '직접 정한 마감은 그대로');

select throws_ok($$update public.program_prep_items set due_manual = true, due_date = '2027-07-01'
  where program_id = 'b6000000-0000-0000-0000-000000000001' and template_key = 'commission_notice'$$,
  'P0001', null, '커미션 고지 기한은 바꿀 수 없음');
select throws_ok($$update public.program_prep_items set status = 'done'
  where program_id = 'b6000000-0000-0000-0000-000000000001' and template_key = 'commission_notice'$$,
  'P0001', null, '커미션 고지 완료는 고지일 기록으로만');

-- 진행 단계: 포스터
update public.program_prep_items
   set owner_id = 'a6000000-0000-0000-0000-000000000002', request = '{"purpose":"학원 게시","spec":"A2"}', status = 'producing'
 where program_id = 'b6000000-0000-0000-0000-000000000001' and template_key = 'poster';
select set_config('test.poster', (select id::text from public.program_prep_items
  where program_id = 'b6000000-0000-0000-0000-000000000001' and template_key = 'poster'), true);

select throws_ok($$update public.program_prep_items set status = 'reviewing' where id = current_setting('test.poster')::uuid$$,
  'P0001', null, '결과물 링크 없이 검수 시작 불가');
select is(public.add_prep_version(current_setting('test.poster')::uuid, 'https://drive.google.com/poster-v1', '초안'), 1, '버전 1 등록');
select is((select status from public.program_prep_items where id = current_setting('test.poster')::uuid), 'reviewing', '버전 등록 → 교차 검수 단계');
select throws_ok($$select public.add_prep_version(current_setting('test.poster')::uuid, 'ftp://x', null)$$,
  'P0001', null, 'http(s) 링크만 허용');

select throws_ok($$update public.program_prep_items set checklist = '{"brand_name":true}', status = 'approved' where id = current_setting('test.poster')::uuid$$,
  'P0001', null, '검수 항목을 모두 체크해야 확인 완료');

update public.program_prep_items
   set checklist = (select jsonb_object_agg(k, true) from unnest(public.prep_review_keys()) k)
 where id = current_setting('test.poster')::uuid;
select throws_ok($$update public.program_prep_items set status = 'approved' where id = current_setting('test.poster')::uuid$$,
  '42501', null, '제작 담당자 본인은 확인 완료 불가(교차 검수)');

set local request.jwt.claims to '{"sub":"a6000000-0000-0000-0000-000000000003","role":"authenticated"}';
update public.program_prep_items set status = 'approved' where id = current_setting('test.poster')::uuid;
select is((select approved_by from public.program_prep_items where id = current_setting('test.poster')::uuid),
  'a6000000-0000-0000-0000-000000000003'::uuid, '다른 직원이 확인 완료 → 확인자 기록');
select throws_ok($$update public.program_prep_items set checklist = '{"brand_name":false}'::jsonb where id = current_setting('test.poster')::uuid$$,
  'P0001', null, '확인 완료 후 검수 체크 변경 불가');

update public.program_prep_items set status = 'distributed', distribution_channel = '파트너 드라이브' where id = current_setting('test.poster')::uuid;
select ok((select distributed_on is not null from public.program_prep_items where id = current_setting('test.poster')::uuid), '배포일 자동 기록');

-- 금액 변경 → 재확인 필요 + 변경 통보 할 일
update public.programs set total_price = 4700000 where id = 'b6000000-0000-0000-0000-000000000001';
select ok((select needs_recheck from public.program_prep_items where id = current_setting('test.poster')::uuid), '금액 변경 → 배포된 자료 재확인 필요');
select is((select recheck_reason from public.program_prep_items where id = current_setting('test.poster')::uuid), '금액', '재확인 사유 기록');
select is((select count(*)::int from public.program_prep_items
  where program_id = 'b6000000-0000-0000-0000-000000000001' and template_key = 'partner_change_notice' and status = 'todo'),
  1, '파트너 학원 변경 통보 할 일 생성');

insert into public.program_payment_rules (program_id, kind, label, amount, due_rule_type, due_offset_days)
values ('b6000000-0000-0000-0000-000000000001', 'deposit', '예약금', 1000000, 'after_registration', 7);
select is((select recheck_reason from public.program_prep_items where id = current_setting('test.poster')::uuid), '금액, 납부 금액·기한', '납부 규칙 변경도 사유에 추가');
select is((select count(*)::int from public.program_prep_items
  where program_id = 'b6000000-0000-0000-0000-000000000001' and template_key = 'partner_change_notice' and status = 'todo'),
  1, '열린 변경 통보 할 일은 하나만');

update public.program_prep_items set needs_recheck = false where id = current_setting('test.poster')::uuid;
select ok((select needs_recheck from public.program_prep_items where id = current_setting('test.poster')::uuid), '재확인 표시는 직접 지울 수 없음');

-- 새 버전 → 검수 → 다른 직원 확인 → 재확인 해제
select is(public.add_prep_version(current_setting('test.poster')::uuid, 'https://drive.google.com/poster-v2', '금액 수정'), 2, '버전 2 등록');
update public.program_prep_items
   set checklist = (select jsonb_object_agg(k, true) from unnest(public.prep_review_keys()) k)
 where id = current_setting('test.poster')::uuid;
update public.program_prep_items set status = 'approved' where id = current_setting('test.poster')::uuid;
select ok(not (select needs_recheck from public.program_prep_items where id = current_setting('test.poster')::uuid), '다시 확인 완료 → 재확인 해제');
select is((select count(*)::int from public.program_prep_versions where item_id = current_setting('test.poster')::uuid), 2, '버전 기록 2건');

-- 모집 시작 경고
select throws_like($$update public.programs set status = 'open' where id = 'b6000000-0000-0000-0000-000000000001'$$,
  'PREP_INCOMPLETE%', '모집 전 필수 준비물이 남으면 모집 시작 불가');
select throws_ok($$update public.programs set status = 'open', prep_override_reason = '일정상 먼저 시작' where id = 'b6000000-0000-0000-0000-000000000001'$$,
  '42501', null, '직원은 경고 사유로 넘길 수 없음');

set local request.jwt.claims to '{"sub":"a6000000-0000-0000-0000-000000000001","role":"authenticated"}';
update public.programs set status = 'open', prep_override_reason = '설명회 일정상 먼저 시작' where id = 'b6000000-0000-0000-0000-000000000001';
select is((select status from public.programs where id = 'b6000000-0000-0000-0000-000000000001'), 'open', '관리자: 사유를 적고 모집 시작');

-- 현지 팀은 준비물을 보지 않음, 기본 목록은 관리자만 수정
set local request.jwt.claims to '{"sub":"a6000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is((select count(*)::int from public.program_prep_items), 0, '현지 팀: 준비물 열람 불가');
set local request.jwt.claims to '{"sub":"a6000000-0000-0000-0000-000000000002","role":"authenticated"}';
update public.prep_item_templates set title = '바뀐 제목' where key = 'poster';
select is((select title from public.prep_item_templates where key = 'poster'), '포스터', '직원: 기본 목록 수정 불가');

select * from finish();
rollback;
