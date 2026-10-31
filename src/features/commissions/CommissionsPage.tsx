import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Spinner, Tabs, Textarea } from '../../components/ui'
import { addDays, formatDateKo } from '../../domain/dates'
import {
  cancellationMessage,
  monthlyReport,
  payoutScheduleMessage,
  programNoticeMessage,
  registrationStatusMessage,
  type PartnerStudent,
} from '../../domain/partnerMessages'
import { formatWon } from '../../domain/registration'
import { downloadCsv, toCsv } from '../../lib/csv'
import { formatKst, todayKst } from '../../lib/datetime'
import { REGISTRATION_STATUS } from '../../lib/labels'
import { supabase, type Tables, type Views } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'

type Row = Views<'v_commissions'>
type Msg = { tone: 'green' | 'red'; text: string } | null

export const COMMISSION_STATUS: Record<string, { label: string; tone: 'gray' | 'blue' | 'green' | 'amber' | 'red' }> = {
  scheduled: { label: '지급 예정', tone: 'blue' },
  paid: { label: '지급 완료', tone: 'green' },
  held: { label: '보류', tone: 'amber' },
  excluded: { label: '지급 제외', tone: 'gray' },
  canceled: { label: '자동 제외', tone: 'gray' },
}
const err = (e: { message?: string } | null, fallback: string) => (e?.message && /[가-힣]/.test(e.message) ? e.message : fallback)
const programLabel = (r: { program_name: string | null; program_season: string | null }) => `${r.program_name ?? ''}${r.program_season ? ` (${r.program_season})` : ''}`

function toStudent(r: Row): PartnerStudent {
  return {
    studentName: r.destroyed_at ? null : r.student_name_ko,
    shareAgreed: !!r.partner_share_agreed,
    programName: programLabel(r),
    status: REGISTRATION_STATUS[r.registration_status ?? '']?.label ?? '',
    registeredOn: r.registered_on ?? '',
    amount: r.amount,
    dueDate: r.due_date,
    paidOn: r.paid_on,
    commissionStatus: r.status as PartnerStudent['commissionStatus'],
  }
}

async function copy(text: string, setMessage: (m: Msg) => void, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    setMessage({ tone: 'green', text: `${label}을(를) 복사했습니다.` })
  } catch {
    setMessage({ tone: 'red', text: '복사하지 못했습니다. 글을 직접 선택해 복사해 주세요.' })
  }
}

