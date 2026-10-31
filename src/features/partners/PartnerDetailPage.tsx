import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { Alert, Badge, Button, Card, PageHeader, Spinner, Tabs } from '../../components/ui'
import { applyLink, publicSiteUrl } from '../../domain/links'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { AgreementsSection } from './AgreementsSection'
import { errorMessage, type Partner, type PartnerAgreement, type PartnerContact, type PayoutAccount } from './api'
import { ContactsSection } from './ContactsSection'
import { PartnerForm } from './PartnerForm'
import { PayoutSection } from './PayoutSection'
import { QrPanel } from '../../components/shared/QrPanel'

type Tab = 'info' | 'links' | 'contacts' | 'agreements' | 'payout'

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'info', label: '기본 정보' },
  { value: 'links', label: '링크·QR' },
  { value: 'contacts', label: '상담실장·담당자' },
  { value: 'agreements', label: '협약' },
  { value: 'payout', label: '커미션 지급 계좌' },
]

type Data = {
  partner: Partner
  contacts: PartnerContact[]
  agreements: PartnerAgreement[]
  payouts: PayoutAccount[]
}

export function PartnerDetailPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'info') as Tab
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [data, setData] = useState<Data | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string } | null>(null)

  const load = useCallback(async () => {
    const { data: partner } = await supabase.from('partners').select('*').eq('id', id).maybeSingle()
    if (!partner) {
      setNotFound(true)
      return
    }
    const [contacts, agreements, payouts] = await Promise.all([
      supabase.from('partner_contacts').select('*').eq('partner_id', id).order('active', { ascending: false }).order('name'),
      supabase.from('v_partner_agreements').select('*').eq('partner_id', id).order('start_date', { ascending: false }),
      supabase.from('payout_accounts').select('*'),
    ])
    const contactIds = new Set((contacts.data ?? []).map((c) => c.id))
    setData({
      partner,
      contacts: contacts.data ?? [],
      agreements: agreements.data ?? [],
      payouts: (payouts.data ?? []).filter((p) => p.partner_id === id || (p.contact_id && contactIds.has(p.contact_id))),
    })
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  if (notFound) {
    return (
      <Card>
        <p className="text-sm text-slate-600">학원을 찾을 수 없습니다.</p>
        <Link to="/admin/partners" className="mt-2 inline-block text-sm text-brand-600">
          목록으로
        </Link>
      </Card>
    )
  }
  if (!data) return <Spinner />

  const { partner, contacts, agreements, payouts } = data
  const base = publicSiteUrl()
  const counselorPayees = contacts.filter((c) =>
    agreements.some((a) => a.form === 'counselor' && a.contact_id === c.id),
  )

  async function lockPartnerCode(): Promise<boolean> {
    const { error } = await supabase.from('partners').update({ code_locked: true }).eq('id', partner.id)
    if (error) {
      setMessage({ tone: 'red', text: '코드를 잠그지 못했습니다.' })
      return false
    }
    await load()
    return true
  }

  async function lockContactCode(contactId: string): Promise<boolean> {
    // 담당자 링크는 학원 코드도 함께 쓰므로 둘 다 잠근다
    const [a, b] = await Promise.all([
      supabase.from('partners').update({ code_locked: true }).eq('id', partner.id),
      supabase.from('partner_contacts').update({ code_locked: true }).eq('id', contactId),
    ])
    if (a.error || b.error) {
      setMessage({ tone: 'red', text: '코드를 잠그지 못했습니다.' })
      return false
    }
    await load()
    return true
  }

  return (
    <>
      <PageHeader
        title={partner.name}
        description={[partner.region, partner.director_name && `${partner.director_name} 원장`].filter(Boolean).join(' · ')}
        actions={
          <Link to="/admin/partners" className="text-sm text-slate-500 hover:text-slate-800">
            목록으로
          </Link>
        }
      />
      {!partner.active && (
        <div className="mb-4">
          <Alert tone="amber">비활성 학원입니다.</Alert>
        </div>
      )}
      {message && (
        <div className="mb-4">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}

      <Tabs tabs={TABS} value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} />

      {tab === 'info' && (
        <Card>
          <PartnerForm
            key={partner.updated_at}
            partner={partner}
            canEditLockedCode={isAdmin}
            submitLabel="저장"
            onSubmit={async (values) => {
              const { error } = await supabase.from('partners').update(values).eq('id', partner.id)
              if (error) return errorMessage(error, '저장하지 못했습니다.')
              setMessage({ tone: 'green', text: '학원 정보를 저장했습니다.' })
              await load()
              return null
            }}
          />
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            <Button
              variant={partner.active ? 'danger' : 'secondary'}
              onClick={async () => {
                if (partner.active && !window.confirm('이 학원을 비활성화할까요? 기존 기록과 커미션 정산은 그대로 유지됩니다.')) return
                await supabase.from('partners').update({ active: !partner.active }).eq('id', partner.id)
                await load()
              }}
            >
              {partner.active ? '학원 비활성화' : '다시 활성화'}
            </Button>
            {isAdmin && partner.code_locked && (
              <Button
                variant="ghost"
                onClick={async () => {
                  if (!window.confirm('코드 잠금을 풀면 이미 배포된 QR·링크가 깨질 수 있습니다. 계속할까요?')) return
                  await supabase.from('partners').update({ code_locked: false }).eq('id', partner.id)
                  await load()
                }}
              >
                코드 잠금 해제 (관리자)
              </Button>
            )}
          </div>
        </Card>
      )}

      {tab === 'links' && (
        <div className="space-y-3">
          <Alert tone="blue">
            학원 전체 링크와 상담실장별 링크를 나눠 쓸 수 있습니다. 상담실장별 링크를 쓰면 누가 소개했는지 자동으로 기록됩니다. 학원에는 학생
            개인정보가 아닌 건수 통계만 공유합니다.
          </Alert>
          <QrPanel
            title="학원 상담 신청 링크"
            url={applyLink(base, partner.code)}
            fileBaseName={`인투유학_상담신청_${partner.name}`}
            locked={partner.code_locked}
            onLock={lockPartnerCode}
          />
          {contacts
            .filter((c) => c.active)
            .map((c) => (
              <QrPanel
                key={c.id}
                title={`${c.name} 전용 링크`}
                url={applyLink(base, partner.code, c.code)}
                fileBaseName={`인투유학_상담신청_${partner.name}_${c.name}`}
                locked={c.code_locked && partner.code_locked}
                onLock={() => lockContactCode(c.id)}
              />
            ))}
          {contacts.length === 0 && (
            <p className="text-sm text-slate-500">
              상담실장을 등록하면 전용 링크가 여기에 나타납니다.{' '}
              <button type="button" className="text-brand-600 hover:underline" onClick={() => setParams({ tab: 'contacts' })}>
                담당자 추가하기
              </button>
            </p>
          )}
          <p className="text-xs text-slate-500">캠프별 등록 신청서 링크(학원 코드 포함)는 캠프 만들기 화면에서 함께 만들어집니다.</p>
        </div>
      )}

      {tab === 'contacts' && <ContactsSection partnerId={partner.id} contacts={contacts} isAdmin={isAdmin} onChanged={load} />}

      {tab === 'agreements' && (
        <AgreementsSection
          partnerId={partner.id}
          partnerRegion={partner.region}
          agreements={agreements}
          contacts={contacts}
          onChanged={load}
        />
      )}

      {tab === 'payout' && (
        <PayoutSection
          partnerId={partner.id}
          partnerName={partner.name}
          accounts={payouts}
          counselorPayees={counselorPayees}
          onChanged={load}
        />
      )}

      {tab !== 'info' && agreements.length === 0 && (
        <div className="mt-4">
          <Badge tone="red">협약 정보가 아직 없습니다</Badge>
        </div>
      )}
    </>
  )
}
