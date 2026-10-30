import { useState, type FormEvent } from 'react'
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Select, Textarea } from '../../components/ui'
import { AGREEMENT_FORM_LABELS, AGREEMENT_STATUS, AGREEMENT_TYPE_LABELS } from '../../lib/labels'
import { supabase } from '../../lib/supabase'
import { errorMessage, findExclusiveConflicts, type PartnerAgreement, type PartnerContact } from './api'

type Draft = {
  agreement_type: string
  form: string
  contact_id: string
  start_date: string
  end_date: string
  auto_renew: boolean
  exclusive_region: string
  signed_on: string
  termination_notified_on: string
  terminated_on: string
  memo: string
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function addYearsMinusDay(date: string, years: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCFullYear(d.getUTCFullYear() + years)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export function AgreementsSection({
  partnerId,
  partnerRegion,
  agreements,
  contacts,
  onChanged,
}: {
  partnerId: string
  partnerRegion: string | null
  agreements: PartnerAgreement[]
  contacts: PartnerContact[]
  onChanged: () => Promise<void>
}) {
  const [editing, setEditing] = useState<PartnerAgreement | 'new' | null>(null)
  const [message, setMessage] = useState('')

  return (
    <div className="space-y-3">
      <Alert tone="blue">
        협약서 기준: 기간 만료 14일 전까지 서면 해지 통보가 없으면 1년씩 자동 연장(제4조②), 해지는 통보 도달 후 14일 경과 시(제10조①),
        해지 전 등록이 끝난 학생의 커미션은 정상 정산(제10조③)합니다.
      </Alert>
      {message && <Alert tone="green">{message}</Alert>}
      {agreements.length === 0 && !editing && <EmptyState>등록된 협약이 없습니다. 협약서 내용을 입력해 주세요.</EmptyState>}

      {agreements.map((a) => {
        if (editing !== 'new' && editing?.id === a.id) return null
        const st = AGREEMENT_STATUS[a.status ?? 'active']
        return (
          <Card key={a.id}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-900">
                    {AGREEMENT_TYPE_LABELS[a.agreement_type ?? 'basic']} · {AGREEMENT_FORM_LABELS[a.form ?? 'into']}
                  </p>
                  {st && <Badge tone={st.tone}>{st.label}</Badge>}
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {a.start_date} ~ {a.end_date}
                  {a.auto_renew && a.effective_end_date !== a.end_date && ` (자동 연장 → ${a.effective_end_date})`}
                  {a.auto_renew ? ' · 자동 연장' : ' · 자동 연장 안 함'}
                </p>
                {a.agreement_type === 'exclusive' && <p className="text-sm text-amber-800">독점 지역: {a.exclusive_region}</p>}
                {a.form === 'counselor' && (
                  <p className="text-sm text-slate-600">계약 상대: {contacts.find((c) => c.id === a.contact_id)?.name ?? '-'}</p>
                )}
                {a.termination_notified_on && (
                  <p className="text-sm text-red-700">
                    해지 통보 {a.termination_notified_on} → 해지일 {a.terminated_on ?? '-'}
                  </p>
                )}
                {a.memo && <p className="mt-1 text-sm text-slate-600">{a.memo}</p>}
              </div>
              <Button variant="secondary" onClick={() => setEditing(a)}>
                수정
              </Button>
            </div>
          </Card>
        )
      })}

      {editing ? (
        <AgreementForm
          partnerId={partnerId}
          partnerRegion={partnerRegion}
          agreement={editing === 'new' ? undefined : editing}
          contacts={contacts}
          onCancel={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            setMessage('협약 정보를 저장했습니다.')
            await onChanged()
          }}
        />
      ) : (
        <Button onClick={() => setEditing('new')}>+ 협약 추가</Button>
      )}
    </div>
  )
}

function AgreementForm({
  partnerId,
  partnerRegion,
  agreement,
  contacts,
  onCancel,
  onSaved,
}: {
  partnerId: string
  partnerRegion: string | null
  agreement?: PartnerAgreement
  contacts: PartnerContact[]
  onCancel: () => void
  onSaved: () => Promise<void>
}) {
  const [d, setD] = useState<Draft>({
    agreement_type: agreement?.agreement_type ?? 'basic',
    form: agreement?.form ?? 'into',
    contact_id: agreement?.contact_id ?? '',
    start_date: agreement?.start_date ?? '',
    end_date: agreement?.end_date ?? '',
    auto_renew: agreement?.auto_renew ?? true,
    exclusive_region: agreement?.exclusive_region ?? partnerRegion ?? '',
    signed_on: agreement?.signed_on ?? '',
    termination_notified_on: agreement?.termination_notified_on ?? '',
    terminated_on: agreement?.terminated_on ?? '',
    memo: agreement?.memo ?? '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setD((prev) => ({ ...prev, [key]: value }))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!d.start_date || !d.end_date) return setError('계약 시작일과 종료일을 입력해 주세요.')
    if (d.end_date < d.start_date) return setError('종료일이 시작일보다 빠릅니다.')
    if (d.agreement_type === 'exclusive' && !d.exclusive_region.trim()) return setError('독점권형은 독점 지역을 입력해야 합니다.')
    if (d.form === 'counselor' && !d.contact_id) return setError('상담실장판은 계약 상대 담당자를 선택해야 합니다.')

    if (d.agreement_type === 'exclusive') {
      const conflicts = await findExclusiveConflicts(d.exclusive_region, partnerId)
      if (
        conflicts.length > 0 &&
        !window.confirm(
          `같은 지역에 독점권 협약이 있습니다: ${conflicts.map((c) => `${c.partnerName}(${c.region})`).join(', ')}\n대표님 확인 후 진행하셨나요?`,
        )
      ) {
        return
      }
    }

    setSaving(true)
    const row = {
      partner_id: partnerId,
      agreement_type: d.agreement_type,
      form: d.form,
      contact_id: d.form === 'counselor' ? d.contact_id : null,
      start_date: d.start_date,
      end_date: d.end_date,
      auto_renew: d.auto_renew,
      exclusive_region: d.agreement_type === 'exclusive' ? d.exclusive_region.trim() : null,
      signed_on: d.signed_on || null,
      termination_notified_on: d.termination_notified_on || null,
      terminated_on: d.terminated_on || null,
      memo: d.memo.trim() || null,
    }
    const { error } = agreement?.id
      ? await supabase.from('partner_agreements').update(row).eq('id', agreement.id)
      : await supabase.from('partner_agreements').insert(row)
    setSaving(false)
    if (error) return setError(errorMessage(error, '저장하지 못했습니다.'))
    await onSaved()
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <p className="font-semibold text-slate-900">{agreement ? '협약 수정' : '협약 추가'}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="협약 유형">
            <Select value={d.agreement_type} onChange={(e) => set('agreement_type', e.target.value)}>
              <option value="basic">기본형 (제1조~제11조)</option>
              <option value="exclusive">독점권형 (+ 제12조 지역 독점권)</option>
            </Select>
          </Field>
          <Field label="협약서 양식">
            <Select value={d.form} onChange={(e) => set('form', e.target.value)}>
              <option value="into">인투유학판 (학원과 계약)</option>
              <option value="counselor">상담실장판 (개인과 계약)</option>
            </Select>
          </Field>
          {d.form === 'counselor' && (
            <Field label="계약 상대 (상담실장)">
              <Select value={d.contact_id} onChange={(e) => set('contact_id', e.target.value)}>
                <option value="">선택</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {d.agreement_type === 'exclusive' && (
            <Field label="독점 지역" hint="예: 수원 영통">
              <Input value={d.exclusive_region} onChange={(e) => set('exclusive_region', e.target.value)} />
            </Field>
          )}
          <Field label="계약 시작일">
            <Input
              type="date"
              value={d.start_date}
              onChange={(e) => {
                const start = e.target.value
                setD((prev) => ({ ...prev, start_date: start, end_date: prev.end_date || (start ? addYearsMinusDay(start, 1) : '') }))
              }}
            />
          </Field>
          <Field label="계약 종료일">
            <Input type="date" value={d.end_date} onChange={(e) => set('end_date', e.target.value)} />
          </Field>
          <Field label="서명일">
            <Input type="date" value={d.signed_on} onChange={(e) => set('signed_on', e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
            <input type="checkbox" className="size-4" checked={d.auto_renew} onChange={(e) => set('auto_renew', e.target.checked)} />
            자동 연장 (종료 14일 전까지 해지 통보 없으면 1년 연장)
          </label>
          <Field label="해지 통보 도달일" hint="입력하면 해지일이 통보일 + 14일로 채워집니다">
            <Input
              type="date"
              value={d.termination_notified_on}
              onChange={(e) => {
                const notified = e.target.value
                setD((prev) => ({
                  ...prev,
                  termination_notified_on: notified,
                  terminated_on: notified ? addDays(notified, 14) : prev.terminated_on,
                }))
              }}
            />
          </Field>
          <Field label="해지일">
            <Input type="date" value={d.terminated_on} onChange={(e) => set('terminated_on', e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="메모">
              <Textarea value={d.memo} onChange={(e) => set('memo', e.target.value)} />
            </Field>
          </div>
        </div>
        {error && <Alert>{error}</Alert>}
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? '저장 중…' : '저장'}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            취소
          </Button>
        </div>
      </form>
    </Card>
  )
}
