// 학원별 캠프비 할인 (캠프마다, 관리자·직원만) — 이 학원 소개로 신청한 등록생의 캠프비에서 뺀다
import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Card, Field, Input, Select } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { won, type Program } from './api'

export type PartnerDiscount = { id: string; partner_id: string; amount: number; note: string | null; partner_name: string }
type PartnerOption = { id: string; name: string; region: string | null }

export async function loadPartnerDiscounts(programId: string): Promise<PartnerDiscount[]> {
  const { data } = await supabase
    .from('program_partner_discounts')
    .select('id, partner_id, amount, note, partners(name)')
    .eq('program_id', programId)
    .order('created_at')
  return (data ?? []).map((d) => ({
    id: d.id,
    partner_id: d.partner_id,
    amount: d.amount,
    note: d.note,
    partner_name: (d.partners as { name: string } | null)?.name ?? '(삭제된 학원)',
  }))
}

const digits = (s: string) => s.replace(/[^0-9]/g, '')

export function PartnerDiscounts({
  program,
  discounts,
  onChanged,
}: {
  program: Program
  discounts: PartnerDiscount[]
  onChanged: () => Promise<void>
}) {
  const [partners, setPartners] = useState<PartnerOption[]>([])
  const [partnerId, setPartnerId] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void supabase
      .from('partners')
      .select('id, name, region')
      .eq('active', true)
      .is('deleted_at', null)
      .order('name')
      .then(({ data }) => setPartners(data ?? []))
  }, [])

  const used = new Set(discounts.map((d) => d.partner_id))
  const available = partners.filter((p) => !used.has(p.id))

  async function add() {
    setError('')
    const n = Number(digits(amount))
    if (!partnerId) return setError('학원을 선택해 주세요.')
    if (!n) return setError('할인 금액을 입력해 주세요.')
    if (program.total_price > 0 && n >= program.total_price) return setError('할인 금액은 총 참가비보다 작아야 합니다.')
    setBusy(true)
    const { error: err } = await supabase
      .from('program_partner_discounts')
      .insert({ program_id: program.id, partner_id: partnerId, amount: n, note: note.trim() || null })
    setBusy(false)
    if (err) return setError(err.code === '23505' ? '이미 할인이 등록된 학원입니다.' : '저장하지 못했습니다.')
    setPartnerId('')
    setAmount('')
    setNote('')
    await onChanged()
  }

  async function saveAmount(d: PartnerDiscount) {
    const n = Number(digits(edits[d.id] ?? ''))
    if (!n) return setError('할인 금액을 입력해 주세요.')
    setBusy(true)
    const { error: err } = await supabase.from('program_partner_discounts').update({ amount: n }).eq('id', d.id)
    setBusy(false)
    if (err) return setError('저장하지 못했습니다.')
    setEdits((prev) => {
      const next = { ...prev }
      delete next[d.id]
      return next
    })
    await onChanged()
  }

  async function remove(d: PartnerDiscount) {
    if (!confirm(`${d.partner_name} 할인을 삭제할까요? 이미 신청한 등록생의 금액은 바뀌지 않습니다.`)) return
    setBusy(true)
    const { error: err } = await supabase.from('program_partner_discounts').delete().eq('id', d.id)
    setBusy(false)
    if (err) return setError('삭제하지 못했습니다.')
    await onChanged()
  }

  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="font-semibold text-slate-900">학원별 할인</p>
        <Badge tone="gray">관리자·직원만 보임</Badge>
      </div>
      <p className="mb-3 text-sm text-slate-600">
        아래 학원 소개로 신청한 등록생은 캠프비(예약금·잔금)에서 이 금액을 뺍니다. 얼리버드와 함께 적용됩니다. 신청하는 순간의 할인이 적용되며, 이미
        신청한 등록생에게는 자동으로 바뀌지 않습니다.
      </p>

      {discounts.length === 0 ? (
        <p className="mb-3 text-sm text-slate-500">등록된 학원별 할인이 없습니다.</p>
      ) : (
        <ul className="mb-4 divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200" aria-label="학원별 할인 목록">
          {discounts.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">{d.partner_name}</p>
                {d.note && <p className="text-xs text-slate-500">{d.note}</p>}
              </div>
              {edits[d.id] !== undefined ? (
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={`${d.partner_name} 할인 금액`}
                    inputMode="numeric"
                    className="w-32"
                    value={edits[d.id]}
                    onChange={(e) => setEdits((prev) => ({ ...prev, [d.id]: e.target.value }))}
                  />
                  <Button variant="secondary" disabled={busy} onClick={() => void saveAmount(d)}>
                    저장
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  className="font-semibold text-blue-700 underline-offset-2 hover:underline"
                  onClick={() => setEdits((prev) => ({ ...prev, [d.id]: String(d.amount) }))}
                  aria-label={`${d.partner_name} 할인 금액 수정`}
                >
                  −{won(d.amount)}
                </button>
              )}
              <Button variant="ghost" disabled={busy} onClick={() => void remove(d)}>
                삭제
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_160px_1fr_auto] sm:items-end">
        <Field label="학원">
          <Select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
            <option value="">학원 선택</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.region ? ` (${p.region})` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="할인 금액(원)">
          <Input inputMode="numeric" placeholder="예: 200000" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="메모 (선택)">
          <Input placeholder="예: MOU 특별 할인" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Button variant="secondary" disabled={busy} onClick={() => void add()}>
          + 할인 추가
        </Button>
      </div>
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
    </Card>
  )
}
