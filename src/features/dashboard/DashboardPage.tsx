import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Alert, Badge, Card, PageHeader, Spinner } from '../../components/ui'
import { ddayLabel, dayHeading } from '../../domain/calendar'
import { addDays } from '../../domain/dates'
import { formatKst, todayKst } from '../../lib/datetime'
import { PROGRAM_STATUS } from '../../lib/labels'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import type { CalendarItem } from '../calendar/CalendarPage'

type Summary = {
  new_leads: number
  undecided_consultations: number
  payments_due_week: number
  payments_overdue: number
  commissions_overdue: number
  destruction_pending: number
  destruction_overdue: number
  refunds_pending: number
  passport_missing: Array<{ program_id: string; program: string; count: number; deadline: string }>
  enrollment: Array<{ program_id: string; program: string; status: string; capacity: number | null; enrolled: number; waitlisted: number }>
  partner_top: Array<{ partner: string; leads: number }>
}
type DDay = { kind: string; date: string; title: string; link: string; critical: boolean; overdue: boolean }

function Stat({ title, value, to, tone, hint }: { title: string; value: number; to: string; tone?: 'red' | 'amber'; hint?: string }) {
  return (
    <Link to={to} className="block">
      <Card className={`h-full hover:bg-slate-50 ${tone === 'red' && value > 0 ? 'ring-red-300' : tone === 'amber' && value > 0 ? 'ring-amber-300' : ''}`}>
        <p className="text-sm text-slate-600">{title}</p>
        <p className={`mt-1 text-3xl font-bold ${tone === 'red' && value > 0 ? 'text-red-600' : tone === 'amber' && value > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{value}</p>
        {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      </Card>
    </Link>
  )
}

function Section({ title, to, children }: { title: string; to?: string; children: ReactNode }) {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        {to && (
          <Link to={to} className="text-sm text-brand-600 hover:underline">
            전체 보기
          </Link>
        )}
      </div>
      {children}
    </Card>
  )
}

function DDayList({ items, today }: { items: DDay[]; today: string }) {
  if (items.length === 0) return <p className="text-sm text-slate-500">다가오는 중요 일정이 없습니다.</p>
  return (
    <ul className="space-y-1.5" aria-label="D-Day">
      {items.slice(0, 15).map((d, i) => {
        const near = !d.overdue && d.date <= addDays(today, 7)
        return (
          <li key={i}>
            <Link to={d.link} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 ${d.overdue ? 'bg-red-50' : near ? 'bg-amber-50' : ''}`}>
              <Badge tone={d.overdue ? 'red' : near ? 'amber' : 'gray'}>{ddayLabel(d.date, today)}</Badge>
              <span className={`truncate ${d.critical ? 'font-semibold' : ''}`}>{d.title}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

export function DashboardPage() {
  const { profile } = useAuth()
  const isViewer = profile?.role === 'viewer'
  const today = todayKst()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [dday, setDday] = useState<DDay[] | null>(null)
  const [consults, setConsults] = useState<CalendarItem[]>([])

  useEffect(() => {
    supabase.rpc('dday_items', { p_days: 60 }).then(({ data }) => setDday((data ?? []) as DDay[]))
    if (isViewer) return
    supabase.rpc('dashboard_summary').then(({ data }) => setSummary(data as unknown as Summary))
    supabase
      .rpc('calendar_items', { p_from: today, p_to: addDays(today, 6) })
      .then(({ data }) => setConsults(((data ?? []) as CalendarItem[]).filter((i) => i.kind === 'consultation' && !i.done).sort((a, b) => (a.starts_at ?? '').localeCompare(b.starts_at ?? ''))))
  }, [isViewer, today])

  if (isViewer) {
    return (
      <>
        <PageHeader title="대시보드" description={profile ? `${profile.name}님, 안녕하세요. 담당 프로그램의 일정입니다.` : undefined} />
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="다가오는 일정 (D-Day)">{dday ? <DDayList items={dday} today={today} /> : <Spinner />}</Section>
          <Section title="담당 프로그램 등록생" to="/admin/registrations">
            <p className="text-sm text-slate-600">학생 정보·비상 연락처·특이사항은 [등록생] 메뉴에서 확인하세요.</p>
          </Section>
        </div>
      </>
    )
  }

  if (!summary || !dday) return <Spinner />
  const warnings = [
    summary.payments_overdue > 0 && { text: `납부 기한이 지난 건 ${summary.payments_overdue}건`, to: '/admin/payments' },
    summary.commissions_overdue > 0 && { text: `지급 예정일이 지난 커미션 ${summary.commissions_overdue}건`, to: '/admin/commissions' },
    summary.destruction_overdue > 0 && { text: `파기 예정일이 지났는데 승인하지 않은 개인정보 ${summary.destruction_overdue}건`, to: '/admin/destruction' },
  ].filter(Boolean) as Array<{ text: string; to: string }>

  return (
    <>
      <PageHeader title="대시보드" description={profile ? `${profile.name}님, 안녕하세요. 오늘은 ${dayHeading(today)}입니다.` : undefined} />
      <div className="space-y-4">
        {warnings.length > 0 && (
          <Alert tone="red">
            <p className="font-semibold">먼저 처리해야 할 일</p>
            <ul className="mt-1 list-disc pl-5">
              {warnings.map((w) => (
                <li key={w.text}>
                  <Link to={w.to} className="underline">
                    {w.text}
                  </Link>
                </li>
              ))}
            </ul>
          </Alert>
        )}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat title="신규 상담 신청(미처리)" value={summary.new_leads} to="/admin/leads?status=new" tone="amber" />
          <Stat title="상담 방식 미정" value={summary.undecided_consultations} to="/admin/leads" tone="amber" hint="예약된 상담 중 전화/화상 미지정" />
          <Stat title="이번 주 납부 기한" value={summary.payments_due_week} to="/admin/payments" />
          <Stat title="기한 지난 납부" value={summary.payments_overdue} to="/admin/payments" tone="red" />
          <Stat title="환불 처리 대기" value={summary.refunds_pending} to="/admin/payments?tab=refunds" tone="amber" />
          <Stat title="커미션 지급 지연" value={summary.commissions_overdue} to="/admin/commissions" tone="red" />
          <Stat title="개인정보 파기 승인 대기" value={summary.destruction_pending} to="/admin/destruction" tone={summary.destruction_overdue ? 'red' : 'amber'} />
          <Stat title="여권 미제출" value={summary.passport_missing.reduce((a, p) => a + p.count, 0)} to="/admin/registrations?flag=passport" tone="amber" />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="중요 일정 D-Day" to="/admin/events">
            <DDayList items={dday} today={today} />
          </Section>
          <Section title="오늘·이번 주 상담" to="/admin/calendar?view=week">
            {consults.length === 0 ? (
              <p className="text-sm text-slate-500">예정된 상담이 없습니다.</p>
            ) : (
              <ul className="space-y-1.5">
                {consults.slice(0, 12).map((c, i) => (
                  <li key={i}>
                    <Link to={c.link} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 ${c.date === today ? 'bg-blue-50' : ''}`}>
                      <span className="w-32 shrink-0 text-xs text-slate-500">
                        {dayHeading(c.date)} {c.starts_at ? formatKst(c.starts_at, 'HH:mm') : ''}
                      </span>
                      <span className="truncate">{c.title.replace('상담 · ', '')}</span>
                      {c.critical ? <Badge tone="amber">방식 미정</Badge> : <Badge>{c.detail}</Badge>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="여권 미제출 (발권 일정이 가까운 순)" to="/admin/registrations?flag=passport">
            {summary.passport_missing.length === 0 ? (
              <p className="text-sm text-slate-500">미제출 등록생이 없습니다.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {summary.passport_missing.map((p) => (
                  <li key={p.program_id} className="flex items-center justify-between gap-2">
                    <Link to={`/admin/registrations?program=${p.program_id}&flag=passport`} className="truncate text-brand-700 hover:underline">
                      {p.program}
                    </Link>
                    <span className="shrink-0">
                      <Badge tone={p.deadline <= addDays(today, 14) ? 'red' : 'amber'}>{p.count}명</Badge>
                      <span className="ml-2 text-xs text-slate-500">{ddayLabel(p.deadline, today)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="프로그램 모집 현황" to="/admin/programs">
            {summary.enrollment.length === 0 ? (
              <p className="text-sm text-slate-500">진행 중인 프로그램이 없습니다.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {summary.enrollment.map((e) => {
                  const pct = e.capacity ? Math.min(100, Math.round((e.enrolled / e.capacity) * 100)) : 0
                  return (
                    <li key={e.program_id}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">
                          {e.program} <span className="text-xs text-slate-500">{PROGRAM_STATUS[e.status]?.label}</span>
                        </span>
                        <span className="shrink-0 text-xs text-slate-600">
                          {e.enrolled}
                          {e.capacity ? ` / ${e.capacity}명` : '명'}
                          {e.waitlisted > 0 && ` · 대기 ${e.waitlisted}`}
                        </span>
                      </div>
                      {e.capacity && (
                        <div className="mt-1 h-2 rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${e.program} 모집률`}>
                          <div className={`h-2 rounded-full ${pct >= 100 ? 'bg-green-600' : 'bg-brand-600'}`} style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>
          <Section title="이번 달 학원별 상담 유입 TOP" to="/admin/partners">
            {summary.partner_top.length === 0 ? (
              <p className="text-sm text-slate-500">이번 달 상담 신청이 없습니다.</p>
            ) : (
              <ol className="space-y-1 text-sm">
                {summary.partner_top.map((p, i) => (
                  <li key={p.partner} className="flex justify-between">
                    <span>
                      {i + 1}. {p.partner}
                    </span>
                    <span className="font-medium">{p.leads}건</span>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>
      </div>
    </>
  )
}
