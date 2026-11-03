// 등록생 상세: 항공권·ESTA·보험 대행(선택 변경) + 출국 서류 정보(여권 열람 권한자만) + 담당자 진행 기록 (M17)
import { useCallback, useEffect, useState } from 'react'
import { AgencyChooser } from '../../components/shared/AgencyChooser'
import { Badge, Button, Card, Field, Input, Select } from '../../components/ui'
import { agencyServiceLabels, DEFAULT_AGENCY_FEES, type AgencyChoice, type AgencyFees, type AgencyService } from '../../domain/agency'
import { formatDateKo } from '../../domain/dates'
import { formatPhone } from '../../domain/phone'
import { formatKstWithDay } from '../../lib/datetime'
import { supabase, type Tables } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'

type Traveler = Tables<'registration_travelers'>

const ESTA_STATUS: Record<string, string> = {
  not_started: '신청 전',
  submitted: '신청함',
  approved: '승인',
  denied: '거절',
  not_needed: '필요 없음',
}
const FLIGHT_STATUS: Record<string, string> = { not_started: '예약 전', booked: '발권 완료', not_needed: '필요 없음' }
const INSURANCE_STATUS: Record<string, string> = { not_started: '가입 전', enrolled: '가입 완료', not_needed: '필요 없음' }

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`

export function AgencyTravelCard({
  registration,
  agencyEnabled,
  onChanged,
  onMessage,
}: {
  registration: {
    id: string
    agency_choice: string | null
    agency_services: string[]
    agency_fee: number
    travel_info_submitted_at: string | null
    destroyed_at: string | null
  }
  agencyEnabled: boolean
  onChanged: () => void
  onMessage: (m: { tone: 'green' | 'red'; text: string }) => void
}) {
  const { profile } = useAuth()
  const canView = profile?.role === 'admin' || (profile?.role === 'staff' && !!profile?.can_view_passport)
  const r = registration
  const [editing, setEditing] = useState(false)
  const [fees, setFees] = useState<AgencyFees>(DEFAULT_AGENCY_FEES)
  const [draft, setDraft] = useState<{ choice: AgencyChoice | ''; services: AgencyService[] }>({
    choice: (r.agency_choice as AgencyChoice | null) ?? '',
    services: r.agency_services as AgencyService[],
  })
  const [travelers, setTravelers] = useState<Traveler[] | null>(null)
  const [busy, setBusy] = useState(false)

  const loadTravelers = useCallback(async () => {
    if (!canView) return
    const { data } = await supabase.from('registration_travelers').select('*').eq('registration_id', r.id).order('traveler_type', { ascending: false }).order('sort')
    setTravelers(data ?? [])
  }, [canView, r.id])

  useEffect(() => {
    void loadTravelers()
    void supabase
      .from('settings')
      .select('value')
      .eq('key', 'agency_fees')
      .maybeSingle()
      .then(({ data }) => data?.value && setFees(data.value as AgencyFees))
  }, [loadTravelers])

  if (!agencyEnabled && !r.agency_choice) return null

  async function saveChoice() {
    if (!draft.choice) return onMessage({ tone: 'red', text: '대행 여부를 선택해 주세요.' })
    setBusy(true)
    const { error } = await supabase.rpc('set_registration_agency', {
      p_registration_id: r.id,
      p_choice: draft.choice,
      p_services: draft.choice === 'agency' ? draft.services : [],
    })
    setBusy(false)
    if (error) return onMessage({ tone: 'red', text: /[가-힣]/.test(error.message) ? error.message : '저장하지 못했습니다.' })
    setEditing(false)
    onMessage({ tone: 'green', text: '대행 선택을 바꿨습니다. 대행료가 바뀌었다면 납부 안내 변경을 보내 주세요.' })
    onChanged()
  }

  async function saveTraveler(t: Traveler, patch: Partial<Traveler>) {
    const { error } = await supabase.from('registration_travelers').update(patch).eq('id', t.id)
    if (error) return onMessage({ tone: 'red', text: '저장하지 못했습니다.' })
    onMessage({ tone: 'green', text: '진행 상태를 저장했습니다.' })
    void loadTravelers()
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-slate-900">항공권·ESTA·여행자보험 대행</p>
        {!editing && !r.destroyed_at && (
          <Button variant="ghost" onClick={() => setEditing(true)}>
            선택 바꾸기
          </Button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <AgencyChooser fees={fees} choice={draft.choice} services={draft.services} onChange={setDraft} />
          <div className="flex gap-2">
            <Button onClick={() => void saveChoice()} disabled={busy}>
              저장
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              취소
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-800">
          {r.agency_choice === 'agency' ? (
            <>
              <Badge tone="blue">대행</Badge> {agencyServiceLabels(r.agency_services)} · 대행료 {won(r.agency_fee)}
            </>
          ) : r.agency_choice === 'self' ? (
            <>
              <Badge tone="gray">직접 준비</Badge> 학부모가 ESTA·항공권을 직접 준비합니다.
            </>
          ) : (
            <Badge tone="amber">아직 선택 안 함</Badge>
          )}
        </p>
      )}

      {r.agency_choice === 'agency' && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="mb-2 text-sm font-medium text-slate-800">
            출국 서류 정보{' '}
            {r.travel_info_submitted_at ? (
              <Badge tone="green">제출 {formatKstWithDay(r.travel_info_submitted_at)}</Badge>
            ) : (
              <Badge tone="amber">아직 안 냄</Badge>
            )}
          </p>
          {!r.travel_info_submitted_at && (
            <p className="text-xs text-slate-500">학부모가 "신청 내용 확인" 링크에서 [출국 서류 정보 입력하기]로 냅니다. 링크를 잃어버렸다면 위 [신청 내용 확인 링크]를 다시 보내 주세요.</p>
          )}
          {!canView ? (
            <p className="text-sm text-slate-500">여권 정보가 들어 있어 여권 열람 권한이 있는 담당자만 볼 수 있습니다.</p>
          ) : (
            travelers &&
            travelers.map((t) => (
              <div key={t.id} className="mt-3 rounded-lg bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
                <p className="mb-2 font-semibold text-slate-900">
                  {t.traveler_type === 'student' ? '학생' : `보호자(${t.relation ?? '-'})`} · {t.surname_en} {t.given_name_en}
                </p>
                <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                  {(
                    [
                      ['성(Surname)', t.surname_en],
                      ['이름(Given name)', t.given_name_en],
                      ['성별', t.gender === 'male' ? 'M (남)' : t.gender === 'female' ? 'F (여)' : '-'],
                      ['생년월일', t.birth_date ? formatDateKo(t.birth_date) : '-'],
                      ['출생 도시·국가', `${t.birth_city_en ?? '-'} / ${t.birth_country ?? '-'}`],
                      ['다른 국적', t.other_citizenship ?? '없음'],
                      ['여권번호', t.passport_no ?? '-'],
                      ['여권 발급·만료', `${t.passport_issue_date ? formatDateKo(t.passport_issue_date) : '-'} ~ ${t.passport_expiry_date ? formatDateKo(t.passport_expiry_date) : '-'}`],
                      ['아버지 성명', t.father_name_en ?? '-'],
                      ['어머니 성명', t.mother_name_en ?? '-'],
                      ['주소(영문)', t.home_address_en ?? '-'],
                      ['연락처·이메일', `${t.phone ? formatPhone(t.phone) : '-'} / ${t.email ?? '-'}`],
                      ['직장·직위', t.employer ? `${t.employer} / ${t.job_title ?? '-'}` : '-'],
                      ['비상 연락처', t.emergency_name ? `${t.emergency_name} ${t.emergency_phone ? formatPhone(t.emergency_phone) : ''}` : '-'],
                      ['전달 내용', t.memo ?? '-'],
                    ] as const
                  ).map(([k, val]) => (
                    <div key={k} className="flex gap-2">
                      <dt className="w-28 shrink-0 text-slate-500">{k}</dt>
                      <dd className="min-w-0 break-words text-slate-900 select-all">{val}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-3 grid gap-3 sm:grid-cols-4">
                  {r.agency_services.includes('esta') && (
                    <>
                      <Field label="ESTA">
                        <Select value={t.esta_status} onChange={(e) => void saveTraveler(t, { esta_status: e.target.value })}>
                          {Object.entries(ESTA_STATUS).map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="ESTA 신청번호">
                        <Input
                          defaultValue={t.esta_application_no ?? ''}
                          onBlur={(e) => e.target.value !== (t.esta_application_no ?? '') && void saveTraveler(t, { esta_application_no: e.target.value.trim() || null })}
                        />
                      </Field>
                    </>
                  )}
                  {r.agency_services.includes('flight') && (
                    <Field label="항공권">
                      <Select value={t.flight_status} onChange={(e) => void saveTraveler(t, { flight_status: e.target.value })}>
                        {Object.entries(FLIGHT_STATUS).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}
                  {r.agency_services.includes('insurance') && (
                    <Field label="여행자보험">
                      <Select value={t.insurance_status} onChange={(e) => void saveTraveler(t, { insurance_status: e.target.value })}>
                        {Object.entries(INSURANCE_STATUS).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  ESTA 신청 때 주민등록번호와 자격 확인 질문(건강·범죄·여행 이력 등)은 학부모에게 직접 확인해 입력합니다. 미국 내 연락처는 캠프 [2. 납부 규칙]의 값을 씁니다.
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  )
}
