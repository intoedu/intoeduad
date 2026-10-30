-- M3: 상담 시간 생성 · 공개 조회 · 상담 신청 저장 테스트
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into public.partners (id, name, code) values ('b3000000-0000-0000-0000-000000000001', '공개테스트학원', 'public-test');
insert into public.partner_contacts (id, partner_id, name, code)
values ('c3000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001', '정실장', 'jung');
insert into public.consultation_slots (id, starts_at, ends_at, capacity) values
  ('f3000000-0000-0000-0000-000000000001', now() + interval '2 days', now() + interval '2 days 30 minutes', 1);

-- ---------------------------------------------------------------------------
-- 상담 시간 일괄 생성 (KST, 요일, 점심 제외)
-- ---------------------------------------------------------------------------
select is(
  public.generate_consultation_slots('2027-03-01', '2027-03-07', array[1], '10:00', '12:00', 30, '[]'::jsonb, 1),
  4, '월요일 10~12시 30분 간격 → 4개'
);
select is(
  public.generate_consultation_slots('2027-03-08', '2027-03-08', array[1], '10:00', '12:00', 30, '[{"start":"10:30","end":"11:00"}]'::jsonb, 1),
  3, '휴게 시간 제외'
);
select is(
  public.generate_consultation_slots('2027-03-01', '2027-03-07', array[1], '10:00', '12:00', 30, '[]'::jsonb, 1),
  0, '이미 있는 시간은 다시 만들지 않음'
);
select is(
  (select to_char(starts_at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') from public.consultation_slots
    where starts_at = '2027-03-01 10:00+09'),
  '2027-03-01 10:00', 'KST 기준으로 저장'
);
select throws_ok(
  $$select public.generate_consultation_slots('2027-03-07', '2027-03-01', array[1], '10:00', '12:00', 30)$$,
  'P0001', null, '기간 역전 거부'
);

-- ---------------------------------------------------------------------------
-- 권한: 비로그인은 공개 조회만, 저장 함수는 불가
-- ---------------------------------------------------------------------------
set local role anon;
select lives_ok($$select * from public.public_programs()$$, 'anon: 프로그램 목록 조회 가능');
select lives_ok($$select public.public_lead_form_config()$$, 'anon: 신청 폼 설정 조회 가능');
select is((select name from public.public_partner_by_code('PUBLIC-TEST')), '공개테스트학원', 'anon: 학원 코드 조회(대소문자 무시)');
select throws_ok($$select public.submit_lead('{}'::jsonb)$$, '42501', null, 'anon: 신청 저장 함수 직접 호출 불가');
select throws_ok(
  $$select public.generate_consultation_slots('2027-04-01', '2027-04-01', array[4], '10:00', '11:00', 30)$$,
  '42501', null, 'anon: 상담 시간 생성 불가'
);
reset role;

-- ---------------------------------------------------------------------------
-- 상담 신청 저장
-- ---------------------------------------------------------------------------
select is(
  (public.submit_lead(jsonb_build_object(
    'partner_code', 'public-test', 'contact_code', 'jung',
    'student_name', '김학생', 'student_grade', '중1', 'interests', '["camp"]'::jsonb,
    'parent_name', '김부모', 'parent_phone', '010-1234-5678', 'relation', '어머니',
    'topics', '["camp","cost"]'::jsonb, 'agree_privacy', true, 'agree_guardian', true,
    'slot_id', 'f3000000-0000-0000-0000-000000000001', 'phone_hash', 'hash-a'
  )) ->> 'scheduled_at') is not null,
  true, '신청 + 상담 예약 성공'
);
select is(
  (select row(partner_id, partner_contact_id, attribution_source, parent_phone)::text from public.leads where student_name = '김학생'),
  row('b3000000-0000-0000-0000-000000000001'::uuid, 'c3000000-0000-0000-0000-000000000001'::uuid, 'link', '01012345678')::text,
  '소개 학원·실장·경로(link) 기록, 전화번호 숫자만 저장'
);
select is(
  (select count(*)::int from public.consent_records cr join public.leads l on l.id = cr.lead_id where l.student_name = '김학생'),
  2, '동의 기록 2건(개인정보·법정대리인) 저장'
);
select ok(
  (select bool_and(rendered_text not like '%{{%') from public.consent_records cr join public.leads l on l.id = cr.lead_id where l.student_name = '김학생'),
  '동의 문구 치환 완료본 저장'
);
select is(
  (select count(*)::int from public.public_available_slots(current_date, current_date + 10) where id = 'f3000000-0000-0000-0000-000000000001'),
  0, '찬 슬롯은 공개 목록에서 사라짐'
);

-- 같은 번호 단시간 재신청 차단
select throws_ok(
  $$select public.submit_lead(jsonb_build_object('student_name','a','parent_name','b','parent_phone','01012345678',
    'agree_privacy',true,'agree_guardian',true,'phone_hash','hash-a'))$$,
  'P0001', null, '같은 번호 10분 내 재신청 차단'
);

-- 찬 슬롯 예약 시도 → 신청 전체 취소
select throws_ok(
  $$select public.submit_lead(jsonb_build_object('student_name','이학생','parent_name','이부모','parent_phone','01099998888',
    'agree_privacy',true,'agree_guardian',true,'slot_id','f3000000-0000-0000-0000-000000000001','phone_hash','hash-b'))$$,
  'P0001', null, '찬 슬롯 예약 거부'
);
select is((select count(*)::int from public.leads where student_name = '이학생'), 0, '슬롯 실패 시 신청도 저장되지 않음');

-- 필수 동의 누락
select throws_ok(
  $$select public.submit_lead(jsonb_build_object('student_name','박','parent_name','박','parent_phone','01011112222','agree_privacy',true,'agree_guardian',false))$$,
  'P0001', null, '법정대리인 동의 없으면 거부'
);

-- 학원 소개 아님(기타 직접 입력)
select set_config('test.other_lead', public.submit_lead(jsonb_build_object(
  'source_other', '블로그', 'student_name','최','parent_name','최','parent_phone','01033334444',
  'agree_privacy',true,'agree_guardian',true)) ->> 'lead_id', true);
select is(
  (select source_other from public.leads where id = current_setting('test.other_lead')::uuid),
  '블로그', '기타 경로 직접 입력 저장'
);

select * from finish();
rollback;
