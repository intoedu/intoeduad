-- M4: 소개 경로 확인 · 상담 방식 결정 기록 · 고객 링크 토큰
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email) values
  ('a4000000-0000-0000-0000-000000000001', 'm4-admin@test.local'),
  ('a4000000-0000-0000-0000-000000000002', 'm4-staff@test.local'),
  ('a4000000-0000-0000-0000-000000000003', 'm4-viewer@test.local');
insert into public.staff_profiles (id, name, email, role) values
  ('a4000000-0000-0000-0000-000000000001', '관리자', 'm4-admin@test.local', 'admin'),
  ('a4000000-0000-0000-0000-000000000002', '직원', 'm4-staff@test.local', 'staff'),
  ('a4000000-0000-0000-0000-000000000003', '현지팀', 'm4-viewer@test.local', 'viewer');
insert into public.partners (id, name, code) values ('b4000000-0000-0000-0000-000000000001', 'M4학원', 'm4-academy');
insert into public.partner_contacts (id, partner_id, name, code)
values ('c4000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', '최실장', 'choi');
insert into public.leads (id, student_name, parent_name, parent_phone, partner_id, attribution_source)
values ('d4000000-0000-0000-0000-000000000001', '학생', '부모', '01012341234', 'b4000000-0000-0000-0000-000000000001', 'link');
insert into public.consultations (id, lead_id) values ('e4000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001');

set local role authenticated;
set local request.jwt.claims to '{"sub":"a4000000-0000-0000-0000-000000000002","role":"authenticated"}';

-- 직원이 실장을 지정하고 확인 → 확인자·출처 자동 기록 (클라이언트가 보낸 확인자는 무시)
update public.leads
   set partner_contact_id = 'c4000000-0000-0000-0000-000000000001',
       attribution_confirmed_at = '2000-01-01',
       attribution_confirmed_by = 'a4000000-0000-0000-0000-000000000001'
 where id = 'd4000000-0000-0000-0000-000000000001';
select is((select attribution_confirmed_by from public.leads where id = 'd4000000-0000-0000-0000-000000000001'),
  'a4000000-0000-0000-0000-000000000002'::uuid, '확인자는 로그인한 직원으로 기록');
select ok((select attribution_confirmed_at > now() - interval '1 minute' from public.leads where id = 'd4000000-0000-0000-0000-000000000001'),
  '확인 시각은 서버 시각');
select is((select attribution_source from public.leads where id = 'd4000000-0000-0000-0000-000000000001'), 'staff', '직원이 바꾸면 출처는 staff');

select throws_ok(
  $$update public.leads set attribution_confirmed_at = null where id = 'd4000000-0000-0000-0000-000000000001'$$,
  '42501', null, '직원은 확인 해제 불가'
);
select throws_ok(
  $$update public.leads set partner_contact_id = null where id = 'd4000000-0000-0000-0000-000000000001'$$,
  '42501', null, '직원은 확인 후 실장 변경 불가'
);

-- 상담 방식: 결정자 자동 기록, 화상 아니면 링크 제거
update public.consultations set method = 'video', meeting_url = 'https://meet.example.com/abc', decided_by = 'a4000000-0000-0000-0000-000000000001'
 where id = 'e4000000-0000-0000-0000-000000000001';
select is((select decided_by from public.consultations where id = 'e4000000-0000-0000-0000-000000000001'),
  'a4000000-0000-0000-0000-000000000002'::uuid, '상담 방식 결정자 자동 기록');
select is((select meeting_url from public.consultations where id = 'e4000000-0000-0000-0000-000000000001'),
  'https://meet.example.com/abc', '화상 링크 저장');
update public.consultations set method = 'phone' where id = 'e4000000-0000-0000-0000-000000000001';
select is((select meeting_url from public.consultations where id = 'e4000000-0000-0000-0000-000000000001'),
  null, '전화로 바꾸면 화상 링크 제거');
select throws_ok(
  $$update public.consultations set method = 'video', meeting_url = 'javascript:alert(1)' where id = 'e4000000-0000-0000-0000-000000000001'$$,
  '23514', null, '회의 링크는 http(s)만'
);

-- 고객 링크 토큰: 원문은 한 번만 반환, DB에는 해시만
select ok(length(public.create_access_token('prefill', 'd4000000-0000-0000-0000-000000000001', null, 30)) >= 30, '토큰 발급');
select is((select count(*)::int from public.access_tokens where lead_id = 'd4000000-0000-0000-0000-000000000001'), 0,
  '직원도 토큰 테이블은 직접 조회 불가');

-- 관리자: 확인 해제 가능
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"a4000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok($$update public.leads set attribution_confirmed_at = null where id = 'd4000000-0000-0000-0000-000000000001'$$, '관리자는 확인 해제 가능');

-- 현지 팀: 토큰 발급 불가
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"a4000000-0000-0000-0000-000000000003","role":"authenticated"}';
select throws_ok($$select public.create_access_token('prefill', 'd4000000-0000-0000-0000-000000000001')$$, '42501', null, '현지 팀 토큰 발급 불가');

reset role;
select is((select length(token_hash) from public.access_tokens where lead_id = 'd4000000-0000-0000-0000-000000000001'), 64, '저장된 값은 SHA-256 해시');

select * from finish();
rollback;
