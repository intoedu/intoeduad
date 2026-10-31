-- M11: 개인정보 파기 — 승인 대기 생성·[중요] 일정·관리자 승인/보류·예정일 자동 파기·기록 (PLAN 기능 B)
-- 보유 기간: 프로그램 종료일 + N일(기본 5) / 취소·환불은 환불 완료 + N일 / 등록하지 않은 상담 고객은 신청 후 1년
-- 파기 대상: 여권 파일(저장소에서 실제 삭제), 건강 정보, 학생·학부모·비상연락처 개인정보, 연결된 상담 신청 개인정보,
--            메모, 납부·환불 메모, 발송 기록의 번호 해시, 고객용 링크
-- 남기는 것: 프로그램·학원·상태·금액·날짜(통계·정산), 동의 기록(문구 원문·버전·동의 여부 — 학생 정보 없음), 파기 기록, 여권 접근 기록

create extension if not exists pg_net;

-- 법정 보관 거래 기록 분리 보관 구조(PLAN N5): 사용 여부는 법률 검토 후 결정. 지금은 비워 둔다.
create table public.legal_retention_records (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('registration', 'payment', 'refund')),
  source_id uuid not null,
  legal_basis text not null,
  payload jsonb not null,
  retain_until date not null,
  created_at timestamptz not null default now()
);
alter table public.legal_retention_records enable row level security;
create policy legal_retention_select on public.legal_retention_records for select to authenticated using (public.is_admin());
revoke all on public.legal_retention_records from anon;
revoke insert, update, delete on public.legal_retention_records from authenticated;

-- ---------------------------------------------------------------------------
-- 승인 대기 생성 + [중요] 일정 (매일)
-- ---------------------------------------------------------------------------
create or replace function public.queue_destruction_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := public.kst_today();
  v_n integer := 0;
  v_m integer;
