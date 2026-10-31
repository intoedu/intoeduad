-- M6: 캠프 준비사항(사전 자료 제작) 체크리스트
-- 캠프를 만들면 기본 목록대로 준비물이 자동으로 할 일이 되고,
-- 캠프의 금액·날짜·정원·납부 규칙이 바뀌면 이미 확인·배포된 자료를 "재확인 필요"로 되돌린다.

-- ---------------------------------------------------------------------------
-- 교차 검수 항목(운영 매뉴얼 11) — 화면(src/lib/labels.ts PREP_REVIEW_ITEMS)과 같은 키
-- ---------------------------------------------------------------------------
create or replace function public.prep_review_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'brand_name', 'price_dates', 'inclusions', 'apply_qr', 'no_guarantee',
    'admission_disclaimer', 'photo_consent', 'school_logo', 'file_version'
  ];
$$;

-- 마감 기준: 모집 시작일 기준(recruit_start) · 출국일 기준(start) · 없음(none)
create or replace function public.prep_due_date(p_anchor text, p_offset integer, p_recruit_start date, p_start date)
returns date
language sql
immutable
set search_path = ''
as $$
  select case p_anchor
    when 'recruit_start' then p_recruit_start + coalesce(p_offset, 0)
    when 'start' then p_start + coalesce(p_offset, 0)
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- 기본 목록(관리자가 수정)
-- ---------------------------------------------------------------------------
create table public.prep_item_templates (
  key text primary key check (key ~ '^[a-z0-9_]{2,40}$'),
  title text not null,
  -- material: 제작물(요청서 → 제작 → 교차 검수 → 확인 → 배포), task: 단순 할 일(완료/해당 없음)
  kind text not null check (kind in ('material', 'task')),
  audience text,
  due_anchor text not null default 'none' check (due_anchor in ('recruit_start', 'start', 'none')),
  due_offset_days integer not null default 0 check (due_offset_days between -365 and 365),
  -- 준비율 계산에 들어가는 필수 항목
  required boolean not null default true,
  -- 끝나지 않으면 "모집 중"으로 바꿀 때 경고(관리자는 사유를 적고 진행)
  gate_open boolean not null default false,
  sort integer not null default 0,
  active boolean not null default true,
  description text,
  updated_at timestamptz not null default now(),
  -- 협약서 제8조: 커미션 고지는 개시 30일 전까지(고정)
  constraint prep_commission_notice_fixed check (
    key <> 'commission_notice' or (kind = 'task' and due_anchor = 'start' and due_offset_days = -30 and active)
  )
);

insert into public.prep_item_templates (key, title, kind, audience, due_anchor, due_offset_days, required, gate_open, sort, description) values
  ('commission_notice', '커미션 사전 고지(MOU-15)', 'task', '파트너 학원', 'start', -30, true, false, 10,
   '협약서 제8조: 프로그램 개시 30일 전까지 서면 고지. 고지일은 [2. 납부 규칙]의 커미션 고지일과 함께 기록됩니다.'),
  ('partner_video_program', '파트너용 영상 ① 프로그램 설명', 'material', '원장·상담실장', 'recruit_start', -7, true, true, 20, null),
  ('partner_video_guide', '파트너용 영상 ② 홍보 가이드', 'material', '원장·상담실장', 'recruit_start', -7, true, true, 30, null),
  ('promo_video', '고객용 메인 프로모션 영상', 'material', '학부모·학생', 'recruit_start', 0, true, true, 40, null),
  ('short_form', '숏폼·현장 하이라이트', 'material', '학부모·학생', 'none', 0, false, false, 50, '선택 항목 — 필요할 때만 진행'),
  ('brochure', '브로셔', 'material', '설명회·학원 배포', 'recruit_start', -7, true, true, 60, null),
  ('poster', '포스터', 'material', '학원 홍보물', 'recruit_start', -7, true, true, 70, null),
  ('parent_guide', '부모용 안내문', 'material', '등록자·학부모', 'start', -30, true, false, 80, null),
  ('partner_drive_share', '파트너 학원 드라이브 공유(배포)', 'task', '파트너 학원', 'recruit_start', 0, true, true, 90, null),
  ('photo_consent_request', '사진·영상 촬영 동의 요청(MAT-03)', 'task', '등록 학부모', 'start', -14, true, false, 100, null);

