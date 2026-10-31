import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Spinner, Tabs } from '../../components/ui'
import { addDays, formatDateKo, startOfWeek } from '../../domain/dates'
import { formatWon } from '../../domain/registration'
import { downloadCsv, toCsv } from '../../lib/csv'
import { todayKst } from '../../lib/datetime'
import { PAYMENT_KIND, PAYMENT_METHOD, PAYMENT_STATUS, REFUND_REASON } from '../../lib/labels'
import { supabase, type Tables, type Views } from '../../lib/supabase'

type Board = Views<'v_payment_board'>
type ProgramOption = { id: string; name: string; season: string | null }
const label = (p: { name: string | null; season: string | null }) => `${p.name ?? ''}${p.season ? ` (${p.season})` : ''}`

function usePrograms() {
  const [programs, setPrograms] = useState<ProgramOption[]>([])
  useEffect(() => {
    supabase
      .from('programs')
      .select('id, name, season')
      .is('deleted_at', null)
      .order('start_date', { ascending: false })
      .then(({ data }) => setPrograms(data ?? []))
  }, [])
  return programs
}

// 납부 일정 (전체 프로그램 통합) — 기한 지남 자동 판정
function Schedules() {
  const programs = usePrograms()
  const [rows, setRows] = useState<Board[] | null>(null)
  const [programId, setProgramId] = useState('')
  const [range, setRange] = useState<'overdue' | 'week' | 'month' | 'unpaid' | 'all'>('overdue')
  const today = todayKst()

  useEffect(() => {
    let q = supabase.from('v_payment_board').select('*').is('canceled_at', null).is('destroyed_at', null).order('due_date').limit(2000)
    if (programId) q = q.eq('program_id', programId)
    q.then(({ data }) => setRows(data ?? []))
  }, [programId])

  const filtered = useMemo(() => {
    const weekStart = startOfWeek(today)
    const weekEnd = addDays(weekStart, 6)
    const month = today.slice(0, 7)
    return (rows ?? []).filter((r) => {
      const unpaid = r.status !== 'paid'
      if (['canceled', 'refunded', 'waitlisted'].includes(r.registration_status ?? '')) return false
      if (range === 'overdue') return r.status === 'overdue'
      if (range === 'week') return unpaid && r.due_date! >= weekStart && r.due_date! <= weekEnd
      if (range === 'month') return r.due_date!.startsWith(month)
      if (range === 'unpaid') return unpaid
      return true
    })
  }, [rows, range, today])

  const due = filtered.reduce((a, r) => a + (r.amount_due ?? 0), 0)
  const paid = filtered.reduce((a, r) => a + (r.paid_amount ?? 0), 0)

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="기간">
          {(
            [
              ['overdue', '기한 지남'],
              ['week', '이번 주 기한'],
              ['month', '이번 달 기한'],
              ['unpaid', '미납 전체'],
              ['all', '전체'],
            ] as const
          ).map(([v, l]) => (
            <Button key={v} variant={range === v ? 'primary' : 'secondary'} aria-pressed={range === v} onClick={() => setRange(v)}>
              {l}
            </Button>
          ))}
        </div>
        <div className="w-64">
          <Field label="프로그램">
            <Select value={programId} onChange={(e) => setProgramId(e.target.value)}>
              <option value="">전체</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {label(p)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button
          variant="secondary"
          disabled={!filtered.length}
          onClick={() =>
            downloadCsv(
              `납부현황_${today}.csv`,
              toCsv(filtered, [
                { header: '프로그램', value: (r) => label({ name: r.program_name, season: r.program_season }) },
                { header: '학생', value: (r) => r.student_name_ko },
                { header: '학부모', value: (r) => r.parent_name },
                { header: '항목', value: (r) => r.label },
                { header: '구분', value: (r) => PAYMENT_KIND[r.kind ?? ''] },
                { header: '기한', value: (r) => r.due_date },
                { header: '청구액', value: (r) => r.amount_due },
                { header: '납부액', value: (r) => r.paid_amount },
                { header: '상태', value: (r) => PAYMENT_STATUS[r.status ?? '']?.label },
              ]),
            )
          }
        >
          CSV
        </Button>
      </div>
      {!rows ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState>해당하는 납부 일정이 없습니다.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2">기한</th>
                <th className="px-4 py-2">학생</th>
                <th className="px-4 py-2">프로그램</th>
                <th className="px-4 py-2">항목</th>
                <th className="px-4 py-2 text-right">납부 / 청구</th>
                <th className="px-4 py-2">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => {
                const st = PAYMENT_STATUS[r.status ?? '']
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-2 whitespace-nowrap">{formatDateKo(r.due_date!)}</td>
                    <td className="px-4 py-2">
                      <Link to={`/admin/registrations/${r.registration_id}`} className="text-brand-700 hover:underline">
                        {r.student_name_ko}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{label({ name: r.program_name, season: r.program_season })}</td>
                    <td className="px-4 py-2">{r.label}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      {formatWon(r.paid_amount ?? 0)} / {formatWon(r.amount_due ?? 0)}
                    </td>
                    <td className="px-4 py-2">{st && <Badge tone={st.tone}>{st.label}</Badge>}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-slate-50 text-sm font-medium">
              <tr>
                <td className="px-4 py-2" colSpan={4}>
                  합계 {filtered.length}건
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {formatWon(paid)} / {formatWon(due)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  )
}

type PaymentRow = Tables<'payments'> & {
  payment_schedules: { label: string; registration_id: string; registrations: { student_name_ko: string | null; programs: { id: string; name: string; season: string | null } | null } | null } | null
}

// 납부 내역 — 월별·프로그램별 합계
function Received() {
  const [month, setMonth] = useState(todayKst().slice(0, 7))
  const [rows, setRows] = useState<PaymentRow[] | null>(null)

  useEffect(() => {
    const [y, m] = month.split('-').map(Number)
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
    supabase
      .from('payments')
      .select('*, payment_schedules(label, registration_id, registrations(student_name_ko, programs(id, name, season)))')
      .eq('status', 'confirmed')
      .gte('paid_at', `${month}-01`)
      .lt('paid_at', next)
      .order('paid_at')
      .then(({ data }) => setRows((data ?? []) as PaymentRow[]))
  }, [month])

  const byProgram = useMemo(() => {
    const m = new Map<string, { name: string; total: number; count: number }>()
    for (const r of rows ?? []) {
      const p = r.payment_schedules?.registrations?.programs
      const key = p?.id ?? '-'
      const cur = m.get(key) ?? { name: p ? label(p) : '-', total: 0, count: 0 }
      cur.total += r.amount
      cur.count += 1
      m.set(key, cur)
    }
    return [...m.values()].sort((a, b) => b.total - a.total)
  }, [rows])
  const total = byProgram.reduce((a, x) => a + x.total, 0)

  return (
    <>
      <div className="mb-4 w-48">
        <Field label="월">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </Field>
      </div>
      {!rows ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <Card>
            <p className="mb-2 font-semibold text-slate-900">
              {month} 납부 합계 <span className="text-brand-700">{formatWon(total)}</span>
            </p>
            {byProgram.length === 0 ? (
              <p className="text-sm text-slate-500">이 달에 기록된 납부가 없습니다.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {byProgram.map((p) => (
                  <li key={p.name} className="flex justify-between py-2">
                    <span>
                      {p.name} <span className="text-xs text-slate-500">{p.count}건</span>
                    </span>
                    <span className="font-medium">{formatWon(p.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {rows.length > 0 && (
            <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2">납부일</th>
                    <th className="px-4 py-2">학생</th>
                    <th className="px-4 py-2">항목</th>
                    <th className="px-4 py-2">수단</th>
                    <th className="px-4 py-2 text-right">금액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2">{formatDateKo(r.paid_at)}</td>
                      <td className="px-4 py-2">
                        <Link to={`/admin/registrations/${r.payment_schedules?.registration_id}`} className="text-brand-700 hover:underline">
                          {r.payment_schedules?.registrations?.student_name_ko ?? '(파기됨)'}
                        </Link>
                      </td>
                      <td className="px-4 py-2">{r.payment_schedules?.label}</td>
                      <td className="px-4 py-2">{PAYMENT_METHOD[r.method]}</td>
                      <td className="px-4 py-2 text-right">{formatWon(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  )
}

type RefundRow = Tables<'refunds'> & { registrations: { student_name_ko: string | null; programs: { name: string; season: string | null } | null } | null }

function Refunds() {
  const [rows, setRows] = useState<RefundRow[] | null>(null)
  useEffect(() => {
    supabase
      .from('refunds')
      .select('*, registrations(student_name_ko, programs(name, season))')
      .order('processed_at', { nullsFirst: true })
      .order('created_at', { ascending: false })
      .then(({ data }) => setRows((data ?? []) as RefundRow[]))
  }, [])
  if (!rows) return <Spinner />
  if (rows.length === 0) return <EmptyState>환불 건이 없습니다.</EmptyState>
  return (
    <ul className="space-y-2">
      {rows.map((f) => (
        <li key={f.id}>
          <Link to={`/admin/registrations/${f.registration_id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
            <span className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone={f.processed_at ? 'green' : 'amber'}>{f.processed_at ? '환불 완료' : '환불 대기'}</Badge>
              <span className="font-medium">{f.registrations?.student_name_ko ?? '(파기됨)'}</span>
              <span className="text-slate-500">{f.registrations?.programs ? label(f.registrations.programs) : ''}</span>
              <span className="text-slate-500">· {REFUND_REASON[f.reason_type]}</span>
            </span>
            <span className="text-sm">
              {f.final_amount !== null ? `확정 ${formatWon(f.final_amount)}` : f.expected_amount !== null ? `예상 ${formatWon(f.expected_amount)}` : '금액 결정 필요'}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function PaymentsPage() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as 'schedules' | 'received' | 'refunds' | null) ?? 'schedules'
  return (
    <>
      <PageHeader title="납부·환불" description="모든 프로그램의 납부 기한과 납부 내역, 환불 처리 현황입니다. 납부 기록은 등록생 상세에서 합니다." />
      <Tabs
        tabs={[
          { value: 'schedules', label: '납부 일정' },
          { value: 'received', label: '월별 납부 합계' },
          { value: 'refunds', label: '환불' },
        ]}
        value={tab}
        onChange={(t) => setParams(t === 'schedules' ? {} : { tab: t }, { replace: true })}
      />
      {tab === 'schedules' ? <Schedules /> : tab === 'received' ? <Received /> : <Refunds />}
    </>
  )
}
