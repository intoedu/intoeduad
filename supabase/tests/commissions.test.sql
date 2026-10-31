-- M10: 커미션 — 영업일·자동 산정·특별 합의·학원 간 소개·취소/환불 제외·보류·지급·권한
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (id, email) values
  ('aa100000-0000-0000-0000-000000000001', 'm10-admin@test.local'),
  ('aa100000-0000-0000-0000-000000000002', 'm10-staff@test.local'),
  ('aa100000-0000-0000-0000-000000000003', 'm10-viewer@test.local');
insert into public.staff_profiles (id, name, email, role) values
  ('aa100000-0000-0000-0000-000000000001', '관리자', 'm10-admin@test.local', 'admin'),
  ('aa100000-0000-0000-0000-000000000002', '직원', 'm10-staff@test.local', 'staff'),
  ('aa100000-0000-0000-0000-000000000003', '현지', 'm10-viewer@test.local', 'viewer');

-- 영업일 (설 연휴 2/6~9)
select is(public.add_business_days('2027-02-05', 10), '2027-02-23'::date, '영업일 10일: 주말·설 연휴 제외');
select is(public.add_business_days('2027-01-08', 1), '2027-01-11'::date, '금요일 + 1영업일 = 월요일');

insert into public.partners (id, name, code) values
  ('ab100000-0000-0000-0000-000000000001', '소개학원', 'm10-intro'),
  ('ab100000-0000-0000-0000-000000000002', '대전학원', 'm10-daejeon');
update public.partners set referred_by_partner_id = 'ab100000-0000-0000-0000-000000000001' where id = 'ab100000-0000-0000-0000-000000000002';
update public.settings set value = jsonb_set(value, '{referral_rate}', '0.1') where key = 'commission';

insert into public.programs (id, type, name, start_date, end_date, total_price, slug, commission_amount) values
  ('ac100000-0000-0000-0000-000000000001', 'camp', '커미션 캠프', public.kst_today() + 40, public.kst_today() + 60, 1000000, 'comm-camp-t10', 300000),
  ('ac100000-0000-0000-0000-000000000002', 'study_abroad', '커미션 유학', '2027-08-20', '2028-06-30', 2000000, 'comm-study-t10', null);

-- 등록 + 완납 + 소개 경로 확인 → 확정
create function pg_temp.confirmed_reg(p_id uuid, p_program uuid, p_partner uuid, p_paid_on date, p_total bigint)
returns void language plpgsql as $$
begin
  insert into public.registrations (id, program_id, partner_id, student_name_ko, parent_name, parent_phone, status, destroy_due_date)
  values (p_id, p_program, p_partner, '학생', '부모', '010' || lpad((random() * 99999999)::int::text, 8, '0'), 'deposit_pending', public.kst_today() + 90);
  insert into public.payment_schedules (registration_id, kind, label, amount_due, due_date) values (p_id, 'balance', '참가비', p_total, public.kst_today() + 10);
  insert into public.payments (schedule_id, amount, method, paid_at)
  select id, p_total, 'transfer', p_paid_on from public.payment_schedules where registration_id = p_id;
  update public.registrations set attribution_confirmed_at = now() where id = p_id;
end $$;

select pg_temp.confirmed_reg('ad100000-0000-0000-0000-000000000001', 'ac100000-0000-0000-0000-000000000001', 'ab100000-0000-0000-0000-000000000002', public.kst_today(), 1000000);
select is((select status from public.registrations where id = 'ad100000-0000-0000-0000-000000000001'), 'confirmed', '완납 + 소개 경로 확인 → 등록 확정');
select is((select amount || '/' || due_date || '/' || status from public.commissions where registration_id = 'ad100000-0000-0000-0000-000000000001' and kind = 'base'),
  '300000/' || (public.kst_today() + 40) || '/scheduled', '캠프 커미션: 1인당 금액·지급일 = 캠프 시작일');
select is((select amount || '/' || partner_id from public.commissions where registration_id = 'ad100000-0000-0000-0000-000000000001' and kind = 'referral'),
  '30000/ab100000-0000-0000-0000-000000000001', '학원 간 소개 수수료(요율 10%) → 소개해 준 학원');

-- 특별 합의 금액 → 지급 전 커미션 다시 계산
insert into public.commission_overrides (partner_id, program_id, amount, memo)
values ('ab100000-0000-0000-0000-000000000002', 'ac100000-0000-0000-0000-000000000001', 350000, '단체 3인 이상');
select is((select amount from public.commissions where registration_id = 'ad100000-0000-0000-0000-000000000001' and kind = 'base'), 350000::bigint, '특별 합의 금액 우선');

-- 유학: 금액 미정 → 보류, 금액 입력 → 지급 예정(완납 후 영업일 10일)
select pg_temp.confirmed_reg('ad100000-0000-0000-0000-000000000002', 'ac100000-0000-0000-0000-000000000002', 'ab100000-0000-0000-0000-000000000002', '2027-02-05', 2000000);
select is((select status from public.commissions where registration_id = 'ad100000-0000-0000-0000-000000000002' and kind = 'base'), 'held', '금액 미정 → 보류');
update public.programs set commission_amount = 500000 where id = 'ac100000-0000-0000-0000-000000000002';
select is((select status || '/' || due_date || '/' || basis_date from public.commissions where registration_id = 'ad100000-0000-0000-0000-000000000002' and kind = 'base'),
  'scheduled/2027-02-23/2027-02-05', '유학: 완납일 후 영업일 10일');

