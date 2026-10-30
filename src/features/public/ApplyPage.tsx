import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { Alert, Button, Field, Input, Select, Spinner, Textarea } from '../../components/ui'
import { isValidMobile, normalizePhone } from '../../domain/phone'
import { CONTACT_ROLE_LABELS } from '../../lib/labels'
import { ChoiceChips, PublicLayout, Section } from './PublicLayout'
import {
  getFormConfig,
  getPartnerByCode,
  listPartnerContacts,
  listPartners,
  listPrograms,
  submitLead,
  SubmitError,
  type PublicContact,
  type PublicFormConfig,
  type PublicSlot,
} from './publicApi'
import { SlotPicker } from './SlotPicker'

const GRADES = ['초1', '초2', '초3', '초4', '초5', '초6', '중1', '중2', '중3', '고1', '고2', '고3', '기타']
const RELATIONS = ['어머니', '아버지', '조부모', '기타']
const INTERESTS = [
  { value: 'study_abroad', label: '유학' },
  { value: 'camp', label: '캠프' },
]
const TOPICS = [
  { value: 'camp', label: '캠프' },
  { value: 'study_abroad', label: '유학' },
  { value: 'cost', label: '비용' },
  { value: 'schedule', label: '일정' },
  { value: 'other', label: '기타' },
]
const OTHER = '__other__'
const UNKNOWN = '__unknown__'

export type ApplyDoneState = {
  studentName: string
  scheduledAt: string | null
  kakaoUrl: string | null
}

