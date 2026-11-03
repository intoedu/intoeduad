-- M16 관리자·직원 직접 입력: 전화·방문·종이 신청서로 받은 상담 신청과 캠프 등록을 직원이 넣는다.
-- 학부모 신청서와 같은 저장 함수(submit_lead / submit_registration)를 그대로 써서 검증·납부 일정·할인·동의 기록 규칙이 같다.
-- 추가로: 누가 어떤 방법으로 입력했는지, 담당자가 고객 동의를 받았다는 확인 기록을 남긴다.

alter table public.leads
  add column entered_by uuid references public.staff_profiles (id) on delete set null,
  add column entry_method text check (entry_method in ('phone', 'visit', 'paper', 'kakao', 'other'));
alter table public.registrations
  add column entered_by uuid references public.staff_profiles (id) on delete set null,
  add column entry_method text check (entry_method in ('phone', 'visit', 'paper', 'kakao', 'other'));
create index on public.leads (entered_by);
create index on public.registrations (entered_by);
comment on column public.leads.entered_by is '직원이 직접 입력한 경우 입력한 직원(학부모 신청서는 null)';
comment on column public.registrations.entered_by is '직원이 직접 입력한 경우 입력한 직원(학부모 신청서는 null)';

-- 직원 직접 입력은 "모집 전·마감" 캠프에도 넣을 수 있게: submit_registration의 모집 상태 검사만 이 경우에 건너뛴다.
-- (app.staff_entry는 아래 admin_create_registration 안에서만 켜고 끈다. submit_registration은 서비스 역할 외 직접 호출 불가)
do $$
declare
  v text := pg_get_functiondef('public.submit_registration(jsonb)'::regprocedure);
  v_old text := 'if v_prog.status <> ''open'' then';
