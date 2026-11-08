import { useEffect, useState } from 'react'
import { Field, Input, Select } from '../ui'
import { CONTACT_ROLE_LABELS } from '../../lib/labels'
import { useLang } from '../../i18n/context'
import {
  CONTACT_UNKNOWN,
  inflowText,
  PARTNER_NOT_LISTED,
  type InflowConfig,
  type InflowValue,
} from '../../domain/formSettings'

export type InflowPartner = { id: string; name: string; region: string | null }
export type InflowContact = { id: string; name: string; role?: string }

// "어디서 알게 되셨나요?" — 경로를 고르고, 학원 소개면 학원·선생님, 그 밖에는 필요한 내용을 적는다
export function InflowField({
  config,
  value,
  onChange,
  partners,
  loadContacts,
  error,
}: {
  config: InflowConfig
  value: InflowValue
  onChange: (next: InflowValue) => void
  partners: InflowPartner[]
  loadContacts: (partnerId: string) => Promise<InflowContact[]>
  error?: string | null
}) {
  const [loaded, setLoaded] = useState<{ partnerId: string; list: InflowContact[] }>({ partnerId: '', list: [] })
  const channel = config.channels.find((c) => c.id === value.channelId)
  const { lang, en, tr } = useLang()

  const partnerPicked = channel?.kind === 'partner' && !!value.partnerId && value.partnerId !== PARTNER_NOT_LISTED
  useEffect(() => {
    let cancelled = false
    if (partnerPicked) loadContacts(value.partnerId).then((list) => !cancelled && setLoaded({ partnerId: value.partnerId, list }))
    return () => {
      cancelled = true
    }
  }, [partnerPicked, value.partnerId, loadContacts])
  const contacts = partnerPicked && loaded.partnerId === value.partnerId ? loaded.list : []

  return (
    <div className="space-y-3" id="field-inflow">
      <Field label={inflowText(config.label, lang)}>
        <Select
          value={value.channelId}
          onChange={(e) => onChange({ channelId: e.target.value, partnerId: '', contactId: '', detail: '' })}
        >
          <option value="">{tr('선택해 주세요', 'Please select')}</option>
          {config.channels.map((c) => (
            <option key={c.id} value={c.id}>
              {inflowText(c.label, lang)}
            </option>
          ))}
        </Select>
      </Field>

      {channel?.kind === 'partner' && (
        <>
          <Field label={tr('소개해 준 학원', 'Referring academy')}>
            <Select value={value.partnerId} onChange={(e) => onChange({ ...value, partnerId: e.target.value, contactId: '', detail: '' })}>
              <option value="">{tr('선택해 주세요', 'Please select')}</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.region ? ` (${p.region})` : ''}
                </option>
              ))}
              <option value={PARTNER_NOT_LISTED}>{tr('목록에 없어요 (직접 입력)', 'Not listed (type the name)')}</option>
            </Select>
          </Field>
          {value.partnerId === PARTNER_NOT_LISTED && (
            <Field label={tr('학원 이름', 'Academy name')}>
              <Input maxLength={100} value={value.detail} onChange={(e) => onChange({ ...value, detail: e.target.value })} />
            </Field>
          )}
          {contacts.length > 0 && (
            <Field label={tr('소개해 주신 선생님 (선택)', 'Teacher who referred you (optional)')}>
              <Select value={value.contactId} onChange={(e) => onChange({ ...value, contactId: e.target.value })}>
                <option value="">{tr('선택 안 함', 'Not selected')}</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.role && !en ? (CONTACT_ROLE_LABELS[c.role] ?? '') : ''}
                  </option>
                ))}
                <option value={CONTACT_UNKNOWN}>{tr('잘 모르겠어요', "I'm not sure")}</option>
              </Select>
            </Field>
          )}
        </>
      )}

      {channel?.kind === 'detail' && (
        <Field label={channel.detail_label ? inflowText(channel.detail_label, lang) : tr('내용', 'Details')}>
          <Input maxLength={100} value={value.detail} onChange={(e) => onChange({ ...value, detail: e.target.value })} />
        </Field>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
