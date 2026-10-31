import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Alert, Button, EmptyState, Field, Input, PageHeader, Select, Spinner } from '../../components/ui'
import { shiftMonth } from '../../domain/calendar'
import { addDays } from '../../domain/dates'
import { downloadCsv, toCsv } from '../../lib/csv'
import { todayKst } from '../../lib/datetime'
import { supabase } from '../../lib/supabase'

type Stat = {
  partner_id: string | null
  partner_name: string
  region: string | null
  leads: number
  consulted: number
  registrations: number
  confirmed: number
  canceled: number
  programs: Array<{ program: string; count: number }>
}

function monthRange(month: string) {
  const from = `${month}-01`
  return { from, to: addDays(`${shiftMonth(month, 1)}-01`, -1) }
}

// 학원별 통계 — 상담 신청·상담 완료·등록·확정 건수와 등록 프로그램(소개 수수료 정산 근거). 개인정보 없음.
export function PartnerStatsPage() {
  const thisMonth = todayKst().slice(0, 7)
  const [mode, setMode] = useState<'month' | 'range'>('month')
  const [month, setMonth] = useState(thisMonth)
  const [range, setRange] = useState({ from: `${thisMonth.slice(0, 4)}-01-01`, to: todayKst() })
  const [rows, setRows] = useState<Stat[] | null>(null)
  const period = mode === 'month' ? monthRange(month) : range

  useEffect(() => {
    setRows(null)
    supabase.rpc('partner_stats', { p_from: period.from, p_to: period.to }).then(({ data }) => setRows((data ?? []) as unknown as Stat[]))
  }, [period.from, period.to])

  const visible = (rows ?? []).filter((r) => r.leads + r.registrations + r.canceled > 0)
  const total = visible.reduce(
    (a, r) => ({ leads: a.leads + r.leads, consulted: a.consulted + r.consulted, registrations: a.registrations + r.registrations, confirmed: a.confirmed + r.confirmed }),
    { leads: 0, consulted: 0, registrations: 0, confirmed: 0 },
  )

  return (
    <>
      <PageHeader
        title="학원별 통계"
        description="학원별 상담 신청·상담 완료·등록 건수입니다(상담은 신청일, 등록은 등록일 기준). 학원에 공유할 때도 이 건수 통계만 씁니다."
        actions={
          <Button
            variant="secondary"
            disabled={!visible.length}
            onClick={() =>
              downloadCsv(
                `학원별통계_${period.from}_${period.to}.csv`,
                toCsv(visible, [
                  { header: '학원', value: (r) => r.partner_name },
                  { header: '지역', value: (r) => r.region },
                  { header: '상담 신청', value: (r) => r.leads },
                  { header: '상담 완료', value: (r) => r.consulted },
                  { header: '등록', value: (r) => r.registrations },
                  { header: '등록 확정', value: (r) => r.confirmed },
                  { header: '취소·환불', value: (r) => r.canceled },
                  { header: '등록 프로그램', value: (r) => r.programs.map((p) => `${p.program} ${p.count}명`).join(' / ') },
                ]),
              )
            }
          >
            CSV
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-36">
          <Field label="기간">
            <Select value={mode} onChange={(e) => setMode(e.target.value as 'month' | 'range')}>
              <option value="month">월별</option>
              <option value="range">기간 지정</option>
            </Select>
          </Field>
        </div>
        {mode === 'month' ? (
          <>
            <Button variant="secondary" aria-label="이전 달" onClick={() => setMonth(shiftMonth(month, -1))}>
              ‹
            </Button>
            <div className="w-44">
              <Field label="월">
                <Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
              </Field>
            </div>
            <Button variant="secondary" aria-label="다음 달" onClick={() => setMonth(shiftMonth(month, 1))}>
              ›
            </Button>
          </>
        ) : (
          <>
            <Field label="시작일">
              <Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
            </Field>
            <Field label="종료일">
              <Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
            </Field>
          </>
        )}
      </div>
      <Alert tone="blue">
        합계: 상담 신청 {total.leads}건 · 상담 완료 {total.consulted}건 · 등록 {total.registrations}명 · 등록 확정 {total.confirmed}명
      </Alert>
      <div className="mt-4">
        {!rows ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <EmptyState>이 기간에 신청·등록이 없습니다.</EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2">학원</th>
                  <th className="px-4 py-2 text-right">상담 신청</th>
                  <th className="px-4 py-2 text-right">상담 완료</th>
                  <th className="px-4 py-2 text-right">등록</th>
                  <th className="px-4 py-2 text-right">확정</th>
                  <th className="px-4 py-2 text-right">취소·환불</th>
                  <th className="px-4 py-2">등록 프로그램</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((r) => (
                  <tr key={r.partner_id ?? 'none'} aria-label={`학원 통계 ${r.partner_name}`}>
                    <td className="px-4 py-2">
                      {r.partner_id ? (
                        <Link to={`/admin/partners/${r.partner_id}`} className="text-brand-700 hover:underline">
                          {r.partner_name}
                        </Link>
                      ) : (
                        r.partner_name
                      )}
                      {r.region && <span className="ml-1 text-xs text-slate-500">{r.region}</span>}
                    </td>
                    <td className="px-4 py-2 text-right">{r.leads}</td>
                    <td className="px-4 py-2 text-right">{r.consulted}</td>
                    <td className="px-4 py-2 text-right font-semibold">{r.registrations}</td>
                    <td className="px-4 py-2 text-right">{r.confirmed}</td>
                    <td className="px-4 py-2 text-right">{r.canceled}</td>
                    <td className="px-4 py-2 text-xs text-slate-600">{r.programs.map((p) => `${p.program} ${p.count}명`).join(', ') || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
