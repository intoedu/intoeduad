-- M12: 통합 캘린더 + 중요 일정(D-Day) + 대시보드
-- 프로그램 주요 일정은 복사하지 않고 조회할 때 합친다(PLAN 6). 모두 호출자 권한(RLS 그대로) → 현지 팀은 담당 프로그램만.

-- 시스템 일정(파기 승인 등)은 지울 수 없다(완료 처리만)
create or replace function public.guard_system_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_system and (select auth.uid()) is not null then
    if new.deleted_at is not null and old.deleted_at is null then
      raise exception '자동으로 만든 중요 일정은 지울 수 없습니다' using errcode = 'P0001';
    end if;
    if new.title is distinct from old.title or new.date is distinct from old.date or new.category is distinct from old.category
       or new.is_system is distinct from old.is_system or new.priority is distinct from old.priority then
      raise exception '자동으로 만든 중요 일정은 고칠 수 없습니다(완료 처리만 가능)' using errcode = 'P0001';
    end if;
  end if;
  if new.is_system is distinct from old.is_system and (select auth.uid()) is not null then
    raise exception '자동 일정 여부는 바꿀 수 없습니다' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger guard_system_event before update on public.important_events
  for each row execute function public.guard_system_event();

-- ---------------------------------------------------------------------------
-- 통합 캘린더 (KST 날짜 범위)
-- kind: consultation / payment / program_start / program_end / milestone / event / prep / commission / commission_notice
-- ---------------------------------------------------------------------------
create or replace function public.calendar_items(p_from date, p_to date)
returns table (
  kind text,
  date date,
  starts_at timestamptz,
  title text,
  detail text,
  program_id uuid,
  link text,
  critical boolean,
  done boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  -- 상담 예약
  select 'consultation', (c.scheduled_at at time zone 'Asia/Seoul')::date, c.scheduled_at,
         '상담 · ' || coalesce(l.student_name, '(파기됨)'),
         case c.method when 'phone' then '전화' when 'video' then '화상' else '방식 미정' end,
         null::uuid, '/admin/leads/' || l.id, c.method = 'undecided', c.status <> 'scheduled'
  from public.consultations c join public.leads l on l.id = c.lead_id
  where c.scheduled_at is not null and c.status in ('scheduled', 'done')
    and (c.scheduled_at at time zone 'Asia/Seoul')::date between p_from and p_to
  union all
  -- 납부 기한 (미납)
  select 'payment', v.due_date, null, v.label || ' 기한 · ' || coalesce(v.student_name_ko, '(파기됨)'),
         v.status, v.program_id, '/admin/registrations/' || v.registration_id, v.status = 'overdue', false
  from public.v_payment_board v
  where v.canceled_at is null and v.status in ('scheduled', 'partial', 'overdue')
    and v.registration_status not in ('canceled', 'refunded', 'waitlisted')
    and v.due_date between p_from and p_to
  union all
  -- 프로그램 출국·귀국
  select 'program_start', p.start_date, null, '출국 · ' || p.name || coalesce(' (' || p.season || ')', ''), null, p.id, '/admin/programs/' || p.id, false, false
  from public.programs p where p.deleted_at is null and p.start_date between p_from and p_to
  union all
  select 'program_end', p.end_date, null, '귀국 · ' || p.name || coalesce(' (' || p.season || ')', ''), null, p.id, '/admin/programs/' || p.id, false, false
  from public.programs p where p.deleted_at is null and p.end_date between p_from and p_to
  union all
  -- 프로그램 주요 일정
  select 'milestone', m.date, null, m.title || ' · ' || p.name, m.memo, p.id, '/admin/programs/' || p.id || '?step=milestones', false, false
  from public.program_milestones m join public.programs p on p.id = m.program_id
  where p.deleted_at is null and m.date between p_from and p_to
  union all
  -- 중요 일정
  select 'event', e.date, null, e.title, e.memo, e.program_id, '/admin/events?id=' || e.id, e.priority = 'critical', e.done_at is not null
  from public.important_events e where e.deleted_at is null and e.date between p_from and p_to
  union all
  -- 준비물 마감 (끝나지 않은 것)
  select 'prep', i.due_date, null, '준비물 · ' || i.title || ' · ' || p.name, null, p.id, '/admin/programs/' || p.id || '?step=prep',
         i.due_date < public.kst_today(), false
  from public.program_prep_items i join public.programs p on p.id = i.program_id
  where i.deleted_at is null and p.deleted_at is null and i.due_date between p_from and p_to
    and not public.prep_item_complete(i.status, i.needs_recheck) and i.status <> 'not_applicable'
  union all
  -- 커미션 지급 예정
  select 'commission', c.due_date, null, '커미션 지급 · ' || c.partner_name, c.program_name, c.program_id, '/admin/commissions',
         c.overdue, false
  from public.v_commissions c where c.status = 'scheduled' and c.due_date between p_from and p_to
  union all
  -- 커미션 사전 고지 기한(제8조: 개시 30일 전), 고지 전인 것만
  select 'commission_notice', p.start_date - 30, null, '커미션 고지 기한 · ' || p.name, null, p.id, '/admin/commissions?tab=notices',
         true, false
  from public.programs p
  where p.deleted_at is null and p.commission_notice_sent_on is null and (p.start_date - 30) between p_from and p_to
    and public.is_staff_or_admin();
$$;

-- ---------------------------------------------------------------------------
-- D-Day 카드: 다가오는(그리고 놓친) 중요 일정. 지난 일정 중 처리 안 된 위험 항목만 남기고 나머지는 자동 정리.
-- ---------------------------------------------------------------------------
create or replace function public.dday_items(p_days integer default 60)
returns table (kind text, date date, title text, link text, critical boolean, overdue boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select x.kind, x.date, x.title, x.link, x.critical, x.date < public.kst_today()
  from (
    -- 직접 등록·자동 생성 중요 일정
    select 'event' as kind, e.date, e.title, '/admin/events?id=' || e.id as link, e.priority = 'critical' as critical
    from public.important_events e
    where e.deleted_at is null and e.done_at is null and e.show_dday
      and (e.date >= public.kst_today() or e.priority = 'critical')
    union all
    -- 프로그램 주요 일정(D-Day 표시)
    select 'milestone', m.date, m.title || ' · ' || p.name, '/admin/programs/' || p.id || '?step=milestones', false
    from public.program_milestones m join public.programs p on p.id = m.program_id
    where m.show_dday and p.deleted_at is null and m.date >= public.kst_today()
    union all
    -- 준비물 마감 (D-7 이내·지난 것)
    select 'prep', i.due_date, '준비물 마감 · ' || i.title || ' · ' || p.name, '/admin/programs/' || p.id || '?step=prep', i.due_date < public.kst_today()
    from public.program_prep_items i join public.programs p on p.id = i.program_id
    where i.deleted_at is null and p.deleted_at is null and i.due_date <= public.kst_today() + 7 and p.end_date >= public.kst_today()
      and not public.prep_item_complete(i.status, i.needs_recheck) and i.status <> 'not_applicable'
    union all
    -- 커미션 지급
    select 'commission', c.due_date, '커미션 지급 · ' || c.partner_name || ' (' || c.program_name || ')', '/admin/commissions', c.overdue
    from public.v_commissions c where c.status = 'scheduled' and c.due_date is not null
    union all
    -- 커미션 사전 고지 기한
    select 'commission_notice', p.start_date - 30, '커미션 고지 기한 · ' || p.name, '/admin/commissions?tab=notices', true
    from public.programs p
    where p.deleted_at is null and p.commission_notice_sent_on is null and p.start_date >= public.kst_today()
      and public.is_staff_or_admin()
  ) x
  where x.date <= public.kst_today() + greatest(coalesce(p_days, 60), 0)
  order by x.date, x.critical desc;
$$;

-- ---------------------------------------------------------------------------
-- 대시보드 요약 (한 번에) — 직원·관리자 전용 숫자
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_summary()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select case when not public.is_staff_or_admin() then '{}'::jsonb else jsonb_build_object(
    'new_leads', (select count(*) from public.leads where status = 'new' and deleted_at is null and destroyed_at is null),
    'undecided_consultations', (select count(*) from public.consultations
       where status = 'scheduled' and method = 'undecided' and scheduled_at >= now()),
    'payments_due_week', (select count(*) from public.v_payment_board v
       where v.canceled_at is null and v.status in ('scheduled', 'partial') and v.registration_status not in ('canceled', 'refunded', 'waitlisted')
         and v.due_date between public.kst_today() and public.kst_today() + 6),
    'payments_overdue', (select count(*) from public.v_payment_board v
       where v.canceled_at is null and v.status = 'overdue' and v.registration_status not in ('canceled', 'refunded', 'waitlisted')),
    'commissions_overdue', (select count(*) from public.v_commissions where overdue),
    'destruction_pending', (select count(*) from public.destruction_requests where status = 'pending'),
    'destruction_overdue', (select count(*) from public.destruction_requests where status = 'pending' and due_date < public.kst_today()),
    'refunds_pending', (select count(*) from public.refunds where processed_at is null),
    'passport_missing', coalesce((
      select jsonb_agg(x order by x ->> 'deadline') from (
        select jsonb_build_object(
          'program_id', p.id, 'program', p.name || coalesce(' (' || p.season || ')', ''), 'count', count(*),
          -- 항공권 발권 일정이 있으면 그 날짜, 없으면 출국일 기준으로 급한 순
          'deadline', coalesce((select min(m.date) from public.program_milestones m where m.program_id = p.id and m.category = 'flight_ticketing' and m.date >= public.kst_today()), p.start_date)
        ) as x
        from public.registrations r join public.programs p on p.id = r.program_id
        where r.passport_status = 'pending' and r.destroyed_at is null and r.deleted_at is null
          and r.status not in ('canceled', 'refunded', 'waitlisted') and p.end_date >= public.kst_today()
        group by p.id
      ) s
    ), '[]'::jsonb),
    'enrollment', coalesce((
      select jsonb_agg(jsonb_build_object('program_id', p.id, 'program', p.name || coalesce(' (' || p.season || ')', ''),
        'status', p.status, 'capacity', p.capacity, 'enrolled', c.enrolled, 'waitlisted', c.waitlisted) order by p.start_date)
      from public.programs p join public.program_enrollment_counts() c on c.program_id = p.id
      where p.deleted_at is null and p.end_date >= public.kst_today() and p.status in ('before', 'open', 'closed')
    ), '[]'::jsonb),
    'partner_top', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object('partner', coalesce(pa.name, '직접·기타'), 'leads', count(*)) as x
        from public.leads l left join public.partners pa on pa.id = l.partner_id
        where l.created_at >= (date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul') and l.deleted_at is null
        group by pa.name order by count(*) desc limit 5
      ) t
    ), '[]'::jsonb)
  ) end;
$$;

revoke execute on function
  public.guard_system_event(),
  public.calendar_items(date, date),
  public.dday_items(integer),
  public.dashboard_summary()
from public, anon, authenticated;

grant execute on function
  public.calendar_items(date, date),
  public.dday_items(integer),
  public.dashboard_summary()
to authenticated;
