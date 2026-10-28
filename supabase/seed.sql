-- 로컬 개발 전용 시드 (운영 DB에는 적용하지 않는다)
-- 개발 계정 비밀번호: devpass1234

do $$
declare
  u record;
begin
  for u in
    select * from (values
      ('11111111-1111-1111-1111-111111111111'::uuid, 'admin@dev.local', '관리자(개발)', 'admin', true),
      ('22222222-2222-2222-2222-222222222222'::uuid, 'staff@dev.local', '행정직원(개발)', 'staff', true),
      ('33333333-3333-3333-3333-333333333333'::uuid, 'staff2@dev.local', '행정직원2(개발)', 'staff', false),
      ('44444444-4444-4444-4444-444444444444'::uuid, 'viewer@dev.local', '현지팀(개발)', 'viewer', false)
    ) as t(id, email, name, role, passport)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
      extensions.crypt('devpass1234', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
      '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), u.id, u.id::text,
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
      'email', now(), now(), now()
    );
    insert into public.staff_profiles (id, name, email, role, can_view_passport, team)
    values (u.id, u.name, u.email, u.role, u.passport, case when u.role = 'viewer' then '미국' end);
  end loop;
end;
$$;

insert into public.programs (id, type, name, season, country, start_date, end_date, capacity, total_price, status, slug)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'camp', '미국 스쿨링 캠프', '2027 겨울', '미국',
   '2027-01-05', '2027-02-02', 20, 6900000, 'open', 'us-schooling-2027w'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'camp', '필리핀 영어 캠프', '2027 겨울', '필리핀',
   '2027-01-10', '2027-02-07', 30, 3900000, 'open', 'ph-english-2027w');

insert into public.staff_program_assignments (staff_id, program_id)
values ('44444444-4444-4444-4444-444444444444', 'aaaaaaaa-0000-0000-0000-000000000001');

insert into public.partners (name, region, director_name, code)
values ('대전 인투학원', '대전', '홍길동', 'daejeon-into');
