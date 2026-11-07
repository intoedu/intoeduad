import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { Alert, Button, Field, Input, Select, Spinner, Textarea } from '../../components/ui'
import { isValidMobile, normalizePhone } from '../../domain/phone'
import { CONTACT_ROLE_LABELS } from '../../lib/labels'
import { InflowField } from '../../components/shared/InflowField'
import { QuestionFields } from '../../components/shared/QuestionFields'
import { KakaoField } from '../../components/shared/KakaoField'
import { ChildPicker } from '../account/ChildPicker'
import { MemberGate } from '../account/MemberGate'
import { rememberFromForm, useCustomer, type CustomerStudent } from '../account/customerApi'
import { formatPhone } from '../../domain/phone'
import {
  CONTACT_UNKNOWN,
  EMPTY_INFLOW,
  EMPTY_KAKAO,
  kakaoPayload,
  validateKakao,
  type KakaoValue,
  cleanAnswers,
  fieldHelp,
  fieldLabel,
  inflowPayload,
  leadModes,
  validateAnswers,
  validateInflow,
  type AnswerMap,
  type InflowValue,
} from '../../domain/formSettings'
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
  const location = useLocation()
  // 회원: 저장된 정보로 신청서 채우기
  const { state: member } = useCustomer()
  const [childId, setChildId] = useState('')
  const [memberFilled, setMemberFilled] = useState(false)

  const [config, setConfig] = useState<PublicFormConfig | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [programs, setPrograms] = useState<Array<{ id: string; name: string; season: string | null }>>([])
  // 링크로 들어온 학원
  const [linkedPartner, setLinkedPartner] = useState<{ id: string; name: string; contacts: PublicContact[] } | null>(null)
  const [linkedContact, setLinkedContact] = useState<PublicContact | null>(null)
  // 링크가 없으면 유입 경로를 고른다(학원 소개면 학원·선생님)
  const [partners, setPartners] = useState<Array<{ id: string; name: string; region: string | null }>>([])
  const [inflow, setInflow] = useState<InflowValue>(EMPTY_INFLOW)
  // 링크로 온 학원의 선생님 (링크에 선생님 코드가 없을 때)
  const [contactChoice, setContactChoice] = useState('')
  const [answers, setAnswers] = useState<AnswerMap>({})
  const [kakao, setKakao] = useState<KakaoValue>(EMPTY_KAKAO)

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

  function pickChild(c: CustomerStudent | null) {
    setChildId(c ? c.id : 'new')
    setStudentName(c ? c.name_ko : '')
    setGrade(c?.grade && GRADES.includes(c.grade) ? c.grade : '')
  }

  // 회원 정보로 한 번 채운다(이미 적은 칸은 그대로)
  useEffect(() => {
    if (member.status !== 'member' || memberFilled) return
    const p = member.profile
    setMemberFilled(true)
    setParentName((v) => v || p.parent_name)
    setPhone((v) => v || formatPhone(p.parent_phone))
    if (p.relation && RELATIONS.includes(p.relation)) setRelation((v) => v || p.relation!)
    if (p.kakao_use !== null) {
      setKakao((k) =>
        k.use ? k : { use: p.kakao_use ? 'yes' : 'no', altPhone: p.kakao_alt_phone ? formatPhone(p.kakao_alt_phone) : '', altContact: p.alt_contact ?? '' },
      )
    }
    if (member.students.length === 1) {
      const c = member.students[0]
      setChildId(c.id)
      setStudentName((v) => v || c.name_ko)
      if (c.grade && GRADES.includes(c.grade)) setGrade((v) => v || c.grade!)
    }
  }, [member, memberFilled])

  const loadContacts = useCallback((partnerId: string) => listPartnerContacts(partnerId), [])
  const modes = leadModes(config?.modes)
  const shown = (k: keyof typeof modes) => modes[k] !== 'hidden'
  const req = (k: keyof typeof modes) => modes[k] === 'required'
  const texts = config?.texts
  const label = (k: string, fallback: string, optionalMark = false) =>
    `${fieldLabel(texts, k, fallback)}${optionalMark ? ' (선택)' : ''}`
  const questions = config?.questions ?? []

  function validate(): Record<string, string> {
    const next: Record<string, string> = {}
    const inflowError = config ? validateInflow(config.inflow, inflow, !!linkedPartner) : null
    if (inflowError) next.inflow = inflowError
    if (!studentName.trim()) next.studentName = '자녀 이름을 입력해 주세요.'
    if (shown('grade') && req('grade') && !grade) next.grade = '학년을 선택해 주세요.'
    if (shown('interests') && req('interests') && interests.length === 0) next.interests = '관심 분야를 골라 주세요.'
    if (shown('programs') && req('programs') && programs.length > 0 && programIds.length === 0) next.programs = '관심 프로그램을 골라 주세요.'
    if (!parentName.trim()) next.parentName = '학부모 이름을 입력해 주세요.'
    if (!isValidMobile(normalizePhone(phone))) next.phone = '휴대폰 번호를 정확히 입력해 주세요. (예: 010-1234-5678)'
    const kakaoError = validateKakao(kakao)
    if (kakaoError) next.kakao = kakaoError
    if (shown('relation') && req('relation') && !relation) next.relation = '자녀와의 관계를 선택해 주세요.'
    if (wantSlot && !slot) next.slot = '상담 희망 날짜와 시간을 골라 주세요. 원하지 않으시면 체크를 해제해 주세요.'
    if (shown('topics') && req('topics') && topics.length === 0) next.topics = '상담 받고 싶은 내용을 골라 주세요.'
    if (shown('message') && req('message') && !message.trim()) next.message = '자세한 내용을 적어 주세요.'
    for (const [id, msg] of Object.entries(validateAnswers(questions, answers))) next[`q-${id}`] = msg
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
      const route = inflowPayload(config?.inflow, inflow, !!linkedPartner)
      const linkedContactChoice = linkedPartner && !linkedContact && contactChoice && contactChoice !== CONTACT_UNKNOWN ? contactChoice : null
      const result = await submitLead({
        partner_code: linkedPartner ? partnerCode : null,
        contact_code: linkedContact?.code ?? null,
        partner_id: route.partner_id,
        contact_id: route.contact_id ?? linkedContactChoice,
        inflow_channel_id: route.inflow_channel_id,
        inflow_detail: route.inflow_detail,
        answers: cleanAnswers(questions, answers),
        ...kakaoPayload(kakao),
        student_name: studentName.trim(),
        student_grade: shown('grade') ? grade : '',
        interests: shown('interests') ? interests : [],
        program_ids: shown('programs') ? programIds : [],
        parent_name: parentName.trim(),
        parent_phone: normalizePhone(phone),
        relation: shown('relation') ? relation : '',
        topics: shown('topics') ? topics : [],
        message: shown('message') ? message.trim() : '',
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
      await rememberFromForm(member, { name_ko: studentName.trim(), grade: shown('grade') ? grade || null : null }, { relation })
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
  const questionErrors = Object.fromEntries(
    Object.entries(errors)
      .filter(([k]) => k.startsWith('q-'))
      .map(([k, v]) => [k.slice(2), v]),
  )

  return (
    <PublicLayout>
      <MemberGate state={member} next={location.pathname + location.search} />
      {member.status === 'needs_setup' && (
        <div className="mb-4">
          <Alert tone="blue">
            회원 정보를 아직 입력하지 않으셨습니다.{' '}
            <a href={`/account/setup?next=${encodeURIComponent(location.pathname + location.search)}`} className="font-semibold underline">
              회원 정보 입력하기
            </a>
          </Alert>
        </div>
      )}
      {memberFilled && (
        <div className="mb-4">
          <Alert tone="green">회원 정보로 채웠습니다. 바뀐 내용이 있으면 고쳐 주세요.</Alert>
        </div>
      )}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">{config.title || '유학·캠프 상담 신청'}</h1>
        {config.intro && <p className="mt-1 text-sm whitespace-pre-line text-slate-600">{config.intro}</p>}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Section title="알게 된 경로">
          {linkedPartner ? (
            <>
              <div className="rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-700">
                <strong>{linkedPartner.name}</strong>
                {linkedContact ? ` ${linkedContact.name} 선생님` : ''} 소개로 신청합니다.
              </div>
              {!linkedContact && linkedPartner.contacts.length > 0 && (
                <Field label="소개해 주신 선생님 (선택)">
                  <Select value={contactChoice} onChange={(e) => setContactChoice(e.target.value)}>
                    <option value="">선택 안 함</option>
                    {linkedPartner.contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {CONTACT_ROLE_LABELS[c.role] ?? ''}
                      </option>
                    ))}
                    <option value={CONTACT_UNKNOWN}>잘 모르겠어요</option>
                  </Select>
                </Field>
              )}
            </>
          ) : config.inflow ? (
            <InflowField
              config={config.inflow}
              value={inflow}
              onChange={setInflow}
              partners={partners}
              loadContacts={loadContacts}
              error={errors.inflow}
            />
          ) : null}
        </Section>

        <Section title="자녀 정보">
          {member.status === 'member' && <ChildPicker students={member.students} value={childId} onPick={pickChild} />}
          <div id="field-studentName">
            <Field label={label('student_name', '자녀 이름')} hint={fieldHelp(texts, 'student_name')} error={errors.studentName}>
              <Input autoComplete="off" value={studentName} onChange={(e) => setStudentName(e.target.value)} />
            </Field>
          </div>
          {shown('grade') && (
            <div id="field-grade">
              <Field label={label('grade', '학년', !req('grade'))} hint={fieldHelp(texts, 'grade')} error={errors.grade}>
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
          )}
          {shown('interests') && (
            <div id="field-interests">
              <p className="mb-2 text-sm font-medium text-slate-700">{label('interests', '관심 분야 (복수 선택)')}</p>
              {fieldHelp(texts, 'interests') && <p className="-mt-1 mb-2 text-xs text-slate-500">{fieldHelp(texts, 'interests')}</p>}
              <ChoiceChips name="interests" options={INTERESTS} values={interests} onChange={setInterests} />
              {errors.interests && <p className="mt-1 text-xs text-red-600">{errors.interests}</p>}
            </div>
          )}
          {shown('programs') && programs.length > 0 && (
            <div id="field-programs">
              <p className="mb-2 text-sm font-medium text-slate-700">{label('programs', '관심 프로그램 (복수 선택)')}</p>
              {fieldHelp(texts, 'programs') && <p className="-mt-1 mb-2 text-xs text-slate-500">{fieldHelp(texts, 'programs')}</p>}
              <ChoiceChips
                name="programs"
                options={programs.map((p) => ({ value: p.id, label: p.season ? `${p.name} (${p.season})` : p.name }))}
                values={programIds}
                onChange={setProgramIds}
              />
              {errors.programs && <p className="mt-1 text-xs text-red-600">{errors.programs}</p>}
            </div>
          )}
        </Section>

        <Section title="학부모 정보">
          <div id="field-parentName">
            <Field label={label('parent_name', '학부모 이름')} hint={fieldHelp(texts, 'parent_name')} error={errors.parentName}>
              <Input autoComplete="name" value={parentName} onChange={(e) => setParentName(e.target.value)} />
            </Field>
          </div>
          <div id="field-phone">
            <Field label={label('parent_phone', '휴대폰 번호')} hint={fieldHelp(texts, 'parent_phone')} error={errors.phone}>
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
          <KakaoField value={kakao} onChange={setKakao} error={errors.kakao} />
          {shown('relation') && (
            <div id="field-relation">
              <Field label={label('relation', '자녀와의 관계', !req('relation'))} hint={fieldHelp(texts, 'relation')} error={errors.relation}>
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
          )}
        </Section>

        {shown('slot') && (
          <Section
            title="상담 희망 일시 (선택)"
            description={fieldHelp(texts, 'slot', '상담 방식(전화 또는 화상)은 문의 내용에 맞춰 담당자가 안내드립니다.')}
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
              {fieldLabel(texts, 'slot', '원하는 상담 날짜·시간을 고를게요')}
            </label>
            {wantSlot && (
              <div id="field-slot">
                <SlotPicker value={slot} onChange={setSlot} reloadKey={slotReload} />
                {errors.slot && <p className="mt-2 text-xs text-red-600">{errors.slot}</p>}
              </div>
            )}
          </Section>
        )}

        {(shown('topics') || shown('message')) && (
          <Section title={fieldLabel(texts, 'topics', '상담 받고 싶은 내용')}>
            {shown('topics') && (
              <div id="field-topics">
                {fieldHelp(texts, 'topics') && <p className="mb-2 text-xs text-slate-500">{fieldHelp(texts, 'topics')}</p>}
                <ChoiceChips name="topics" options={TOPICS} values={topics} onChange={setTopics} />
                {errors.topics && <p className="mt-1 text-xs text-red-600">{errors.topics}</p>}
              </div>
            )}
            {shown('message') && (
              <div id="field-message">
                <Field label={label('message', '자세한 내용', !req('message'))} hint={fieldHelp(texts, 'message')} error={errors.message}>
                  <Textarea rows={4} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} />
                </Field>
              </div>
            )}
          </Section>
        )}

        {questions.length > 0 && (
          <Section title="추가 질문">
            <QuestionFields questions={questions} values={answers} onChange={setAnswers} errors={questionErrors} />
          </Section>
        )}

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