function useCommissions() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const load = useCallback(async () => {
    const { data } = await supabase.from('v_commissions').select('*').order('due_date', { nullsFirst: false })
    setRows(data ?? [])
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  return { rows, load }
}

// ---------------------------------------------------------------------------
// 지급 관리
// ---------------------------------------------------------------------------
function Payouts({ isAdmin }: { isAdmin: boolean }) {
  const { rows, load } = useCommissions()
  const [status, setStatus] = useState('open')
  const [partner, setPartner] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [paidOn, setPaidOn] = useState(todayKst())
  const [memo, setMemo] = useState('')
  const [message, setMessage] = useState<Msg>(null)

  const partners = useMemo(() => [...new Map((rows ?? []).map((r) => [r.partner_id!, r.partner_name ?? ''])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [rows])
  const filtered = useMemo(
    () =>
      (rows ?? []).filter((r) => {
        if (partner && r.partner_id !== partner) return false
        if (status === 'open') return r.status === 'scheduled' || r.status === 'held' || !!r.review_note
        if (status === 'overdue') return !!r.overdue
        if (status === 'all') return true
        return r.status === status
      }),
    [rows, status, partner],
  )
  const overdueCount = (rows ?? []).filter((r) => r.overdue).length
  const sum = (xs: Row[]) => xs.reduce((a, r) => a + (r.amount ?? 0), 0)

  async function act(id: string, next: 'held' | 'excluded' | 'scheduled') {
    let reason = ''
    if (next !== 'scheduled') {
      reason = window.prompt(next === 'held' ? '보류 사유를 적어 주세요' : '지급 제외 사유를 적어 주세요(예: 허위·과장 분쟁)') ?? ''
      if (!reason.trim()) return
    }
    const { error } = await supabase.rpc('set_commission_status', { p_id: id, p_status: next, p_reason: reason })
    setMessage(error ? { tone: 'red', text: err(error, '바꾸지 못했습니다.') } : { tone: 'green', text: '커미션 상태를 바꿨습니다.' })
    await load()
  }

  function exportSheet() {
    // 부록 C 기록 시트
    downloadCsv(
      `커미션_기록시트_${todayKst()}.csv`,
      toCsv(filtered, [
        { header: '소개 학원', value: (r) => r.partner_name },
        { header: '상담실장', value: (r) => r.contact_name },
        { header: '구분', value: (r) => (r.kind === 'referral' ? '학원 간 소개' : '소개') },
        { header: '학생', value: (r) => (r.destroyed_at ? '(파기됨)' : r.student_name_ko) },
        { header: '프로그램', value: (r) => programLabel(r) },
        { header: '신청일', value: (r) => r.registered_on },
        { header: '계약금(예약금) 납부', value: (r) => r.deposit_paid },
        { header: '완납일', value: (r) => r.basis_date },
        { header: '등록 상태', value: (r) => REGISTRATION_STATUS[r.registration_status ?? '']?.label },
        { header: '커미션', value: (r) => r.amount },
        { header: '커미션 상태', value: (r) => COMMISSION_STATUS[r.status ?? '']?.label },
        { header: '지급 예정일', value: (r) => r.due_date },
        { header: '지급일', value: (r) => r.paid_on },
        { header: '사유·검토', value: (r) => [r.status_reason, r.review_note].filter(Boolean).join(' / ') },
      ]),
    )
  }

  if (!rows) return <Spinner />
  const payable = filtered.filter((r) => r.status === 'scheduled' && r.amount !== null)
  return (
    <div className="space-y-4">
      {overdueCount > 0 && (
        <Alert tone="red">
          지급 예정일이 지났는데 지급하지 않은 커미션이 <strong>{overdueCount}건</strong> 있습니다. 협약서상 지급 지연은 신뢰 문제로 이어지므로 먼저 처리해 주세요.
        </Alert>
      )}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Field label="상태">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="open">처리할 것(예정·보류·검토)</option>
              <option value="overdue">지급 지연 {overdueCount ? `(${overdueCount})` : ''}</option>
              {Object.entries(COMMISSION_STATUS).map(([v, s]) => (
                <option key={v} value={v}>
                  {s.label}
                </option>
              ))}
              <option value="all">전체</option>
            </Select>
          </Field>
        </div>
        <div className="w-56">
          <Field label="학원">
            <Select value={partner} onChange={(e) => setPartner(e.target.value)}>
              <option value="">전체</option>
              {partners.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button variant="secondary" onClick={exportSheet} disabled={!filtered.length}>
          기록 시트 CSV
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState>해당하는 커미션이 없습니다.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                {isAdmin && <th className="w-8 px-3 py-2" aria-label="선택" />}
                <th className="px-3 py-2">학원·실장</th>
                <th className="px-3 py-2">학생·프로그램</th>
                <th className="px-3 py-2 text-right">금액</th>
                <th className="px-3 py-2">지급 예정일</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2">처리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => {
                const st = COMMISSION_STATUS[r.status ?? '']
                const canPay = r.status === 'scheduled' && r.amount !== null
                return (
                  <tr key={r.id} className={r.overdue ? 'bg-red-50' : ''} aria-label={`커미션 ${r.partner_name} ${r.student_name_ko ?? ''}`}>
                    {isAdmin && (
                      <td className="px-3 py-2">
                        {canPay && (
                          <input
                            type="checkbox"
                            className="size-4"
                            aria-label={`${r.student_name_ko} 지급 선택`}
                            checked={selected.has(r.id!)}
                            onChange={(e) => {
                              const next = new Set(selected)
                              if (e.target.checked) next.add(r.id!)
                              else next.delete(r.id!)
                              setSelected(next)
                            }}
                          />
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2">
                      {r.partner_name}
                      <span className="block text-xs text-slate-500">
                        {r.kind === 'referral' ? '학원 간 소개 수수료' : (r.contact_name ?? '원장 직접')}
                        {r.recipient_type === 'contact' ? ' · 개인 지급' : ''}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Link to={`/admin/registrations/${r.registration_id}`} className="text-brand-700 hover:underline">
                        {r.destroyed_at ? '(파기됨)' : r.student_name_ko}
                      </Link>
                      <span className="block text-xs text-slate-500">{programLabel(r)}</span>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{r.amount === null ? '미정' : formatWon(r.amount)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.due_date ? formatDateKo(r.due_date) : '-'}
                      {r.overdue && <Badge tone="red">지연</Badge>}
                      {r.paid_on && <span className="block text-xs text-green-700">{formatDateKo(r.paid_on)} 지급</span>}
                    </td>
                    <td className="px-3 py-2">
                      {st && <Badge tone={st.tone}>{st.label}</Badge>}
                      {(r.status_reason || r.review_note) && (
                        <span className="mt-1 block text-xs text-slate-500">{[r.status_reason, r.review_note].filter(Boolean).join(' / ')}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {isAdmin && r.status === 'scheduled' && (
                          <Button variant="ghost" onClick={() => void act(r.id!, 'held')}>
                            보류
                          </Button>
                        )}
                        {isAdmin && (r.status === 'scheduled' || r.status === 'held') && (
                          <Button variant="ghost" onClick={() => void act(r.id!, 'excluded')}>
                            제외
                          </Button>
                        )}
                        {isAdmin && (r.status === 'held' || r.status === 'excluded') && r.amount !== null && (
                          <Button variant="ghost" onClick={() => void act(r.id!, 'scheduled')}>
                            지급 예정으로
                          </Button>
                        )}
                        {(r.status === 'canceled' || (r.status === 'held' && r.registration_status && ['canceled', 'refunded'].includes(r.registration_status))) && (
                          <Button
                            variant="ghost"
                            onClick={() =>
                              void copy(
                                cancellationMessage(r.partner_name ?? '', null, toStudent(r), r.status === 'canceled' ? '납부하신 금액은 전액 환불되었습니다.' : '환불 금액은 확정되는 대로 안내드리겠습니다.'),
                                setMessage,
                                '취소·환불 안내 문구(MOU-05)',
                              )
                            }
                          >
                            안내 문구
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">
        표시 {filtered.length}건 · 금액 합계 {formatWon(sum(filtered))} · 지급 예정 {formatWon(sum(filtered.filter((r) => r.status === 'scheduled')))}
      </p>

      {isAdmin && payable.length > 0 && (
        <Card>
          <p className="mb-2 font-semibold text-slate-900">선택한 {selected.size}건 지급 처리</p>
          <div className="grid gap-2 sm:grid-cols-[180px_1fr_auto] sm:items-end">
            <Field label="지급일">
              <Input type="date" value={paidOn} max={todayKst()} onChange={(e) => setPaidOn(e.target.value)} />
            </Field>
            <Field label="메모(이체 내역 등)">
              <Input value={memo} onChange={(e) => setMemo(e.target.value)} />
            </Field>
            <Button
              disabled={selected.size === 0}
              onClick={async () => {
                const ids = [...selected]
                const total = filtered.filter((r) => selected.has(r.id!)).reduce((a, r) => a + (r.amount ?? 0), 0)
                if (!window.confirm(`${ids.length}건, ${formatWon(total)}을 지급 완료로 기록할까요?`)) return
                const { data, error } = await supabase.rpc('pay_commissions', { p_ids: ids, p_paid_on: paidOn, p_memo: memo })
                setMessage(error ? { tone: 'red', text: err(error, '지급 처리하지 못했습니다.') } : { tone: 'green', text: `${data}건을 지급 완료로 기록했습니다.` })
                setSelected(new Set())
                await load()
              }}
            >
              지급 완료 기록
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 원장님 안내 문구 (MOU-03·04·13)
// ---------------------------------------------------------------------------
function Messages() {
  const { rows } = useCommissions()
  const [partners, setPartners] = useState<Array<Pick<Tables<'partners'>, 'id' | 'name' | 'director_name'>>>([])
  const [partnerId, setPartnerId] = useState('')
  const [kind, setKind] = useState<'status' | 'payout' | 'monthly'>('monthly')
  const [month, setMonth] = useState(todayKst().slice(0, 7))
  const [regs, setRegs] = useState<Array<{ student_name_ko: string | null; partner_share_agreed: boolean; status: string; created_at: string; destroyed_at: string | null; programs: { name: string; season: string | null } | null }>>([])
  const [message, setMessage] = useState<Msg>(null)

  useEffect(() => {
    supabase
      .from('partners')
      .select('id, name, director_name')
      .is('deleted_at', null)
      .order('name')
      .then(({ data }) => {
        setPartners(data ?? [])
        if (data?.[0]) setPartnerId(data[0].id)
      })
  }, [])
  useEffect(() => {
    if (!partnerId) return
    supabase
      .from('registrations')
      .select('student_name_ko, partner_share_agreed, status, created_at, destroyed_at, programs(name, season)')
      .eq('partner_id', partnerId)
      .is('deleted_at', null)
      .order('created_at')
      .then(({ data }) => setRegs(data ?? []))
  }, [partnerId])

  const p = partners.find((x) => x.id === partnerId)
  const mine = (rows ?? []).filter((r) => r.partner_id === partnerId)
  const regStudents: PartnerStudent[] = regs.map((r) => ({
    studentName: r.destroyed_at ? null : r.student_name_ko,
    shareAgreed: r.partner_share_agreed,
    programName: r.programs ? `${r.programs.name}${r.programs.season ? ` (${r.programs.season})` : ''}` : '',
    status: REGISTRATION_STATUS[r.status]?.label ?? r.status,
    registeredOn: formatKst(r.created_at, 'yyyy-MM-dd'),
    amount: null,
    dueDate: null,
    paidOn: null,
    commissionStatus: 'scheduled',
  }))

  let email = ''
  let kakao = ''
  if (p) {
    if (kind === 'status') email = registrationStatusMessage(p.name, p.director_name, regStudents.filter((s) => !['취소', '환불'].includes(s.status)))
    if (kind === 'payout') email = payoutScheduleMessage(p.name, p.director_name, mine.map(toStudent))
    if (kind === 'monthly') {
      const r = monthlyReport({
        partnerName: p.name,
        directorName: p.director_name,
        month,
        newStudents: regStudents.filter((s) => s.registeredOn.startsWith(month)),
        paidThisMonth: mine.filter((r) => r.paid_on?.startsWith(month)).map(toStudent),
        upcoming: mine.filter((r) => r.status === 'scheduled').map(toStudent),
      })
      email = r.email
      kakao = r.kakao
    }
  }

  return (
    <div className="space-y-4">
      <Alert tone="blue">
        학원에 학생 이름을 알리는 것은 개인정보 제3자 제공입니다. 등록 신청 때 "소개 학원 제공"에 동의하지 않은 학생은 이름을 가려서(예: 홍*동) 넣습니다.
        문구는 초안이니 운영 매뉴얼 원문에 맞게 고쳐 쓰세요.
      </Alert>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="학원">
          <Select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
            {partners.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="안내 종류">
          <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="monthly">월말 현황 보고 (MOU-13)</option>
            <option value="status">등록 현황 (MOU-03)</option>
            <option value="payout">지급 예정일 (MOU-04)</option>
          </Select>
        </Field>
        {kind === 'monthly' && (
          <Field label="월">
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </Field>
        )}
      </div>
      {email && (
        <Card>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-slate-900">{kind === 'monthly' ? '이메일용 내용' : '안내 문구'}</p>
            <Button variant="secondary" onClick={() => void copy(email, setMessage, '안내 문구')}>
              복사
            </Button>
          </div>
          <Textarea aria-label="안내 문구" readOnly rows={16} value={email} className="font-mono text-xs" />
        </Card>
      )}
      {kakao && (
        <Card>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-slate-900">카카오톡 요약</p>
            <Button variant="secondary" onClick={() => void copy(kakao, setMessage, '카카오톡 요약')}>
              복사
            </Button>
          </div>
          <Textarea aria-label="카카오톡 요약" readOnly rows={3} value={kakao} className="text-sm" />
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 사전 고지 (협약서 제8조, MOU-15)
// ---------------------------------------------------------------------------
function Notices({ isAdmin }: { isAdmin: boolean }) {
  const [programs, setPrograms] = useState<Array<Pick<Tables<'programs'>, 'id' | 'name' | 'season' | 'start_date' | 'commission_amount' | 'commission_notice_sent_on' | 'type'>> | null>(null)
  const [message, setMessage] = useState<Msg>(null)
  const [dates, setDates] = useState<Record<string, string>>({})
  const today = todayKst()

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('programs')
      .select('id, name, season, start_date, commission_amount, commission_notice_sent_on, type')
      .is('deleted_at', null)
      .gte('start_date', today)
      .order('start_date')
    setPrograms(data ?? [])
  }, [today])
  useEffect(() => {
    void load()
  }, [load])

  if (!programs) return <Spinner />
  return (
    <div className="space-y-3">
      <Alert tone="blue">프로그램 개시 30일 전까지 파트너 학원에 커미션을 서면으로 고지하고(제8조), 고지일을 기록합니다. 이의 제기 기한은 고지 후 7일입니다.</Alert>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {programs.length === 0 && <EmptyState>다가오는 프로그램이 없습니다.</EmptyState>}
      {programs.map((p) => {
        const deadline = addDays(p.start_date, -30)
        const late = !p.commission_notice_sent_on && deadline < today
        const soon = !p.commission_notice_sent_on && !late && deadline <= addDays(today, 14)
        const name = `${p.name}${p.season ? ` (${p.season})` : ''}`
        return (
          <Card key={p.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-slate-900">{name}</p>
                <p className="text-xs text-slate-500">
                  {formatDateKo(p.start_date)} 시작 · 1인당 {p.commission_amount === null ? '미정' : formatWon(p.commission_amount)} · 고지 기한 {formatDateKo(deadline)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {p.commission_notice_sent_on ? (
                  <Badge tone="green">
                    {formatDateKo(p.commission_notice_sent_on)} 고지 · 이의 기한 {formatDateKo(addDays(p.commission_notice_sent_on, 7))}
                  </Badge>
                ) : late ? (
                  <Badge tone="red">고지 기한 지남</Badge>
                ) : soon ? (
                  <Badge tone="amber">고지 기한 임박</Badge>
                ) : (
                  <Badge>고지 전</Badge>
                )}
                <Button
                  variant="secondary"
                  onClick={() => void copy(programNoticeMessage({ programName: name, startDate: p.start_date, amount: p.commission_amount }), setMessage, '고지 문구(MOU-15)')}
                >
                  고지 문구 복사
                </Button>
              </div>
            </div>
            {isAdmin && !p.commission_notice_sent_on && (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <Field label="고지한 날">
                  <Input type="date" max={today} value={dates[p.id] ?? today} onChange={(e) => setDates({ ...dates, [p.id]: e.target.value })} />
                </Field>
                <Button
                  onClick={async () => {
                    const { error } = await supabase.from('programs').update({ commission_notice_sent_on: dates[p.id] ?? today }).eq('id', p.id)
                    setMessage(error ? { tone: 'red', text: '기록하지 못했습니다.' } : { tone: 'green', text: `${name} 커미션 고지일을 기록했습니다.` })
                    await load()
                  }}
                >
                  고지일 기록
                </Button>
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 설정 (관리자): 학원 간 소개 요율, 특별 합의 금액, 공휴일
// ---------------------------------------------------------------------------
function CommissionSettings({ isAdmin }: { isAdmin: boolean }) {
  const [rate, setRate] = useState<string | null>(null)
  const [overrides, setOverrides] = useState<Array<Tables<'commission_overrides'> & { partners: { name: string } | null; programs: { name: string; season: string | null } | null }>>([])
  const [holidays, setHolidays] = useState<Tables<'holidays'>[]>([])
  const [partners, setPartners] = useState<Array<{ id: string; name: string }>>([])
  const [programs, setPrograms] = useState<Array<{ id: string; name: string; season: string | null }>>([])
  const [ov, setOv] = useState({ partner: '', program: '', amount: '', memo: '' })
  const [hol, setHol] = useState({ date: '', name: '' })
  const [message, setMessage] = useState<Msg>(null)

  const load = useCallback(async () => {
    const [s, o, h, pa, pr] = await Promise.all([
      supabase.from('settings').select('value').eq('key', 'commission').maybeSingle(),
      supabase.from('commission_overrides').select('*, partners(name), programs(name, season)'),
      supabase.from('holidays').select('*').gte('date', todayKst().slice(0, 4) + '-01-01').order('date'),
      supabase.from('partners').select('id, name').is('deleted_at', null).order('name'),
      supabase.from('programs').select('id, name, season').is('deleted_at', null).order('start_date', { ascending: false }),
    ])
    const v = (s.data?.value ?? {}) as { referral_rate?: number }
    setRate(String(Math.round((v.referral_rate ?? 0) * 1000) / 10))
    setOverrides((o.data ?? []) as typeof overrides)
    setHolidays(h.data ?? [])
    setPartners(pa.data ?? [])
    setPrograms(pr.data ?? [])
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  async function done(error: { message?: string } | null, ok: string) {
    setMessage(error ? { tone: 'red', text: err(error, '저장하지 못했습니다.') } : { tone: 'green', text: ok })
    await load()
  }

  if (rate === null) return <Spinner />
  return (
    <div className="space-y-4">
      {!isAdmin && <Alert tone="amber">설정은 관리자만 바꿀 수 있습니다.</Alert>}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Card>
        <p className="mb-2 font-semibold text-slate-900">학원 간 소개 수수료 요율</p>
        <p className="mb-3 text-xs text-slate-500">다른 학원을 소개해 준 학원(1단계)에게 소개 커미션의 몇 %를 줄지. 0이면 만들지 않습니다(매뉴얼상 [확인 필요]).</p>
        <div className="flex items-end gap-2">
          <Field label="요율(%)">
            <Input type="number" min={0} max={100} step={0.5} disabled={!isAdmin} value={rate} onChange={(e) => setRate(e.target.value)} />
          </Field>
          {isAdmin && (
            <Button
              onClick={async () => {
                const { data } = await supabase.from('settings').select('value').eq('key', 'commission').maybeSingle()
                const value = { ...((data?.value as object) ?? {}), referral_rate: Number(rate) / 100 }
                const { error } = await supabase.from('settings').update({ value }).eq('key', 'commission')
                await done(error, '요율을 저장했습니다. 이후 확정되는 등록부터 적용됩니다.')
              }}
            >
              저장
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <p className="mb-2 font-semibold text-slate-900">학원·프로그램별 특별 합의 금액</p>
        <p className="mb-3 text-xs text-slate-500">단체 3인 이상 인센티브 등. 지정하면 프로그램 1인당 금액 대신 쓰고, 아직 지급하지 않은 커미션은 바로 다시 계산됩니다.</p>
        <ul className="mb-3 divide-y divide-slate-100 text-sm">
          {overrides.map((o) => (
            <li key={`${o.partner_id}-${o.program_id}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {o.partners?.name} · {o.programs?.name}
                {o.programs?.season ? ` (${o.programs.season})` : ''} → <strong>{formatWon(o.amount)}</strong>
                {o.memo && <span className="text-xs text-slate-500"> · {o.memo}</span>}
              </span>
              {isAdmin && (
                <Button
                  variant="ghost"
                  onClick={async () => {
                    const { error } = await supabase.from('commission_overrides').delete().eq('partner_id', o.partner_id).eq('program_id', o.program_id)
                    await done(error, '특별 합의 금액을 지웠습니다.')
                  }}
                >
                  지우기
                </Button>
              )}
            </li>
          ))}
          {overrides.length === 0 && <li className="py-2 text-slate-500">없음</li>}
        </ul>
        {isAdmin && (
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_140px_1fr_auto] sm:items-end">
            <Field label="학원">
              <Select value={ov.partner} onChange={(e) => setOv({ ...ov, partner: e.target.value })}>
                <option value="">선택</option>
                {partners.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="프로그램">
              <Select value={ov.program} onChange={(e) => setOv({ ...ov, program: e.target.value })}>
                <option value="">선택</option>
                {programs.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                    {x.season ? ` (${x.season})` : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="1인당 금액">
              <Input type="number" min={0} value={ov.amount} onChange={(e) => setOv({ ...ov, amount: e.target.value })} />
            </Field>
            <Field label="메모">
              <Input value={ov.memo} onChange={(e) => setOv({ ...ov, memo: e.target.value })} />
            </Field>
            <Button
              disabled={!ov.partner || !ov.program || ov.amount === ''}
              onClick={async () => {
                const { error } = await supabase
                  .from('commission_overrides')
                  .upsert({ partner_id: ov.partner, program_id: ov.program, amount: Number(ov.amount), memo: ov.memo.trim() || null })
                setOv({ partner: '', program: '', amount: '', memo: '' })
                await done(error, '특별 합의 금액을 저장했습니다.')
              }}
            >
              저장
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <p className="mb-2 font-semibold text-slate-900">공휴일 (유학 커미션 영업일 계산)</p>
        <p className="mb-3 text-xs text-slate-500">
          공식 자료(우주항공청 월력요항·관보)로 확인해 입력합니다. "확인 필요"는 2차 자료로 넣은 날짜라 관보로 확인한 뒤 다시 저장해 주세요.
        </p>
        <ul className="mb-3 grid gap-1 text-sm sm:grid-cols-2">
          {holidays.map((h) => (
            <li key={h.date} className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1">
              <span>
                {formatDateKo(h.date)} {h.name} {!h.verified && <Badge tone="amber">확인 필요</Badge>}
              </span>
              {isAdmin && (
                <span className="flex gap-1">
                  {!h.verified && (
                    <button
                      type="button"
                      className="text-xs text-brand-600 underline"
                      onClick={async () => {
                        const { error } = await supabase.from('holidays').update({ verified: true, source: '관보 확인(관리자)' }).eq('date', h.date)
                        await done(error, `${h.name} 날짜를 확인 완료로 표시했습니다.`)
                      }}
                    >
                      확인 완료
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-xs text-red-600 underline"
                    onClick={async () => {
                      const { error } = await supabase.from('holidays').delete().eq('date', h.date)
                      await done(error, '공휴일을 지웠습니다.')
                    }}
                  >
                    지우기
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
        {isAdmin && (
          <div className="flex flex-wrap items-end gap-2">
            <Field label="날짜">
              <Input type="date" value={hol.date} onChange={(e) => setHol({ ...hol, date: e.target.value })} />
            </Field>
            <Field label="이름">
              <Input value={hol.name} onChange={(e) => setHol({ ...hol, name: e.target.value })} placeholder="예: 임시공휴일" />
            </Field>
            <Button
              disabled={!hol.date || !hol.name.trim()}
              onClick={async () => {
                const { error } = await supabase.from('holidays').upsert({ date: hol.date, name: hol.name.trim(), source: '관리자 입력', verified: true })
                setHol({ date: '', name: '' })
                await done(error, '공휴일을 저장했습니다.')
              }}
            >
              공휴일 추가
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}

export function CommissionsPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as 'payouts' | 'messages' | 'notices' | 'settings' | null) ?? 'payouts'
  return (
    <>
      <PageHeader
        title="커미션 정산"
        description="내부 전용 화면입니다(학부모 화면·알림에는 커미션 정보가 없습니다). 소개 경로가 확인된 등록이 확정되면 자동으로 산정됩니다. 지급·보류·제외는 관리자만 처리합니다."
      />
      <Tabs
        tabs={[
          { value: 'payouts', label: '지급 관리' },
          { value: 'messages', label: '원장님 안내·월말 보고' },
          { value: 'notices', label: '사전 고지(제8조)' },
          { value: 'settings', label: '요율·특별 합의·공휴일' },
        ]}
        value={tab}
        onChange={(t) => setParams(t === 'payouts' ? {} : { tab: t }, { replace: true })}
      />
      {tab === 'payouts' && <Payouts isAdmin={isAdmin} />}
      {tab === 'messages' && <Messages />}
      {tab === 'notices' && <Notices isAdmin={isAdmin} />}
      {tab === 'settings' && <CommissionSettings isAdmin={isAdmin} />}
      <p className="mt-6 text-xs text-slate-400">
        세무: 안내 금액은 학원 실수령액이며 원천징수 등 세무 비용은 본사 부담입니다(협약서 제7조③④). 지급 시 세전 금액 환산은 세무 담당 확인 후 처리하세요.
      </p>
    </>
  )
}