begin
  if position(v_old in v) = 0 then
    raise exception 'submit_registration 본문이 예상과 다릅니다';
  end if;
  execute replace(v, v_old,
    'if v_prog.status <> ''open'' and coalesce(current_setting(''app.staff_entry'', true), '''') <> ''on'' then');
end $$;

create or replace function public.entry_method_label(p_method text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_method
    when 'phone' then '전화'
    when 'visit' then '방문 상담'
    when 'paper' then '종이 신청서'
    when 'kakao' then '카카오톡'
    else '기타'
  end;
$$;

-- ---------------------------------------------------------------------------
-- 상담 신청 직접 등록
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_lead(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_method text := coalesce(nullif(p ->> 'entry_method', ''), 'phone');
  v_res jsonb;
  v_id uuid;
  v_staff text;
begin
  if not public.is_staff_or_admin() then
    raise exception '권한이 없습니다' using errcode = '42501';
  end if;
  if v_method not in ('phone', 'visit', 'paper', 'kakao', 'other') then
    raise exception '입력 방법을 확인해 주세요' using errcode = 'P0001', hint = 'INVALID_INPUT';
  end if;
  if coalesce((p ->> 'consent_confirmed')::boolean, false) is not true then
    raise exception '고객에게 개인정보 수집·이용 동의를 받았는지 확인해 주세요' using errcode = 'P0001', hint = 'CONSENT_REQUIRED';
  end if;

  -- 학부모 신청서와 같은 저장 함수 (링크 코드·중복 제출 제한·상담 시간 예약은 쓰지 않음)
  v_res := public.submit_lead(
    (p - 'phone_hash' - 'slot_id' - 'partner_code' - 'contact_code' - 'consent_confirmed' - 'entry_method' - 'notify')
    || jsonb_build_object('agree_privacy', true, 'agree_guardian', true)
  );
  v_id := (v_res ->> 'lead_id')::uuid;
  select name into v_staff from public.staff_profiles where id = (select auth.uid());

  update public.leads
     set entered_by = (select auth.uid()),
         entry_method = v_method,
         attribution_source = case when partner_id is not null then 'staff' else attribution_source end
   where id = v_id;

  insert into public.consent_records (lead_id, kind, document_version, rendered_text, agreed, agreed_at)
  values (v_id, 'staff_entry', 1,
    format('담당자 %s이(가) %s(으)로 신청을 받으면서 위 개인정보 수집·이용 및 법정대리인 동의 내용을 안내하고 동의를 받았음을 확인함.',
           coalesce(v_staff, '직원'), public.entry_method_label(v_method)),
    true, now());

  -- 학부모 접수 안내(알림톡): 선택. 직원 알림(새 상담)은 직접 입력이면 보내지 않음
  if coalesce((p ->> 'notify')::boolean, false) is not true then
    update public.message_logs set status = 'skipped', error = '담당자 직접 입력 — 접수 안내 보내지 않음'
     where related_id = v_id and purpose = 'lead_received' and status = 'queued';
  end if;
  update public.message_logs set status = 'skipped', error = '담당자 직접 입력'
   where related_id = v_id and purpose = 'staff_new_lead' and status = 'queued';

  return v_res;
end;
$$;

-- ---------------------------------------------------------------------------
-- 캠프 등록 직접 추가
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_registration(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_method text := coalesce(nullif(p ->> 'entry_method', ''), 'paper');
  v_slug text;
  v_res jsonb;
  v_id uuid;
  v_staff text;
begin
  if not public.is_staff_or_admin() then
    raise exception '권한이 없습니다' using errcode = '42501';
  end if;
  if v_method not in ('phone', 'visit', 'paper', 'kakao', 'other') then
    raise exception '입력 방법을 확인해 주세요' using errcode = 'P0001', hint = 'INVALID_INPUT';
  end if;
  if coalesce((p ->> 'consent_confirmed')::boolean, false) is not true then
    raise exception '학부모 동의(개인정보·제3자 제공·법정대리인·환불 규정·파기 안내)를 받았는지 확인해 주세요'
      using errcode = 'P0001', hint = 'CONSENT_REQUIRED';
  end if;
  begin
    select slug into v_slug from public.programs
    where id = (p ->> 'program_id')::uuid and deleted_at is null;
  exception when invalid_text_representation then
    v_slug := null;
  end;
  if v_slug is null then
    raise exception '캠프를 선택해 주세요' using errcode = 'P0001', hint = 'NOT_FOUND';
  end if;

  perform set_config('app.staff_entry', 'on', true);
  v_res := public.submit_registration(
    (p - 'phone_hash' - 'token' - 'partner_code' - 'contact_code' - 'agree' - 'consent_confirmed' - 'entry_method'
       - 'notify' - 'program_id' - 'agree_health' - 'agree_partner_share')
    || jsonb_build_object(
      'slug', v_slug,
      'agree', jsonb_build_object(
        'reg_privacy', true, 'reg_passport', true, 'reg_third_party', true, 'reg_guardian', true,
        'refund', true, 'destruction_notice', true,
        'reg_health', coalesce((p ->> 'agree_health')::boolean, false),
        'reg_partner_share', coalesce((p ->> 'agree_partner_share')::boolean, false)
      )
    )
  );
  perform set_config('app.staff_entry', '', true);

  v_id := (v_res ->> 'registration_id')::uuid;
  select name into v_staff from public.staff_profiles where id = (select auth.uid());

  update public.registrations
     set entered_by = (select auth.uid()),
         entry_method = v_method,
         attribution_source = case when partner_id is not null then 'staff' else attribution_source end
   where id = v_id;

  insert into public.consent_records (registration_id, kind, document_version, rendered_text, agreed, agreed_at)
  values (v_id, 'staff_entry', 1,
    format('담당자 %s이(가) %s(으)로 신청을 받으면서 위 동의 문구(개인정보·고유식별정보·제3자 제공·법정대리인·환불 규정·파기 안내%s)를 안내하고 동의를 받았음을 확인함.',
           coalesce(v_staff, '직원'), public.entry_method_label(v_method),
           case when coalesce((p ->> 'agree_health')::boolean, false) then '·민감정보' else '' end),
    true, now());

  if coalesce((p ->> 'notify')::boolean, false) is not true then
    update public.message_logs set status = 'skipped', error = '담당자 직접 입력 — 납부 안내 보내지 않음'
     where related_id = v_id and purpose in ('registration_payment_notice', 'registration_waitlisted') and status = 'queued';
  end if;
  update public.message_logs set status = 'skipped', error = '담당자 직접 입력'
   where related_id = v_id and purpose = 'staff_new_registration' and status = 'queued';

  return v_res;
end;
$$;

revoke execute on function
  public.entry_method_label(text),
  public.admin_create_lead(jsonb),
  public.admin_create_registration(jsonb)
from public, anon;
grant execute on function
  public.entry_method_label(text),
  public.admin_create_lead(jsonb),
  public.admin_create_registration(jsonb)
to authenticated;
