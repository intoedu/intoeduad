import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { QrPanel } from '../../components/shared/QrPanel'
import { Alert, Card, Field, PageHeader, Select } from '../../components/ui'
import { applyLink, publicSiteUrl, registerHubLink } from '../../domain/links'
import { supabase } from '../../lib/supabase'

type PartnerRow = { id: string; name: string; code: string; code_locked: boolean; contacts: Array<{ id: string; name: string; code: string; code_locked: boolean; active: boolean }> }

// 신청 링크 모음: 모든 상담은 한 링크, 모든 캠프 신청은 한 링크
export function LinksPage() {
  const base = publicSiteUrl()
  const [open, setOpen] = useState<Array<{ id: string; name: string; season: string | null; slug: string }>>([])
  const [partners, setPartners] = useState<PartnerRow[]>([])
  const [partnerId, setPartnerId] = useState('')
  const [contactId, setContactId] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    supabase
      .from('programs')
      .select('id, name, season, slug')
      .is('deleted_at', null)
      .eq('status', 'open')
      .order('start_date')
      .then(({ data }) => setOpen(data ?? []))
    void loadPartners()
  }, [])

  async function loadPartners() {
    const { data } = await supabase
      .from('partners')
      .select('id, name, code, code_locked, partner_contacts(id, name, code, code_locked, active)')
      .is('deleted_at', null)
      .eq('active', true)
      .order('name')
    setPartners(
      (data ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        code_locked: p.code_locked,
        contacts: ((p.partner_contacts ?? []) as PartnerRow['contacts']).filter((c) => c.active),
      })),
    )
  }

  const partner = partners.find((p) => p.id === partnerId)
  const contact = partner?.contacts.find((c) => c.id === contactId)

  // 학원·선생님 코드는 처음 배포할 때 잠근다(이미 나간 링크가 깨지지 않도록)
  async function lockCodes(): Promise<boolean> {
    if (!partner) return false
    const res = await supabase.from('partners').update({ code_locked: true }).eq('id', partner.id)
    if (res.error) {
      setMessage('코드를 잠그지 못했습니다. 다시 시도해 주세요.')
      return false
    }
    if (contact) {
      const r2 = await supabase.from('partner_contacts').update({ code_locked: true }).eq('id', contact.id)
      if (r2.error) {
        setMessage('코드를 잠그지 못했습니다. 다시 시도해 주세요.')
        return false
      }
    }
    await loadPartners()
    return true
  }

  const locked = !!partner?.code_locked && (!contact || contact.code_locked)

  return (
    <>
      <PageHeader title="신청 링크" description="학부모님께 보낼 링크와 QR 코드입니다. 상담은 한 링크, 캠프 신청도 한 링크로 받을 수 있습니다." />
      <div className="space-y-4">
        <Card>
          <p className="mb-1 font-semibold text-slate-900">상담 신청 링크 (모든 상담 공통)</p>
          <p className="mb-3 text-sm text-slate-500">
            "어디서 알게 되셨나요?"를 반드시 묻습니다. 질문 문구와 추가 질문은{' '}
            <Link to="/admin/settings/forms" className="text-brand-600 hover:underline">
              설정 → 신청서 질문
            </Link>
            에서 바꿀 수 있습니다(관리자).
          </p>
          <QrPanel title="상담 신청" url={`${base}/apply`} fileBaseName="인투유학_상담신청" locked onLock={async () => true} showLock={false} />
        </Card>

        <Card>
          <p className="mb-1 font-semibold text-slate-900">캠프 신청 링크 (모든 캠프 공통)</p>
          <p className="mb-3 text-sm text-slate-500">
            학부모님이 모집 중인 캠프 중에서 골라 신청합니다. 신청서에서 상담 신청 여부를 묻고, 같은 학부모 번호·학생 이름의 상담 기록이 있으면 자동으로
            연결합니다.
          </p>
          <QrPanel title="캠프 신청" url={registerHubLink(base)} fileBaseName="인투유학_캠프신청" locked onLock={async () => true} showLock={false} />
          <p className="mt-3 text-xs text-slate-500">
            지금 이 링크에 보이는 캠프:{' '}
            {open.length === 0 ? '모집 중인 캠프 없음' : open.map((p) => `${p.name}${p.season ? ` (${p.season})` : ''}`).join(', ')}
          </p>
        </Card>

        <Card>
          <p className="mb-1 font-semibold text-slate-900">학원별 링크</p>
          <p className="mb-3 text-sm text-slate-500">학원(또는 상담실장) 링크로 들어오면 소개 경로가 자동으로 기록되고, 유입 경로를 따로 묻지 않습니다.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="학원">
              <Select
                value={partnerId}
                onChange={(e) => {
                  setPartnerId(e.target.value)
                  setContactId('')
                }}
              >
                <option value="">선택</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="상담실장 (선택)">
              <Select value={contactId} onChange={(e) => setContactId(e.target.value)} disabled={!partner || partner.contacts.length === 0}>
                <option value="">학원 전체</option>
                {partner?.contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {message && (
            <div className="mt-3">
              <Alert>{message}</Alert>
            </div>
          )}
          {partner && (
            <div className="mt-3 space-y-3">
              <QrPanel
                title={`${partner.name}${contact ? ` ${contact.name}` : ''} 상담 신청`}
                url={applyLink(base, partner.code, contact?.code)}
                fileBaseName={`인투유학_상담신청_${partner.name}${contact ? `_${contact.name}` : ''}`}
                locked={locked}
                onLock={lockCodes}
              />
              <QrPanel
                title={`${partner.name}${contact ? ` ${contact.name}` : ''} 캠프 신청`}
                url={registerHubLink(base, partner.code, contact?.code)}
                fileBaseName={`인투유학_캠프신청_${partner.name}${contact ? `_${contact.name}` : ''}`}
                locked={locked}
                onLock={lockCodes}
              />
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
