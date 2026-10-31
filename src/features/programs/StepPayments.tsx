import { useState } from 'react'
import { Alert, Badge, Button, Card, Field, Input, Select } from '../../components/ui'
import { addDays, formatDateKo } from '../../domain/dates'
import { commissionNoticeDeadline, computeSchedule, validateRules, type DueRuleType, type PaymentKind, type PaymentRule } from '../../domain/paymentRules'
import { todayKst } from '../../lib/datetime'
import { COMMISSION_PAY_RULE, DUE_RULE_LABELS } from '../../lib/labels'
import { supabase } from '../../lib/supabase'
import { won, type Program } from './api'

type Row = {
  id?: string
  kind: PaymentKind
  label: string
  amount: string
  due_rule_type: DueRuleType
  due_fixed_date: string
  due_offset_days: string
}

function toRow(r: PaymentRule & { id?: string }): Row {
  return {
    id: r.id,
    kind: r.kind,
    label: r.label,
    amount: String(r.amount),
    due_rule_type: r.due_rule_type,
    due_fixed_date: r.due_fixed_date ?? '',
    due_offset_days: r.due_offset_days?.toString() ?? '',
  }
}

function toRule(r: Row, sort: number): PaymentRule & { id?: string } {
  return {
    id: r.id,
    kind: r.kind,
    label: r.label.trim() || (r.kind === 'deposit' ? '예약금' : r.kind === 'balance' ? '잔금' : '추가 항목'),
    amount: Number(r.amount.replace(/[^0-9]/g, '')) || 0,
    due_rule_type: r.due_rule_type,
    due_fixed_date: r.due_rule_type === 'fixed' ? r.due_fixed_date || null : null,
    due_offset_days: r.due_rule_type === 'fixed' ? null : r.due_offset_days === '' ? null : Number(r.due_offset_days),
    sort,
  }
}

