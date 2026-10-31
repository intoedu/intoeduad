-- 임시 비밀번호로 만든 계정은 첫 로그인 때 비밀번호를 반드시 바꾸게 한다

alter table public.staff_profiles
  add column must_change_password boolean not null default false;

-- 본인이 새 비밀번호를 설정한 뒤 표시를 지운다 (다른 필드는 건드리지 않음)
create or replace function public.clear_must_change_password()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.staff_profiles
     set must_change_password = false
   where id = (select auth.uid()) and must_change_password;
$$;

revoke execute on function public.clear_must_change_password() from public, anon, authenticated;
grant execute on function public.clear_must_change_password() to authenticated;
