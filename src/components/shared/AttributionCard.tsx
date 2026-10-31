import { useEffect, useState } from 'react'
import { formatKstWithDay } from '../../lib/datetime'
import { ATTRIBUTION_SOURCE, CONTACT_ROLE_LABELS } from '../../lib/labels'
import { supabase } from '../../lib/supabase'
import { Badge, Button, Card, Field, Select } from '../ui'

type Option = { id: string; name: string }

export type AttributionRow = {
  id: string
  partner_id: string | null
  partner_contact_id: string | null
  attribution_confirmed_at: string | null
  attribution_confirmed_by: string | null
  attribution_source: string | null
  source_other: string | null
}

// 소개 경로(커미션 대상) 확인 — 상담 고객 카드·등록생 상세 공통. 확인 후 변경·해제는 관리자만(DB 트리거로도 강제).
export function AttributionCard({
  table,
  row: lead,
  isAdmin,
  onChanged,
  onMessage,
}: {
  table: 'leads' | 'registrations'
  row: AttributionRow
  isAdmin: boolean
  onChanged: () => Promise<void>
  onMessage: (m: { tone: 'green' | 'red'; text: string } | null) => void
}) {
  const confirmed = Boolean(lead.attribution_confirmed_at)
  const [partners, setPartners] = useState<Option[]>([])
  const [contacts, setContacts] = useState<Array<Option & { role: string }>>([])
  const [partnerId, setPartnerId] = useState(lead.partner_id ?? '')
  const [contactId, setContactId] = useState(lead.partner_contact_id ?? '')
  const [confirmer, setConfirmer] = useState<string | null>(null)
  const locked = confirmed && !isAdmin

  useEffect(() => {
    supabase
      .from('partners')
      .select('id, name')
      .is('deleted_at', null)
      .order('name')
      .then(({ data }) => setPartners(data ?? []))
  }, [])

  useEffect(() => {
    if (!partnerId) {
      setContacts([])
      return
    }
    supabase
      .from('partner_contacts')
      .select('id, name, role')
      .eq('partner_id', partnerId)
      .order('name')
      .then(({ data }) => setContacts(data ?? []))
  }, [partnerId])

  useEffect(() => {
    if (!lead.attribution_confirmed_by) return
    supabase
      .from('staff_profiles')
      .select('name')
      .eq('id', lead.attribution_confirmed_by)
      .maybeSingle()
      .then(({ data }) => setConfirmer(data?.name ?? null))
  }, [lead.attribution_confirmed_by])

  async function save(confirm: boolean) {
    onMessage(null)
    const patch: { partner_id: string | null; partner_contact_id: string | null; attribution_confirmed_at?: string } = {
      partner_id: partnerId || null,
      partner_contact_id: partnerId && contactId ? contactId : null,
    }
    if (confirm) patch.attribution_confirmed_at = new Date().toISOString()
    const { error } = await supabase.from(table).update(patch).eq('id', lead.id)
    onMessage(
      error
        ? { tone: 'red', text: /[가-힣]/.test(error.message) ? error.message : '저장하지 못했습니다.' }
        : { tone: 'green', text: confirm ? '소개 경로를 확인했습니다. 이후 변경은 관리자만 할 수 있습니다.' : '소개 경로를 저장했습니다.' },
    )
    await onChanged()
  }

  return (
    <Card className={confirmed ? '' : 'ring-amber-300'}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="font-semibold text-slate-900">소개 경로 (커미션 대상)</p>
        {confirmed ? <Badge tone="green">확인됨</Badge> : <Badge tone="amber">확인 필요</Badge>}
        {lead.attribution_source && <Badge>{ATTRIBUTION_SOURCE[lead.attribution_source] ?? lead.attribution_source}</Badge>}
      </div>
      {!confirmed && (
        <p className="mb-3 text-sm text-slate-600">
          어느 학원의 누가 소개했는지 학부모에게 확인한 뒤 <strong>확인 처리</strong>해 주세요. 커미션은 확인된 소개 경로로 계산됩니다.
          {!lead.partner_id && lead.source_other && ` (학부모 입력: ${lead.source_other})`}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="소개 학원">
          <Select
            value={partnerId}
            disabled={locked}
            onChange={(e) => {
              setPartnerId(e.target.value)
              setContactId('')
            }}
          >
            <option value="">학원 소개 아님</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="소개한 선생님(상담실장)">
          <Select value={contactId} disabled={locked || !partnerId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">{partnerId ? '원장 직접 / 모름' : '-'}</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {CONTACT_ROLE_LABELS[c.role] ?? ''}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!confirmed && (
          <>
            <Button onClick={() => void save(true)}>소개 경로 확인 처리</Button>
            <Button variant="secondary" onClick={() => void save(false)}>
              임시 저장
            </Button>
          </>
        )}
        {confirmed && isAdmin && (
          <>
            <Button variant="secondary" onClick={() => void save(false)}>
              변경 저장 (관리자)
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                if (!window.confirm('소개 경로 확인을 해제할까요? 커미션 대상이 다시 "확인 필요"가 됩니다.')) return
                const { error } = await supabase.from(table).update({ attribution_confirmed_at: null }).eq('id', lead.id)
                onMessage(error ? { tone: 'red', text: '해제하지 못했습니다.' } : { tone: 'green', text: '소개 경로 확인을 해제했습니다.' })
                await onChanged()
              }}
            >
              확인 해제 (관리자)
            </Button>
          </>
        )}
        {confirmed && (
          <p className="text-xs text-slate-500">
            {confirmer ?? '직원'} · {formatKstWithDay(lead.attribution_confirmed_at)} 확인
            {!isAdmin && ' · 변경은 관리자에게 요청해 주세요'}
          </p>
        )}
      </div>
    </Card>
  )
}
