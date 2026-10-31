import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Badge, Card, EmptyState, Input, PageHeader, Select, Spinner } from '../../components/ui'
import { formatPhone } from '../../domain/phone'
import { formatKstWithDay } from '../../lib/datetime'
import { CONSULT_METHOD, LEAD_STATUS } from '../../lib/labels'
import { supabase } from '../../lib/supabase'
import { activeConsultation, EMPTY_FILTERS, listLeads, type LeadFilters, type LeadRow } from './api'

type Option = { id: string; name: string }

export function LeadsListPage() {
  const [params, setParams] = useSearchParams()
  const filters: LeadFilters = useMemo(
    () => ({
      ...EMPTY_FILTERS,
      status: params.get('status') ?? '',
      partnerId: params.get('partner') ?? '',
      programId: params.get('program') ?? '',
      assigneeId: params.get('assignee') ?? '',
      from: params.get('from') ?? '',
      to: params.get('to') ?? '',
      query: params.get('q') ?? '',
      unconfirmedOnly: params.get('unconfirmed') === '1',
    }),
    [params],
  )
  const [query, setQuery] = useState(filters.query)
  const [rows, setRows] = useState<LeadRow[] | null>(null)
  const [error, setError] = useState('')
  const [partners, setPartners] = useState<Option[]>([])
  const [programs, setPrograms] = useState<Option[]>([])
  const [staff, setStaff] = useState<Option[]>([])

  useEffect(() => {
    Promise.all([
      supabase.from('partners').select('id, name').is('deleted_at', null).order('name'),
      supabase.from('programs').select('id, name').is('deleted_at', null).order('start_date', { ascending: false }),
      supabase.from('staff_profiles').select('id, name').eq('active', true).neq('role', 'viewer').order('name'),
    ]).then(([p, pr, s]) => {
      setPartners(p.data ?? [])
      setPrograms(pr.data ?? [])
      setStaff(s.data ?? [])
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    listLeads(filters)
      .then((r) => !cancelled && setRows(r))
      .catch(() => !cancelled && setError('상담 신청 목록을 불러오지 못했습니다.'))
    return () => {
      cancelled = true
    }
  }, [filters])

  // 검색어는 입력이 멈추면 반영
  useEffect(() => {
    const t = setTimeout(() => {
      if (query !== filters.query) setFilter('q', query)
    }, 350)
    return () => clearTimeout(t)
  })

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const r of rows ?? []) c[r.status] = (c[r.status] ?? 0) + 1
    return c
  }, [rows])

  return (
    <>
      <PageHeader title="상담 신청" description="학부모 상담 신청을 확인하고 연락·상담·등록까지 진행 상황을 관리합니다." />

      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="상태 필터">
        {[{ value: '', label: '전체' }, ...Object.entries(LEAD_STATUS).map(([value, s]) => ({ value, label: s.label }))].map((s) => (
          <button
            key={s.value}
            type="button"
            aria-pressed={filters.status === s.value}
            onClick={() => setFilter('status', s.value)}
            className={`rounded-full px-3 py-1.5 text-sm ring-1 ${
              filters.status === s.value ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-300'
            }`}
          >
            {s.label}
            {s.value && !filters.status && counts[s.value] ? ` ${counts[s.value]}` : ''}
          </button>
        ))}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <Input placeholder="자녀·학부모 이름, 전화번호 검색" aria-label="검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Select aria-label="유입 학원" value={filters.partnerId} onChange={(e) => setFilter('partner', e.target.value)}>
          <option value="">모든 학원</option>
          <option value="none">학원 소개 아님</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select aria-label="관심 프로그램" value={filters.programId} onChange={(e) => setFilter('program', e.target.value)}>
          <option value="">모든 프로그램</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select aria-label="담당자" value={filters.assigneeId} onChange={(e) => setFilter('assignee', e.target.value)}>
          <option value="">모든 담당자</option>
          <option value="none">담당자 없음</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="size-4"
            checked={filters.unconfirmedOnly}
            onChange={(e) => setFilter('unconfirmed', e.target.checked ? '1' : '')}
          />
          소개 경로 미확인만
        </label>
        <Input type="date" aria-label="신청일 시작" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} />
        <Input type="date" aria-label="신청일 끝" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!rows && !error && <Spinner />}
      {rows && rows.length === 0 && <EmptyState>조건에 맞는 상담 신청이 없습니다.</EmptyState>}

      <div className="space-y-2">
        {rows?.map((r) => {
          const st = LEAD_STATUS[r.status]
          const c = activeConsultation(r)
          const destroyed = Boolean(r.destroyed_at)
          return (
            <Link key={r.id} to={`/admin/leads/${r.id}`} className="block">
              <Card className="py-4 transition hover:ring-brand-600/40">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {st && <Badge tone={st.tone}>{st.label}</Badge>}
                      <p className="font-semibold text-slate-900">
                        {destroyed ? '(파기됨)' : `${r.student_name} · ${r.student_grade ?? '-'}`}
                      </p>
                      {!destroyed && (
                        <span className="text-sm text-slate-500">
                          {r.parent_name} {formatPhone(r.parent_phone)}
                        </span>
                      )}
                      {!r.attribution_confirmed_at && <Badge tone="amber">소개 경로 미확인</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      신청 {formatKstWithDay(r.created_at)} ·{' '}
                      {r.partner ? `${r.partner.name}${r.contact ? ` ${r.contact.name}` : ''}` : r.source_other ? `기타: ${r.source_other}` : '학원 소개 아님'}
                      {r.interests_programs.length > 0 &&
                        ` · ${r.interests_programs
                          .map((ip) => ip.program?.name)
                          .filter(Boolean)
                          .join(', ')}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 text-sm">
                    {c?.scheduled_at ? (
                      <span className="text-slate-700">상담 {formatKstWithDay(c.scheduled_at)}</span>
                    ) : (
                      <span className="text-slate-400">상담 일정 없음</span>
                    )}
                    {c && (
                      <Badge tone={c.method === 'undecided' ? 'red' : 'gray'}>
                        {c.method === 'undecided' ? '방식 미정' : CONSULT_METHOD[c.method]}
                      </Badge>
                    )}
                    <span className="text-slate-500">담당 {r.assignee?.name ?? '없음'}</span>
                  </div>
                </div>
              </Card>
            </Link>
          )
        })}
      </div>
      {rows && rows.length >= 300 && <p className="mt-3 text-xs text-slate-500">최근 300건까지 표시합니다. 기간·조건으로 좁혀 주세요.</p>}
    </>
  )
}
