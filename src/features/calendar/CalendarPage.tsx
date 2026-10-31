import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Button, Field, PageHeader, Select, Spinner, Tabs } from '../../components/ui'
import { dayHeading, monthGrid, shiftMonth, weekDays } from '../../domain/calendar'
import { addDays } from '../../domain/dates'
import { formatKst, todayKst } from '../../lib/datetime'
import { supabase } from '../../lib/supabase'

export type CalendarItem = {
  kind: string
  date: string
  starts_at: string | null
  title: string
  detail: string | null
  program_id: string | null
  link: string
  critical: boolean
  done: boolean
}

// 종류별 색상 (글자·배경 대비 확보)
export const KINDS: Record<string, { label: string; cls: string; dot: string }> = {
  consultation: { label: '상담', cls: 'bg-blue-50 text-blue-800 ring-blue-200', dot: 'bg-blue-600' },
  payment: { label: '납부 기한', cls: 'bg-amber-50 text-amber-900 ring-amber-200', dot: 'bg-amber-500' },
  program_start: { label: '출국', cls: 'bg-green-50 text-green-800 ring-green-200', dot: 'bg-green-600' },
  program_end: { label: '귀국', cls: 'bg-green-50 text-green-800 ring-green-200', dot: 'bg-green-600' },
  milestone: { label: '프로그램 일정', cls: 'bg-teal-50 text-teal-800 ring-teal-200', dot: 'bg-teal-600' },
  event: { label: '중요 일정', cls: 'bg-violet-50 text-violet-800 ring-violet-200', dot: 'bg-violet-600' },
  prep: { label: '준비물 마감', cls: 'bg-pink-50 text-pink-800 ring-pink-200', dot: 'bg-pink-600' },
  commission: { label: '커미션 지급', cls: 'bg-slate-100 text-slate-800 ring-slate-300', dot: 'bg-slate-600' },
  commission_notice: { label: '커미션 고지', cls: 'bg-slate-100 text-slate-800 ring-slate-300', dot: 'bg-slate-600' },
}
// 필터 묶음(출국·귀국, 커미션 지급·고지는 함께)
const FILTERS: Array<{ key: string; label: string; kinds: string[] }> = [
  { key: 'consultation', label: '상담', kinds: ['consultation'] },
  { key: 'payment', label: '납부 기한', kinds: ['payment'] },
  { key: 'program', label: '출국·귀국', kinds: ['program_start', 'program_end'] },
  { key: 'milestone', label: '프로그램 일정', kinds: ['milestone'] },
  { key: 'event', label: '중요 일정', kinds: ['event'] },
  { key: 'prep', label: '준비물', kinds: ['prep'] },
  { key: 'commission', label: '커미션', kinds: ['commission', 'commission_notice'] },
]

function ItemChip({ item, compact }: { item: CalendarItem; compact?: boolean }) {
  const k = KINDS[item.kind] ?? KINDS.event
  return (
    <Link
      to={item.link}
      title={`${k.label} · ${item.title}${item.detail ? ` · ${item.detail}` : ''}`}
      className={`block truncate rounded px-1.5 py-0.5 text-xs ring-1 ${k.cls} ${item.critical && !item.done ? 'font-semibold ring-red-400' : ''} ${item.done ? 'line-through opacity-60' : ''}`}
    >
      {item.starts_at && `${formatKst(item.starts_at, 'HH:mm')} `}
      {item.title}
      {!compact && item.detail ? ` · ${item.detail}` : ''}
    </Link>
  )
}

