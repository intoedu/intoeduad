-- M4: 상담 신청 관리 — 소개 경로 확인·상담 방식 결정 기록·고객용 링크 토큰

-- ---------------------------------------------------------------------------
-- 소개 경로 확인: 확인자·출처를 클라이언트가 아닌 DB가 기록
-- ---------------------------------------------------------------------------
create or replace function public.stamp_attribution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 확인 처리 시 확인자는 로그인한 직원으로 고정
  if new.attribution_confirmed_at is not null and old.attribution_confirmed_at is null then
    new.attribution_confirmed_by := (select auth.uid());
    new.attribution_confirmed_at := now();
  end if;
  -- 직원이 학원·담당자를 바꾸면 출처는 "직원 확인"
  if (new.partner_id is distinct from old.partner_id or new.partner_contact_id is distinct from old.partner_contact_id)
     and (select auth.uid()) is not null then
    new.attribution_source := case when new.partner_id is null then null else 'staff' end;
  end if;
  return new;
end;
$$;

create trigger stamp_attribution
  before update of partner_id, partner_contact_id, attribution_confirmed_at on public.leads
  for each row execute function public.stamp_attribution();
create trigger stamp_attribution
  before update of partner_id, partner_contact_id, attribution_confirmed_at on public.registrations
  for each row execute function public.stamp_attribution();

-- 확인된 소개 경로는 관리자만 변경·확인 해제 가능 (기존 규칙에 "확인 해제" 추가)
create or replace function public.guard_confirmed_attribution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.attribution_confirmed_at is not null
     and (new.partner_id is distinct from old.partner_id
          or new.partner_contact_id is distinct from old.partner_contact_id
          or new.attribution_confirmed_at is null)
     and not public.is_admin()
     and (select auth.uid()) is not null
  then
    raise exception '소개 경로가 확인된 건은 관리자만 변경할 수 있습니다' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace trigger guard_confirmed_attribution
  before update of partner_id, partner_contact_id, attribution_confirmed_at on public.leads
  for each row execute function public.guard_confirmed_attribution();
create or replace trigger guard_confirmed_attribution
  before update of partner_id, partner_contact_id, attribution_confirmed_at on public.registrations
  for each row execute function public.guard_confirmed_attribution();

-- ---------------------------------------------------------------------------
-- 상담 방식 결정: 결정자·시각 자동 기록, 화상이 아니면 회의 링크 비움
-- ---------------------------------------------------------------------------
create or replace function public.stamp_consultation_method()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.method is distinct from old.method then
    new.decided_by := (select auth.uid());
    new.decided_at := case when new.method = 'undecided' then null else now() end;
  end if;
  if new.method <> 'video' then
    new.meeting_url := null;
  end if;
  return new;
end;
$$;

create trigger stamp_consultation_method
  before update of method, meeting_url on public.consultations
  for each row execute function public.stamp_consultation_method();

-- 화상 회의 링크는 http(s)만
alter table public.consultations
  add constraint consultations_meeting_url check (meeting_url is null or meeting_url ~ '^https?://');

-- ---------------------------------------------------------------------------
-- 고객용 링크 토큰 (원문은 한 번만 돌려주고 DB에는 해시만 저장)
-- purpose: prefill(등록 신청서 미리 채움) / my_view(신청 내용 확인) / passport_upload(여권 재제출)
-- ---------------------------------------------------------------------------
create or replace function public.create_access_token(
  p_purpose text,
  p_lead_id uuid default null,
  p_registration_id uuid default null,
  p_ttl_days integer default 30
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if not public.is_staff_or_admin() then
    raise exception '권한이 없습니다' using errcode = '42501';
  end if;
  if p_purpose not in ('prefill', 'my_view', 'passport_upload') then
    raise exception '알 수 없는 링크 용도입니다' using errcode = 'P0001';
  end if;
  if num_nonnulls(p_lead_id, p_registration_id) <> 1 then
    raise exception '대상이 올바르지 않습니다' using errcode = 'P0001';
  end if;

  v_token := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
  insert into public.access_tokens (token_hash, purpose, lead_id, registration_id, expires_at, created_by)
  values (
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    p_purpose, p_lead_id, p_registration_id,
    now() + make_interval(days => least(greatest(coalesce(p_ttl_days, 30), 1), 180)),
    (select auth.uid())
  );
  return v_token;
end;
$$;

-- ---------------------------------------------------------------------------
-- 실행 권한
-- ---------------------------------------------------------------------------
revoke execute on function
  public.stamp_attribution(),
  public.guard_confirmed_attribution(),
  public.stamp_consultation_method(),
  public.create_access_token(text, uuid, uuid, integer)
from public, anon, authenticated;

grant execute on function public.create_access_token(text, uuid, uuid, integer) to authenticated;
