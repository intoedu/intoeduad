-- M18: 통합 신청 링크(공개 캠프 목록) · 유입 경로 필수 · 신청서 질문(문구·필수 여부·추가 질문) · 상담 이력 자동/수동 연결
begin;
create extension if not exists pgtap with schema extensions;
select plan(59);

create function pg_temp.hint_of(p_sql text)
returns text
language plpgsql
as $$
declare
  v_hint text;
begin
  execute p_sql;
  return 'NO_ERROR';
exception when others then
  get stacked diagnostics v_hint = pg_exception_hint;
  return v_hint;
end;
$$;
create function pg_temp.msg_of(p_sql text)
returns text
language plpgsql
as $$
begin
  execute p_sql;
  return 'NO_ERROR';
exception when others then
  return sqlerrm;
end;
$$;

insert into auth.users (id, email) values
  ('a1800000-0000-0000-0000-000000000001', 'm18-admin@test.local'),
  ('a1800000-0000-0000-0000-000000000002', 'm18-staff@test.local'),
  ('a1800000-0000-0000-0000-000000000003', 'm18-viewer@test.local');
insert into public.staff_profiles (id, name, email, role) values
  ('a1800000-0000-0000-0000-000000000001', '관리자', 'm18-admin@test.local', 'admin'),
  ('a1800000-0000-0000-0000-000000000002', '직원', 'm18-staff@test.local', 'staff'),
  ('a1800000-0000-0000-0000-000000000003', '현지', 'm18-viewer@test.local', 'viewer');
insert into public.partners (id, name, code) values ('d1800000-0000-0000-0000-000000000001', '유입학원', 'm18-inflow');
insert into public.partner_contacts (id, partner_id, name, code) values
  ('e1800000-0000-0000-0000-000000000001', 'd1800000-0000-0000-0000-000000000001', '정실장', 'jung');

insert into public.programs (id, type, name, start_date, end_date, capacity, total_price, slug, early_bird_discount, early_bird_until, agency_enabled)
values ('c1800000-0000-0000-0000-000000000001', 'camp', '통합 캠프', public.kst_today() + 60, public.kst_today() + 80, 10, 4000000, 'unified-t18',
        200000, public.kst_today() + 10, true),
       ('c1800000-0000-0000-0000-000000000002', 'camp', '다른 캠프', public.kst_today() + 90, public.kst_today() + 100, 10, 3000000, 'other-t18', null, null, false),
       ('c1800000-0000-0000-0000-000000000003', 'camp', '모집 전 캠프', public.kst_today() + 120, public.kst_today() + 130, 10, 3000000, 'before-t18', null, null, false);
insert into public.program_payment_rules (program_id, kind, label, amount, due_rule_type, due_offset_days) values
  ('c1800000-0000-0000-0000-000000000001', 'balance', '원금', 4000000, 'before_start', 30),
  ('c1800000-0000-0000-0000-000000000002', 'balance', '원금', 3000000, 'before_start', 30);
insert into public.program_partner_discounts (program_id, partner_id, amount)
values ('c1800000-0000-0000-0000-000000000001', 'd1800000-0000-0000-0000-000000000001', 100000);
update public.programs set status = 'open' where id in ('c1800000-0000-0000-0000-000000000001', 'c1800000-0000-0000-0000-000000000002');

select set_config('t.ch_insta', (select id::text from public.inflow_channels where label = '인스타그램'), true);
select set_config('t.ch_other', (select id::text from public.inflow_channels where system_key = 'other'), true);
select set_config('t.ch_partner', (select id::text from public.inflow_channels where system_key = 'partner'), true);
select set_config('t.ch_friend', (select id::text from public.inflow_channels where label = '지인 소개'), true);

-- ---------------------------------------------------------------------------
-- 공개 캠프 목록 · 권한
-- ---------------------------------------------------------------------------
set local role anon;
select is((select string_agg(x ->> 'slug', ',' order by x ->> 'slug') from jsonb_array_elements(public.public_open_programs()) x
           where x ->> 'slug' like '%-t18'), 'other-t18,unified-t18', '비로그인: 모집 중인 캠프만 공개 목록에');
select is((select (x -> 'early_bird' ->> 'amount')::int from jsonb_array_elements(public.public_open_programs()) x where x ->> 'slug' = 'unified-t18'),
  200000, '공개 목록에 얼리버드 안내');
