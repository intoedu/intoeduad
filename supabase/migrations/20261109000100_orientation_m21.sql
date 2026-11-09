-- M21: 오리엔테이션 안내
--  1) 1:1 오리엔테이션: 등록생별 일시·진행 방식·담당 → [안내 보내기] (일정이 바뀌면 변경 안내)
--  2) 최종 오리엔테이션: 캠프별 일시·장소·참고 → 등록생 학부모를 골라 일괄 안내 (같은 내용은 다시 보내지 않음)
-- 모두 등록한 프로그램의 진행 일정을 알리는 정보성 알림톡이다(광고 아님). 현지 팀은 담당 프로그램 등록생만 다룬다.
-- 발송 대기열에는 개인정보 없이 일정 정보만 context로 남긴다(보낼 때 이름·번호는 DB에서 읽음).
-- 안내 기록 시각은 clock_timestamp(): 같은 트랜잭션에서 여러 번 넣어도 "가장 최근 안내" 순서가 맞게.

alter table public.message_logs add column context jsonb;

-- 1:1 오리엔테이션 (등록생당 현재 일정 1건)
create table public.registration_orientations (
  registration_id uuid primary key references public.registrations (id) on delete cascade,
  starts_at timestamptz not null,
  method text not null check (char_length(method) between 1 and 100),
  host_name text not null check (char_length(host_name) between 1 and 40),
  memo text check (memo is null or char_length(memo) <= 500),
  updated_by uuid references public.staff_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.registration_orientations (starts_at);

-- 캠프 최종 오리엔테이션 (프로그램당 1건, 캠프 일정·캘린더에도 표시)
create table public.program_final_orientations (
  program_id uuid primary key references public.programs (id) on delete cascade,
  starts_at timestamptz not null,
  place text not null check (char_length(place) between 1 and 100),
  note text check (note is null or char_length(note) <= 60),
  milestone_id uuid references public.program_milestones (id) on delete set null,
  updated_by uuid references public.staff_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.registration_orientations
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.program_final_orientations
  for each row execute function public.set_updated_at();
create trigger audit after insert or update or delete on public.registration_orientations
  for each row execute function public.audit_row('memo');
create trigger audit after insert or update or delete on public.program_final_orientations
  for each row execute function public.audit_row();

alter table public.registration_orientations enable row level security;
alter table public.program_final_orientations enable row level security;
create policy registration_orientations_select on public.registration_orientations for select to authenticated
  using (public.is_staff_or_admin() or public.viewer_has_registration(registration_id));
create policy program_final_orientations_select on public.program_final_orientations for select to authenticated
  using (public.is_staff_or_admin() or public.viewer_has_program(program_id));
revoke all on public.registration_orientations, public.program_final_orientations from anon;
revoke insert, update, delete on public.registration_orientations, public.program_final_orientations from authenticated;

-- 승인 템플릿 ID 칸
update public.settings
   set value = jsonb_set(value, '{templates}',
         coalesce(value -> 'templates', '{}'::jsonb)
         || jsonb_build_object('orientation_scheduled', coalesce(value #>> '{templates,orientation_scheduled}', ''),
                               'orientation_rescheduled', coalesce(value #>> '{templates,orientation_rescheduled}', ''),
                               'final_orientation_notice', coalesce(value #>> '{templates,final_orientation_notice}', ''),
                               'final_orientation_changed', coalesce(value #>> '{templates,final_orientation_changed}', '')))
 where key = 'solapi';

-- ---------------------------------------------------------------------------
-- 공통: 안내를 보낼 수 있는 등록인지 (취소·환불·대기·파기·삭제 제외)
-- ---------------------------------------------------------------------------
create or replace function public.orientation_target_ok(r public.registrations)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select r.destroyed_at is null and r.deleted_at is null and r.status not in ('canceled', 'refunded', 'waitlisted');
$$;

-- 가장 최근 안내(보냈거나 발송 대기) — 같은 내용 재발송 막기·변경 안내 판단용
create or replace function public.orientation_last_notice(p_registration_id uuid, p_final boolean)
returns public.message_logs
language sql
stable
security definer
set search_path = ''
as $$
  select m.* from public.message_logs m
  where m.related_type = 'registration' and m.related_id = p_registration_id
    and m.status in ('queued', 'sent')
    and m.purpose = any (case when p_final then array['final_orientation_notice', 'final_orientation_changed']
                              else array['orientation_scheduled', 'orientation_rescheduled'] end)
  order by m.created_at desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 1:1 오리엔테이션
-- ---------------------------------------------------------------------------
create or replace function public.send_registration_orientation(p_registration_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.registrations;
  o public.registration_orientations;
  last public.message_logs;
  v_purpose text := 'orientation_scheduled';
  v_prev timestamptz;
begin
  if not (public.is_staff_or_admin() or public.viewer_has_registration(p_registration_id)) then
    raise exception '권한이 없습니다' using errcode = '42501';
  end if;
  select * into r from public.registrations where id = p_registration_id;
  if not found or not public.orientation_target_ok(r) then
    raise exception '안내를 보낼 수 없는 신청입니다(취소·환불·대기)' using errcode = 'P0001';
  end if;
  select * into o from public.registration_orientations where registration_id = p_registration_id;
  if not found then
    raise exception '먼저 오리엔테이션 일정을 저장해 주세요' using errcode = 'P0001';
  end if;
  last := public.orientation_last_notice(p_registration_id, false);
  if last.id is not null then
    if last.status = 'queued' then
      raise exception '이미 발송 대기 중입니다. 잠시 후 다시 확인해 주세요' using errcode = 'P0001';
    end if;
    if (last.context ->> 'starts_at')::timestamptz = o.starts_at and last.context ->> 'method' = o.method and last.context ->> 'host' = o.host_name then
      raise exception '이미 같은 내용으로 안내했습니다' using errcode = 'P0001';
    end if;
    if (last.context ->> 'starts_at')::timestamptz <> o.starts_at then
      v_purpose := 'orientation_rescheduled';
      v_prev := (last.context ->> 'starts_at')::timestamptz;
    end if;
  end if;
  insert into public.message_logs (channel, purpose, template_code, status, related_type, related_id, requested_by, context, created_at)
  values ('alimtalk', v_purpose, v_purpose, 'queued', 'registration', p_registration_id, (select auth.uid()),
          jsonb_build_object('starts_at', o.starts_at, 'previous_starts_at', v_prev, 'method', o.method, 'host', o.host_name),
          clock_timestamp());
  return v_purpose;
end;
$$;

create or replace function public.save_registration_orientation(
  p_registration_id uuid,
  p_starts_at timestamptz,
  p_method text,
  p_host text,
  p_memo text default null,
  p_notify boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.registrations;
  v_method text := nullif(trim(coalesce(p_method, '')), '');
  v_host text := nullif(trim(coalesce(p_host, '')), '');
  v_sent text;
begin
  if not (public.is_staff_or_admin() or public.viewer_has_registration(p_registration_id)) then
    raise exception '권한이 없습니다' using errcode = '42501';
  end if;
  select * into r from public.registrations where id = p_registration_id;
  if not found or not public.orientation_target_ok(r) then
    raise exception '오리엔테이션을 정할 수 없는 신청입니다(취소·환불·대기)' using errcode = 'P0001';
  end if;
  if p_starts_at is null then
    raise exception '일시를 입력해 주세요' using errcode = 'P0001';
  end if;
  if v_method is null or char_length(v_method) > 100 then
    raise exception '진행 방식을 100자 이내로 입력해 주세요' using errcode = 'P0001';
  end if;
  if v_host is null or char_length(v_host) > 40 then
    raise exception '담당자를 40자 이내로 입력해 주세요' using errcode = 'P0001';
  end if;
  if p_memo is not null and char_length(p_memo) > 500 then
    raise exception '메모는 500자 이내로 입력해 주세요' using errcode = 'P0001';
  end if;
  insert into public.registration_orientations (registration_id, starts_at, method, host_name, memo, updated_by)
  values (p_registration_id, p_starts_at, v_method, v_host, nullif(trim(coalesce(p_memo, '')), ''), (select auth.uid()))
  on conflict (registration_id) do update
    set starts_at = excluded.starts_at, method = excluded.method, host_name = excluded.host_name,
        memo = excluded.memo, updated_by = excluded.updated_by;
  if p_notify then
    v_sent := public.send_registration_orientation(p_registration_id);
  end if;
  return jsonb_build_object('saved', true, 'queued', v_sent);
end;
$$;

create or replace function public.delete_registration_orientation(p_registration_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.is_staff_or_admin() or public.viewer_has_registration(p_registration_id)) then
    raise exception '권한이 없습니다' using errcode = '42501';
  end if;
  delete from public.registration_orientations where registration_id = p_registration_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 최종 오리엔테이션
-- ---------------------------------------------------------------------------
create or replace function public.save_final_orientation(p_program_id uuid, p_starts_at timestamptz, p_place text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.program_final_orientations;
  v_place text := nullif(trim(coalesce(p_place, '')), '');
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_day date;
  v_memo text;
  v_mid uuid;
begin
  if not (public.is_staff_or_admin() or public.viewer_has_program(p_program_id)) then
    raise exception '권한이 없습니다' using errcode = '42501';
  end if;
  if not exists (select 1 from public.programs where id = p_program_id) then
    raise exception '프로그램을 찾을 수 없습니다' using errcode = 'P0001';
  end if;
  if p_starts_at is null then
    raise exception '일시를 입력해 주세요' using errcode = 'P0001';
  end if;
  if v_place is null or char_length(v_place) > 100 then
    raise exception '장소·방식을 100자 이내로 입력해 주세요' using errcode = 'P0001';
  end if;
  if v_note is not null and char_length(v_note) > 60 then
    raise exception '참고 사항은 60자 이내로 입력해 주세요' using errcode = 'P0001';
  end if;
  v_day := (p_starts_at at time zone 'Asia/Seoul')::date;
  v_memo := to_char(p_starts_at at time zone 'Asia/Seoul', 'HH24:MI') || ' (한국 시간) · ' || v_place;

  select * into f from public.program_final_orientations where program_id = p_program_id for update;
  v_mid := f.milestone_id;
  if v_mid is not null and exists (select 1 from public.program_milestones where id = v_mid) then
    update public.program_milestones set date = v_day, memo = v_memo where id = v_mid;
  else
    insert into public.program_milestones (program_id, title, date, category, show_dday, memo)
    values (p_program_id, '최종 오리엔테이션', v_day, 'orientation', true, v_memo)
    returning id into v_mid;
  end if;

  insert into public.program_final_orientations (program_id, starts_at, place, note, milestone_id, updated_by)
  values (p_program_id, p_starts_at, v_place, v_note, v_mid, (select auth.uid()))
  on conflict (program_id) do update
    set starts_at = excluded.starts_at, place = excluded.place, note = excluded.note,
        milestone_id = excluded.milestone_id, updated_by = excluded.updated_by;
end;
$$;

create or replace function public.delete_final_orientation(p_program_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mid uuid;
begin
  if not (public.is_staff_or_admin() or public.viewer_has_program(p_program_id)) then
    raise exception '권한이 없습니다' using errcode = '42501';
  end if;
  delete from public.program_final_orientations where program_id = p_program_id returning milestone_id into v_mid;
  if v_mid is not null then
    delete from public.program_milestones where id = v_mid;
  end if;
end;
$$;

-- 고른 등록생 학부모에게 최종 오리엔테이션 안내 (같은 내용은 건너뜀)
create or replace function public.send_final_orientation(p_program_id uuid, p_registration_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.program_final_orientations;
  r public.registrations;
  last public.message_logs;
  v_purpose text;
  v_prev timestamptz;
  v_queued integer := 0;
  v_already integer := 0;
  v_pending integer := 0;
  v_skipped integer := 0;
begin
  if not (public.is_staff_or_admin() or public.viewer_has_program(p_program_id)) then
    raise exception '권한이 없습니다' using errcode = '42501';
  end if;
  select * into f from public.program_final_orientations where program_id = p_program_id;
  if not found then
    raise exception '먼저 최종 오리엔테이션 일정을 저장해 주세요' using errcode = 'P0001';
  end if;
  if coalesce(cardinality(p_registration_ids), 0) = 0 then
    raise exception '안내를 받을 학부모를 골라 주세요' using errcode = 'P0001';
  end if;

  for r in select * from public.registrations where id = any (p_registration_ids) loop
    if r.program_id <> p_program_id or not public.orientation_target_ok(r) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    last := public.orientation_last_notice(r.id, true);
    v_purpose := 'final_orientation_notice';
    v_prev := null;
    if last.id is not null then
      if last.status = 'queued' then
        v_pending := v_pending + 1;
        continue;
      end if;
      if (last.context ->> 'starts_at')::timestamptz = f.starts_at and last.context ->> 'place' = f.place
         and coalesce(last.context ->> 'note', '') = coalesce(f.note, '') then
        v_already := v_already + 1;
        continue;
      end if;
      if (last.context ->> 'starts_at')::timestamptz <> f.starts_at or last.context ->> 'place' <> f.place then
        v_purpose := 'final_orientation_changed';
        v_prev := (last.context ->> 'starts_at')::timestamptz;
      end if;
    end if;
    insert into public.message_logs (channel, purpose, template_code, status, related_type, related_id, requested_by, context, created_at)
    values ('alimtalk', v_purpose, v_purpose, 'queued', 'registration', r.id, (select auth.uid()),
            jsonb_build_object('starts_at', f.starts_at, 'previous_starts_at', v_prev, 'place', f.place, 'note', f.note),
            clock_timestamp());
    v_queued := v_queued + 1;
  end loop;
  return jsonb_build_object('queued', v_queued, 'already', v_already, 'pending', v_pending,
                            'skipped', v_skipped + cardinality(p_registration_ids) - (v_queued + v_already + v_pending + v_skipped));
end;
$$;

-- 오리엔테이션 화면: 캠프 등록생 + 1:1 일정 + 안내 상태 (현지 팀은 담당 프로그램만, 주소·납부 정보 없음)
create or replace function public.program_orientation_board(p_program_id uuid)
returns table (
  registration_id uuid,
  status text,
  student_name_ko text,
  student_name_en text,
  parent_name text,
  kakao_use boolean,
  ot_starts_at timestamptz,
  ot_method text,
  ot_host text,
  ot_memo text,
  ot_notice_purpose text,
  ot_notice_status text,
  ot_notice_at timestamptz,
  ot_notice_current boolean,
  final_notice_purpose text,
  final_notice_status text,
  final_notice_at timestamptz,
  final_notice_current boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.status, r.student_name_ko, r.student_name_en, r.parent_name, r.kakao_use,
         o.starts_at, o.method, o.host_name, o.memo,
         n1.purpose, n1.status, n1.created_at,
         (n1.id is not null and o.registration_id is not null and (n1.context ->> 'starts_at')::timestamptz = o.starts_at
           and n1.context ->> 'method' = o.method and n1.context ->> 'host' = o.host_name),
         n2.purpose, n2.status, n2.created_at,
         (n2.id is not null and f.program_id is not null and (n2.context ->> 'starts_at')::timestamptz = f.starts_at
           and n2.context ->> 'place' = f.place and coalesce(n2.context ->> 'note', '') = coalesce(f.note, ''))
  from public.registrations r
  left join public.registration_orientations o on o.registration_id = r.id
  left join public.program_final_orientations f on f.program_id = r.program_id
  left join lateral (
    select m.* from public.message_logs m
    where m.related_type = 'registration' and m.related_id = r.id and m.purpose in ('orientation_scheduled', 'orientation_rescheduled')
    order by m.created_at desc limit 1
  ) n1 on true
  left join lateral (
    select m.* from public.message_logs m
    where m.related_type = 'registration' and m.related_id = r.id and m.purpose in ('final_orientation_notice', 'final_orientation_changed')
    order by m.created_at desc limit 1
  ) n2 on true
  where r.program_id = p_program_id
    and r.destroyed_at is null and r.deleted_at is null
    and r.status not in ('canceled', 'refunded', 'waitlisted')
    and (public.is_staff_or_admin() or public.viewer_has_program(p_program_id))
  order by o.starts_at nulls last, r.student_name_ko;
$$;

revoke execute on function
  public.orientation_target_ok(public.registrations),
  public.orientation_last_notice(uuid, boolean),
  public.send_registration_orientation(uuid),
  public.save_registration_orientation(uuid, timestamptz, text, text, text, boolean),
  public.delete_registration_orientation(uuid),
  public.save_final_orientation(uuid, timestamptz, text, text),
  public.delete_final_orientation(uuid),
  public.send_final_orientation(uuid, uuid[]),
  public.program_orientation_board(uuid)
from public, anon, authenticated;
grant execute on function
  public.send_registration_orientation(uuid),
  public.save_registration_orientation(uuid, timestamptz, text, text, text, boolean),
  public.delete_registration_orientation(uuid),
  public.save_final_orientation(uuid, timestamptz, text, text),
  public.delete_final_orientation(uuid),
  public.send_final_orientation(uuid, uuid[]),
  public.program_orientation_board(uuid)
to authenticated;
