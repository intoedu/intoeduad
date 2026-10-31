import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { NotesPanel } from '../../components/shared/NotesPanel'
import { Alert, Badge, Button, Card, Field, PageHeader, Select, Spinner } from '../../components/ui'
import { publicSiteUrl } from '../../domain/links'
import { formatPhone } from '../../domain/phone'
import { formatKstWithDay } from '../../lib/datetime'
import { INTEREST_LABELS, LEAD_STATUS, TOPIC_LABELS } from '../../lib/labels'
import { supabase, type TablesUpdate } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { getLead, loadTimeline, type LeadRow, type TimelineItem } from './api'
import { ConsultationCard } from './ConsultationCard'
import { AttributionCard } from '../../components/shared/AttributionCard'

type Option = { id: string; name: string }

export function LeadDetailPage() {
  const { id = '' } = useParams()
  const { profile } = useAuth()
  const [lead, setLead] = useState<LeadRow | null | undefined>(undefined)
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [staff, setStaff] = useState<Option[]>([])
  const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string } | null>(null)

  const load = useCallback(async () => {
    const row = await getLead(id)
    setLead(row)
    if (row) setTimeline(await loadTimeline(row))
  }, [id])

  useEffect(() => {
    void load()
    supabase
      .from('staff_profiles')
      .select('id, name')
      .eq('active', true)
      .neq('role', 'viewer')
      .order('name')
      .then(({ data }) => setStaff(data ?? []))
  }, [load])

  if (lead === undefined) return <Spinner />
  if (lead === null) {
    return (
      <Card>
        <p className="text-sm text-slate-600">상담 신청을 찾을 수 없습니다.</p>
        <Link to="/admin/leads" className="mt-2 inline-block text-sm text-brand-600">
          목록으로
        </Link>
      </Card>
    )
  }

  const destroyed = Boolean(lead.destroyed_at)

  async function updateLead(patch: TablesUpdate<'leads'>, success: string) {
    setMessage(null)
    const { error } = await supabase.from('leads').update(patch).eq('id', lead!.id)
    setMessage(error ? { tone: 'red', text: /[가-힣]/.test(error.message) ? error.message : '저장하지 못했습니다.' } : { tone: 'green', text: success })
    await load()
  }

  async function addConsultation() {
    const { error } = await supabase.from('consultations').insert({ lead_id: lead!.id })
    setMessage(error ? { tone: 'red', text: '상담을 추가하지 못했습니다.' } : { tone: 'green', text: '상담을 추가했습니다. 일정과 방식을 정해 주세요.' })
    await load()
  }

  const openConsultations = lead.consultations.filter((c) => c.status !== 'canceled')
  const st = LEAD_STATUS[lead.status]

  return (
    <>
      <PageHeader
        title={destroyed ? '(개인정보 파기됨)' : `${lead.student_name} 학생 상담`}
        description={`신청 ${formatKstWithDay(lead.created_at)}`}
        actions={
          <Link to="/admin/leads" className="text-sm text-slate-500 hover:text-slate-800">
            목록으로
          </Link>
        }
      />
      {message && (
        <div className="mb-4">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {/* 상태·담당자 */}
          <Card>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="진행 상태">
                <Select value={lead.status} onChange={(e) => void updateLead({ status: e.target.value }, '상태를 변경했습니다.')}>
                  {Object.entries(LEAD_STATUS).map(([value, s]) => (
                    <option key={value} value={value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="담당자">
                <Select
                  value={lead.assigned_to ?? ''}
                  onChange={(e) => void updateLead({ assigned_to: e.target.value || null }, '담당자를 지정했습니다.')}
                >
                  <option value="">없음</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {profile && !lead.assigned_to && (
              <Button variant="ghost" className="mt-2" onClick={() => void updateLead({ assigned_to: profile.id }, '내가 담당하기로 했습니다.')}>
                내가 담당하기
              </Button>
            )}
            {st && (
              <p className="mt-3 text-xs text-slate-500">
                현재 상태 <Badge tone={st.tone}>{st.label}</Badge>
              </p>
            )}
          </Card>

          {/* 신청 내용 */}
          <Card>
            <p className="mb-3 font-semibold text-slate-900">신청 내용</p>
            {destroyed ? (
              <p className="text-sm text-slate-500">보유 기간이 지나 개인정보가 파기되었습니다.</p>
            ) : (
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <Item label="자녀" value={`${lead.student_name} (${lead.student_grade ?? '학년 미입력'})`} />
                <Item
                  label="학부모"
                  value={
                    <>
                      {lead.parent_name} ({lead.relation ?? '-'}){' '}
                      <a href={`tel:${lead.parent_phone}`} className="text-brand-600 hover:underline">
                        {formatPhone(lead.parent_phone)}
                      </a>
                    </>
                  }
                />
                <Item label="관심 분야" value={lead.interests.map((i) => INTEREST_LABELS[i] ?? i).join(', ') || '-'} />
                <Item
                  label="관심 프로그램"
                  value={
                    lead.interests_programs
                      .map((ip) => (ip.program ? `${ip.program.name}${ip.program.season ? ` (${ip.program.season})` : ''}` : null))
                      .filter(Boolean)
                      .join(', ') || '-'
                  }
                />
                <Item label="상담 받고 싶은 내용" value={lead.topics.map((t) => TOPIC_LABELS[t] ?? t).join(', ') || '-'} />
                <div className="sm:col-span-2">
                  <Item label="자세한 내용" value={<span className="whitespace-pre-wrap">{lead.message ?? '-'}</span>} />
                </div>
              </dl>
            )}
          </Card>

          <AttributionCard table="leads" row={lead} isAdmin={profile?.role === 'admin'} onChanged={load} onMessage={setMessage} />

          {/* 상담 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-slate-900">상담</p>
              {openConsultations.length === 0 && !destroyed && (
                <Button variant="secondary" onClick={() => void addConsultation()}>
                  + 상담 추가
                </Button>
              )}
            </div>
            {lead.consultations.length === 0 && <p className="text-sm text-slate-500">아직 잡힌 상담이 없습니다.</p>}
            {[...lead.consultations]
              .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
              .map((c) => (
                <ConsultationCard key={c.id} consultation={c} onChanged={load} />
              ))}
          </div>

          {!destroyed && <RegisterLinkCard lead={lead} onMessage={setMessage} />}
        </div>

        <div className="space-y-4">
          <NotesPanel entityType="lead" entityId={lead.id} onChanged={() => void load()} />
          <Card>
            <p className="mb-3 font-semibold text-slate-900">타임라인</p>
            <ol className="relative space-y-4 border-l border-slate-200 pl-4">
              {timeline.map((t, i) => (
                <li key={`${t.at}-${i}`} className="relative">
                  <span
                    className={`absolute top-1.5 -left-[21px] size-2.5 rounded-full ${
                      t.kind === 'apply' || t.kind === 'register'
                        ? 'bg-brand-600'
                        : t.kind === 'attribution'
                          ? 'bg-amber-500'
                          : t.kind === 'note'
                            ? 'bg-slate-400'
                            : 'bg-green-600'
                    }`}
                    aria-hidden
                  />
                  <p className="text-sm text-slate-800">{t.text}</p>
                  <p className="text-xs text-slate-500">
                    {formatKstWithDay(t.at)}
                    {t.actor ? ` · ${t.actor}` : ''}
                  </p>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-slate-400">납부 이력은 등록생·납부 관리(M9)에서 함께 표시됩니다.</p>
          </Card>
        </div>
      </div>
    </>
  )
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-800">{value}</dd>
    </div>
  )
}

// 소개 경로(학원·상담실장) 확인 — 커미션 대상을 확정하는 단계
// 캠프 등록 신청서 링크 (학부모 정보 미리 채움 토큰 포함)
function RegisterLinkCard({ lead, onMessage }: { lead: LeadRow; onMessage: (m: { tone: 'green' | 'red'; text: string } | null) => void }) {
  const [programs, setPrograms] = useState<Array<{ id: string; name: string; slug: string; season: string | null }>>([])
  const [programId, setProgramId] = useState('')
  const [link, setLink] = useState('')

  useEffect(() => {
    supabase
      .from('programs')
      .select('id, name, slug, season')
      .is('deleted_at', null)
      .in('status', ['before', 'open'])
      .order('start_date')
      .then(({ data }) => {
        setPrograms(data ?? [])
        const interested = lead.interests_programs.find((ip) => data?.some((p) => p.id === ip.program?.id))
        if (interested?.program) setProgramId(interested.program.id)
      })
  }, [lead.interests_programs])

  async function makeLink() {
    const program = programs.find((p) => p.id === programId)
    if (!program) return
    const { data: token, error } = await supabase.rpc('create_access_token', { p_purpose: 'prefill', p_lead_id: lead.id, p_ttl_days: 30 })
    if (error || !token) {
      onMessage({ tone: 'red', text: '링크를 만들지 못했습니다.' })
      return
    }
    const url = new URL(`${publicSiteUrl()}/register/${program.slug}`)
    url.searchParams.set('t', token)
    if (lead.partner?.code) url.searchParams.set('ref', lead.partner.code)
    setLink(url.toString())
    try {
      await navigator.clipboard.writeText(url.toString())
      onMessage({ tone: 'green', text: '등록 신청서 링크를 복사했습니다. 30일 동안 유효합니다.' })
    } catch {
      onMessage({ tone: 'green', text: '등록 신청서 링크를 만들었습니다. 아래 주소를 복사해 주세요.' })
    }
  }

  return (
    <Card>
      <p className="mb-1 font-semibold text-slate-900">캠프 등록 신청서 보내기</p>
      <p className="mb-3 text-sm text-slate-500">학부모 정보가 미리 채워진 신청서 링크를 만듭니다(30일 유효). 카카오톡으로 보내 주세요.</p>
      {programs.length === 0 ? (
        <p className="text-sm text-slate-500">모집 전·모집 중인 프로그램이 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label="프로그램">
              <Select value={programId} onChange={(e) => setProgramId(e.target.value)}>
                <option value="">선택</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.season ? ` (${p.season})` : ''}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Button disabled={!programId} onClick={() => void makeLink()}>
            링크 만들고 복사
          </Button>
        </div>
      )}
      {link && <p className="mt-3 font-mono text-xs break-all text-slate-600">{link}</p>}
      <p className="mt-2 text-xs text-slate-400">이 링크로 신청하면 상담 기록과 연결되고, 상담 상태가 "등록 전환"으로 바뀝니다.</p>
    </Card>
  )
}
