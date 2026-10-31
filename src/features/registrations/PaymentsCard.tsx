import { useCallback, useEffect, useState } from 'react'
import { Alert, Badge, Button, Card, Field, Input, Select } from '../../components/ui'
import { formatDateKo } from '../../domain/dates'
import { formatWon } from '../../domain/registration'
import { formatKst, todayKst } from '../../lib/datetime'
import { PAYMENT_KIND, PAYMENT_METHOD, PAYMENT_STATUS } from '../../lib/labels'
import { supabase, type Tables, type Views } from '../../lib/supabase'

type Schedule = Views<'v_payment_schedules'>
type Payment = Tables<'payments'>
type Msg = { tone: 'green' | 'red'; text: string } | null

const err = (e: { message?: string } | null, fallback: string) => (e?.message && /[가-힣]/.test(e.message) ? e.message : fallback)

function PayForm({ schedule, onDone }: { schedule: Schedule; onDone: (m: Msg) => Promise<void> }) {
  const remaining = Math.max((schedule.amount_due ?? 0) - (schedule.paid_amount ?? 0), 0)
  const [amount, setAmount] = useState(String(remaining))
  const [paidAt, setPaidAt] = useState(todayKst())
  const [method, setMethod] = useState('transfer')
  const [memo, setMemo] = useState('')
  return (
    <div className="mt-2 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_1fr_1.5fr_auto] sm:items-end">
      <Field label="납부 금액">
        <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="납부일">
        <Input type="date" value={paidAt} max={todayKst()} onChange={(e) => setPaidAt(e.target.value)} />
      </Field>
      <Field label="수단">
        <Select value={method} onChange={(e) => setMethod(e.target.value)}>
          {Object.entries(PAYMENT_METHOD).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="메모">
        <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="입금자명 등" />
      </Field>
      <Button
        disabled={!(Number(amount) > 0)}
        onClick={async () => {
          const { error } = await supabase
            .from('payments')
            .insert({ schedule_id: schedule.id!, amount: Number(amount), paid_at: paidAt, method, memo: memo.trim() || null })
          await onDone(error ? { tone: 'red', text: err(error, '납부를 기록하지 못했습니다.') } : { tone: 'green', text: `${schedule.label} ${formatWon(Number(amount))} 납부를 기록했습니다.` })
        }}
      >
        기록
      </Button>
    </div>
  )
}

function EditForm({ schedule, onDone }: { schedule: Schedule; onDone: (m: Msg) => Promise<void> }) {
  const [amount, setAmount] = useState(String(schedule.amount_due ?? 0))
  const [due, setDue] = useState(schedule.due_date ?? '')
  const [reason, setReason] = useState('')
  return (
    <div className="mt-2 grid gap-2 rounded-lg bg-amber-50 p-3 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
      <Field label="금액">
        <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="기한">
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </Field>
      <Field label="바꾸는 이유(필수, 기록됨)">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Button
        disabled={!reason.trim() || !due}
        onClick={async () => {
          const { error } = await supabase
            .from('payment_schedules')
            .update({ amount_due: Number(amount), due_date: due, change_reason: reason.trim() })
            .eq('id', schedule.id!)
          await onDone(
            error
              ? { tone: 'red', text: err(error, '바꾸지 못했습니다.') }
              : { tone: 'green', text: `${schedule.label} 금액·기한을 바꿨습니다. 학부모에게 정정 안내가 필요합니다.` },
          )
        }}
      >
        변경 저장
      </Button>
    </div>
  )
}

// 등록생 납부 일정·납부 기록 (부분 납부 허용, 기록 수정 대신 무효 처리, 금액·기한 변경은 사유와 이력)
export function PaymentsCard({
  registrationId,
  editable,
  paymentChangedAt,
  correctionSentAt,
  onChanged,
  onMessage: setMessage,
}: {
  registrationId: string
  editable: boolean
  paymentChangedAt: string | null
  correctionSentAt: string | null
  onChanged: () => void
  onMessage: (m: Msg) => void
}) {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [open, setOpen] = useState<{ id: string; mode: 'pay' | 'edit' } | null>(null)
  const [extra, setExtra] = useState<{ label: string; amount: string; due: string } | null>(null)

  const load = useCallback(async () => {
    const { data: s } = await supabase.from('v_payment_schedules').select('*').eq('registration_id', registrationId).order('sort').order('due_date')
    setSchedules(s ?? [])
    const ids = (s ?? []).map((x) => x.id!)
    const [{ data: p }, { data: staff }] = await Promise.all([
      ids.length ? supabase.from('payments').select('*').in('schedule_id', ids).order('paid_at') : Promise.resolve({ data: [] as Payment[] }),
      supabase.from('staff_profiles').select('id, name'),
    ])
    setPayments(p ?? [])
    setNames(new Map((staff ?? []).map((x) => [x.id, x.name])))
  }, [registrationId])

  useEffect(() => {
    void load()
  }, [load])

  async function done(m: Msg) {
    setMessage(m)
    if (m?.tone === 'green') {
      setOpen(null)
      setExtra(null)
      await load()
      onChanged()
    }
  }

  const active = schedules.filter((s) => !s.canceled_at)
  const due = active.reduce((a, s) => a + (s.amount_due ?? 0), 0)
  const paid = active.reduce((a, s) => a + (s.paid_amount ?? 0), 0)
  const needsCorrection = paymentChangedAt && (!correctionSentAt || correctionSentAt < paymentChangedAt)

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-slate-900">납부</p>
        <p className="text-sm text-slate-700">
          {formatWon(paid)} / {formatWon(due)} {due > 0 && paid >= due && <Badge tone="green">완납</Badge>}
        </p>
      </div>
      {needsCorrection && (
        <div className="mb-3">
          <Alert tone="amber">납부 금액·기한이 바뀌었습니다({formatKst(paymentChangedAt)}). 학부모에게 정정 안내를 1회 보내 주세요.</Alert>
        </div>
      )}
      {schedules.length === 0 && <p className="text-sm text-slate-500">납부 일정이 없습니다(대기 접수는 승격 시 생성).</p>}
      <ul className="divide-y divide-slate-100">
        {schedules.map((s) => {
          const st = PAYMENT_STATUS[s.status ?? '']
          const mine = payments.filter((p) => p.schedule_id === s.id)
          return (
            <li key={s.id} className="py-3" aria-label={`납부 일정 ${s.label}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {s.label} <span className="text-xs text-slate-500">{PAYMENT_KIND[s.kind ?? '']}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDateKo(s.due_date!)}까지 · {formatWon(s.paid_amount ?? 0)} / {formatWon(s.amount_due ?? 0)}
                    {s.change_reason && ` · 변경 사유: ${s.change_reason}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {st && <Badge tone={st.tone}>{st.label}</Badge>}
                  {editable && !s.canceled_at && (
                    <>
                      <Button variant="secondary" onClick={() => setOpen(open?.id === s.id && open.mode === 'pay' ? null : { id: s.id!, mode: 'pay' })}>
                        납부 기록
                      </Button>
                      <Button variant="ghost" onClick={() => setOpen(open?.id === s.id && open.mode === 'edit' ? null : { id: s.id!, mode: 'edit' })}>
                        금액·기한 변경
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {open?.id === s.id && open.mode === 'pay' && <PayForm schedule={s} onDone={done} />}
              {open?.id === s.id && open.mode === 'edit' && <EditForm schedule={s} onDone={done} />}
              {mine.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {mine.map((p) => (
                    <li key={p.id} className={`flex flex-wrap items-center gap-2 text-xs ${p.status === 'void' ? 'text-slate-400 line-through' : 'text-slate-600'}`}>
                      <span>
                        {formatDateKo(p.paid_at)} {formatWon(p.amount)} · {PAYMENT_METHOD[p.method] ?? p.method}
                        {p.memo ? ` · ${p.memo}` : ''} · 기록 {names.get(p.recorded_by ?? '') ?? '-'}
                      </span>
                      {p.status === 'void' ? (
                        <span className="no-underline">(무효 · {names.get(p.voided_by ?? '') ?? '-'})</span>
                      ) : (
                        editable && (
                          <button
                            type="button"
                            className="text-red-600 underline"
                            onClick={async () => {
                              if (!window.confirm(`${formatWon(p.amount)} 납부 기록을 무효 처리할까요? 되돌릴 수 없고 기록은 남습니다.`)) return
                              const { error } = await supabase.from('payments').update({ status: 'void' }).eq('id', p.id)
                              await done(error ? { tone: 'red', text: err(error, '무효 처리하지 못했습니다.') } : { tone: 'green', text: '납부 기록을 무효 처리했습니다.' })
                            }}
                          >
                            무효 처리
                          </button>
                        )
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
      {editable &&
        (extra ? (
          <div className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
            <Field label="추가 납부 항목">
              <Input value={extra.label} onChange={(e) => setExtra({ ...extra, label: e.target.value })} placeholder="예: 항공권" />
            </Field>
            <Field label="금액">
              <Input type="number" min={0} value={extra.amount} onChange={(e) => setExtra({ ...extra, amount: e.target.value })} />
            </Field>
            <Field label="기한">
              <Input type="date" value={extra.due} onChange={(e) => setExtra({ ...extra, due: e.target.value })} />
            </Field>
            <Button
              disabled={!extra.label.trim() || !(Number(extra.amount) >= 0) || !extra.due}
              onClick={async () => {
                const { error } = await supabase.from('payment_schedules').insert({
                  registration_id: registrationId,
                  kind: 'extra',
                  label: extra.label.trim(),
                  amount_due: Number(extra.amount),
                  due_date: extra.due,
                  sort: 100,
                })
                await done(error ? { tone: 'red', text: err(error, '추가하지 못했습니다.') } : { tone: 'green', text: `"${extra.label.trim()}" 항목을 추가했습니다.` })
              }}
            >
              추가
            </Button>
          </div>
        ) : (
          <Button variant="ghost" className="mt-2" onClick={() => setExtra({ label: '', amount: '', due: todayKst() })}>
            + 추가 납부 항목
          </Button>
        ))}
    </Card>
  )
}