-- 참가 전 취소 + 전액 환불 → 자동 제외
select pg_temp.confirmed_reg('ad100000-0000-0000-0000-000000000003', 'ac100000-0000-0000-0000-000000000001', 'ab100000-0000-0000-0000-000000000002', public.kst_today(), 1000000);
set local role authenticated;
set local request.jwt.claims to '{"sub":"aa100000-0000-0000-0000-000000000002","role":"authenticated"}';
select set_config('test.r3', public.cancel_registration('ad100000-0000-0000-0000-000000000003', public.kst_today(), 'company', null)::text, true);
reset role;
select is((select status from public.commissions where registration_id = 'ad100000-0000-0000-0000-000000000003' and kind = 'base'), 'held', '취소 후 환불 대기 → 보류');
set local role authenticated;
set local request.jwt.claims to '{"sub":"aa100000-0000-0000-0000-000000000002","role":"authenticated"}';
select public.process_refund(current_setting('test.r3')::uuid, 1000000, null);
reset role;
select is((select status from public.commissions where registration_id = 'ad100000-0000-0000-0000-000000000003' and kind = 'base'), 'canceled', '참가 전 전액 환불 → 지급 제외');
select ok((select status_reason from public.commissions where registration_id = 'ad100000-0000-0000-0000-000000000003' and kind = 'base') ~ '제7조', '제외 사유(협약서 근거) 기록');

-- 부분 환불 → 보류(대표 판단)
select pg_temp.confirmed_reg('ad100000-0000-0000-0000-000000000004', 'ac100000-0000-0000-0000-000000000001', 'ab100000-0000-0000-0000-000000000002', public.kst_today(), 1000000);
set local role authenticated;
set local request.jwt.claims to '{"sub":"aa100000-0000-0000-0000-000000000002","role":"authenticated"}';
select set_config('test.r4', public.cancel_registration('ad100000-0000-0000-0000-000000000004', public.kst_today(), 'customer', null)::text, true);
select public.process_refund(current_setting('test.r4')::uuid, 600000, null);
reset role;
select is((select status_reason from public.commissions where registration_id = 'ad100000-0000-0000-0000-000000000004' and kind = 'base'), '부분 환불 — 대표 판단 필요', '부분 환불 → 보류');

-- 권한: 직원은 열람만, 지급·상태 변경 불가
set local role authenticated;
set local request.jwt.claims to '{"sub":"aa100000-0000-0000-0000-000000000002","role":"authenticated"}';
select ok((select count(*) from public.v_commissions) >= 4, '직원: 커미션 열람');
select throws_ok($$select public.pay_commissions(array(select id from public.commissions where status = 'scheduled'), public.kst_today(), null)$$, '42501', null, '직원: 지급 처리 불가');
select throws_ok($$select public.set_commission_status((select id from public.commissions limit 1), 'excluded', '분쟁')$$, '42501', null, '직원: 제외 불가');
update public.commissions set amount = 1;
select is((select count(*)::int from public.commissions where amount = 1), 0, '직원: 커미션 직접 수정 불가(RLS)');
select throws_ok($$insert into public.holidays (date, name) values ('2027-12-31', '임의 휴일')$$, '42501', null, '직원: 공휴일 추가 불가');
set local request.jwt.claims to '{"sub":"aa100000-0000-0000-0000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.v_commissions), 0, '현지 팀: 커미션 안 보임');
reset role;
set local role anon;
select throws_ok($$select count(*) from public.commissions$$, '42501', null, '비로그인: 커미션 접근 불가');
reset role;

-- 관리자: 제외(사유 필수)·지급
set local role authenticated;
set local request.jwt.claims to '{"sub":"aa100000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$select public.set_commission_status((select id from public.commissions where registration_id = 'ad100000-0000-0000-0000-000000000002' and kind = 'base'), 'excluded', '')$$,
  'P0001', null, '제외는 사유 필수');
select is(public.pay_commissions(array(select id from public.commissions where registration_id = 'ad100000-0000-0000-0000-000000000001'), public.kst_today(), '계좌 이체'),
  2, '관리자: 지급 처리(기본·소개 수수료)');
select is((select paid_by from public.commissions where registration_id = 'ad100000-0000-0000-0000-000000000001' and kind = 'base'),
  'aa100000-0000-0000-0000-000000000001'::uuid, '지급자 기록');
reset role;

-- 지급 후 취소 → 검토 메모, 지급 상태 유지
set local role authenticated;
set local request.jwt.claims to '{"sub":"aa100000-0000-0000-0000-000000000002","role":"authenticated"}';
select public.cancel_registration('ad100000-0000-0000-0000-000000000001', public.kst_today(), 'customer', null);
reset role;
select is((select status || '/' || review_note from public.commissions where registration_id = 'ad100000-0000-0000-0000-000000000001' and kind = 'base'),
  'paid/지급 후 취소 — 환수 여부 검토', '지급 후 취소 → 검토 메모');

-- 지연 판정
update public.commissions set due_date = public.kst_today() - 1 where registration_id = 'ad100000-0000-0000-0000-000000000002' and kind = 'base';
select ok((select overdue from public.v_commissions where registration_id = 'ad100000-0000-0000-0000-000000000002' and kind = 'base'), '지급 예정일 지남 → 지급 지연');

select * from finish();
rollback;