-- ---------------------------------------------------------------------------
-- 캠프별 준비물
-- ---------------------------------------------------------------------------
create table public.program_prep_items (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  template_key text,
  title text not null,
  kind text not null check (kind in ('material', 'task')),
  audience text,
  -- 학원별 맞춤 요청(MAT-01 학원명 포스터 등)
  partner_id uuid references public.partners (id) on delete set null,
  due_anchor text not null default 'none' check (due_anchor in ('recruit_start', 'start', 'none')),
  due_offset_days integer not null default 0,
  due_date date,
  -- 직접 정한 마감은 캠프 날짜가 바뀌어도 그대로 둔다
  due_manual boolean not null default false,
  required boolean not null default true,
  gate_open boolean not null default false,
  status text not null default 'requested' check (status in (
    'requested', 'producing', 'reviewing', 'approved', 'distributed', 'todo', 'done', 'not_applicable'
  )),
  -- 제작 요청서: {purpose, audience, usage, spec, key_message, include_price, partner_logo, photo_consent}
  request jsonb not null default '{}'::jsonb,
  owner_id uuid references public.staff_profiles (id) on delete set null,
  reviewer_id uuid references public.staff_profiles (id) on delete set null,
  result_url text check (result_url is null or result_url ~ '^https?://'),
  version integer not null default 0 check (version >= 0),
  -- 교차 검수 체크: {"brand_name": true, ...}
  checklist jsonb not null default '{}'::jsonb,
  approved_by uuid references public.staff_profiles (id) on delete set null,
  approved_at timestamptz,
  distributed_on date,
  distribution_channel text,
  needs_recheck boolean not null default false,
  recheck_reason text,
  memo text,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint prep_status_by_kind check (
    (kind = 'material' and status in ('requested', 'producing', 'reviewing', 'approved', 'distributed', 'not_applicable'))
    or (kind = 'task' and status in ('todo', 'done', 'not_applicable'))
  )
);
create index on public.program_prep_items (program_id);
create index on public.program_prep_items (due_date) where deleted_at is null;
-- 기본 목록 항목은 캠프마다 하나
create unique index program_prep_items_one_template
  on public.program_prep_items (program_id, template_key)
  where template_key is not null and deleted_at is null and template_key <> 'partner_change_notice';

-- 버전 기록(v1, v2 …)
create table public.program_prep_versions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.program_prep_items (id) on delete cascade,
  version integer not null,
  url text not null check (url ~ '^https?://'),
  note text,
  created_by uuid references public.staff_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (item_id, version)
);

-- 모집 시작 경고를 넘긴 사유(관리자만)
alter table public.programs add column prep_override_reason text;

