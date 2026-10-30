-- 권한 함수 · RLS · 슬롯 예약 트리거 · 감사 트리거 · 여권 버킷

-- ---------------------------------------------------------------------------
-- 권한 확인 함수 (비활성 직원은 모두 null/false)
-- ---------------------------------------------------------------------------
create or replace function public.current_staff_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.staff_profiles
  where id = (select auth.uid()) and active;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_staff_role() = 'admin', false);
$$;

create or replace function public.is_staff_or_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_staff_role() in ('admin', 'staff'), false);
$$;

create or replace function public.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_staff_role() is not null;
$$;

-- 여권 열람: 관리자 또는 권한 플래그가 있는 직원
create or replace function public.can_view_passport()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_profiles
    where id = (select auth.uid())
      and active
      and (role = 'admin' or (role = 'staff' and can_view_passport))
  );
$$;

-- 현지 팀 담당 프로그램 여부
create or replace function public.viewer_has_program(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_staff()
    and exists (
      select 1
      from public.staff_program_assignments
      where staff_id = (select auth.uid()) and program_id = p_program_id
    );
$$;

-- 등록생이 현지 팀 담당 프로그램 소속인지
create or replace function public.viewer_has_registration(p_registration_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.registrations r
    where r.id = p_registration_id
      and r.destroyed_at is null
      and public.viewer_has_program(r.program_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- 상담 슬롯 예약 카운트 (정원 초과 방지)
-- 하나의 UPDATE 문이 슬롯 행을 잠그므로 동시 요청에서도 정원을 넘지 않는다.
-- ---------------------------------------------------------------------------
create or replace function public.consultation_slot_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_holds boolean := false;
  v_new_holds boolean := false;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old_holds := old.slot_id is not null and old.status <> 'canceled';
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new_holds := new.slot_id is not null and new.status <> 'canceled';
  end if;

  -- 같은 슬롯을 계속 쓰는 경우 변동 없음
  if tg_op = 'UPDATE' and v_old_holds and v_new_holds and old.slot_id = new.slot_id then
    return new;
  end if;

  if v_old_holds then
    update public.consultation_slots
       set booked_count = booked_count - 1
     where id = old.slot_id;
  end if;

  if v_new_holds then
    update public.consultation_slots
       set booked_count = booked_count + 1
     where id = new.slot_id
       and is_open
       and starts_at > now()
       and booked_count < capacity;
    if not found then
      raise exception '선택한 상담 시간은 예약할 수 없습니다'
        using errcode = 'P0001', hint = 'SLOT_UNAVAILABLE';
    end if;
    select starts_at into new.scheduled_at
    from public.consultation_slots
    where id = new.slot_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger consultation_slot_booking
  before insert or update of slot_id, status or delete on public.consultations
  for each row execute function public.consultation_slot_booking();

-- ---------------------------------------------------------------------------
-- 감사 기록: 트리거 인자로 받은 개인정보 컬럼은 값을 남기지 않는다
-- ---------------------------------------------------------------------------
create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_redact text[] := coalesce(tg_argv::text[], '{}'::text[]);
  v_changed text[];
  v_id uuid;
  v_actor uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(new);
  end if;

  v_id := coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'registration_id', v_old ->> 'registration_id')::uuid;
  v_actor := coalesce(
    (select auth.uid()),
    nullif(current_setting('app.actor_id', true), '')::uuid
  );

  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key)
      into v_changed
      from jsonb_each(v_new) n
     where n.value is distinct from v_old -> n.key
       and n.key <> 'updated_at';

    if v_changed is null then
      return new;
    end if;

    select jsonb_object_agg(key, value) into v_old
      from jsonb_each(v_old)
     where key = any (v_changed) and not key = any (v_redact);
    select jsonb_object_agg(key, value) into v_new
      from jsonb_each(v_new)
     where key = any (v_changed) and not key = any (v_redact);
  elsif tg_op = 'INSERT' then
    v_new := v_new - v_redact;
  else
    v_old := v_old - v_redact;
  end if;

  insert into public.activity_logs (entity_type, entity_id, actor_id, action, changed_fields, before, after)
  values (tg_table_name, v_id, v_actor, lower(tg_op), v_changed, v_old, v_new);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger audit after insert or update or delete on public.staff_profiles
  for each row execute function public.audit_row('phone', 'email');
create trigger audit after insert or update or delete on public.partners
  for each row execute function public.audit_row('phone', 'director_name', 'memo');
create trigger audit after insert or update or delete on public.programs
  for each row execute function public.audit_row();
create trigger audit after insert or update or delete on public.program_payment_rules
  for each row execute function public.audit_row();
create trigger audit after insert or update or delete on public.leads
  for each row execute function public.audit_row(
    'student_name', 'parent_name', 'parent_phone', 'relation', 'message', 'source_other'
  );
create trigger audit after insert or update or delete on public.consultations
  for each row execute function public.audit_row('notes', 'meeting_url');
create trigger audit after insert or update or delete on public.registrations
  for each row execute function public.audit_row(
    'student_name_ko', 'student_name_en', 'birth_date', 'gender', 'school', 'grade', 'english_level',
    'parent_name', 'parent_phone', 'parent_email', 'address',
    'emergency_name', 'emergency_relation', 'emergency_phone', 'special_notes'
  );
create trigger audit after insert or update or delete on public.registration_health_notes
  for each row execute function public.audit_row('body');
create trigger audit after insert or update or delete on public.payment_schedules
  for each row execute function public.audit_row();
create trigger audit after insert or update or delete on public.payments
  for each row execute function public.audit_row('memo');
create trigger audit after insert or update or delete on public.refunds
  for each row execute function public.audit_row('memo');
create trigger audit after insert or update or delete on public.important_events
  for each row execute function public.audit_row();
create trigger audit after insert or update or delete on public.destruction_requests
  for each row execute function public.audit_row();
create trigger audit after insert or update or delete on public.staff_program_assignments
  for each row execute function public.audit_row();

-- ---------------------------------------------------------------------------
-- 기본 권한: 비로그인(anon)에는 아무 권한도 주지 않는다
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon, public;

grant execute on function
  public.kst_today(),
  public.current_staff_role(),
  public.is_admin(),
  public.is_staff_or_admin(),
  public.is_active_staff(),
  public.can_view_passport(),
  public.viewer_has_program(uuid),
  public.viewer_has_registration(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- RLS 활성화 (모든 테이블)
-- ---------------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS 정책
-- ---------------------------------------------------------------------------

-- 직원: 활성 직원은 목록 열람(담당자 지정용), 본인 행은 항상 열람, 수정은 관리자만
create policy staff_select on public.staff_profiles for select to authenticated
  using (public.is_active_staff() or id = (select auth.uid()));
create policy staff_update on public.staff_profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy assignments_select on public.staff_program_assignments for select to authenticated
  using (public.is_staff_or_admin() or staff_id = (select auth.uid()));
create policy assignments_write on public.staff_program_assignments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 학원: 직원·관리자
create policy partners_select on public.partners for select to authenticated
  using (public.is_staff_or_admin());
create policy partners_insert on public.partners for insert to authenticated
  with check (public.is_staff_or_admin());
create policy partners_update on public.partners for update to authenticated
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

-- 프로그램: 직원·관리자 + 현지 팀은 담당 프로그램 열람
create policy programs_select on public.programs for select to authenticated
  using (public.is_staff_or_admin() or public.viewer_has_program(id));
create policy programs_insert on public.programs for insert to authenticated
  with check (public.is_staff_or_admin());
create policy programs_update on public.programs for update to authenticated
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

create policy payment_rules_all on public.program_payment_rules for all to authenticated
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

create policy milestones_select on public.program_milestones for select to authenticated
  using (public.is_staff_or_admin() or public.viewer_has_program(program_id));
create policy milestones_write on public.program_milestones for all to authenticated
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

-- 상담: 직원·관리자만
create policy leads_select on public.leads for select to authenticated
  using (public.is_staff_or_admin());
create policy leads_insert on public.leads for insert to authenticated
  with check (public.is_staff_or_admin());
create policy leads_update on public.leads for update to authenticated
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

create policy lead_interests_all on public.lead_program_interests for all to authenticated
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

create policy slots_all on public.consultation_slots for all to authenticated
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

create policy consultations_select on public.consultations for select to authenticated
  using (public.is_staff_or_admin());
create policy consultations_insert on public.consultations for insert to authenticated
  with check (public.is_staff_or_admin());
create policy consultations_update on public.consultations for update to authenticated
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

-- 등록: 직원·관리자만 테이블 직접 접근 (현지 팀은 전용 함수로 제한 열람)
create policy registrations_select on public.registrations for select to authenticated
  using (public.is_staff_or_admin());
create policy registrations_insert on public.registrations for insert to authenticated
  with check (public.is_staff_or_admin());
create policy registrations_update on public.registrations for update to authenticated
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

-- 건강 정보: 직원·관리자 + 현지 팀(담당 프로그램, 현장 안전 관리)
create policy health_select on public.registration_health_notes for select to authenticated
  using (public.is_staff_or_admin() or public.viewer_has_registration(registration_id));
create policy health_write on public.registration_health_notes for all to authenticated
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

-- 동의 문구: 직원 열람, 관리자만 새 버전 추가(수정·삭제는 트리거로 금지)
create policy consent_docs_select on public.consent_documents for select to authenticated
  using (public.is_staff_or_admin());
create policy consent_docs_insert on public.consent_documents for insert to authenticated
  with check (public.is_admin());

create policy consent_records_select on public.consent_records for select to authenticated
  using (public.is_staff_or_admin());
create policy consent_records_update on public.consent_records for update to authenticated
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

-- 여권: 메타데이터도 열람 권한자만. 쓰기는 Edge Function(service role)만
create policy passport_files_select on public.passport_files for select to authenticated
  using (public.can_view_passport());
create policy passport_logs_select on public.passport_access_logs for select to authenticated
  using (public.is_admin());

-- 납부·환불: 직원·관리자
create policy schedules_select on public.payment_schedules for select to authenticated
  using (public.is_staff_or_admin());
create policy schedules_insert on public.payment_schedules for insert to authenticated
  with check (public.is_staff_or_admin());
create policy schedules_update on public.payment_schedules for update to authenticated
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

create policy payments_select on public.payments for select to authenticated
  using (public.is_staff_or_admin());
create policy payments_insert on public.payments for insert to authenticated
  with check (public.is_staff_or_admin());
create policy payments_update on public.payments for update to authenticated
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

create policy refunds_select on public.refunds for select to authenticated
  using (public.is_staff_or_admin());
create policy refunds_insert on public.refunds for insert to authenticated
  with check (public.is_staff_or_admin());
create policy refunds_update on public.refunds for update to authenticated
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

-- 중요 일정: 직원·관리자 + 현지 팀은 담당 프로그램 일정 열람
create policy events_select on public.important_events for select to authenticated
  using (
    public.is_staff_or_admin()
    or (program_id is not null and public.viewer_has_program(program_id))
  );
create policy events_insert on public.important_events for insert to authenticated
  with check (public.is_staff_or_admin() and not is_system);
create policy events_update on public.important_events for update to authenticated
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

-- 파기 요청: 직원 열람, 승인·보류는 관리자만 (생성은 예약 작업)
create policy destruction_select on public.destruction_requests for select to authenticated
  using (public.is_staff_or_admin());
create policy destruction_update on public.destruction_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 메모: 직원·관리자 전체, 현지 팀은 담당 등록생 메모만. 수정은 작성자 본인만
create policy notes_select on public.notes for select to authenticated
  using (
    public.is_staff_or_admin()
    or (entity_type = 'registration' and public.viewer_has_registration(entity_id))
  );
create policy notes_insert on public.notes for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (
      public.is_staff_or_admin()
      or (entity_type = 'registration' and public.viewer_has_registration(entity_id))
    )
  );
create policy notes_update on public.notes for update to authenticated
  using (author_id = (select auth.uid()) and public.is_active_staff())
  with check (author_id = (select auth.uid()));

-- 기록: 직원·관리자 열람만 (쓰기는 트리거·Edge Function)
create policy activity_select on public.activity_logs for select to authenticated
  using (public.is_staff_or_admin());
create policy messages_select on public.message_logs for select to authenticated
  using (public.is_staff_or_admin());

-- 설정: 활성 직원 열람, 관리자만 수정
create policy settings_select on public.settings for select to authenticated
  using (public.is_active_staff());
create policy settings_write on public.settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- access_tokens, submission_throttle: 정책 없음 → service role 전용

-- 개인정보 컬럼 값이 남지 않도록 activity_logs·access_tokens 등은 직접 쓰기 불가
revoke insert, update, delete on public.activity_logs, public.message_logs,
  public.passport_access_logs, public.access_tokens, public.submission_throttle
  from authenticated;

-- ---------------------------------------------------------------------------
-- 현지 팀 전용 조회 함수 (주소·납부·학부모 이메일 제외, 담당 프로그램 강제)
-- ---------------------------------------------------------------------------
create or replace function public.viewer_list_registrations(p_program_id uuid)
returns table (
  id uuid,
  program_id uuid,
  status text,
  student_name_ko text,
  student_name_en text,
  birth_date date,
  gender text,
  school text,
  grade text,
  english_level text,
  parent_name text,
  parent_phone text,
  emergency_name text,
  emergency_relation text,
  emergency_phone text,
  special_notes text,
  health_note text,
  passport_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id, r.program_id, r.status,
    r.student_name_ko, r.student_name_en, r.birth_date, r.gender, r.school, r.grade, r.english_level,
    r.parent_name, r.parent_phone,
    r.emergency_name, r.emergency_relation, r.emergency_phone,
    r.special_notes, h.body, r.passport_status
  from public.registrations r
  left join public.registration_health_notes h on h.registration_id = r.id
  where r.program_id = p_program_id
    and r.destroyed_at is null
    and r.deleted_at is null
    and r.status not in ('canceled', 'refunded')
    and (public.is_staff_or_admin() or public.viewer_has_program(p_program_id))
  order by r.student_name_ko;
$$;

revoke execute on function public.viewer_list_registrations(uuid) from public, anon;
grant execute on function public.viewer_list_registrations(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 여권 파일 버킷: 비공개, 정책 없음 → Edge Function(service role)만 접근
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('passports', 'passports', false, 10485760)
on conflict (id) do nothing;
