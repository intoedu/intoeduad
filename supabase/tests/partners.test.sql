-- M2: 학원·담당자·협약·지급 계좌 권한과 규칙 테스트
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, email) values
  ('a1000000-0000-0000-0000-000000000001', 'p-admin@test.local'),
  ('a1000000-0000-0000-0000-000000000002', 'p-staff@test.local'),
  ('a1000000-0000-0000-0000-000000000003', 'p-viewer@test.local');
insert into public.staff_profiles (id, name, email, role) values
  ('a1000000-0000-0000-0000-000000000001', '관리자', 'p-admin@test.local', 'admin'),
  ('a1000000-0000-0000-0000-000000000002', '직원', 'p-staff@test.local', 'staff'),
  ('a1000000-0000-0000-0000-000000000003', '현지팀', 'p-viewer@test.local', 'viewer');

insert into public.partners (id, name, region, code) values
  ('b1000000-0000-0000-0000-000000000001', '테스트학원', '수원', 'test-academy'),
  ('b1000000-0000-0000-0000-000000000002', '다른학원', '수원', 'other-academy');
insert into public.partner_contacts (id, partner_id, name, code) values
  ('c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', '박실장', 'park');
insert into public.payout_accounts (partner_id, bank_name, account_number, account_holder)
values ('b1000000-0000-0000-0000-000000000001', '테스트은행', '123-456-7890', '테스트학원');

-- ---------------------------------------------------------------------------
-- 협약 상태 계산 (자동 연장)
-- ---------------------------------------------------------------------------
select is(public.agreement_effective_end('2026-01-01', true, null, '2026-10-30'), '2027-01-01'::date, '자동 연장: 지난 종료일은 1년 뒤로');
select is(public.agreement_effective_end('2026-01-01', true, null, '2027-01-01'), '2027-01-01'::date, '자동 연장: 연장된 종료일 당일까지 유효');
select is(public.agreement_effective_end('2026-01-01', true, null, '2027-01-02'), '2028-01-01'::date, '자동 연장: 그다음 날은 한 해 더');
select is(public.agreement_effective_end('2026-01-01', false, null, '2026-10-30'), '2026-01-01'::date, '자동 연장 안 함: 원래 종료일');
select is(public.agreement_effective_end('2027-01-01', true, '2026-11-15', '2026-10-30'), '2026-11-15'::date, '해지: 해지일이 종료일');

select throws_ok(
  $$insert into public.partner_agreements (partner_id, agreement_type, start_date, end_date) values ('b1000000-0000-0000-0000-000000000001', 'exclusive', '2026-01-01', '2026-12-31')$$,
  '23514', null, '독점권형은 독점 지역 필수'
);

-- ---------------------------------------------------------------------------
-- 직원
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is((select count(*)::int from public.partner_contacts where partner_id = 'b1000000-0000-0000-0000-000000000001'), 1, '직원: 담당자 열람');
select is((select count(*)::int from public.payout_accounts where partner_id = 'b1000000-0000-0000-0000-000000000001'), 1, '직원: 지급 계좌 열람');

-- 배포 전 코드는 직원도 변경 가능, 배포(잠금) 후에는 불가
select lives_ok($$update public.partners set code = 'test-academy2' where id = 'b1000000-0000-0000-0000-000000000001'$$, '직원: 잠기기 전 코드 변경 가능');
select lives_ok($$update public.partners set code_locked = true where id = 'b1000000-0000-0000-0000-000000000001'$$, '직원: 배포 시 코드 잠금');
select throws_ok(
  $$update public.partners set code = 'changed' where id = 'b1000000-0000-0000-0000-000000000001'$$,
  '42501', null, '직원: 잠긴 코드 변경 불가'
);
select throws_ok(
  $$update public.partners set code_locked = false where id = 'b1000000-0000-0000-0000-000000000001'$$,
  '42501', null, '직원: 코드 잠금 해제 불가'
);

-- 소개 경로: 다른 학원 담당자를 연결할 수 없음
select throws_ok(
  $$insert into public.leads (student_name, parent_name, parent_phone, partner_id, partner_contact_id)
    values ('학생', '부모', '01012345678', 'b1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001')$$,
  'P0001', null, '소개 경로: 다른 학원 소속 담당자 연결 불가'
);

-- 소개 경로 확인 후에는 직원이 바꿀 수 없음
insert into public.leads (id, student_name, parent_name, parent_phone, partner_id, partner_contact_id, attribution_confirmed_at)
values ('d1000000-0000-0000-0000-000000000001', '학생', '부모', '01012345678',
        'b1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', now());
select throws_ok(
  $$update public.leads set partner_id = 'b1000000-0000-0000-0000-000000000002', partner_contact_id = null where id = 'd1000000-0000-0000-0000-000000000001'$$,
  '42501', null, '소개 경로: 확인 후 직원 변경 불가'
);

-- ---------------------------------------------------------------------------
-- 관리자
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$update public.leads set partner_id = 'b1000000-0000-0000-0000-000000000002', partner_contact_id = null where id = 'd1000000-0000-0000-0000-000000000001'$$,
  '소개 경로: 관리자는 확인 후에도 변경 가능'
);

-- ---------------------------------------------------------------------------
-- 현지 팀: 학원·담당자·계좌 열람 불가
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"a1000000-0000-0000-0000-000000000003","role":"authenticated"}';

select is((select count(*)::int from public.partner_contacts), 0, '현지 팀: 담당자 열람 불가');
select is((select count(*)::int from public.payout_accounts), 0, '현지 팀: 지급 계좌 열람 불가');

select * from finish();
rollback;