select throws_ok($$select count(*) from public.inflow_channels$$, '42501', null, '비로그인: 유입 경로 표 직접 조회 불가');
select throws_ok($$select count(*) from public.form_questions$$, '42501', null, '비로그인: 질문 표 직접 조회 불가');
select throws_ok($$select public.collect_form_answers('lead', null, '{}', true)$$, '42501', null, '비로그인: 답변 검사 함수 직접 호출 불가');
select throws_ok($$select public.set_registration_lead(null, null)$$, '42501', null, '비로그인: 상담 연결 함수 호출 불가');
reset role;

-- ---------------------------------------------------------------------------
-- 질문 만들기 권한 (공통 = 관리자, 캠프별 = 직원도)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"a1800000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok($$insert into public.form_questions (form, label, type) values ('lead', '직원 공통 질문', 'short_text')$$,
  '42501', null, '직원: 공통 질문은 만들 수 없음');
select lives_ok($$insert into public.form_questions (id, form, program_id, label, type, options, required) values
  ('b1800000-0000-0000-0000-000000000010', 'registration', 'c1800000-0000-0000-0000-000000000001', '티셔츠 사이즈', 'single_choice', array['S', ' M ', 'M', '', 'L'], true)$$,
  '직원: 캠프별 질문 만들기');
select is((select array_to_string(options, '|') from public.form_questions where id = 'b1800000-0000-0000-0000-000000000010'),
  'S|M|L', '선택지 공백·빈 칸·중복 정리');
select is(pg_temp.msg_of($$update public.inflow_channels set label = '인스타' where label = '인스타그램'$$) || (select label from public.inflow_channels where id = current_setting('t.ch_insta')::uuid),
  'NO_ERROR인스타그램', '직원: 유입 경로 수정 안 됨(정책상 바뀌는 행 없음)');
set local request.jwt.claims to '{"sub":"a1800000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$insert into public.form_questions (id, form, label, type, required, sort) values
  ('b1800000-0000-0000-0000-000000000001', 'lead', '원하는 연락 시간', 'dropdown', true, 1)$$, '23514', null, '선택지 없는 객관식은 만들 수 없음');
reset role;
select is((select count(*)::int from public.form_questions where id = 'b1800000-0000-0000-0000-000000000001'), 0, '선택지 없는 객관식은 저장 안 됨');
set local role authenticated;
set local request.jwt.claims to '{"sub":"a1800000-0000-0000-0000-000000000001","role":"authenticated"}';
insert into public.form_questions (id, form, label, type, options, required, sort) values
  ('b1800000-0000-0000-0000-000000000001', 'lead', '원하는 연락 시간', 'dropdown', '{오전,오후,저녁}', true, 1),
  ('b1800000-0000-0000-0000-000000000002', 'lead', '관심 국가', 'multi_choice', '{미국,캐나다,필리핀}', false, 2),
  ('b1800000-0000-0000-0000-000000000003', 'lead', '숨긴 질문', 'short_text', '{}', true, 3),
  ('b1800000-0000-0000-0000-000000000004', 'registration', '알레르기 외 참고 사항', 'long_text', '{}', false, 1),
  ('b1800000-0000-0000-0000-000000000005', 'registration', '다른 캠프 질문', 'yes_no', '{}', true, 1);
update public.form_questions set active = false where id = 'b1800000-0000-0000-0000-000000000003';
update public.form_questions set program_id = 'c1800000-0000-0000-0000-000000000002' where id = 'b1800000-0000-0000-0000-000000000005';
select throws_ok($$insert into public.inflow_channels (label, kind) values ('또 학원', 'partner')$$, 'P0001', null, '학원 소개 항목은 하나만');
select throws_ok($$update public.inflow_channels set kind = 'plain' where system_key = 'partner'$$, 'P0001', null, '학원 소개 항목 종류 변경 불가');
select lives_ok($$update public.inflow_channels set label = '인스타그램·SNS' where id = current_setting('t.ch_insta')::uuid$$, '관리자: 유입 경로 이름 변경');
reset role;
select is((select count(*)::int from public.form_questions where id::text like 'b1800000%'), 6, '질문 6개 저장');

-- ---------------------------------------------------------------------------
-- 상담 신청서
-- ---------------------------------------------------------------------------
select is((select jsonb_agg(q ->> 'label' order by ord) from jsonb_array_elements(public.public_lead_form_config() -> 'questions') with ordinality t(q, ord)),
  '["원하는 연락 시간", "관심 국가"]'::jsonb, '공개 상담 신청서: 사용 중인 공통 질문만');
