-- M13: 알림(솔라피 알림톡·문자, 직원 이메일) — 발송 대기열(message_logs) + 발송 함수(message-sender)
-- 원칙: 학부모 알림톡은 고객 신청에 따른 1회성 안내만(리마인드·홍보 없음). 직원 알림에는 학부모 개인정보를 넣지 않는다.
--       솔라피를 끄거나 설정하지 않아도 시스템은 그대로 동작한다(발송 기록만 "보내지 않음").
-- 대기열에는 번호·이름을 넣지 않고 대상(상담·등록·직원)만 기록한다. 보낼 때 DB에서 읽어 만든다.

alter table public.message_logs
  add column recipient_staff_id uuid references public.staff_profiles (id) on delete set null,
  add column attempts integer not null default 0,
  add column last_attempt_at timestamptz,
  add column requested_by uuid references public.staff_profiles (id) on delete set null;
create index on public.message_logs (status, created_at);

-- 학부모 1회성 안내는 대상별 한 번만
create unique index message_logs_once
  on public.message_logs (purpose, related_id)
  where purpose in ('lead_received', 'registration_payment_notice', 'registration_waitlisted');

insert into public.settings (key, value) values
  ('public_site_url', '""'::jsonb),
  ('email', '{"enabled": false, "from": ""}'::jsonb)
on conflict (key) do nothing;

