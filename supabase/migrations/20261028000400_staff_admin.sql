-- 직원 초대 시 프로필 생성 (관리자만, Edge Function이 관리자 본인 권한으로 호출 → 감사 기록에 관리자가 남음)
create or replace function public.admin_create_staff_profile(
  p_id uuid,
  p_name text,
  p_email text,
  p_role text,
  p_team text default null,
  p_can_view_passport boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 직원을 추가할 수 있습니다' using errcode = '42501';
  end if;

  insert into public.staff_profiles (id, name, email, role, team, can_view_passport)
  values (p_id, p_name, lower(p_email), p_role, nullif(p_team, ''), coalesce(p_can_view_passport, false));
end;
$$;

revoke execute on function public.admin_create_staff_profile(uuid, text, text, text, text, boolean) from public, anon;
grant execute on function public.admin_create_staff_profile(uuid, text, text, text, text, boolean) to authenticated;

-- 관리자가 스스로를 강등·비활성화해 관리자가 0명이 되는 것을 막는다
create or replace function public.guard_last_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'admin' and old.active
     and (new.role <> 'admin' or not new.active)
     and not exists (
       select 1 from public.staff_profiles
       where role = 'admin' and active and id <> old.id
     )
  then
    raise exception '활성 관리자가 최소 1명은 있어야 합니다' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger guard_last_admin
  before update of role, active on public.staff_profiles
  for each row execute function public.guard_last_admin();