select is(public.public_lead_form_config() #>> '{inflow,label}', '어디서 알게 되셨나요?', '유입 경로 질문 문구');

create temp table lead_base (v jsonb);
insert into lead_base values (jsonb_build_object(
  'student_name', '유입학생', 'student_grade', '중1', 'parent_name', '유입부모', 'parent_phone', '010-1800-0001', 'relation', '어머니',
  'agree_privacy', true, 'agree_guardian', true, 'kakao_use', true,
  'answers', jsonb_build_object('b1800000-0000-0000-0000-000000000001', '오후', 'b1800000-0000-0000-0000-000000000002', '["필리핀","미국"]'::jsonb)));
grant select on lead_base to authenticated, service_role;

select is(pg_temp.hint_of($$select public.submit_lead((select v from lead_base))$$), 'INFLOW_REQUIRED', '상담: 유입 경로 필수');
select is(pg_temp.msg_of($$select public.submit_lead((select v from lead_base) || jsonb_build_object('inflow_channel_id', current_setting('t.ch_other')))$$),
  '알게 된 경로을(를) 적어 주세요', '기타는 내용 필수');
select is(pg_temp.msg_of($$select public.submit_lead((select v from lead_base) || jsonb_build_object('inflow_channel_id', current_setting('t.ch_insta'),
  'answers', '{}'::jsonb))$$), '「원하는 연락 시간」에 답해 주세요', '필수 추가 질문 미응답 거부(질문 문구로 안내)');
select is(pg_temp.hint_of($$select public.submit_lead((select v from lead_base) || jsonb_build_object('inflow_channel_id', current_setting('t.ch_insta'),
  'answers', '{"b1800000-0000-0000-0000-000000000001":"새벽"}'::jsonb))$$), 'QUESTION_INVALID', '선택지에 없는 답 거부');
select set_config('t.lead1', public.submit_lead((select v from lead_base) || jsonb_build_object(
  'inflow_channel_id', current_setting('t.ch_insta'), 'inflow_detail', '무시될 내용')) ->> 'lead_id', true);
select is((select inflow_label || '|' || coalesce(inflow_detail, '-') || '|' || source_other from public.leads where id = current_setting('t.lead1')::uuid),
  '인스타그램·SNS|-|인스타그램·SNS', '유입 경로 이름(신청 시점) 저장, 고르기만 하는 경로는 추가 내용 없음');
select is((select answers from public.leads where id = current_setting('t.lead1')::uuid),
  jsonb_build_array(
    jsonb_build_object('id', 'b1800000-0000-0000-0000-000000000001', 'label', '원하는 연락 시간', 'type', 'dropdown', 'value', '오후'),
    jsonb_build_object('id', 'b1800000-0000-0000-0000-000000000002', 'label', '관심 국가', 'type', 'multi_choice', 'value', '["미국", "필리핀"]'::jsonb)),
  '답변을 질문 문구와 함께 저장(복수 선택은 선택지 순서)');
select set_config('t.lead2', public.submit_lead((select v from lead_base) || jsonb_build_object('partner_code', 'm18-inflow',
  'student_name', '학원학생', 'parent_phone', '010-1800-0002', 'source_other', '무시')) ->> 'lead_id', true);
select is((select inflow_label || '|' || coalesce(source_other, '-') || '|' || partner_id from public.leads where id = current_setting('t.lead2')::uuid),
  '학원 소개|-|d1800000-0000-0000-0000-000000000001', '학원 링크로 오면 유입 경로 = 학원 소개');

-- 기본 질문 필수 여부: 학년을 선택으로, 자세한 내용을 필수로
update public.settings set value = jsonb_set(value, '{lead,fields}', '{"grade":{"mode":"optional","label":"자녀 학년"},"message":{"mode":"required"},"slot":{"mode":"required"}}')
 where key = 'form_settings';
select is(public.lead_field_modes() ->> 'grade' || '|' || (public.lead_field_modes() ->> 'message') || '|' || (public.lead_field_modes() ->> 'slot'),
  'optional|required|optional', '기본 질문 필수 여부 설정 반영(상담 시간은 필수 불가)');
select is(public.public_lead_form_config() #>> '{texts,grade,label}', '자녀 학년', '기본 질문 문구 바꾸기');
select is(pg_temp.hint_of($$select public.submit_lead((select v from lead_base) - 'student_grade' || jsonb_build_object(
  'inflow_channel_id', current_setting('t.ch_insta'), 'parent_phone', '010-1800-0003'))$$), 'INVALID_INPUT', '필수로 바꾼 자세한 내용이 없으면 거부');

-- 직원 직접 입력: 유입 경로·필수 질문 검사 안 함
set local role authenticated;
set local request.jwt.claims to '{"sub":"a1800000-0000-0000-0000-000000000002","role":"authenticated"}';
select set_config('t.lead3', public.admin_create_lead(jsonb_build_object('student_name', '전화학생', 'parent_name', '전화부모',
  'parent_phone', '010-1800-0004', 'consent_confirmed', true)) ->> 'lead_id', true);
reset role;
-- (한 트랜잭션 안의 시험이라 직원 입력 표시를 되돌린다 — 실제로는 요청마다 따로)
select set_config('app.staff_entry', '', true);
select ok((select inflow_label is null and answers = '[]'::jsonb from public.leads where id = current_setting('t.lead3')::uuid),
  '직원 직접 입력은 유입 경로·필수 질문 없이도 저장');

-- ---------------------------------------------------------------------------
-- 캠프 신청서 · 상담 기록 연결
-- ---------------------------------------------------------------------------
select is((select jsonb_agg(q ->> 'label' order by ord) from jsonb_array_elements(public.public_register_form('unified-t18') -> 'questions') with ordinality t(q, ord)),
  '["알레르기 외 참고 사항", "티셔츠 사이즈"]'::jsonb, '캠프 신청서: 공통 질문 + 이 캠프 질문(다른 캠프 질문 제외)');
select is(public.public_register_form('unified-t18') ->> 'consulted_label', '인투유학 상담을 신청하신 적이 있나요?', '상담 이력 질문 문구');

create temp table reg_base (v jsonb);
insert into reg_base values (jsonb_build_object(
  'slug', 'unified-t18', 'student_name_ko', '유입 학생', 'student_name_en', 'YUIP KID', 'birth_date', '2014-01-01', 'gender', 'male',
  'grade', '중1', 'parent_name', '유입부모', 'parent_phone', '010-1800-0001', 'parent_email', 'p@example.com',
  'emergency_name', '보호자', 'emergency_phone', '010-1800-0099', 'agency_choice', 'self', 'consulted_before', 'yes', 'kakao_use', true,
  'inflow_channel_id', current_setting('t.ch_insta'),
  'answers', jsonb_build_object('b1800000-0000-0000-0000-000000000010', 'M'),
  'agree', '{"reg_privacy":true,"reg_third_party":true,"reg_guardian":true,"refund":true,"destruction_notice":true}'::jsonb));
grant select on reg_base to authenticated, service_role;

select is(pg_temp.msg_of($$select public.submit_registration((select v from reg_base) - 'answers')$$), '「티셔츠 사이즈」에 답해 주세요',
  '캠프별 필수 질문 미응답 거부');
-- 상담 기록(학원 소개 lead2 와 같은 번호·이름이 되도록 lead2 이름을 맞춘다)
update public.leads set student_name = '유입학생', parent_phone = '01018000001' where id = current_setting('t.lead2')::uuid;
update public.leads set created_at = now() - interval '1 day' where id = current_setting('t.lead1')::uuid;
select set_config('t.r1', public.submit_registration((select v from reg_base)) ->> 'registration_id', true);
select is((select lead_id::text || '|' || lead_link_method || '|' || lead_check_needed from public.registrations where id = current_setting('t.r1')::uuid),
  current_setting('t.lead2') || '|auto|false', '같은 번호 + 같은 이름(띄어쓰기 무시) → 가장 최근 상담 기록 자동 연결');
select is((select partner_id::text || '|' || attribution_source || '|' || inflow_label from public.registrations where id = current_setting('t.r1')::uuid),
  'd1800000-0000-0000-0000-000000000001|link|학원 소개', '자동 연결된 상담 기록의 소개 학원을 이어받음(유입 경로 = 학원 소개)');
select is((select discount_amount from public.registrations where id = current_setting('t.r1')::uuid), 300000::bigint,
  '이어받은 학원의 할인까지 신청 시점에 반영(얼리버드 + 학원)');
select is((select status from public.leads where id = current_setting('t.lead2')::uuid), 'converted', '상담 기록 → 등록 전환');
select is((select answers -> 0 ->> 'value' from public.registrations where id = current_setting('t.r1')::uuid), 'M', '캠프 추가 질문 답변 저장');

-- 번호만 같고 이름이 다름(형제) → 연결하지 않고 확인 필요
select set_config('t.r2', public.submit_registration((select v from reg_base) || '{"student_name_ko":"유입동생","consulted_before":"no"}') ->> 'registration_id', true);
select is((select coalesce(lead_id::text, '-') || '|' || lead_check_needed || '|' || consulted_before from public.registrations where id = current_setting('t.r2')::uuid),
  '-|true|no', '번호만 같으면 자동 연결하지 않고 "확인 필요"');
-- 상담했다고 했는데 기록 없음 → 확인 필요 / 상담 안 함 + 기록 없음 → 확인 불필요
select set_config('t.r3', public.submit_registration((select v from reg_base) || '{"student_name_ko":"새학생","parent_phone":"010-1800-0100"}') ->> 'registration_id', true);
select set_config('t.r4', public.submit_registration((select v from reg_base) || '{"student_name_ko":"새학생2","parent_phone":"010-1800-0101","consulted_before":"no"}') ->> 'registration_id', true);
select is((select string_agg(lead_check_needed::text, ',' order by student_name_ko) from public.registrations where id in (current_setting('t.r3')::uuid, current_setting('t.r4')::uuid)),
  'true,false', '"예"인데 기록 없음 → 확인 필요, "아니오" + 기록 없음 → 확인 불필요');
select is((select inflow_label || '|' || source_other from public.registrations where id = current_setting('t.r3')::uuid),
  '인스타그램·SNS|인스타그램·SNS', '캠프 신청 유입 경로 저장');
select is(pg_temp.hint_of($$select public.submit_registration((select v from reg_base) - 'inflow_channel_id' || '{"student_name_ko":"경로없음","parent_phone":"010-1800-0102"}')$$),
  'INFLOW_REQUIRED', '캠프 신청: 유입 경로 필수');

-- 담당자 수동 연결: 직원만, 학원 이어받기, 해제
set local role authenticated;
set local request.jwt.claims to '{"sub":"a1800000-0000-0000-0000-000000000003","role":"authenticated"}';
select throws_ok(format($$select public.set_registration_lead(%L, %L)$$, current_setting('t.r2'), current_setting('t.lead2')), '42501', null, '현지 팀: 연결 불가');
set local request.jwt.claims to '{"sub":"a1800000-0000-0000-0000-000000000002","role":"authenticated"}';
select is(public.set_registration_lead(current_setting('t.r3')::uuid, current_setting('t.lead2')::uuid) ->> 'attribution', 'copied', '직원: 연결 + 학원 이어받기');
reset role;
select is((select lead_id::text || '|' || lead_link_method || '|' || lead_check_needed || '|' || partner_id from public.registrations where id = current_setting('t.r3')::uuid),
  current_setting('t.lead2') || '|staff|false|d1800000-0000-0000-0000-000000000001', '담당자 연결 기록 · 확인 필요 해제');
set local role authenticated;
set local request.jwt.claims to '{"sub":"a1800000-0000-0000-0000-000000000002","role":"authenticated"}';
select lives_ok(format($$select public.set_registration_lead(%L, null)$$, current_setting('t.r3')), '직원: 연결 해제');
reset role;
select ok((select lead_id is null and lead_link_method is null from public.registrations where id = current_setting('t.r3')::uuid), '해제 반영');

-- 목록 보기 · 통계
select is((select inflow_label || '|' || lead_check_needed from public.v_registration_board where id = current_setting('t.r2')::uuid),
  '인스타그램·SNS|true', '등록생 목록에 유입 경로·확인 필요');
select ok((select registrations from public.inflow_stats(public.kst_today() - 1, public.kst_today()) where label = '인스타그램·SNS') >= 3,
  '유입 경로 통계');

-- 감사 기록·파기
select ok(not exists (select 1 from public.activity_logs where entity_id in (current_setting('t.r1')::uuid, current_setting('t.lead1')::uuid)
  and (coalesce(before::text, '') || coalesce(after::text, '')) ~ '오후|"M"|무시될'), '감사 기록에 답변 값 없음');
update public.leads set destroyed_at = now(), student_name = null, parent_name = null, parent_phone = null where id = current_setting('t.lead1')::uuid;
select ok((select answers = '[]'::jsonb and inflow_detail is null and inflow_label is not null from public.leads where id = current_setting('t.lead1')::uuid),
  '파기 시 답변 삭제(유입 경로 이름은 통계용으로 남김)');

-- 캠프 신청서 기본값: 설정 → 캠프
update public.settings set value = jsonb_set(value, '{registration,fields}', '{"school":{"mode":"required"},"address":{"mode":"hidden"}}')
 where key = 'form_settings';
select is(public.registration_field_modes('{"fields":{"address":"optional"}}') ->> 'school' || '|' || (public.registration_field_modes('{"fields":{"address":"optional"}}') ->> 'address'),
  'required|optional', '새 캠프 기본값(설정) 위에 캠프별 설정');

-- 다음 기수 복제: 캠프 질문 · 얼리버드 · 학원 할인 · 대행
set local role authenticated;
set local request.jwt.claims to '{"sub":"a1800000-0000-0000-0000-000000000002","role":"authenticated"}';
select set_config('t.copy', public.duplicate_program('c1800000-0000-0000-0000-000000000001', public.kst_today() + 400)::text, true);
reset role;
select is((select count(*)::int from public.form_questions where program_id = current_setting('t.copy')::uuid)
          || '|' || (select early_bird_discount || '|' || agency_enabled from public.programs where id = current_setting('t.copy')::uuid)
          || '|' || (select count(*)::int from public.program_partner_discounts where program_id = current_setting('t.copy')::uuid),
  '1|200000|true|1', '복제 시 캠프 질문·얼리버드·대행 안내·학원 할인도 복사');

-- 카카오톡 사용 여부 (안 쓰면 대신 받을 번호·연락 방법 필수, 알림톡은 대신 받을 번호로)
select is(pg_temp.hint_of($$select public.submit_lead((select v from lead_base) - 'kakao_use' || jsonb_build_object('inflow_channel_id', current_setting('t.ch_insta'),
  'parent_phone', '010-1800-0201', 'message', '카톡'))$$), 'KAKAO_REQUIRED', '카카오톡 사용 여부 필수');
select is(pg_temp.msg_of($$select public.submit_lead((select v from lead_base) || jsonb_build_object('inflow_channel_id', current_setting('t.ch_insta'),
  'parent_phone', '010-1800-0202', 'message', '카톡', 'kakao_use', false))$$),
  '카카오톡을 쓰지 않으시면 대신 받을 카카오톡 번호나 다른 연락 방법을 적어 주세요', '미사용이면 대신 받을 번호·연락 방법 필수');
select set_config('t.lead_nokakao', public.submit_lead((select v from lead_base) || jsonb_build_object('inflow_channel_id', current_setting('t.ch_insta'),
  'parent_phone', '010-1800-0203', 'message', '카톡', 'kakao_use', false, 'kakao_alt_phone', '010-7777-8888', 'alt_contact', '라인 abc')) ->> 'lead_id', true);
select is((select kakao_use::text || '|' || kakao_alt_phone || '|' || alt_contact from public.leads where id = current_setting('t.lead_nokakao')::uuid),
  'false|01077778888|라인 abc', '카카오톡 미사용 · 대신 받을 번호 · 다른 연락 방법 저장');
select is((select public.message_context(m.id) #>> '{data,phone}' from public.message_logs m
           where m.related_id = current_setting('t.lead_nokakao')::uuid and m.purpose = 'lead_received'),
  '01077778888', '알림톡은 대신 받을 카카오톡 번호로');
select set_config('t.r_nokakao', public.submit_registration((select v from reg_base) || '{"student_name_ko":"카톡없음","school":"학교","parent_phone":"010-1800-0204","kakao_use":false,"alt_contact":"인스타 @kid"}') ->> 'registration_id', true);
select is((select kakao_use from public.v_registration_board where id = current_setting('t.r_nokakao')::uuid), false, '등록생 목록에 카카오톡 미사용 표시');
select ok(not exists (select 1 from public.activity_logs where entity_id in (current_setting('t.lead_nokakao')::uuid, current_setting('t.r_nokakao')::uuid)
  and (coalesce(before::text, '') || coalesce(after::text, '')) ~ '77778888|라인 abc|인스타 @kid'), '감사 기록에 대신 받을 번호·연락처 값 없음');
update public.registrations set destroyed_at = now() where id = current_setting('t.r_nokakao')::uuid;
select ok((select kakao_alt_phone is null and alt_contact is null from public.registrations where id = current_setting('t.r_nokakao')::uuid), '파기 시 대신 받을 연락처 삭제');

select * from finish();
rollback;