-- 직원 알림 수신자: 알림 받기(문자·이메일)를 켠 활성 직원, 관리자 전용 알림은 관리자만
create or replace function public.staff_recipients(p_event text, p_admin_only boolean)
returns table (staff_id uuid, channel text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, c.channel
  from public.staff_profiles s
  cross join lateral unnest(s.notify_channels) as c(channel)
  where s.active and s.role in ('admin', 'staff')
    and (not p_admin_only or s.role = 'admin')
    and coalesce((select (value ->> 'enabled')::boolean from public.settings where key = 'staff_notifications'), false)
    and p_event = any (public.jsonb_text_array((select value -> 'events' from public.settings where key = 'staff_notifications')))
    and ((c.channel = 'sms' and s.phone is not null) or c.channel = 'email');
$$;

create or replace function public.enqueue_staff_alert(p_event text, p_admin_only boolean, p_related_type text, p_related_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  insert into public.message_logs (channel, purpose, status, related_type, related_id, recipient_staff_id)
  select case r.channel when 'sms' then 'sms' else 'email' end, 'staff_' || p_event, 'queued', p_related_type, p_related_id, r.staff_id
  from public.staff_recipients(p_event, p_admin_only) r;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 대기열에 넣기 (트리거)
-- ---------------------------------------------------------------------------
create or replace function public.leads_after_insert_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.message_logs (channel, purpose, template_code, status, related_type, related_id)
  values ('alimtalk', 'lead_received', 'lead_received', 'queued', 'lead', new.id)
  on conflict do nothing;
  perform public.enqueue_staff_alert('new_lead', false, 'lead', new.id);
  return null;
end;
$$;
create trigger leads_after_insert_message after insert on public.leads
  for each row when (new.parent_phone is not null)
  execute function public.leads_after_insert_message();

create or replace function public.registrations_after_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.message_logs (channel, purpose, template_code, status, related_type, related_id)
    values ('alimtalk',
            case when new.status = 'waitlisted' then 'registration_waitlisted' else 'registration_payment_notice' end,
            case when new.status = 'waitlisted' then 'registration_waitlisted' else 'registration_payment_notice' end,
            'queued', 'registration', new.id)
    on conflict do nothing;
    perform public.enqueue_staff_alert('new_registration', false, 'registration', new.id);
  elsif old.status = 'waitlisted' and new.status = 'received' then
    -- 대기 → 등록 승격: 납부 안내 1회
    insert into public.message_logs (channel, purpose, template_code, status, related_type, related_id)
    values ('alimtalk', 'registration_payment_notice', 'registration_payment_notice', 'queued', 'registration', new.id)
    on conflict do nothing;
  end if;
  return null;
end;
$$;
create trigger registrations_after_insert_message after insert on public.registrations
  for each row when (new.parent_phone is not null)
  execute function public.registrations_after_message();
create trigger registrations_after_promote_message after update of status on public.registrations
  for each row when (old.status = 'waitlisted' and new.status = 'received')
  execute function public.registrations_after_message();

create or replace function public.passport_after_insert_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.enqueue_staff_alert('passport_uploaded', false, 'registration', new.registration_id);
  return null;
end;
$$;
create trigger passport_after_insert_message after insert on public.passport_files
  for each row execute function public.passport_after_insert_message();

-- 납부 금액·기한 정정 안내(직원 버튼, 변경 후 1회)
create or replace function public.request_payment_correction(p_registration_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.registrations;
  v_id uuid;
begin
  if not public.is_staff_or_admin() then
    raise exception '권한이 없습니다' using errcode = '42501';
  end if;
  select * into r from public.registrations where id = p_registration_id;
  if not found or r.destroyed_at is not null or r.status in ('canceled', 'refunded', 'waitlisted') then
    raise exception '정정 안내를 보낼 수 없는 신청입니다' using errcode = 'P0001';
  end if;
  if r.payment_changed_at is null or r.payment_changed_at <= coalesce(r.payment_correction_sent_at, '-infinity') then
    raise exception '안내 이후 바뀐 납부 내용이 없습니다' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.message_logs where purpose = 'payment_notice_correction' and related_id = p_registration_id and status = 'queued') then
    raise exception '이미 발송 대기 중입니다' using errcode = 'P0001';
  end if;
  insert into public.message_logs (channel, purpose, template_code, status, related_type, related_id, requested_by)
  values ('alimtalk', 'payment_notice_correction', 'payment_notice_correction', 'queued', 'registration', p_registration_id, (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;

-- 매일 관리자 알림: 파기 미승인 기한 초과·커미션 지급 지연 (하루 한 번)
create or replace function public.enqueue_daily_staff_alerts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer := 0;
begin
  if exists (select 1 from public.destruction_requests where status = 'pending' and due_date < public.kst_today())
     and not exists (select 1 from public.message_logs where purpose = 'staff_destruction_overdue'
                     and (created_at at time zone 'Asia/Seoul')::date = public.kst_today()) then
    v_n := v_n + public.enqueue_staff_alert('destruction_overdue', true, null, null);
  end if;
  if exists (select 1 from public.commissions where status = 'scheduled' and due_date < public.kst_today())
     and not exists (select 1 from public.message_logs where purpose = 'staff_commission_overdue'
                     and (created_at at time zone 'Asia/Seoul')::date = public.kst_today()) then
    v_n := v_n + public.enqueue_staff_alert('commission_overdue', true, null, null);
  end if;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 발송 함수(service role)용: 대기 건 가져오기 · 보낼 내용 만들 자료 · 결과 기록
-- ---------------------------------------------------------------------------
create or replace function public.claim_messages(p_limit integer default 20)
returns setof public.message_logs
language sql
security definer
set search_path = ''
as $$
  update public.message_logs m
     set attempts = m.attempts + 1, last_attempt_at = now()
   where m.id in (
     select id from public.message_logs
     where status = 'queued' and attempts < 3
       and (last_attempt_at is null or last_attempt_at < now() - interval '2 minutes')
     order by created_at
     limit greatest(coalesce(p_limit, 20), 1)
     for update skip locked
   )
  returning m.*;
$$;

-- 고객용 신청 내용 확인 링크 새로 만들기(알림톡 버튼용, 원문은 보낼 때만 사용)
create or replace function public.issue_my_token(p_registration_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
  v_until date;
begin
  select coalesce(destroy_due_date, public.kst_today() + 30) + 1 into v_until from public.registrations where id = p_registration_id;
  insert into public.access_tokens (token_hash, purpose, registration_id, expires_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), 'my_view', p_registration_id,
          greatest(v_until::timestamp at time zone 'Asia/Seoul', now() + interval '1 day'));
  return v_token;
end;
$$;

create or replace function public.message_context(p_log_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.message_logs;
  v jsonb;
  v_settings jsonb;
begin
  select * into m from public.message_logs where id = p_log_id;
  if not found then
    return null;
  end if;
  select jsonb_object_agg(key, value) into v_settings
  from public.settings where key in ('solapi', 'kakao_channel_url', 'bank_account', 'public_site_url', 'email', 'staff_notifications');

  if m.recipient_staff_id is not null then
    select jsonb_build_object('staff_name', s.name, 'phone', s.phone, 'email', s.email, 'active', s.active)
      into v from public.staff_profiles s where s.id = m.recipient_staff_id;
  elsif m.related_type = 'lead' then
    select jsonb_build_object(
      'phone', l.parent_phone, 'parent_name', l.parent_name, 'student_name', l.student_name,
      'scheduled_at', (select c.scheduled_at from public.consultations c where c.lead_id = l.id and c.status = 'scheduled' order by c.created_at desc limit 1),
      'destroyed', l.destroyed_at is not null)
      into v from public.leads l where l.id = m.related_id;
  elsif m.related_type = 'registration' then
    select jsonb_build_object(
      'phone', r.parent_phone, 'parent_name', r.parent_name, 'student_name', r.student_name_ko,
      'program_name', p.name || coalesce(' (' || nullif(p.season, '') || ')', ''),
      'start_date', p.start_date, 'end_date', p.end_date, 'destroy_date', r.destroy_due_date, 'status', r.status,
      'destroyed', r.destroyed_at is not null,
      'schedule', coalesce((select jsonb_agg(jsonb_build_object('kind', s.kind, 'label', s.label, 'amount', s.amount_due,
                     'due_date', s.due_date, 'paid', s.paid_amount) order by s.sort, s.due_date)
                   from public.v_payment_schedules s where s.registration_id = r.id and s.canceled_at is null), '[]'::jsonb),
      'change_reasons', (select string_agg(distinct s.change_reason, ', ') from public.payment_schedules s
                   where s.registration_id = r.id and s.change_reason is not null and s.updated_at >= coalesce(r.payment_correction_sent_at, '-infinity')))
      into v
    from public.registrations r join public.programs p on p.id = r.program_id where r.id = m.related_id;
  else
    v := '{}'::jsonb;
  end if;
  return jsonb_build_object('message', to_jsonb(m) - 'to_hash', 'data', v, 'settings', v_settings);
end;
$$;

create or replace function public.complete_message(
  p_log_id uuid,
  p_status text,
  p_provider_id text,
  p_error text,
  p_to_masked text,
  p_to_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.message_logs;
begin
  update public.message_logs
     set status = p_status, provider_message_id = p_provider_id, error = left(p_error, 500),
         to_masked = p_to_masked, to_hash = p_to_hash,
         sent_at = case when p_status = 'sent' then now() end
   where id = p_log_id
  returning * into m;
  if m.purpose = 'payment_notice_correction' and p_status = 'sent' then
    update public.registrations set payment_correction_sent_at = now() where id = m.related_id;
  end if;
end;
$$;

-- 실패 건 다시 보내기(관리자)
create or replace function public.retry_message(p_log_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 다시 보낼 수 있습니다' using errcode = '42501';
  end if;
  update public.message_logs set status = 'queued', attempts = 0, last_attempt_at = null, error = null
  where id = p_log_id and status in ('failed', 'skipped');
  if not found then
    raise exception '다시 보낼 수 없는 기록입니다' using errcode = 'P0001';
  end if;
end;
$$;

-- 발송 함수 호출(예약 작업). Vault의 project_url / publishable_key / message_runner_token 이 없으면 호출하지 않는다.
create or replace function public.invoke_message_sender()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
  v_token text;
begin
  if not exists (select 1 from public.message_logs where status = 'queued' and attempts < 3) then
    return null;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'publishable_key';
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'message_runner_token';
  if v_url is null or v_key is null or v_token is null then
    return null;
  end if;
  return net.http_post(
    url := v_url || '/functions/v1/message-sender',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key,
                                  'apikey', v_key, 'x-runner-token', v_token),
    body := jsonb_build_object('source', 'cron')
  );
end;
$$;

select cron.schedule('message-sender', '* * * * *', $$select public.invoke_message_sender()$$);
select cron.schedule('daily-staff-alerts', '5 0 * * *', $$select public.enqueue_daily_staff_alerts(); select public.invoke_message_sender();$$);

revoke execute on function
  public.staff_recipients(text, boolean),
  public.enqueue_staff_alert(text, boolean, text, uuid),
  public.leads_after_insert_message(),
  public.registrations_after_message(),
  public.passport_after_insert_message(),
  public.request_payment_correction(uuid),
  public.enqueue_daily_staff_alerts(),
  public.claim_messages(integer),
  public.issue_my_token(uuid),
  public.message_context(uuid),
  public.complete_message(uuid, text, text, text, text, text),
  public.retry_message(uuid),
  public.invoke_message_sender()
from public, anon, authenticated;

grant execute on function public.request_payment_correction(uuid), public.retry_message(uuid) to authenticated;
grant execute on function
  public.claim_messages(integer),
  public.issue_my_token(uuid),
  public.message_context(uuid),
  public.complete_message(uuid, text, text, text, text, text),
  public.enqueue_daily_staff_alerts()
to service_role;

-- 관리자 테스트 발송(본인에게)
create or replace function public.send_test_message(p_channel text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception '관리자만 테스트 발송할 수 있습니다' using errcode = '42501';
  end if;
  if p_channel not in ('sms', 'email') then
    raise exception '채널을 확인해 주세요' using errcode = 'P0001';
  end if;
  insert into public.message_logs (channel, purpose, status, related_type, recipient_staff_id, requested_by)
  values (p_channel, 'staff_test', 'queued', 'staff', (select auth.uid()), (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.send_test_message(text) from public, anon, authenticated;
grant execute on function public.send_test_message(text) to authenticated;
