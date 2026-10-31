import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { NotesPanel } from '../../components/shared/NotesPanel'
import { Badge, Button, EmptyState, Field, Input, PageHeader, Select, Spinner } from '../../components/ui'
import { formatDateKo } from '../../domain/dates'
import { formatPhone, normalizePhone } from '../../domain/phone'
import { formatWon } from '../../domain/registration'
import { waitingAttribution, type RegistrationStatus } from '../../domain/registrationStatus'
import { downloadCsv, toCsv } from '../../lib/csv'
import { todayKst } from '../../lib/datetime'
import { PASSPORT_STATUS, REGISTRATION_STATUS } from '../../lib/labels'
import { supabase, type Views } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'

type Row = Views<'v_registration_board'>
type ProgramOption = { id: string; name: string; season: string | null }

const STATUS_ORDER = ['received', 'deposit_pending', 'deposit_paid', 'balance_pending', 'confirmed', 'waitlisted', 'canceled', 'refunded']

function programLabel(p: { name: string | null; season: string | null }) {
  return `${p.name ?? ''}${p.season ? ` (${p.season})` : ''}`
}

// 등록생 목록 (직원·관리자) — 현지 팀은 담당 프로그램 전용 화면
export function RegistrationsPage() {
  const { profile } = useAuth()
  if (profile?.role === 'viewer') return <ViewerRegistrations />
  return <OfficeRegistrations />
}

