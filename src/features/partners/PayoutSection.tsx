import { useState, type FormEvent } from 'react'
import { Alert, Button, Card, Field, Input, Select, Textarea } from '../../components/ui'
import { SETTLEMENT_METHOD_LABELS } from '../../lib/labels'
import { supabase } from '../../lib/supabase'
import { errorMessage, type PartnerContact, type PayoutAccount } from './api'

// 커미션 지급 계좌: 학원 계좌 + (상담실장판 협약이 있으면) 개인 계좌
export function PayoutSection({
  partnerId,
  partnerName,
  accounts,
  counselorPayees,
  onChanged,
}: {
  partnerId: string
  partnerName: string
  accounts: PayoutAccount[]
  counselorPayees: PartnerContact[]
  onChanged: () => Promise<void>
}) {
  return (
    <div className="space-y-4">
      <Alert tone="blue">
        협약서 제7조④: 커미션은 파트너 학원이 지정한 계좌로 이체합니다. 기준표 금액이 실수령액이며 세무 비용(원천징수 3.3% 등)은 본사가
        부담합니다. 정산 방식(원천징수·세금계산서)은 세무 확인 후 확정합니다.
      </Alert>
      <PayoutForm
        title={`${partnerName} (학원 계좌)`}
        subject={{ partner_id: partnerId }}
        account={accounts.find((a) => a.partner_id === partnerId)}
        onChanged={onChanged}
      />
      {counselorPayees.map((c) => (
        <PayoutForm
          key={c.id}
          title={`${c.name} (상담실장판 협약 — 개인 계좌)`}
          subject={{ contact_id: c.id }}
          account={accounts.find((a) => a.contact_id === c.id)}
          onChanged={onChanged}
        />
      ))}
    </div>
  )
}

function PayoutForm({
  title,
  subject,
  account,
  onChanged,
}: {
  title: string
  subject: { partner_id: string } | { contact_id: string }
  account?: PayoutAccount
  onChanged: () => Promise<void>
}) {
  const [bank, setBank] = useState(account?.bank_name ?? '')
  const [number, setNumber] = useState(account?.account_number ?? '')
  const [holder, setHolder] = useState(account?.account_holder ?? '')
  const [method, setMethod] = useState(account?.settlement_method ?? 'withholding')
  const [memo, setMemo] = useState(account?.memo ?? '')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSaved(false)
    const accountNumber = number.replace(/[^0-9-]/g, '')
    if (!bank.trim() || !accountNumber || !holder.trim()) return setError('은행, 계좌번호, 예금주를 모두 입력해 주세요.')
    if (!/^[0-9-]{6,30}$/.test(accountNumber)) return setError('계좌번호 형식을 확인해 주세요.')
    setSaving(true)
    const row = {
      partner_id: 'partner_id' in subject ? subject.partner_id : null,
      contact_id: 'contact_id' in subject ? subject.contact_id : null,
      bank_name: bank.trim(),
      account_number: accountNumber,
      account_holder: holder.trim(),
      settlement_method: method,
      memo: memo.trim() || null,
    }
    const { error } = account
      ? await supabase.from('payout_accounts').update(row).eq('id', account.id)
      : await supabase.from('payout_accounts').insert(row)
    setSaving(false)
    if (error) return setError(errorMessage(error, '저장하지 못했습니다.'))
    setSaved(true)
    await onChanged()
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <p className="font-semibold text-slate-900">{title}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="은행">
            <Input value={bank} onChange={(e) => setBank(e.target.value)} />
          </Field>
          <Field label="계좌번호">
            <Input inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} />
          </Field>
          <Field label="예금주">
            <Input value={holder} onChange={(e) => setHolder(e.target.value)} />
          </Field>
          <Field label="정산 방식">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {Object.entries(SETTLEMENT_METHOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="메모">
              <Textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
            </Field>
          </div>
        </div>
        {error && <Alert>{error}</Alert>}
        {saved && <Alert tone="green">지급 계좌를 저장했습니다.</Alert>}
        <Button type="submit" disabled={saving}>
          {saving ? '저장 중…' : account ? '계좌 수정' : '계좌 등록'}
        </Button>
      </form>
    </Card>
  )
}
