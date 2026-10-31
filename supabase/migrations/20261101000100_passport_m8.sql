-- M8: 여권 사진 — 비공개 버킷·암호화 파일 기록·열람/다운로드/삭제 접속기록·재제출 링크
-- 파일 자체의 암호화(AES-256-GCM)·복호화는 Edge Function에서만 한다. DB에는 경로·IV·키 버전·형식만 남는다.

-- 비공개 버킷 (정책 없음 → service role만 접근). 저장되는 것은 암호문뿐이다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('passports', 'passports', false, 15728640, array['application/octet-stream'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.passport_files
  add constraint passport_files_mime check (mime_type in ('image/jpeg', 'image/png', 'image/heic', 'image/heif', 'application/pdf'));

-- 접속기록 2년 이상 보관: 파일 행은 지우지 않고(소프트 삭제) 기록이 파일을 계속 가리킨다.

-- ---------------------------------------------------------------------------
-- 업로드 대상 확인: 링크(여권 제출용 또는 신청 내용 확인용) → 등록생
-- ---------------------------------------------------------------------------
create or replace function public.passport_upload_target(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'registration_id', r.id,
    'student_name', r.student_name_ko,
    'program_name', pr.name || coalesce(' (' || nullif(pr.season, '') || ')', ''),
    'passport_status', r.passport_status,
    'allowed', pr.passport_upload_enabled
      and r.status not in ('canceled', 'refunded')
      and r.destroyed_at is null and r.deleted_at is null
      and public.kst_today() <= r.destroy_due_date,
    'consent', (select jsonb_build_object('kind', c.kind, 'version', c.version, 'title', c.title, 'body', c.body)
                from public.registration_consents(pr.id, null) c where c.kind = 'reg_passport')
  )
  from public.access_tokens t
  join public.registrations r on r.id = t.registration_id
  join public.programs pr on pr.id = r.program_id
  where t.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and t.purpose in ('passport_upload', 'my_view') and t.revoked_at is null and t.expires_at > now();
$$;

-- ---------------------------------------------------------------------------
-- 업로드 기록 (Edge Function이 암호문을 저장한 뒤 호출). 이전 파일은 "교체"로 소프트 삭제하고
-- 실제 저장소에서 지울 경로를 돌려준다.
-- ---------------------------------------------------------------------------
create or replace function public.record_passport_upload(
  p_registration_id uuid,
  p_path text,
  p_iv text,
  p_key_version integer,
  p_mime text,
  p_size integer,
  p_ip inet,
  p_user_agent text,
  p_consent boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text[];
  v_file_id uuid;
  v_reg public.registrations;
  v_doc record;
begin
  select * into v_reg from public.registrations where id = p_registration_id for update;
  if not found or v_reg.destroyed_at is not null or v_reg.status in ('canceled', 'refunded') then
    raise exception '여권 사진을 받을 수 없는 신청입니다' using errcode = 'P0001', hint = 'NOT_ALLOWED';
  end if;

  -- 이전 파일 교체
  with old as (
    update public.passport_files set deleted_at = now(), deleted_reason = 'replaced'
    where registration_id = p_registration_id and deleted_at is null
    returning id, storage_path, registration_id
  ), logged as (
    insert into public.passport_access_logs (passport_file_id, registration_id, action, ip, user_agent)
    select id, registration_id, 'delete', p_ip, p_user_agent from old
  )
  select coalesce(array_agg(storage_path), '{}') into v_old from old;

  insert into public.passport_files (registration_id, storage_path, iv, key_version, mime_type, size_bytes)
  values (p_registration_id, p_path, p_iv, p_key_version, p_mime, p_size)
  returning id into v_file_id;

  insert into public.passport_access_logs (passport_file_id, registration_id, action, ip, user_agent)
  values (v_file_id, p_registration_id, 'upload', p_ip, p_user_agent);

  update public.registrations set passport_status = 'submitted' where id = p_registration_id;

  -- 업로드 화면에서 다시 받은 고유식별정보 동의도 문구와 함께 기록
  if p_consent then
    select c.kind, c.version, c.body into v_doc
    from public.registration_consents(v_reg.program_id, null) c where c.kind = 'reg_passport';
    if found then
      insert into public.consent_records (registration_id, kind, document_version, rendered_text, agreed, agreed_at)
      values (p_registration_id, 'reg_passport', v_doc.version, v_doc.body, true, now());
    end if;
  end if;

  return jsonb_build_object('file_id', v_file_id, 'replaced_paths', to_jsonb(v_old));
end;
$$;

-- ---------------------------------------------------------------------------
-- 열람·다운로드 기록 (권한 확인은 Edge Function에서 호출자 기준으로 먼저 한다)
-- ---------------------------------------------------------------------------
create or replace function public.log_passport_access(
  p_file_id uuid,
  p_actor uuid,
  p_action text,
  p_ip inet,
  p_user_agent text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.passport_access_logs (passport_file_id, registration_id, actor_id, actor_name, action, ip, user_agent)
  select f.id, f.registration_id, p_actor, (select name from public.staff_profiles where id = p_actor), p_action, p_ip, p_user_agent
  from public.passport_files f where f.id = p_file_id;
$$;

-- 삭제(소프트 삭제 + 기록 + 등록 상태). 실제 파일 삭제 경로를 돌려준다.
create or replace function public.mark_passport_deleted(
  p_file_id uuid,
  p_actor uuid,
  p_reason text,
  p_ip inet,
  p_user_agent text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
  v_reg uuid;
begin
  if p_reason not in ('manual', 'consent_withdrawn', 'canceled', 'destruction') then
    raise exception '삭제 사유가 올바르지 않습니다' using errcode = 'P0001';
  end if;
  update public.passport_files set deleted_at = now(), deleted_reason = p_reason
  where id = p_file_id and deleted_at is null
  returning storage_path, registration_id into v_path, v_reg;
  if v_path is null then
    return null;
  end if;
  insert into public.passport_access_logs (passport_file_id, registration_id, actor_id, actor_name, action, ip, user_agent)
  values (p_file_id, v_reg, p_actor, (select name from public.staff_profiles where id = p_actor),
          case when p_actor is null then 'auto_delete' else 'delete' end, p_ip, p_user_agent);
  update public.registrations set passport_status = 'deleted' where id = v_reg;
  return v_path;
end;
$$;

-- 여권 재제출 링크 (등록생 기준, 14일). 직원·관리자.
create or replace function public.create_passport_link(p_registration_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_staff_or_admin() then
    raise exception '권한이 없습니다' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.registrations r join public.programs p on p.id = r.program_id
    where r.id = p_registration_id and p.passport_upload_enabled and r.destroyed_at is null
      and r.status not in ('canceled', 'refunded')
  ) then
    raise exception '여권 사진을 받지 않는 신청입니다' using errcode = 'P0001';
  end if;
  return public.create_access_token('passport_upload', null, p_registration_id, 14);
end;
$$;

-- ---------------------------------------------------------------------------
-- 권한
-- ---------------------------------------------------------------------------
revoke execute on function
  public.passport_upload_target(text),
  public.record_passport_upload(uuid, text, text, integer, text, integer, inet, text, boolean),
  public.log_passport_access(uuid, uuid, text, inet, text),
  public.mark_passport_deleted(uuid, uuid, text, inet, text),
  public.create_passport_link(uuid)
from public, anon, authenticated;

grant execute on function
  public.passport_upload_target(text),
  public.record_passport_upload(uuid, text, text, integer, text, integer, inet, text, boolean),
  public.log_passport_access(uuid, uuid, text, inet, text),
  public.mark_passport_deleted(uuid, uuid, text, inet, text)
to service_role;

grant execute on function public.create_passport_link(uuid) to authenticated;
