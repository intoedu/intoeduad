import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, Field, Input, Select, Textarea } from '../../components/ui'
import { formatDateKo } from '../../domain/dates'
import { formatWon } from '../../domain/registration'
import { expectedRefund, type RefundReason, type RefundRule } from '../../domain/refund'
import { formatKst, todayKst } from '../../lib/datetime'
import { REFUND_REASON } from '../../lib/labels'
import { supabase, type Tables } from '../../lib/supabase'
import type { Registration } from './api'

type Msg = { tone: 'green' | 'red'; text: string }
const err = (e: { message?: string } | null, fallback: string) => (e?.message && /[가-힣]/.test(e.message) ? e.message : fallback)

// 등록 상태 처리: 접수 확인 / 대기 승격 / 취소(환불 예상액 계산)
export function StatusActions({
  registration: r,
  paidTotal,
  onChanged,
  onMessage: setMessage,
}: {
  registration: Registration
  paidTotal: number
  onChanged: () => Promise<void>
  onMessage: (m: Msg) => void
}) {
  const [cancelOpen, setCancelOpen] = useState(false)
  const [requested, setRequested] = useState(todayKst())
  const [reason, setReason] = useState<RefundReason>('customer')
  const [memo, setMemo] = useState('')
  const p = r.programs

  async function call(fn: 'confirm_registration_receipt' | 'promote_waitlisted', ok: string) {
    const { error } = await supabase.rpc(fn, { p_registration_id: r.id })
    setMessage(error ? { tone: 'red', text: err(error, '처리하지 못했습니다.') } : { tone: 'green', text: ok })
    await onChanged()
  }

  const preview =
    p && cancelOpen
      ? expectedRefund({
          reason,
          rules: (Array.isArray(p.refund_rules) ? p.refund_rules : []) as RefundRule[],
          requestedOn: requested,
          startDate: p.start_date,
          totalPrice: p.total_price,
          paidTotal,
        })
      : null

  if (['canceled', 'refunded'].includes(r.status)) return null
  return (
    <Card>
      <p className="mb-3 font-semibold text-slate-900">처리</p>
      <div className="flex flex-wrap gap-2">
        {r.status === 'received' && (
          <Button onClick={() => void call('confirm_registration_receipt', '접수를 확인했습니다. 이제 납부에 따라 상태가 자동으로 바뀝니다.')}>접수 확인</Button>
        )}
        {r.status === 'waitlisted' && <Button onClick={() => void call('promote_waitlisted', '대기에서 등록으로 승격했습니다. 오늘 기준으로 납부 일정을 만들었습니다.')}>대기 승격</Button>}
        <Button variant="ghost" onClick={() => setCancelOpen((o) => !o)}>
          취소 처리
        </Button>
      </div>
      {cancelOpen && (
        <div className="mt-4 space-y-3 rounded-lg bg-red-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="취소 요청일">
              <Input type="date" value={requested} onChange={(e) => setRequested(e.target.value)} />
            </Field>
            <Field label="취소 사유">
              <Select value={reason} onChange={(e) => setReason(e.target.value as RefundReason)}>
                {Object.entries(REFUND_REASON).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="메모">
            <Textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
          </Field>
          {preview && (
            <p className="text-sm text-slate-700" aria-label="환불 예상액">
              출국 {preview.days}일 전 · 납부 합계 {formatWon(paidTotal)}
              {preview.rate !== null && ` · 공제율 ${Math.round(preview.rate * 1000) / 10}% (${formatWon(preview.deduction ?? 0)})`}
              {' → '}
              <strong>{preview.expected === null ? '환불액은 담당자가 정합니다' : `환불 예상액 ${formatWon(preview.expected)}`}</strong>
            </p>
          )}
          <Button
            variant="danger"
            onClick={async () => {
              if (!window.confirm('이 신청을 취소할까요? 남은 납부 일정이 모두 취소됩니다.')) return
              const { error } = await supabase.rpc('cancel_registration', {
                p_registration_id: r.id,
                p_requested_on: requested,
                p_reason_type: reason,
                p_memo: memo,
              })
              setMessage(
                error
                  ? { tone: 'red', text: err(error, '취소하지 못했습니다.') }
                  : {
                      tone: 'green',
                      text: `취소했습니다.${paidTotal > 0 ? ' 아래 환불에서 최종 금액을 확정해 주세요.' : ''}${r.passport_status === 'submitted' ? ' 여권 사진은 "참가 취소" 사유로 삭제해 주세요.' : ''}`,
                    },
              )
              setCancelOpen(false)
              await onChanged()
            }}
          >
            취소 확정
          </Button>
        </div>
      )}
    </Card>
  )
}

type Refund = Tables<'refunds'>

export function RefundsCard({
  registrationId,
  onChanged,
  onMessage: setMessage,
}: {
  registrationId: string
  onChanged: () => Promise<void>
  onMessage: (m: Msg) => void
}) {
  const [refunds, setRefunds] = useState<Refund[]>([])
  const [finals, setFinals] = useState<Record<string, string>>({})
  const [memos, setMemos] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const { data } = await supabase.from('refunds').select('*').eq('registration_id', registrationId).order('created_at')
    setRefunds(data ?? [])
  }, [registrationId])
  useEffect(() => {
    void load()
  }, [load])

  if (refunds.length === 0) return null
  return (
    <Card>
      <p className="mb-3 font-semibold text-slate-900">환불</p>
      <ul className="space-y-3">
        {refunds.map((f) => (
          <li key={f.id} className="rounded-lg bg-slate-50 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={f.processed_at ? 'green' : 'amber'}>{f.processed_at ? '환불 완료' : '환불 대기'}</Badge>
              <span>
                {REFUND_REASON[f.reason_type]} · {formatDateKo(f.requested_at)} 요청
                {f.days_before_start !== null && ` · 출국 ${f.days_before_start}일 전`}
              </span>
            </div>
            <p className="mt-1 text-slate-700">
              납부 {formatWon(f.paid_total ?? 0)}
              {f.deduction_rate !== null && ` · 공제율 ${Math.round(Number(f.deduction_rate) * 1000) / 10}%`} · 예상 {f.expected_amount === null ? '담당자 결정' : formatWon(f.expected_amount)}
              {f.final_amount !== null && ` · 확정 ${formatWon(f.final_amount)}`}
              {f.processed_at && ` · ${formatKst(f.processed_at)} 처리`}
            </p>
            {f.memo && <p className="text-xs text-slate-500">{f.memo}</p>}
            {!f.processed_at && (
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
                <Field label="최종 환불액">
                  <Input type="number" min={0} value={finals[f.id] ?? String(f.expected_amount ?? '')} onChange={(e) => setFinals({ ...finals, [f.id]: e.target.value })} />
                </Field>
                <Field label="메모(계좌·카드 취소 등)">
                  <Input value={memos[f.id] ?? ''} onChange={(e) => setMemos({ ...memos, [f.id]: e.target.value })} />
                </Field>
                <Button
                  disabled={(finals[f.id] ?? String(f.expected_amount ?? '')) === ''}
                  onClick={async () => {
                    const amount = Number(finals[f.id] ?? f.expected_amount)
                    if (!window.confirm(`${formatWon(amount)} 환불을 완료 처리할까요?`)) return
                    const { error } = await supabase.rpc('process_refund', { p_refund_id: f.id, p_final_amount: amount, p_memo: memos[f.id] ?? '' })
                    setMessage(error ? { tone: 'red', text: err(error, '처리하지 못했습니다.') } : { tone: 'green', text: '환불 완료로 처리했습니다.' })
                    await load()
                    await onChanged()
                  }}
                >
                  환불 완료 처리
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}