export function StepPayments({
  program,
  rules,
  onSaved,
}: {
  program: Program
  rules: Array<PaymentRule & { id: string }>
  onSaved: (message: string) => Promise<void>
}) {
  const [rows, setRows] = useState<Row[]>(() => {
    const existing = rules.map(toRow)
    if (existing.length > 0) return existing
    return [
      { kind: 'deposit', label: '예약금', amount: '', due_rule_type: 'after_registration', due_fixed_date: '', due_offset_days: '7' },
      { kind: 'balance', label: '잔금', amount: String(program.total_price || ''), due_rule_type: 'before_start', due_fixed_date: '', due_offset_days: '30' },
    ]
  })
  const [previewDate, setPreviewDate] = useState(todayKst())
  const [commission, setCommission] = useState(program.commission_amount?.toString() ?? '')
  const [noticeOn, setNoticeOn] = useState(program.commission_notice_sent_on ?? '')
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const parsed = rows.map(toRule)
  const liveErrors = validateRules(parsed, program.total_price, program.start_date)
  const preview = liveErrors.length === 0 || parsed.every((r) => r.due_rule_type !== 'fixed' || r.due_fixed_date)
    ? computeSchedule(parsed.filter((r) => r.due_rule_type !== 'fixed' || r.due_fixed_date), previewDate, program.start_date)
    : []
  const deposit = parsed.find((r) => r.kind === 'deposit')
  const noticeDeadline = commissionNoticeDeadline(program.start_date)
  const daysToNotice = Math.round((Date.parse(noticeDeadline) - Date.parse(todayKst())) / 86_400_000)

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => {
      const next = prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r))
      // 예약금을 바꾸면 잔금 = 총 참가비 − 예약금 (잔금을 직접 고친 뒤에도 다시 맞출 수 있도록 버튼 제공)
      if (next[i].kind === 'deposit' && patch.amount !== undefined) {
        const bal = next.findIndex((r) => r.kind === 'balance')
        const dep = Number(patch.amount.replace(/[^0-9]/g, '')) || 0
        if (bal >= 0) next[bal] = { ...next[bal], amount: String(Math.max(program.total_price - dep, 0)) }
      }
      return next
    })
  }

  async function save() {
    const errs = validateRules(parsed, program.total_price, program.start_date)
    setErrors(errs)
    if (errs.length > 0) return
    setSaving(true)
    const keepIds = parsed.filter((r) => r.id).map((r) => r.id!)
    const removed = rules.filter((r) => !keepIds.includes(r.id)).map((r) => r.id)
    const ops = []
    if (removed.length) ops.push(supabase.from('program_payment_rules').delete().in('id', removed))
    for (const r of parsed) {
      const row = {
        program_id: program.id,
        kind: r.kind,
        label: r.label,
        amount: r.amount,
        due_rule_type: r.due_rule_type,
        due_fixed_date: r.due_fixed_date,
        due_offset_days: r.due_offset_days,
        sort: r.sort ?? 0,
      }
      ops.push(r.id ? supabase.from('program_payment_rules').update(row).eq('id', r.id) : supabase.from('program_payment_rules').insert(row))
    }
    ops.push(
      supabase
        .from('programs')
        .update({
          commission_amount: commission === '' ? null : Number(commission.replace(/[^0-9]/g, '')),
          commission_notice_sent_on: noticeOn || null,
        })
        .eq('id', program.id),
    )
    const results = await Promise.all(ops)
    setSaving(false)
    const failed = results.find((r) => r.error)
    if (failed?.error) {
      setErrors([failed.error.code === '23505' ? '예약금·잔금은 하나씩만 둘 수 있습니다.' : '저장하지 못했습니다.'])
      return
    }
    await onSaved('납부 규칙과 커미션 정보를 저장했습니다.')
  }

  return (
    <div className="space-y-4">
      <Alert tone="blue">
        이 캠프 전용 납부 규칙입니다. 학부모가 신청하면 아래 규칙으로 <strong>납부 기한이 자동 생성</strong>되고, 학부모에게는 계산된 금액과
        기한만 안내됩니다. 총 참가비 <strong>{won(program.total_price)}</strong> = 예약금 + 잔금(원금)이며, 항공권 등 추가 항목은 별도입니다.
      </Alert>

      <div className="space-y-3">
        {rows.map((r, i) => (
          <Card key={r.id ?? `new-${i}`} className="py-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[120px_1fr_1fr_1fr_1fr_auto] lg:items-end">
              <div className="text-sm font-semibold text-slate-800 lg:pb-2">
                {r.kind === 'deposit' ? '예약금' : r.kind === 'balance' ? '잔금(원금)' : '추가 항목'}
              </div>
              {r.kind === 'extra' ? (
                <Field label="항목 이름">
                  <Input value={r.label} placeholder="예: 항공권" onChange={(e) => update(i, { label: e.target.value })} />
                </Field>
              ) : (
                <div className="hidden lg:block" />
              )}
              <Field label="금액(원)">
                <Input inputMode="numeric" value={r.amount} onChange={(e) => update(i, { amount: e.target.value })} />
              </Field>
              <Field label="기한 규칙">
                <Select value={r.due_rule_type} onChange={(e) => update(i, { due_rule_type: e.target.value as DueRuleType })}>
                  {Object.entries(DUE_RULE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              {r.due_rule_type === 'fixed' ? (
                <Field label="날짜">
                  <Input type="date" value={r.due_fixed_date} onChange={(e) => update(i, { due_fixed_date: e.target.value })} />
                </Field>
              ) : (
                <Field label={r.due_rule_type === 'after_registration' ? '신청 후 며칠' : '출국 며칠 전'}>
                  <Input type="number" min={0} value={r.due_offset_days} onChange={(e) => update(i, { due_offset_days: e.target.value })} />
                </Field>
              )}
              {r.kind === 'extra' ? (
                <Button variant="ghost" onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}>
                  삭제
                </Button>
              ) : r.kind === 'balance' ? (
                <Button
                  variant="ghost"
                  onClick={() => update(i, { amount: String(Math.max(program.total_price - (deposit?.amount ?? 0), 0)) })}
                >
                  자동 계산
                </Button>
              ) : (
                <div />
              )}
            </div>
          </Card>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              setRows((prev) => [...prev, { kind: 'extra', label: '', amount: '', due_rule_type: 'before_start', due_fixed_date: '', due_offset_days: '45' }])
            }
          >
            + 추가 납부 항목(항공권 등)
          </Button>
          {!rows.some((r) => r.kind === 'deposit') && (
            <Button
              variant="secondary"
              onClick={() =>
                setRows((prev) => [{ kind: 'deposit', label: '예약금', amount: '', due_rule_type: 'after_registration', due_fixed_date: '', due_offset_days: '7' }, ...prev])
              }
            >
              + 예약금
            </Button>
          )}
        </div>
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <p className="font-semibold text-slate-900">미리보기</p>
          <div className="w-48">
            <Field label="이 날 신청하면">
              <Input type="date" value={previewDate} onChange={(e) => setPreviewDate(e.target.value || todayKst())} />
            </Field>
          </div>
        </div>
        {preview.length === 0 ? (
          <p className="text-sm text-slate-500">규칙을 입력하면 납부 기한이 계산됩니다.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {preview.map((p, idx) => (
              <li key={idx} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-1.5 last:border-0">
                <span className="text-slate-700">{p.label}</span>
                <span className="font-medium text-slate-900">
                  {won(p.amount)} · {formatDateKo(p.due_date)}까지
                  {p.adjusted && <span className="ml-1 text-xs text-amber-700">(규칙상 기한이 지나 신청일로)</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-slate-500">
          예: 오늘 신청하면 예약금 {preview.find((p) => p.kind === 'deposit') ? formatDateKo(preview.find((p) => p.kind === 'deposit')!.due_date) : '-'}, 잔금{' '}
          {preview.find((p) => p.kind === 'balance') ? formatDateKo(preview.find((p) => p.kind === 'balance')!.due_date) : '-'}까지
        </p>
      </Card>

      {/* 커미션 — 내부 전용 */}
      <Card className="ring-amber-300">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="font-semibold text-slate-900">MOU 학원 커미션</p>
          <Badge tone="amber">내부 전용 · 학부모 화면·알림에 표시되지 않음</Badge>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="1인당 커미션(원)" hint="기준표 금액 = 학원 실수령액. 비우면 '미정'">
            <Input inputMode="numeric" value={commission} onChange={(e) => setCommission(e.target.value)} />
          </Field>
          <div>
            <p className="mb-1 text-sm font-medium text-slate-700">지급 시점</p>
            <p className="text-sm text-slate-800">{COMMISSION_PAY_RULE[program.type] ?? '-'}</p>
          </div>
          <Field
            label="학원 사전 고지일 (협약서 제8조)"
            hint={`고지 기한 ${formatDateKo(noticeDeadline)} (개시 30일 전)`}
          >
            <Input type="date" value={noticeOn} onChange={(e) => setNoticeOn(e.target.value)} />
          </Field>
        </div>
        {!noticeOn && (
          <p className={`mt-3 text-sm ${daysToNotice <= 7 ? 'font-semibold text-red-700' : 'text-amber-800'}`}>
            {daysToNotice >= 0
              ? `커미션 사전 고지 기한까지 ${daysToNotice}일 남았습니다. 고지하지 않으면 서면 합의 없이는 커미션이 발생하지 않습니다.`
              : `커미션 사전 고지 기한이 ${-daysToNotice}일 지났습니다. 대표님께 보고해 주세요.`}
          </p>
        )}
        {!noticeOn && (
          <Button variant="ghost" className="mt-2" onClick={() => setNoticeOn(todayKst())}>
            오늘 고지함으로 기록
          </Button>
        )}
        {noticeOn && <p className="mt-3 text-sm text-slate-600">이의 제기 기한: {formatDateKo(addDays(noticeOn, 7))} (고지 후 7일, 제8조②)</p>}
      </Card>

      {(errors.length > 0 || liveErrors.length > 0) && (
        <Alert tone={errors.length > 0 ? 'red' : 'amber'}>
          <ul className="list-disc pl-4">
            {(errors.length > 0 ? errors : liveErrors).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Alert>
      )}
      <Button onClick={() => void save()} disabled={saving}>
        {saving ? '저장 중…' : '납부 규칙 저장'}
      </Button>
    </div>
  )
}