export function ApplyPage() {
  const { partnerCode } = useParams()
  const [params] = useSearchParams()
  const contactCode = params.get('c')
  const navigate = useNavigate()

  const [config, setConfig] = useState<PublicFormConfig | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [programs, setPrograms] = useState<Array<{ id: string; name: string; season: string | null }>>([])
  // 링크로 들어온 학원
  const [linkedPartner, setLinkedPartner] = useState<{ id: string; name: string; contacts: PublicContact[] } | null>(null)
  const [linkedContact, setLinkedContact] = useState<PublicContact | null>(null)
  // 직접 고르는 학원
  const [partners, setPartners] = useState<Array<{ id: string; name: string; region: string | null }>>([])
  const [partnerChoice, setPartnerChoice] = useState('')
  const [sourceOther, setSourceOther] = useState('')
  const [contacts, setContacts] = useState<PublicContact[]>([])
  const [contactChoice, setContactChoice] = useState('')

  const [studentName, setStudentName] = useState('')
  const [grade, setGrade] = useState('')
  const [interests, setInterests] = useState<string[]>([])
  const [programIds, setProgramIds] = useState<string[]>([])
  const [parentName, setParentName] = useState('')
  const [phone, setPhone] = useState('')
  const [relation, setRelation] = useState('')
  const [wantSlot, setWantSlot] = useState(false)
  const [slot, setSlot] = useState<PublicSlot | null>(null)
  const [slotReload, setSlotReload] = useState(0)
  const [topics, setTopics] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [agreePrivacy, setAgreePrivacy] = useState(false)
  const [agreeGuardian, setAgreeGuardian] = useState(false)
  const [website, setWebsite] = useState('') // 허니팟
  // 한 번 제출을 시도한 뒤부터는 입력할 때마다 오류 표시를 갱신한다
  const [attempted, setAttempted] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    getFormConfig()
      .then(setConfig)
      .catch(() => setLoadError(true))
    listPrograms().then(setPrograms)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function resolvePartner() {
      const found = partnerCode ? await getPartnerByCode(partnerCode) : null
      if (cancelled) return
      if (found) {
        setLinkedPartner(found)
        setContacts(found.contacts)
        setLinkedContact(found.contacts.find((c) => c.code === contactCode?.toLowerCase()) ?? null)
      } else {
        // 코드가 없거나 잘못된 링크면 학원을 직접 고르게 한다
        setPartners(await listPartners())
      }
    }
    void resolvePartner()
    return () => {
      cancelled = true
    }
  }, [partnerCode, contactCode])

  async function choosePartner(value: string) {
    setPartnerChoice(value)
    setContactChoice('')
    setContacts(value && value !== OTHER ? await listPartnerContacts(value) : [])
  }

  function validate(): Record<string, string> {
    const next: Record<string, string> = {}
    if (!linkedPartner && !partnerChoice) next.partner = '알게 된 경로를 선택해 주세요.'
    if (partnerChoice === OTHER && !sourceOther.trim()) next.sourceOther = '알게 된 경로를 적어 주세요.'
    if (!studentName.trim()) next.studentName = '자녀 이름을 입력해 주세요.'
    if (!grade) next.grade = '학년을 선택해 주세요.'
    if (!parentName.trim()) next.parentName = '학부모 이름을 입력해 주세요.'
    if (!isValidMobile(normalizePhone(phone))) next.phone = '휴대폰 번호를 정확히 입력해 주세요. (예: 010-1234-5678)'
    if (!relation) next.relation = '자녀와의 관계를 선택해 주세요.'
    if (wantSlot && !slot) next.slot = '상담 희망 날짜와 시간을 골라 주세요. 원하지 않으시면 체크를 해제해 주세요.'
    if (!agreePrivacy || !agreeGuardian) next.consent = '필수 동의 항목에 모두 동의해 주세요.'
    return next
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitError('')
    const next = validate()
    setAttempted(true)
    if (Object.keys(next).length > 0) {
      const first = Object.keys(next)[0]
      document.getElementById(`field-${first}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    setSubmitting(true)
    try {
      const chosenContact = linkedContact ? null : contactChoice && contactChoice !== UNKNOWN ? contactChoice : null
      const result = await submitLead({
        partner_code: linkedPartner ? partnerCode : null,
        contact_code: linkedContact?.code ?? null,
        partner_id: !linkedPartner && partnerChoice !== OTHER ? partnerChoice : null,
        contact_id: chosenContact,
        source_other: partnerChoice === OTHER ? sourceOther.trim() : null,
        student_name: studentName.trim(),
        student_grade: grade,
        interests,
        program_ids: programIds,
        parent_name: parentName.trim(),
        parent_phone: normalizePhone(phone),
        relation,
        topics,
        message: message.trim(),
        slot_id: wantSlot && slot ? slot.id : null,
        agree_privacy: agreePrivacy,
        agree_guardian: agreeGuardian,
        website,
      })
      const state: ApplyDoneState = {
        studentName: studentName.trim(),
        scheduledAt: result.scheduled_at,
        kakaoUrl: config?.kakao_channel_url || null,
      }
      navigate('/apply/done', { replace: true, state })
    } catch (err) {
      const error = err as SubmitError
      setSubmitError(error.message)
      if (error.code === 'SLOT_UNAVAILABLE') {
        setSlot(null)
        setSlotReload((n) => n + 1)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loadError) {
    return (
      <PublicLayout>
        <Alert>신청서를 불러오지 못했습니다. 잠시 후 다시 접속해 주세요.</Alert>
      </PublicLayout>
    )
  }
  if (!config) {
    return (
      <PublicLayout>
        <Spinner />
      </PublicLayout>
    )
  }

  const errors: Record<string, string> = attempted ? validate() : {}
  const privacyDoc = config.consents.find((c) => c.kind === 'lead_privacy')
  const guardianDoc = config.consents.find((c) => c.kind === 'lead_guardian')

  return (
    <PublicLayout>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">유학·캠프 상담 신청</h1>
        <p className="mt-1 text-sm text-slate-600">
          아래 내용을 남겨 주시면 인투유학 담당자가 확인 후 연락드립니다. 입력은 2~3분이면 충분합니다.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Section title="알게 된 경로">
          {linkedPartner ? (
            <div className="rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-700">
              <strong>{linkedPartner.name}</strong>
              {linkedContact ? ` ${linkedContact.name} 선생님` : ''} 소개로 신청합니다.
            </div>
          ) : (
            <div id="field-partner">
              <Field label="어디서 알게 되셨나요?" error={errors.partner}>
                <Select value={partnerChoice} onChange={(e) => void choosePartner(e.target.value)}>
                  <option value="">선택해 주세요</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.region ? ` (${p.region})` : ''}
                    </option>
                  ))}
                  <option value={OTHER}>기타 (직접 입력)</option>
                </Select>
              </Field>
            </div>
          )}
          {partnerChoice === OTHER && (
            <div id="field-sourceOther">
              <Field label="알게 된 경로" error={errors.sourceOther}>
                <Input value={sourceOther} placeholder="예: 지인 소개, 블로그" onChange={(e) => setSourceOther(e.target.value)} />
              </Field>
            </div>
          )}
          {!linkedContact && contacts.length > 0 && (
            <Field label="소개해 주신 선생님 (선택)">
              <Select value={contactChoice} onChange={(e) => setContactChoice(e.target.value)}>
                <option value="">선택 안 함</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {CONTACT_ROLE_LABELS[c.role] ?? ''}
                  </option>
                ))}
                <option value={UNKNOWN}>잘 모르겠어요</option>
              </Select>
            </Field>
          )}
        </Section>

        <Section title="자녀 정보">
          <div id="field-studentName">
            <Field label="자녀 이름" error={errors.studentName}>
              <Input autoComplete="off" value={studentName} onChange={(e) => setStudentName(e.target.value)} />
            </Field>
          </div>
          <div id="field-grade">
            <Field label="학년" error={errors.grade}>
              <Select value={grade} onChange={(e) => setGrade(e.target.value)}>
                <option value="">선택해 주세요</option>
                {GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">관심 분야 (복수 선택)</p>
            <ChoiceChips name="interests" options={INTERESTS} values={interests} onChange={setInterests} />
          </div>
          {programs.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">관심 프로그램 (복수 선택)</p>
              <ChoiceChips
                name="programs"
                options={programs.map((p) => ({ value: p.id, label: p.season ? `${p.name} (${p.season})` : p.name }))}
                values={programIds}
                onChange={setProgramIds}
              />
            </div>
          )}
        </Section>

        <Section title="학부모 정보">
          <div id="field-parentName">
            <Field label="학부모 이름" error={errors.parentName}>
              <Input autoComplete="name" value={parentName} onChange={(e) => setParentName(e.target.value)} />
            </Field>
          </div>
          <div id="field-phone">
            <Field label="휴대폰 번호" error={errors.phone}>
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="010-1234-5678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
          </div>
          <div id="field-relation">
            <Field label="자녀와의 관계" error={errors.relation}>
              <Select value={relation} onChange={(e) => setRelation(e.target.value)}>
                <option value="">선택해 주세요</option>
                {RELATIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Section>

        <Section
          title="상담 희망 일시 (선택)"
          description="상담 방식(전화 또는 화상)은 문의 내용에 맞춰 담당자가 안내드립니다."
        >
          <label className="flex items-center gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              className="size-5"
              checked={wantSlot}
              onChange={(e) => {
                setWantSlot(e.target.checked)
                if (!e.target.checked) setSlot(null)
              }}
            />
            원하는 상담 날짜·시간을 고를게요
          </label>
          {wantSlot && (
            <div id="field-slot">
              <SlotPicker value={slot} onChange={setSlot} reloadKey={slotReload} />
              {errors.slot && <p className="mt-2 text-xs text-red-600">{errors.slot}</p>}
            </div>
          )}
        </Section>

        <Section title="상담 받고 싶은 내용">
          <ChoiceChips name="topics" options={TOPICS} values={topics} onChange={setTopics} />
          <Field label="자세한 내용 (선택)">
            <Textarea rows={4} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} />
          </Field>
        </Section>

        <Section title="개인정보 수집·이용 동의">
          {privacyDoc && (
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-800">{privacyDoc.title}</p>
              <div className="max-h-44 overflow-y-auto rounded-lg bg-slate-50 p-3 text-xs leading-relaxed whitespace-pre-wrap text-slate-600 ring-1 ring-slate-200">
                {privacyDoc.body}
              </div>
            </div>
          )}
          <div id="field-consent" className="space-y-3">
            <label className="flex items-start gap-2 text-sm text-slate-800">
              <input type="checkbox" className="mt-0.5 size-5 shrink-0" checked={agreePrivacy} onChange={(e) => setAgreePrivacy(e.target.checked)} />
              [필수] 위 내용을 확인하였으며 개인정보 수집·이용에 동의합니다.
            </label>
            {guardianDoc && (
              <label className="flex items-start gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  className="mt-0.5 size-5 shrink-0"
                  checked={agreeGuardian}
                  onChange={(e) => setAgreeGuardian(e.target.checked)}
                />
                [필수] {guardianDoc.body}
              </label>
            )}
            {errors.consent && <p className="text-xs text-red-600">{errors.consent}</p>}
          </div>
        </Section>

        {/* 허니팟: 화면에 보이지 않음 */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>
            웹사이트
            <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </label>
        </div>

        {submitError && <Alert>{submitError}</Alert>}
        <Button type="submit" className="w-full py-3 text-base" disabled={submitting}>
          {submitting ? '보내는 중…' : '상담 신청하기'}
        </Button>
      </form>
    </PublicLayout>
  )
}
