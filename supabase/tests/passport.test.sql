-- M8: 여권 사진 — 비공개 버킷·업로드 기록·교체·삭제·접속기록·권한
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (id, email) values
  ('a8000000-0000-0000-0000-000000000001', 'm8-admin@test.local'),
  ('a8000000-0000-0000-0000-000000000002', 'm8-staff-pp@test.local'),
  ('a8000000-0000-0000-0000-000000000003', 'm8-staff@test.local'),
  ('a8000000-0000-0000-0000-000000000004', 'm8-viewer@test.local');
insert into public.staff_profiles (id, name, email, role, can_view_passport) values
  ('a8000000-0000-0000-0000-000000000001', '관리자', 'm8-admin@test.local', 'admin', true),
  ('a8000000-0000-0000-0000-000000000002', '여권담당', 'm8-staff-pp@test.local', 'staff', true),
  ('a8000000-0000-0000-0000-000000000003', '일반직원', 'm8-staff@test.local', 'staff', false),
  ('a8000000-0000-0000-0000-000000000004', '현지', 'm8-viewer@test.local', 'viewer', false);

insert into public.programs (id, type, name, start_date, end_date, total_price, slug, passport_upload_enabled)
values ('b8000000-0000-0000-0000-000000000001', 'camp', '여권 캠프', public.kst_today() + 30, public.kst_today() + 50, 0, 'pp-t8', true),
       ('b8000000-0000-0000-0000-000000000002', 'camp', '여권 없는 캠프', public.kst_today() + 30, public.kst_today() + 50, 0, 'nopp-t8', false);
insert into public.registrations (id, program_id, student_name_ko, parent_name, parent_phone, passport_status, destroy_due_date)
values ('c8000000-0000-0000-0000-000000000001', 'b8000000-0000-0000-0000-000000000001', '여권학생', '부모', '01012345678', 'pending', public.kst_today() + 55),
       ('c8000000-0000-0000-0000-000000000002', 'b8000000-0000-0000-0000-000000000001', '취소학생', '부모', '01012345679', 'pending', public.kst_today() + 55),
       ('c8000000-0000-0000-0000-000000000003', 'b8000000-0000-0000-0000-000000000002', '일반학생', '부모', '01012345670', 'not_required', public.kst_today() + 55);
update public.registrations set status = 'canceled' where id = 'c8000000-0000-0000-0000-000000000002';
insert into public.staff_program_assignments (staff_id, program_id) values ('a8000000-0000-0000-0000-000000000004', 'b8000000-0000-0000-0000-000000000001');
insert into public.access_tokens (token_hash, purpose, registration_id, expires_at) values
  (encode(extensions.digest('my-token-for-m8-test-xyz', 'sha256'), 'hex'), 'my_view', 'c8000000-0000-0000-0000-000000000001', now() + interval '1 day'),
  (encode(extensions.digest('canceled-token-m8-xyz-123', 'sha256'), 'hex'), 'passport_upload', 'c8000000-0000-0000-0000-000000000002', now() + interval '1 day');

select is((select public from storage.buckets where id = 'passports'), false, '여권 버킷은 비공개');
select is((select allowed_mime_types from storage.buckets where id = 'passports'), array['application/octet-stream'], '버킷에는 암호문 형식만 저장');

-- 권한: 비로그인·직원은 기록 함수 직접 호출 불가
set local role anon;
select throws_ok($$select public.passport_upload_target('my-token-for-m8-test-xyz')$$, '42501', null, '비로그인: 대상 확인 함수 직접 호출 불가');
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"a8000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok($$select public.record_passport_upload('c8000000-0000-0000-0000-000000000001', 'x', 'iv', 1, 'image/jpeg', 10, null, null, true)$$,
  '42501', null, '직원: 업로드 기록 함수 직접 호출 불가');
