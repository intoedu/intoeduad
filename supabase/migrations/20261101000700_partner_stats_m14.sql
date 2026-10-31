-- M14: 학원별 통계 (건수만 — 학원에 공유하는 자료에는 학생 개인정보를 넣지 않는다, SPEC 4-1)
-- 기간은 신청일(KST) 기준. 등록은 대기·취소·환불 제외 건수와 확정 건수를 따로 센다.
create or replace function public.partner_stats(p_from date, p_to date)
returns table (
  partner_id uuid,
  partner_name text,
  region text,
  leads bigint,
  consulted bigint,
  registrations bigint,
  confirmed bigint,
  canceled bigint,
  programs jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  with l as (
    select partner_id,
      count(*) as leads,
      count(*) filter (where status in ('consulted', 'converted')
        or exists (select 1 from public.consultations c where c.lead_id = x.id and c.status = 'done')) as consulted
    from public.leads x
    where deleted_at is null and (created_at at time zone 'Asia/Seoul')::date between p_from and p_to
    group by partner_id
  ), r as (
    select r.partner_id, r.program_id, r.status
    from public.registrations r
    where r.deleted_at is null and r.registered_on between p_from and p_to
  ), ra as (
    select partner_id,
      count(*) filter (where status not in ('waitlisted', 'canceled', 'refunded')) as registrations,
      count(*) filter (where status = 'confirmed') as confirmed,
      count(*) filter (where status in ('canceled', 'refunded')) as canceled
    from r group by partner_id
  ), rp as (
    select r.partner_id, jsonb_agg(jsonb_build_object('program', p.name || coalesce(' (' || p.season || ')', ''), 'count', r.n) order by r.n desc) as programs
    from (select partner_id, program_id, count(*) as n from r where status not in ('waitlisted', 'canceled', 'refunded') group by partner_id, program_id) r
    join public.programs p on p.id = r.program_id
    group by r.partner_id
  )
  select pa.id, coalesce(pa.name, '직접·기타'), pa.region,
    coalesce(l.leads, 0), coalesce(l.consulted, 0),
    coalesce(ra.registrations, 0), coalesce(ra.confirmed, 0), coalesce(ra.canceled, 0),
    coalesce(rp.programs, '[]'::jsonb)
  from (select id, name, region from public.partners where deleted_at is null
        union all select null, null, null) pa
  left join l on l.partner_id is not distinct from pa.id
  left join ra on ra.partner_id is not distinct from pa.id
  left join rp on rp.partner_id is not distinct from pa.id
  where public.is_staff_or_admin()
  order by coalesce(ra.registrations, 0) desc, coalesce(l.leads, 0) desc, pa.name;
$$;

revoke execute on function public.partner_stats(date, date) from public, anon, authenticated;
grant execute on function public.partner_stats(date, date) to authenticated;