-- ---------------------------------------------------------------------------
-- 캠프가 만들어지면 기본 목록대로 준비물 생성
-- ---------------------------------------------------------------------------
create or replace function public.generate_prep_items(p_program_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program public.programs;
  v_count integer;
begin
  select * into v_program from public.programs where id = p_program_id;
  if not found then
    return 0;
  end if;
  insert into public.program_prep_items (
    program_id, template_key, title, kind, audience, due_anchor, due_offset_days, due_date, required, gate_open, status, sort
  )
  select v_program.id, t.key, t.title, t.kind, t.audience, t.due_anchor, t.due_offset_days,
    public.prep_due_date(t.due_anchor, t.due_offset_days, v_program.recruit_start_date, v_program.start_date),
    t.required, t.gate_open,
    case when t.kind = 'task' then 'todo' else 'requested' end,
    t.sort
  from public.prep_item_templates t
  where t.active
    and not exists (
      select 1 from public.program_prep_items i
      where i.program_id = v_program.id and i.template_key = t.key and i.deleted_at is null
    );
  get diagnostics v_count = row_count;

  -- 이미 커미션 고지를 기록한 캠프
  if v_program.commission_notice_sent_on is not null then
    update public.program_prep_items
       set status = 'done', distributed_on = v_program.commission_notice_sent_on
     where program_id = v_program.id and template_key = 'commission_notice' and status = 'todo';
  end if;
  return v_count;
end;
$$;

create or replace function public.programs_after_insert_prep()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.generate_prep_items(new.id);
  return null;
end;
$$;

create trigger generate_prep_items after insert on public.programs
  for each row execute function public.programs_after_insert_prep();

-- ---------------------------------------------------------------------------
-- 자료 불일치 방지: 확인·배포된 자료 → 재확인 필요 + 파트너 학원 변경 통보(MOU-12) 할 일
-- ---------------------------------------------------------------------------
create or replace function public.flag_prep_recheck(p_program_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_distributed boolean;
begin
  select exists (
    select 1 from public.program_prep_items
    where program_id = p_program_id and deleted_at is null and kind = 'material' and status = 'distributed'
  ) into v_distributed;

  update public.program_prep_items
     set needs_recheck = true,
         recheck_reason = case
           when recheck_reason is null then p_reason
           when position(p_reason in recheck_reason) > 0 then recheck_reason
           else recheck_reason || ', ' || p_reason
         end
   where program_id = p_program_id
     and deleted_at is null
     and kind = 'material'
     and status in ('approved', 'distributed');

  -- 이미 학원에 나간 자료가 있으면 변경 통보 할 일(열린 것이 없을 때만)
  if v_distributed and not exists (
    select 1 from public.program_prep_items
    where program_id = p_program_id and template_key = 'partner_change_notice'
      and deleted_at is null and status = 'todo'
  ) then
    insert into public.program_prep_items (
      program_id, template_key, title, kind, audience, due_anchor, due_date, due_manual, required, status, memo, sort
    ) values (
      p_program_id, 'partner_change_notice', '파트너 학원 변경 통보(MOU-12)', 'task', '파트너 학원', 'none',
      public.kst_today() + 3, true, true, 'todo', '변경 내용: ' || p_reason, 5
    );
  end if;
end;
$$;

create or replace function public.programs_after_update_prep()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reasons text[] := '{}';
begin
  -- 날짜가 바뀌면 자동 마감 다시 계산
  if new.start_date is distinct from old.start_date or new.recruit_start_date is distinct from old.recruit_start_date then
    update public.program_prep_items
       set due_date = public.prep_due_date(due_anchor, due_offset_days, new.recruit_start_date, new.start_date)
     where program_id = new.id and not due_manual and deleted_at is null;
  end if;

  if new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date then
    v_reasons := v_reasons || '일정'::text;
  end if;
  if new.total_price is distinct from old.total_price then
    v_reasons := v_reasons || '금액'::text;
  end if;
  if new.capacity is distinct from old.capacity then
    v_reasons := v_reasons || '정원'::text;
  end if;
  if new.name is distinct from old.name or new.season is distinct from old.season or new.country is distinct from old.country then
    v_reasons := v_reasons || '캠프명·국가'::text;
  end if;
  if new.slug is distinct from old.slug then
    v_reasons := v_reasons || '신청 링크'::text;
  end if;
  if cardinality(v_reasons) > 0 then
    perform public.flag_prep_recheck(new.id, array_to_string(v_reasons, ', '));
  end if;

  -- 커미션 고지일을 기록하면 고지 할 일도 완료
  if new.commission_notice_sent_on is distinct from old.commission_notice_sent_on then
    update public.program_prep_items
       set status = case when new.commission_notice_sent_on is null then 'todo' else 'done' end,
           distributed_on = new.commission_notice_sent_on
     where program_id = new.id and template_key = 'commission_notice' and deleted_at is null
       and status <> 'not_applicable';
  end if;
  return null;
end;
$$;

create trigger prep_follow_program after update on public.programs
  for each row execute function public.programs_after_update_prep();

create or replace function public.payment_rules_after_change_prep()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.amount is not distinct from old.amount
     and new.label is not distinct from old.label
     and new.due_rule_type is not distinct from old.due_rule_type
     and new.due_fixed_date is not distinct from old.due_fixed_date
     and new.due_offset_days is not distinct from old.due_offset_days then
    return null;
  end if;
  perform public.flag_prep_recheck(coalesce(new.program_id, old.program_id), '납부 금액·기한');
  return null;
end;
$$;

create trigger prep_follow_payment_rules after insert or update or delete on public.program_payment_rules
  for each row execute function public.payment_rules_after_change_prep();

-- ---------------------------------------------------------------------------
-- 진행 단계 규칙
-- ---------------------------------------------------------------------------
create or replace function public.guard_prep_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_missing text[];
begin
  if tg_op = 'INSERT' then
    if new.kind = 'material' and new.status not in ('requested', 'producing', 'not_applicable') then
      raise exception '새 준비물은 요청서 작성 단계에서 시작합니다' using errcode = 'P0001';
    end if;
    new.checklist := '{}'::jsonb;
    new.needs_recheck := false;
    return new;
  end if;

  -- 커미션 고지 마감은 협약서 고정값
  if new.template_key = 'commission_notice'
     and (new.due_manual or new.due_anchor <> 'start' or new.due_offset_days <> -30 or new.kind <> 'task') then
    raise exception '커미션 고지 기한(출국 30일 전)은 협약서로 정해져 있어 바꿀 수 없습니다' using errcode = 'P0001';
  end if;
  if new.kind is distinct from old.kind or new.template_key is distinct from old.template_key then
    raise exception '준비물 종류는 바꿀 수 없습니다' using errcode = 'P0001';
  end if;
  -- 커미션 고지 완료는 [납부 규칙]의 고지일 기록으로만(직접 바꾸면 고지일과 어긋난다). "해당 없음"은 허용
  if new.template_key = 'commission_notice' and new.status is distinct from old.status
     and pg_trigger_depth() = 1
     and new.status <> 'not_applicable' and old.status <> 'not_applicable' then
    raise exception '커미션 고지 완료는 [2. 납부 규칙]에서 고지일을 기록하면 자동으로 바뀝니다' using errcode = 'P0001';
  end if;

  -- 교차 검수 체크는 검수 단계에서만 바꾼다(새 버전 등록 시 초기화 예외)
  if new.checklist is distinct from old.checklist
     and new.status <> 'reviewing'
     and new.checklist <> '{}'::jsonb then
    raise exception '교차 검수 체크는 검수 단계에서만 할 수 있습니다' using errcode = 'P0001';
  end if;

  if new.kind = 'material' and new.status is distinct from old.status then
    -- 검수는 결과물이 있어야 시작
    if new.status = 'reviewing' and new.result_url is null then
      raise exception '결과물 링크를 먼저 등록해 주세요' using errcode = 'P0001';
    end if;

    if new.status = 'approved' then
      if old.status <> 'reviewing' then
        raise exception '교차 검수를 마친 뒤 확인 완료할 수 있습니다' using errcode = 'P0001';
      end if;
      select array_agg(k) into v_missing
        from unnest(public.prep_review_keys()) k
       where coalesce((new.checklist ->> k)::boolean, false) is not true;
      if v_missing is not null then
        raise exception '교차 검수 항목을 모두 체크해야 확인 완료할 수 있습니다' using errcode = 'P0001';
      end if;
      -- 교차 검수: 만든 사람이 아닌 사람이 확인(관리자 예외)
      if new.owner_id is not null and new.owner_id = (select auth.uid()) and not public.is_admin() then
        raise exception '제작 담당자가 아닌 사람이 확인해야 합니다(교차 검수)' using errcode = '42501';
      end if;
      new.approved_by := (select auth.uid());
      new.approved_at := now();
      new.needs_recheck := false;
      new.recheck_reason := null;
    end if;

    if new.status = 'distributed' then
      if old.status <> 'approved' then
        raise exception '확인 완료 후에 배포할 수 있습니다' using errcode = 'P0001';
      end if;
      new.distributed_on := coalesce(new.distributed_on, public.kst_today());
    end if;
  end if;

  if new.kind = 'task' and new.status = 'done' and old.status <> 'done' then
    new.distributed_on := coalesce(new.distributed_on, public.kst_today());
  end if;
  if new.kind = 'task' and new.status = 'todo' and old.status = 'done' and new.template_key <> 'commission_notice' then
    new.distributed_on := null;
  end if;

  -- 재확인 표시는 다시 확인 완료하거나 "해당 없음"일 때만 풀린다
  if old.needs_recheck and not new.needs_recheck
     and not (new.status = 'approved' and old.status <> 'approved')
     and new.status <> 'not_applicable' then
    new.needs_recheck := true;
    new.recheck_reason := old.recheck_reason;
  end if;
  if new.status = 'not_applicable' then
    new.needs_recheck := false;
    new.recheck_reason := null;
  end if;
  return new;
end;
$$;

create trigger guard_prep_item before insert or update on public.program_prep_items
  for each row execute function public.guard_prep_item();

-- 새 버전 등록: 버전 +1, 결과물 교체, 검수 체크 초기화, 교차 검수 단계로
create or replace function public.add_prep_version(p_item_id uuid, p_url text, p_note text default null)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_version integer;
begin
  if p_url is null or p_url !~ '^https?://' then
    raise exception '결과물 링크는 http(s)://로 시작해야 합니다' using errcode = 'P0001';
  end if;
  update public.program_prep_items
     set version = version + 1,
         result_url = p_url,
         checklist = '{}'::jsonb,
         status = 'reviewing',
         approved_by = null,
         approved_at = null
   where id = p_item_id and kind = 'material' and deleted_at is null and status <> 'not_applicable'
  returning version into v_version;
  if v_version is null then
    raise exception '준비물을 찾을 수 없습니다' using errcode = 'P0001';
  end if;
  insert into public.program_prep_versions (item_id, version, url, note, created_by)
  values (p_item_id, v_version, p_url, nullif(trim(p_note), ''), (select auth.uid()));
  return v_version;
end;
$$;

-- 위 update는 status를 reviewing으로 바로 바꾸므로 "결과물 먼저" 규칙과 충돌하지 않는다.

-- ---------------------------------------------------------------------------
-- 준비율(캠프별) — 필수 항목 기준
-- 완료: 확인 완료·배포 완료·완료·해당 없음 (재확인 필요는 미완료)
-- ---------------------------------------------------------------------------
create or replace function public.prep_item_complete(p_status text, p_needs_recheck boolean)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status in ('approved', 'distributed', 'done', 'not_applicable') and not p_needs_recheck;
$$;

create or replace function public.program_prep_progress()
returns table (
  program_id uuid,
  required_total bigint,
  required_done bigint,
  overdue bigint,
  due_soon bigint,
  needs_recheck bigint,
  gate_pending bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select i.program_id,
    count(*) filter (where i.required),
    count(*) filter (where i.required and public.prep_item_complete(i.status, i.needs_recheck)),
    count(*) filter (where not public.prep_item_complete(i.status, i.needs_recheck) and i.status <> 'not_applicable'
      and i.due_date < public.kst_today()),
    count(*) filter (where not public.prep_item_complete(i.status, i.needs_recheck) and i.status <> 'not_applicable'
      and i.due_date between public.kst_today() and public.kst_today() + 7),
    count(*) filter (where i.needs_recheck),
    count(*) filter (where i.gate_open and not public.prep_item_complete(i.status, i.needs_recheck))
  from public.program_prep_items i
  where i.deleted_at is null
  group by i.program_id;
$$;

-- ---------------------------------------------------------------------------
-- 모집 시작 경고: 모집 전 필수 준비물이 끝나지 않았으면 "모집 중"으로 바꿀 수 없다.
-- 관리자는 같은 저장에서 사유(prep_override_reason)를 적으면 진행 가능.
-- ---------------------------------------------------------------------------
create or replace function public.guard_program_open()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pending integer;
begin
  if new.prep_override_reason is distinct from old.prep_override_reason
     and (select auth.uid()) is not null and not public.is_admin() then
    raise exception '준비사항 경고 사유는 관리자만 적을 수 있습니다' using errcode = '42501';
  end if;
  -- 로그인 사용자의 요청에만 적용(시드·서버 작업 제외)
  if new.status = 'open' and old.status <> 'open' and (select auth.uid()) is not null then
    select count(*) into v_pending
      from public.program_prep_items i
     where i.program_id = new.id and i.deleted_at is null and i.gate_open
       and not public.prep_item_complete(i.status, i.needs_recheck);
    if v_pending > 0
       and not (new.prep_override_reason is distinct from old.prep_override_reason
                and nullif(trim(new.prep_override_reason), '') is not null) then
      raise exception 'PREP_INCOMPLETE:%', v_pending using errcode = 'P0001',
        hint = '모집 전에 끝내야 할 준비물이 남아 있습니다';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_program_open before update of status, prep_override_reason on public.programs
  for each row execute function public.guard_program_open();

-- 새로 만들 때 바로 "모집 중"은 준비물이 없으므로 허용하지 않는다(만든 뒤 준비사항을 확인하고 바꾼다)
create or replace function public.guard_program_insert_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if new.status = 'open' and nullif(trim(new.prep_override_reason), '') is null and exists (
    select 1 from public.prep_item_templates where active and gate_open
  ) then
    raise exception 'PREP_INCOMPLETE:new' using errcode = 'P0001',
      hint = '캠프를 만든 뒤 준비사항을 확인하고 모집을 시작해 주세요';
  end if;
  if nullif(trim(new.prep_override_reason), '') is not null and not public.is_admin() then
    raise exception '준비사항 경고 사유는 관리자만 적을 수 있습니다' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_program_insert_status before insert on public.programs
  for each row execute function public.guard_program_insert_status();

-- 기존 캠프에도 준비물 생성
select public.generate_prep_items(id) from public.programs where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 권한·감사
-- ---------------------------------------------------------------------------
alter table public.prep_item_templates enable row level security;
alter table public.program_prep_items enable row level security;
alter table public.program_prep_versions enable row level security;
revoke all on public.prep_item_templates, public.program_prep_items, public.program_prep_versions from anon;

create policy prep_templates_select on public.prep_item_templates for select to authenticated
  using (public.is_staff_or_admin());
create policy prep_templates_write on public.prep_item_templates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 준비물은 내부 업무(현지 팀 열람 없음)
create policy prep_items_select on public.program_prep_items for select to authenticated
  using (public.is_staff_or_admin());
create policy prep_items_insert on public.program_prep_items for insert to authenticated
  with check (public.is_staff_or_admin());
create policy prep_items_update on public.program_prep_items for update to authenticated
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

create policy prep_versions_select on public.program_prep_versions for select to authenticated
  using (public.is_staff_or_admin());
create policy prep_versions_insert on public.program_prep_versions for insert to authenticated
  with check (public.is_staff_or_admin());

-- 삭제는 하지 않는다(해당 없음 또는 deleted_at)
revoke delete on public.program_prep_items, public.program_prep_versions from authenticated;

create trigger set_updated_at before update on public.prep_item_templates
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.program_prep_items
  for each row execute function public.set_updated_at();

create trigger audit after insert or update or delete on public.prep_item_templates
  for each row execute function public.audit_row();
create trigger audit after insert or update or delete on public.program_prep_items
  for each row execute function public.audit_row();

revoke execute on function
  public.prep_review_keys(),
  public.prep_due_date(text, integer, date, date),
  public.generate_prep_items(uuid),
  public.programs_after_insert_prep(),
  public.flag_prep_recheck(uuid, text),
  public.programs_after_update_prep(),
  public.payment_rules_after_change_prep(),
  public.guard_prep_item(),
  public.add_prep_version(uuid, text, text),
  public.prep_item_complete(text, boolean),
  public.program_prep_progress(),
  public.guard_program_open(),
  public.guard_program_insert_status()
from public, anon, authenticated;

grant execute on function
  public.prep_review_keys(),
  public.prep_due_date(text, integer, date, date),
  public.prep_item_complete(text, boolean),
  public.add_prep_version(uuid, text, text),
  public.program_prep_progress()
to authenticated;