select throws_ok($$select public.mark_passport_deleted(gen_random_uuid(), null, 'manual', null, null)$$, '42501', null, '직원: 삭제 기록 함수 직접 호출 불가');
select ok(public.create_passport_link('c8000000-0000-0000-0000-000000000001') ~ '^[A-Za-z0-9_-]{20,}$', '직원: 여권 제출 링크 생성');
select throws_ok($$select public.create_passport_link('c8000000-0000-0000-0000-000000000003')$$, 'P0001', null, '여권 받지 않는 캠프는 링크 불가');
reset role;

-- 업로드 (Edge Function = service role)
set local role service_role;
select is(public.passport_upload_target('my-token-for-m8-test-xyz') ->> 'allowed', 'true', '신청 확인 링크로 업로드 대상 확인');
select ok(public.passport_upload_target('my-token-for-m8-test-xyz') #>> '{consent,body}' ~ '여권', '고유식별정보 동의 문구 포함');
select is(public.passport_upload_target('canceled-token-m8-xyz-123') ->> 'allowed', 'false', '취소된 신청은 업로드 불가');
select is(public.passport_upload_target('nope-nope-nope-nope-nope'), null, '없는 링크');
select set_config('test.f1', public.record_passport_upload('c8000000-0000-0000-0000-000000000001', 'reg/c8/1.bin', 'aXY=', 1, 'image/jpeg', 100, '1.2.3.4', 'test', true) ->> 'file_id', true);
select is(public.record_passport_upload('c8000000-0000-0000-0000-000000000001', 'reg/c8/2.bin', 'aXY=', 1, 'image/png', 120, '1.2.3.4', 'test', false) -> 'replaced_paths',
  '["reg/c8/1.bin"]'::jsonb, '다시 올리면 이전 파일 경로를 돌려줌(실제 삭제용)');
reset role;
select is((select deleted_reason from public.passport_files where id = current_setting('test.f1')::uuid), 'replaced', '이전 파일은 교체로 소프트 삭제');
select is((select count(*)::int from public.passport_files where registration_id = 'c8000000-0000-0000-0000-000000000001' and deleted_at is null), 1, '유효한 여권 파일은 하나');
select is((select passport_status from public.registrations where id = 'c8000000-0000-0000-0000-000000000001'), 'submitted', '여권 제출 상태');
select is((select string_agg(action, ',' order by id) from public.passport_access_logs where registration_id = 'c8000000-0000-0000-0000-000000000001'),
  'upload,delete,upload', '업로드·교체 삭제 접속기록');
select is((select count(*)::int from public.consent_records where registration_id = 'c8000000-0000-0000-0000-000000000001' and kind = 'reg_passport' and agreed),
  1, '업로드 화면 동의 기록');
select throws_ok($$insert into public.passport_files (registration_id, storage_path, iv, mime_type, size_bytes)
  values ('c8000000-0000-0000-0000-000000000003', 'x.bin', 'iv', 'text/html', 1)$$, '23514', null, '허용되지 않은 형식은 기록 불가');

-- 열람 권한: 여권 열람 권한 직원만 메타데이터 조회
set local role authenticated;
set local request.jwt.claims to '{"sub":"a8000000-0000-0000-0000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.passport_files), 0, '열람 권한 없는 직원: 여권 파일 안 보임');
set local request.jwt.claims to '{"sub":"a8000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is((select count(*)::int from public.passport_files), 0, '현지 팀: 여권 파일 안 보임');
set local request.jwt.claims to '{"sub":"a8000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.passport_files where deleted_at is null), 1, '열람 권한 직원: 메타데이터 조회');
select is((select count(*)::int from public.passport_access_logs), 0, '접속기록은 관리자만');
reset role;

-- 삭제 기록 + 접속기록 수정 불가
set local role service_role;
select ok(public.mark_passport_deleted((select id from public.passport_files where registration_id = 'c8000000-0000-0000-0000-000000000001' and deleted_at is null),
  'a8000000-0000-0000-0000-000000000002', 'consent_withdrawn', null, null) = 'reg/c8/2.bin', '삭제: 실제 지울 경로 반환');
reset role;
select is((select actor_name || '/' || action from public.passport_access_logs order by id desc limit 1), '여권담당/delete', '삭제자 이름 기록');

select * from finish();
rollback;