function OfficeRegistrations() {
  const [params, setParams] = useSearchParams()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [programs, setPrograms] = useState<ProgramOption[]>([])
  const [q, setQ] = useState('')
  const programId = params.get('program') ?? ''
  const status = params.get('status') ?? 'active'
  const flag = params.get('flag') ?? ''

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  useEffect(() => {
    supabase
      .from('programs')
      .select('id, name, season')
      .is('deleted_at', null)
      .order('start_date', { ascending: false })
      .then(({ data }) => setPrograms(data ?? []))
  }, [])

  useEffect(() => {
    let query = supabase.from('v_registration_board').select('*').is('destroyed_at', null).order('created_at', { ascending: false }).limit(1000)
    if (programId) query = query.eq('program_id', programId)
    query.then(({ data }) => setRows(data ?? []))
  }, [programId])

  const filtered = useMemo(() => {
    if (!rows) return []
    const term = q.trim()
    const digits = normalizePhone(term)
    return rows.filter((r) => {
      if (status === 'active' && ['canceled', 'refunded'].includes(r.status ?? '')) return false
      if (status !== 'active' && status !== 'all' && r.status !== status) return false
      if (flag === 'passport' && r.passport_status !== 'pending') return false
      if (flag === 'overdue' && !(r.overdue_count && r.overdue_count > 0)) return false
      if (flag === 'attribution' && r.attribution_confirmed_at) return false
      if (term && !(r.student_name_ko?.includes(term) || r.parent_name?.includes(term) || (digits.length >= 4 && r.parent_phone?.includes(digits)))) return false
      return true
    })
  }, [rows, status, flag, q])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const r of rows ?? []) c[r.status ?? ''] = (c[r.status ?? ''] ?? 0) + 1
    return c
  }, [rows])

  async function exportCsv() {
    // 명단 CSV: 여권·건강 정보·커미션 제외
    const ids = filtered.map((r) => r.id!)
    const { data } = await supabase
      .from('registrations')
      .select(
        'id, status, registered_on, student_name_ko, student_name_en, birth_date, gender, school, grade, english_level, parent_name, parent_phone, parent_email, address, emergency_name, emergency_relation, emergency_phone, special_notes, passport_status, programs(name, season), partners(name)',
      )
      .in('id', ids)
    const board = new Map(filtered.map((r) => [r.id, r]))
    const csv = toCsv(data ?? [], [
      { header: '프로그램', value: (r) => (r.programs ? programLabel(r.programs) : '') },
      { header: '상태', value: (r) => REGISTRATION_STATUS[r.status]?.label ?? r.status },
      { header: '신청일', value: (r) => r.registered_on },
      { header: '학생(한글)', value: (r) => r.student_name_ko },
      { header: '영문 이름', value: (r) => r.student_name_en },
      { header: '생년월일', value: (r) => r.birth_date },
      { header: '성별', value: (r) => (r.gender === 'male' ? '남' : r.gender === 'female' ? '여' : '') },
      { header: '학교', value: (r) => r.school },
      { header: '학년', value: (r) => r.grade },
      { header: '영어 수준', value: (r) => r.english_level },
      { header: '학부모', value: (r) => r.parent_name },
      { header: '학부모 연락처', value: (r) => formatPhone(r.parent_phone) },
      { header: '이메일', value: (r) => r.parent_email },
      { header: '주소', value: (r) => r.address },
      { header: '비상 연락처', value: (r) => [r.emergency_name, r.emergency_relation, formatPhone(r.emergency_phone)].filter(Boolean).join(' ') },
      { header: '특이사항', value: (r) => r.special_notes },
      { header: '소개 학원', value: (r) => r.partners?.name ?? '' },
      { header: '여권 제출', value: (r) => PASSPORT_STATUS[r.passport_status] ?? r.passport_status },
      { header: '납부 예정 합계', value: (r) => board.get(r.id)?.total_due ?? 0 },
      { header: '납부 합계', value: (r) => board.get(r.id)?.total_paid ?? 0 },
    ])
    downloadCsv(`등록생_${todayKst()}.csv`, csv)
  }

  return (
    <>
      <PageHeader
        title="등록생"
        description="캠프 등록 신청과 납부 현황입니다. 줄을 누르면 등록생 상세(납부 기록·환불·여권)로 이동합니다."
        actions={
          <Button variant="secondary" onClick={() => void exportCsv()} disabled={!filtered.length}>
            명단 CSV (여권·건강 정보 제외)
          </Button>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="프로그램">
          <Select value={programId} onChange={(e) => set('program', e.target.value)}>
            <option value="">전체</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {programLabel(p)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="상태">
          <Select value={status} onChange={(e) => set('status', e.target.value === 'active' ? '' : e.target.value)}>
            <option value="active">진행 중(취소·환불 제외)</option>
            <option value="all">전체</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {REGISTRATION_STATUS[s].label} {counts[s] ? `(${counts[s]})` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="확인할 것">
          <Select value={flag} onChange={(e) => set('flag', e.target.value)}>
            <option value="">-</option>
            <option value="overdue">납부 기한 지남</option>
            <option value="passport">여권 미제출</option>
            <option value="attribution">소개 경로 확인 필요</option>
          </Select>
        </Field>
        <Field label="검색(이름·번호)">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="학생·학부모 이름 또는 번호 4자리" />
        </Field>
      </div>

      {!rows ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState>조건에 맞는 등록생이 없습니다.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2">학생</th>
                <th className="px-4 py-2">프로그램</th>
                <th className="px-4 py-2">상태</th>
                <th className="px-4 py-2 text-right">납부</th>
                <th className="px-4 py-2">다음 기한</th>
                <th className="px-4 py-2">소개 학원</th>
                <th className="px-4 py-2">여권</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => {
                const st = REGISTRATION_STATUS[r.status ?? '']
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <Link to={`/admin/registrations/${r.id}`} className="font-medium text-brand-700 hover:underline">
                        {r.student_name_ko}
                      </Link>
                      <span className="block text-xs text-slate-500">
                        {r.parent_name} · {formatPhone(r.parent_phone)}
                      </span>
                    </td>
                    <td className="px-4 py-2">{programLabel({ name: r.program_name, season: r.program_season })}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {st && <Badge tone={st.tone}>{st.label}</Badge>}
                        {waitingAttribution(r.status as RegistrationStatus, !!r.core_paid, !!r.attribution_confirmed_at) && (
                          <Badge tone="amber">완납·소개 경로 확인 필요</Badge>
                        )}
                        {!!r.overdue_count && <Badge tone="red">기한 지남 {r.overdue_count}</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      {formatWon(r.total_paid ?? 0)}
                      <span className="block text-xs text-slate-500">/ {formatWon(r.total_due ?? 0)}</span>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{r.next_due_date ? formatDateKo(r.next_due_date) : '-'}</td>
                    <td className="px-4 py-2">{r.partner_name ?? '-'}</td>
                    <td className="px-4 py-2">
                      {r.passport_status === 'pending' ? <Badge tone="amber">미제출</Badge> : PASSPORT_STATUS[r.passport_status ?? ''] ?? '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500">{filtered.length}명</p>
    </>
  )
}

type ViewerRow = {
  id: string
  status: string
  student_name_ko: string | null
  student_name_en: string | null
  birth_date: string | null
  gender: string | null
  school: string | null
  grade: string | null
  english_level: string | null
  parent_name: string | null
  parent_phone: string | null
  emergency_name: string | null
  emergency_relation: string | null
  emergency_phone: string | null
  special_notes: string | null
  health_note: string | null
  passport_status: string
}

// 현지 팀: 담당 프로그램 등록생만 (주소·납부·이메일·상담 정보 없음)
function ViewerRegistrations() {
  const [programs, setPrograms] = useState<ProgramOption[] | null>(null)
  const [programId, setProgramId] = useState('')
  const [rows, setRows] = useState<ViewerRow[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('programs')
      .select('id, name, season')
      .is('deleted_at', null)
      .order('start_date')
      .then(({ data }) => {
        setPrograms(data ?? [])
        if (data?.[0]) setProgramId(data[0].id)
      })
  }, [])

  useEffect(() => {
    if (!programId) return
    supabase.rpc('viewer_list_registrations', { p_program_id: programId }).then(({ data }) => setRows((data ?? []) as ViewerRow[]))
  }, [programId])

  if (!programs) return <Spinner />
  return (
    <>
      <PageHeader title="담당 프로그램 등록생" description="현지 운영에 필요한 학생 정보·비상 연락처·특이사항입니다. 메모를 남기면 본사 직원도 함께 봅니다." />
      {programs.length === 0 ? (
        <EmptyState>담당 프로그램이 없습니다. 본사 관리자에게 배정을 요청해 주세요.</EmptyState>
      ) : (
        <>
          <div className="mb-4 max-w-sm">
            <Field label="프로그램">
              <Select value={programId} onChange={(e) => setProgramId(e.target.value)}>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {programLabel(p)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {!rows ? (
            <Spinner />
          ) : rows.length === 0 ? (
            <EmptyState>등록생이 없습니다.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {rows.map((r) => (
                <li key={r.id} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-slate-900">
                      {r.student_name_ko} <span className="text-sm font-normal text-slate-500">{r.student_name_en}</span>
                    </p>
                    {REGISTRATION_STATUS[r.status] && <Badge tone={REGISTRATION_STATUS[r.status].tone}>{REGISTRATION_STATUS[r.status].label}</Badge>}
                  </div>
                  <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-xs text-slate-500">생년월일·성별</dt>
                      <dd>
                        {r.birth_date ?? '-'} · {r.gender === 'male' ? '남' : r.gender === 'female' ? '여' : '-'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">학교·학년·영어</dt>
                      <dd>{[r.school, r.grade, r.english_level].filter(Boolean).join(' · ') || '-'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">학부모</dt>
                      <dd>
                        {r.parent_name} {formatPhone(r.parent_phone)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">비상 연락처</dt>
                      <dd>{[r.emergency_name, r.emergency_relation, formatPhone(r.emergency_phone)].filter(Boolean).join(' · ') || '-'}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-slate-500">특이사항</dt>
                      <dd className="whitespace-pre-wrap">{r.special_notes ?? '-'}</dd>
                    </div>
                    {r.health_note && (
                      <div className="sm:col-span-3">
                        <dt className="text-xs text-red-600">건강 특이사항</dt>
                        <dd className="whitespace-pre-wrap">{r.health_note}</dd>
                      </div>
                    )}
                  </dl>
                  <Button variant="ghost" className="mt-2" onClick={() => setOpen(open === r.id ? null : r.id)}>
                    {open === r.id ? '메모 닫기' : '메모'}
                  </Button>
                  {open === r.id && <NotesPanel entityType="registration" entityId={r.id} />}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  )
}
