import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { AttributionCard } from '../../components/shared/AttributionCard'
import { NotesPanel } from '../../components/shared/NotesPanel'
import { Alert, Badge, Card, PageHeader, Spinner } from '../../components/ui'
import { formatDateKo } from '../../domain/dates'
import { formatPhone } from '../../domain/phone'
import { formatKst } from '../../lib/datetime'
import { waitingAttribution, type RegistrationStatus } from '../../domain/registrationStatus'
import { REGISTRATION_STATUS } from '../../lib/labels'
import { useAuth } from '../auth/AuthProvider'
import { CONSENT_RECORD_LABELS, getRegistration } from './api'
import { PassportPanel } from './PassportPanel'
import { PaymentsCard } from './PaymentsCard'
import { RefundsCard, StatusActions } from './StatusCards'
import { CommissionSummary } from './CommissionSummary'

function Item({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{value || '-'}</dd>
    </div>
  )
}

export function RegistrationDetailPage() {
  const { id = '' } = useParams()
  const { profile } = useAuth()
  const [data, setData] = useState<Awaited<ReturnType<typeof getRegistration>> | null>(null)
  const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string } | null>(null)

  const load = useCallback(async () => setData(await getRegistration(id)), [id])
  useEffect(() => {
    void load()
  }, [load])

  if (!data) return <Spinner />
  const r = data.registration
  if (!r) {
    return (
      <Card>
        <p className="text-sm text-slate-600">등록 정보를 찾을 수 없습니다.</p>
      </Card>
    )
  }
  const st = REGISTRATION_STATUS[r.status]
  const p = r.programs
  const destroyed = !!r.destroyed_at

  return (
    <>
      <PageHeader
        title={destroyed ? '(개인정보 파기됨)' : `${r.student_name_ko} 등록생`}
        description={p ? `${p.name}${p.season ? ` (${p.season})` : ''} · ${formatDateKo(p.start_date)} 출국` : undefined}
        actions={st && <Badge tone={st.tone}>{st.label}</Badge>}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card>
            <p className="mb-3 font-semibold text-slate-900">신청 정보</p>
            {destroyed ? (
              <p className="text-sm text-slate-500">{formatKst(r.destroyed_at)}에 개인정보가 파기되었습니다.</p>
            ) : (
              <dl className="grid gap-4 sm:grid-cols-2">
                <Item label="학생(한글)" value={r.student_name_ko} />
                <Item label="영문 이름" value={r.student_name_en} />
                <Item label="생년월일" value={r.birth_date} />
                <Item label="성별" value={r.gender === 'male' ? '남' : r.gender === 'female' ? '여' : null} />
                <Item label="학교·학년" value={[r.school, r.grade].filter(Boolean).join(' · ')} />
                <Item label="영어 수준" value={r.english_level} />
                <Item label="학부모" value={r.parent_name} />
                <Item label="연락처" value={formatPhone(r.parent_phone)} />
                <Item label="이메일" value={r.parent_email} />
                <Item label="주소" value={r.address} />
                <Item
                  label="비상 연락처"
                  value={[r.emergency_name, r.emergency_relation, formatPhone(r.emergency_phone)].filter(Boolean).join(' · ')}
                />
                <Item label="신청일" value={formatDateKo(r.registered_on)} />
                <div className="sm:col-span-2">
                  <Item label="특이사항" value={<span className="whitespace-pre-wrap">{r.special_notes}</span>} />
                </div>
                {data.health && (
                  <div className="sm:col-span-2">
                    <Item label="건강 특이사항(민감정보)" value={<span className="whitespace-pre-wrap">{data.health}</span>} />
                  </div>
                )}
              </dl>
            )}
          </Card>

          {message && <Alert tone={message.tone}>{message.text}</Alert>}
          {waitingAttribution(r.status as RegistrationStatus, data.corePaid, !!r.attribution_confirmed_at) && (
            <Alert tone="amber">예약금·잔금을 모두 받았습니다. 아래 소개 경로를 확인 처리하면 "등록 확정"이 됩니다.</Alert>
          )}
          <StatusActions registration={r} paidTotal={data.paidTotal} onChanged={load} onMessage={setMessage} />
          <PaymentsCard
            key={`${r.status}-${r.registered_on}`}
            registrationId={r.id}
            editable={!destroyed && !['refunded'].includes(r.status)}
            paymentChangedAt={r.payment_changed_at}
            correctionSentAt={r.payment_correction_sent_at}
            onChanged={() => void load()}
            onMessage={setMessage}
          />
          <RefundsCard key={r.status} registrationId={r.id} onChanged={load} onMessage={setMessage} />
          <CommissionSummary registrationId={r.id} />
          <AttributionCard table="registrations" row={r} isAdmin={profile?.role === 'admin'} onChanged={load} onMessage={setMessage} />
          <p className="-mt-2 text-xs text-slate-500">
            학원 제공 동의: {r.partner_id ? (r.partner_share_agreed ? '동의(학원 안내에 이름 표시)' : '미동의(학원 안내에서 이름 가림)') : '-'}
            {r.lead_id && (
              <Link to={`/admin/leads/${r.lead_id}`} className="ml-2 text-brand-600 hover:underline">
                상담 기록 보기
              </Link>
            )}
          </p>

          {p?.passport_upload_enabled && !destroyed && <PassportPanel registrationId={r.id} passportStatus={r.passport_status} onChanged={() => void load()} />}

          <Card>
            <p className="mb-3 font-semibold text-slate-900">동의 기록</p>
            <ul className="divide-y divide-slate-100">
              {data.consents.map((c) => (
                <li key={c.id} className="py-2">
                  <details>
                    <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                      <span className="text-slate-800">{CONSENT_RECORD_LABELS[c.kind] ?? c.kind}</span>
                      <Badge tone={c.agreed ? 'green' : 'gray'}>{c.agreed ? '동의' : '미동의'}</Badge>
                      <span className="text-xs text-slate-500">
                        v{c.document_version}
                        {c.agreed_at ? ` · ${formatKst(c.agreed_at)}` : ''}
                      </span>
                    </summary>
                    <pre className="mt-2 rounded bg-slate-50 p-3 text-xs whitespace-pre-wrap text-slate-600">{c.rendered_text}</pre>
                  </details>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <div className="space-y-4">{!destroyed && <NotesPanel entityType="registration" entityId={r.id} />}</div>
      </div>
    </>
  )
}