begin
  -- 등록: 프로그램 종료 다음 날부터 / 환불 완료 / 취소(처리할 환불 없음)
  insert into public.destruction_requests (registration_id, program_id, due_date)
  select r.id, r.program_id, coalesce(r.destroy_due_date, p.end_date + p.destroy_after_days)
  from public.registrations r
  join public.programs p on p.id = r.program_id
  where r.destroyed_at is null
    and (p.end_date < v_today
         or r.status = 'refunded'
         or (r.status = 'canceled' and not exists (
               select 1 from public.refunds f where f.registration_id = r.id and f.processed_at is null)))
  on conflict (registration_id) do nothing;
  get diagnostics v_m = row_count;
  v_n := v_n + v_m;

  -- 등록으로 이어지지 않은 상담 신청: 보유 기한 5일 전부터
  insert into public.destruction_requests (lead_id, due_date)
  select l.id, l.destroy_due_date
  from public.leads l
  where l.destroyed_at is null and l.destroy_due_date is not null and l.destroy_due_date <= v_today + 5
    and not exists (select 1 from public.registrations r where r.lead_id = l.id)
  on conflict (lead_id) do nothing;
  get diagnostics v_m = row_count;
  v_n := v_n + v_m;

  -- [중요] 일정: 프로그램·예정일별 1건
  insert into public.important_events (title, date, category, priority, program_id, is_system, memo)
  select '[중요] 개인정보 파기 승인 — ' || p.name || coalesce(' (' || nullif(p.season, '') || ')', ''),
         d.due_date, 'privacy_destruction', 'critical', p.id, true, d.n || '명 · 개인정보 파기 화면에서 승인해 주세요'
  from (
    select program_id, due_date, count(*) as n from public.destruction_requests
    where status = 'pending' and registration_id is not null group by program_id, due_date
  ) d
  join public.programs p on p.id = d.program_id
  where not exists (
    select 1 from public.important_events e
    where e.category = 'privacy_destruction' and e.program_id = d.program_id and e.date = d.due_date and e.deleted_at is null
  );
  insert into public.important_events (title, date, category, priority, is_system, memo)
  select '[중요] 상담 신청 개인정보 파기 승인', d.due_date, 'privacy_destruction', 'critical', true, d.n || '건 · 개인정보 파기 화면에서 승인해 주세요'
  from (
    select due_date, count(*) as n from public.destruction_requests
    where status = 'pending' and lead_id is not null group by due_date
  ) d
  where not exists (
    select 1 from public.important_events e
    where e.category = 'privacy_destruction' and e.program_id is null and e.date = d.due_date and e.deleted_at is null
  );
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 관리자 승인(확인창: 프로그램명 입력, PLAN N6) / 보류(사유) / 보류 해제
-- ---------------------------------------------------------------------------
create or replace function public.approve_destruction(p_request_ids uuid[], p_confirm text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_programs uuid[];
  v_leads integer;
  v_expected text;
  v_n integer;
begin
  if not public.is_admin() then
    raise exception '파기 승인은 관리자만 할 수 있습니다' using errcode = '42501';
  end if;
  select array_agg(distinct program_id) filter (where registration_id is not null),
         count(*) filter (where lead_id is not null)
    into v_programs, v_leads
  from public.destruction_requests where id = any (p_request_ids) and status in ('pending', 'held');
  if coalesce(cardinality(v_programs), 0) + (case when v_leads > 0 then 1 else 0 end) <> 1 then
    raise exception '한 번에 한 프로그램(또는 상담 신청)씩 승인해 주세요' using errcode = 'P0001';
  end if;
  v_expected := case when v_leads > 0 then '상담 신청' else (select name from public.programs where id = v_programs[1]) end;
  if trim(coalesce(p_confirm, '')) <> v_expected then
    raise exception '확인 문구가 맞지 않습니다. "%"을(를) 그대로 입력해 주세요', v_expected using errcode = 'P0001';
  end if;
  update public.destruction_requests
     set status = 'approved', approved_by = (select auth.uid()), approved_at = now(), hold_reason = null, held_by = null, held_at = null
   where id = any (p_request_ids) and status in ('pending', 'held');
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public.hold_destruction(p_request_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '파기 보류는 관리자만 할 수 있습니다' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception '보류 사유를 적어 주세요' using errcode = 'P0001';
  end if;
  update public.destruction_requests
     set status = 'held', hold_reason = trim(p_reason), held_by = (select auth.uid()), held_at = now(), approved_by = null, approved_at = null
   where id = p_request_id and status in ('pending', 'approved', 'failed');
  if not found then
    raise exception '보류할 수 없는 상태입니다' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.release_destruction_hold(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있습니다' using errcode = '42501';
  end if;
  update public.destruction_requests set status = 'pending' where id = p_request_id and status = 'held';
end;
$$;

-- ---------------------------------------------------------------------------
-- 실행 (Edge Function destruction-run이 여권 파일을 저장소에서 지운 뒤 호출)
-- ---------------------------------------------------------------------------
create or replace function public.destruction_due_requests()
returns table (id uuid, registration_id uuid, lead_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.registration_id, d.lead_id from public.destruction_requests d
  where d.status in ('approved', 'failed') and d.approved_at is not null and d.due_date <= public.kst_today()
  order by d.due_date;
$$;

create or replace function public.destroy_lead_pii(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notes integer;
  v_tokens integer;
begin
  update public.leads
     set student_name = null, student_grade = null, parent_name = null, parent_phone = null, relation = null,
         message = null, source_other = null, destroyed_at = coalesce(destroyed_at, now())
   where id = p_lead_id;
  update public.consultations set notes = null, meeting_url = null where lead_id = p_lead_id;
  delete from public.notes where entity_type = 'lead' and entity_id = p_lead_id;
  get diagnostics v_notes = row_count;
  delete from public.access_tokens where lead_id = p_lead_id;
  get diagnostics v_tokens = row_count;
  update public.message_logs set to_hash = null, to_masked = null where related_id = p_lead_id;
  return jsonb_build_object('lead', true, 'lead_notes', v_notes, 'lead_tokens', v_tokens);
end;
$$;

create or replace function public.execute_destruction(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.destruction_requests;
  v_items jsonb := '{}'::jsonb;
  v_lead uuid;
  v_n integer;
begin
  select * into d from public.destruction_requests where id = p_request_id for update;
  if not found or d.status not in ('approved', 'failed') or d.approved_at is null then
    raise exception '승인된 파기 요청이 아닙니다' using errcode = 'P0001';
  end if;
  if d.due_date > public.kst_today() then
    raise exception '파기 예정일 전입니다' using errcode = 'P0001';
  end if;

  if d.registration_id is not null then
    if exists (select 1 from public.passport_files where registration_id = d.registration_id and deleted_at is null) then
      raise exception '여권 파일이 아직 삭제되지 않았습니다' using errcode = 'P0001';
    end if;
    select lead_id into v_lead from public.registrations where id = d.registration_id;

    delete from public.registration_health_notes where registration_id = d.registration_id;
    get diagnostics v_n = row_count;
    v_items := v_items || jsonb_build_object('health', v_n > 0);

    update public.registrations
       set student_name_ko = null, student_name_en = null, birth_date = null, gender = null, school = null, grade = null,
           english_level = null, parent_name = null, parent_phone = null, parent_email = null, address = null,
           emergency_name = null, emergency_relation = null, emergency_phone = null, special_notes = null, source_other = null,
           passport_status = case when passport_status = 'not_required' then passport_status else 'deleted' end,
           destroyed_at = now()
     where id = d.registration_id;

    delete from public.notes where entity_type = 'registration' and entity_id = d.registration_id;
    get diagnostics v_n = row_count;
    v_items := v_items || jsonb_build_object('notes', v_n);

    -- 입금자명 등이 들어갈 수 있는 메모
    update public.payments p set memo = null from public.payment_schedules s
     where s.id = p.schedule_id and s.registration_id = d.registration_id and p.memo is not null;
    update public.refunds set memo = null where registration_id = d.registration_id;

    delete from public.access_tokens where registration_id = d.registration_id;
    get diagnostics v_n = row_count;
    v_items := v_items || jsonb_build_object('tokens', v_n);
    update public.message_logs set to_hash = null, to_masked = null where related_id = d.registration_id;

    v_items := v_items || jsonb_build_object('registration', true,
      'passport_files', (select count(*) from public.passport_files where registration_id = d.registration_id and deleted_reason = 'destruction'));
    if v_lead is not null then
      v_items := v_items || public.destroy_lead_pii(v_lead);
    end if;
  else
    v_items := public.destroy_lead_pii(d.lead_id);
  end if;

  update public.destruction_requests
     set status = 'executed', executed_at = now(), destroyed_items = v_items, error = null
   where id = p_request_id;

  -- 같은 프로그램·예정일의 요청이 모두 끝나면 [중요] 일정 완료
  update public.important_events e set done_at = now()
   where e.category = 'privacy_destruction' and e.done_at is null and e.date = d.due_date
     and e.program_id is not distinct from d.program_id
     and not exists (
       select 1 from public.destruction_requests x
       where x.due_date = d.due_date and x.program_id is not distinct from d.program_id
         and (x.registration_id is not null) = (d.registration_id is not null) and x.status <> 'executed');
  return v_items;
end;
$$;

create or replace function public.mark_destruction_failed(p_request_id uuid, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.destruction_requests set status = 'failed', error = left(p_error, 500)
  where id = p_request_id and status in ('approved', 'failed');
$$;

-- ---------------------------------------------------------------------------
-- 매일 실행: 승인 대기 생성 → 파기 실행 함수 호출(공식 안내대로 Vault의 주소·키 사용)
-- Vault에 project_url / publishable_key / destruction_runner_token 이 없으면 호출하지 않는다.
-- ---------------------------------------------------------------------------
create or replace function public.invoke_destruction_runner()
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
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'publishable_key';
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'destruction_runner_token';
  if v_url is null or v_key is null or v_token is null then
    raise notice 'destruction runner secrets are not configured';
    return null;
  end if;
  return net.http_post(
    url := v_url || '/functions/v1/destruction-run',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key,
                                  'apikey', v_key, 'x-runner-token', v_token),
    body := jsonb_build_object('source', 'cron')
  );
end;
$$;

select cron.schedule('privacy-destruction-daily', '20 15 * * *',
  $$select public.queue_destruction_requests(); select public.invoke_destruction_runner();$$);

-- ---------------------------------------------------------------------------
-- 목록 뷰 (직원 열람, 처리는 관리자)
-- ---------------------------------------------------------------------------
create view public.v_destruction_board
with (security_invoker = true)
as
select
  d.*,
  (d.status = 'pending' and d.due_date < public.kst_today()) as overdue,
  coalesce(r.student_name_ko, l.student_name) as student_name,
  coalesce(r.parent_name, l.parent_name) as parent_name,
  r.status as registration_status,
  (select count(*) from public.passport_files f where f.registration_id = d.registration_id and f.deleted_at is null)::int as passport_files,
  p.name as program_name, p.season as program_season, p.end_date as program_end,
  ap.name as approved_by_name, hp.name as held_by_name
from public.destruction_requests d
left join public.registrations r on r.id = d.registration_id
left join public.leads l on l.id = d.lead_id
left join public.programs p on p.id = d.program_id
left join public.staff_profiles ap on ap.id = d.approved_by
left join public.staff_profiles hp on hp.id = d.held_by;

revoke all on public.v_destruction_board from anon;
grant select on public.v_destruction_board to authenticated;
-- 직접 수정은 막고 함수로만 처리
revoke update on public.destruction_requests from authenticated;

revoke execute on function
  public.queue_destruction_requests(),
  public.approve_destruction(uuid[], text),
  public.hold_destruction(uuid, text),
  public.release_destruction_hold(uuid),
  public.destruction_due_requests(),
  public.destroy_lead_pii(uuid),
  public.execute_destruction(uuid),
  public.mark_destruction_failed(uuid, text),
  public.invoke_destruction_runner()
from public, anon, authenticated;

grant execute on function
  public.approve_destruction(uuid[], text),
  public.hold_destruction(uuid, text),
  public.release_destruction_hold(uuid)
to authenticated;

grant execute on function
  public.queue_destruction_requests(),
  public.destruction_due_requests(),
  public.execute_destruction(uuid),
  public.mark_destruction_failed(uuid, text)
to service_role;