export function CalendarPage() {
  const [params, setParams] = useSearchParams()
  const today = todayKst()
  const view = (params.get('view') as 'month' | 'week' | 'day' | null) ?? 'month'
  const date = params.get('date') ?? today
  const [off, setOff] = useState<Set<string>>(new Set())
  const [programId, setProgramId] = useState('')
  const [programs, setPrograms] = useState<Array<{ id: string; name: string; season: string | null }>>([])
  const [items, setItems] = useState<CalendarItem[] | null>(null)

  const range = useMemo(() => {
    if (view === 'month') {
      const g = monthGrid(date.slice(0, 7))
      return { from: g[0][0], to: g[5][6], days: g.flat() }
    }
    if (view === 'week') {
      const w = weekDays(date)
      return { from: w[0], to: w[6], days: w }
    }
    return { from: date, to: date, days: [date] }
  }, [view, date])

  useEffect(() => {
    supabase
      .from('programs')
      .select('id, name, season')
      .is('deleted_at', null)
      .order('start_date', { ascending: false })
      .then(({ data }) => setPrograms(data ?? []))
  }, [])

  useEffect(() => {
    setItems(null)
    supabase.rpc('calendar_items', { p_from: range.from, p_to: range.to }).then(({ data }) => setItems((data ?? []) as CalendarItem[]))
  }, [range.from, range.to])

  const hidden = new Set(FILTERS.filter((f) => off.has(f.key)).flatMap((f) => f.kinds))
  const visible = (items ?? []).filter((i) => !hidden.has(i.kind) && (!programId || i.program_id === programId))
  const byDay = new Map<string, CalendarItem[]>()
  for (const i of visible) byDay.set(i.date, [...(byDay.get(i.date) ?? []), i])
  for (const list of byDay.values()) list.sort((a, b) => (a.starts_at ?? '').localeCompare(b.starts_at ?? '') || Number(b.critical) - Number(a.critical))

  const go = (next: Partial<{ view: string; date: string }>) => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v)
    setParams(p, { replace: true })
  }
  const step = (dir: number) =>
    go({ date: view === 'month' ? `${shiftMonth(date.slice(0, 7), dir)}-01` : addDays(date, view === 'week' ? dir * 7 : dir) })
  const title =
    view === 'month' ? `${Number(date.slice(0, 4))}년 ${Number(date.slice(5, 7))}월` : view === 'week' ? `${dayHeading(range.from)} ~ ${dayHeading(range.to)}` : dayHeading(date)

  return (
    <>
      <PageHeader title="통합 캘린더" description="상담 예약·납부 기한·출국/귀국·프로그램 일정·중요 일정·준비물 마감·커미션 일정을 한 곳에서 봅니다. 일정을 누르면 해당 화면으로 이동합니다." />
      <Tabs
        tabs={[
          { value: 'month', label: '월' },
          { value: 'week', label: '주' },
          { value: 'day', label: '일' },
        ]}
        value={view}
        onChange={(v) => go({ view: v })}
      />
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="secondary" aria-label="이전" onClick={() => step(-1)}>
            ‹
          </Button>
          <h2 className="min-w-40 text-center text-lg font-semibold text-slate-900">{title}</h2>
          <Button variant="secondary" aria-label="다음" onClick={() => step(1)}>
            ›
          </Button>
          <Button variant="ghost" onClick={() => go({ date: today })}>
            오늘
          </Button>
        </div>
        <div className="w-64">
          <Field label="프로그램">
            <Select value={programId} onChange={(e) => setProgramId(e.target.value)}>
              <option value="">전체</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.season ? ` (${p.season})` : ''}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="일정 종류">
        {FILTERS.map((f) => {
          const on = !off.has(f.key)
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={on}
              onClick={() => {
                const next = new Set(off)
                if (on) next.add(f.key)
                else next.delete(f.key)
                setOff(next)
              }}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm ring-1 ${on ? 'bg-white text-slate-800 ring-slate-300' : 'bg-slate-100 text-slate-400 line-through ring-slate-200'}`}
            >
              <span className={`size-2 rounded-full ${KINDS[f.kinds[0]].dot}`} aria-hidden />
              {f.label}
            </button>
          )
        })}
      </div>

      {!items ? (
        <Spinner />
      ) : view === 'month' ? (
        <div className="overflow-x-auto">
          <div className="grid min-w-[760px] grid-cols-7 border-t border-l border-slate-200 bg-white text-sm">
            {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
              <div key={d} className={`border-r border-b border-slate-200 bg-slate-50 px-2 py-1 text-center text-xs ${i === 0 ? 'text-red-600' : i === 6 ? 'text-blue-600' : 'text-slate-500'}`}>
                {d}
              </div>
            ))}
            {range.days.map((d) => {
              const list = byDay.get(d) ?? []
              const inMonth = d.slice(0, 7) === date.slice(0, 7)
              return (
                <div key={d} className={`min-h-28 border-r border-b border-slate-200 p-1 ${inMonth ? '' : 'bg-slate-50 text-slate-400'}`}>
                  <button
                    type="button"
                    onClick={() => go({ view: 'day', date: d })}
                    className={`mb-1 rounded px-1 text-xs ${d === today ? 'bg-brand-600 font-semibold text-white' : ''}`}
                    aria-label={`${dayHeading(d)} 일정 ${list.length}건`}
                  >
                    {Number(d.slice(8))}
                  </button>
                  <div className="space-y-0.5">
                    {list.slice(0, 4).map((i, idx) => (
                      <ItemChip key={idx} item={i} compact />
                    ))}
                    {list.length > 4 && (
                      <button type="button" className="text-xs text-brand-600" onClick={() => go({ view: 'day', date: d })}>
                        +{list.length - 4}건 더
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {range.days.map((d) => {
            const list = byDay.get(d) ?? []
            return (
              <section key={d} aria-label={dayHeading(d)} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <h3 className={`mb-2 text-sm font-semibold ${d === today ? 'text-brand-700' : 'text-slate-800'}`}>
                  {dayHeading(d)} {d === today && '· 오늘'}
                </h3>
                {list.length === 0 ? <p className="text-sm text-slate-400">일정 없음</p> : <div className="space-y-1">{list.map((i, idx) => <ItemChip key={idx} item={i} />)}</div>}
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}
