import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { Alert, Button, Field, Input, Select, Spinner, Textarea } from '../../components/ui'
import { formatDateLongKo } from '../../domain/dates'
import { isValidMobile, isValidPhone, normalizePhone } from '../../domain/phone'
import { formatWon, isValidBirthDate, isValidEmail, isValidEnglishName, normalizeEnglishName } from '../../domain/registration'
import { todayKst } from '../../lib/datetime'
import { CONTACT_ROLE_LABELS } from '../../lib/labels'
import { PublicLayout, Section } from './PublicLayout'
import { getPartnerByCode, listPartnerContacts, listPartners, SubmitError, type PublicContact } from './publicApi'
import {
  getPrefill,
  getRegisterForm,
  submitRegistration,
  type FieldMode,
  type RegisterConsent,
  type RegisterFieldKey,
  type RegisterForm,
  type RegistrationSummary,
} from './registerApi'
import { DestructionNotice, ScheduleList } from './RegistrationParts'

const GRADES = ['초1', '초2', '초3', '초4', '초5', '초6', '중1', '중2', '중3', '고1', '고2', '고3', '기타']
const ENGLISH_LEVELS = ['처음 배워요', '기초', '중급', '상급']
const EMERGENCY_RELATIONS = ['어머니', '아버지', '조부모', '친척', '기타']
const OTHER = '__other__'
const NONE = '__none__'
const UNKNOWN = '__unknown__'

export type RegisterDoneState = {
  waitlisted: boolean
  myToken: string | null
  summary: RegistrationSummary | null
  kakaoUrl: string | null
  studentName: string
  programName: string
}

type Values = {
  student_name_ko: string
  student_name_en: string
  birth_date: string
  gender: string
  school: string
  grade: string
  english_level: string
  parent_name: string
  parent_phone: string
  parent_email: string
  address: string
  emergency_name: string
  emergency_relation: string
  emergency_phone: string
  special_notes: string
  health_notes: string
}

const EMPTY: Values = {
  student_name_ko: '',
  student_name_en: '',
  birth_date: '',
  gender: '',
  school: '',
  grade: '',
  english_level: '',
  parent_name: '',
  parent_phone: '',
  parent_email: '',
  address: '',
  emergency_name: '',
  emergency_relation: '',
  emergency_phone: '',
  special_notes: '',
  health_notes: '',
}

function ConsentItem({
  doc,
  checked,
  onChange,
  label,
}: {
  doc: { title: string; body: string }
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <div className="rounded-xl ring-1 ring-slate-200">
      <details className="group">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-800">
          {doc.title}
          <span className="ml-1 text-xs font-normal text-brand-600 group-open:hidden">내용 보기</span>
        </summary>
        <div className="max-h-60 overflow-y-auto border-t border-slate-100 bg-slate-50 px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap text-slate-600">
          {doc.body}
        </div>
      </details>
      <label className="flex items-start gap-2 border-t border-slate-100 px-4 py-3 text-sm text-slate-800">
        {/* 같은 문구의 체크박스가 여러 개라 화면낭독기에는 어떤 동의인지 함께 읽힌다 */}
        <input
          type="checkbox"
          className="mt-0.5 size-5 shrink-0"
          aria-label={`${doc.title} — ${label}`}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        {label}
      </label>
    </div>
  )
}

export function RegisterPage() {
  const { slug = '' } = useParams()
  const [params] = useSearchParams()
  const refCode = params.get('ref')
  const contactCode = params.get('c')
  const token = params.get('t')
  const navigate = useNavigate()

  const [form, setForm] = useState<RegisterForm | null | undefined>(undefined)
  const [loadError, setLoadError] = useState(false)
  const [v, setV] = useState<Values>(EMPTY)
  const [tokenValid, setTokenValid] = useState(false)
  // 소개 경로
  const [knownPartner, setKnownPartner] = useState<{ id: string; name: string } | null>(null)
  const [knownContact, setKnownContact] = useState<{ id: string; name: string } | null>(null)
  const [partners, setPartners] = useState<Array<{ id: string; name: string; region: string | null }>>([])
  const [partnerChoice, setPartnerChoice] = useState('')
  const [sourceOther, setSourceOther] = useState('')
  const [contacts, setContacts] = useState<PublicContact[]>([])
  const [contactChoice, setContactChoice] = useState('')

  const [agree, setAgree] = useState<Record<string, boolean>>({})
  const [website, setWebsite] = useState('') // 허니팟
  const [attempted, setAttempted] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    getRegisterForm(slug)
      .then(setForm)
      .catch(() => setLoadError(true))
  }, [slug])

  // 소개 경로: 상담 기록 링크(t) > 학원 링크(ref) > 직접 선택
  useEffect(() => {
    let cancelled = false
    async function resolve() {
      const prefill = token ? await getPrefill(token) : null
      if (cancelled) return
      if (prefill) {
        setTokenValid(true)
        setV((prev) => ({
          ...prev,
          student_name_ko: prefill.student_name ?? '',
          grade: GRADES.includes(prefill.student_grade ?? '') ? (prefill.student_grade ?? '') : '',
          parent_name: prefill.parent_name ?? '',
          parent_phone: prefill.parent_phone ?? '',
        }))
        if (prefill.partner) {
          setKnownPartner(prefill.partner)
          setKnownContact(prefill.contact)
          if (!prefill.contact) setContacts(await listPartnerContacts(prefill.partner.id))
          return
        }
      }
      const linked = refCode ? await getPartnerByCode(refCode) : null
      if (cancelled) return
      if (linked) {
        setKnownPartner({ id: linked.id, name: linked.name })
        const c = linked.contacts.find((x) => x.code === contactCode?.toLowerCase())
        setKnownContact(c ? { id: c.id, name: c.name } : null)
        setContacts(linked.contacts)
      } else {
        setPartners(await listPartners())
      }
    }
    void resolve()
    return () => {
      cancelled = true
    }
  }, [token, refCode, contactCode])

  async function choosePartner(value: string) {
    setPartnerChoice(value)
    setContactChoice('')
    setContacts(value && value !== OTHER && value !== NONE ? await listPartnerContacts(value) : [])
  }

  const set = (key: keyof Values) => (value: string) => setV((prev) => ({ ...prev, [key]: value }))
  const mode = (key: RegisterFieldKey): FieldMode => form?.fields?.[key] ?? 'optional'
  const shown = (key: RegisterFieldKey) => mode(key) !== 'hidden'
  const req = (key: RegisterFieldKey) => mode(key) === 'required'

  const consents = form?.consents ?? []
  const doc = (kind: string): RegisterConsent | undefined => consents.find((c) => c.kind === kind)
  const partnerName = knownPartner?.name ?? partners.find((p) => p.id === partnerChoice)?.name ?? null
  const hasPartner = !!partnerName

  function validate(): Record<string, string> {
    const e: Record<string, string> = {}
    const today = todayKst()
    if (!knownPartner && !partnerChoice) e.partner = '알게 된 경로를 선택해 주세요.'
    if (partnerChoice === OTHER && !sourceOther.trim()) e.sourceOther = '알게 된 경로를 적어 주세요.'
    if (!v.student_name_ko.trim()) e.student_name_ko = '학생 이름을 입력해 주세요.'
    if (shown('student_name_en')) {
      if (req('student_name_en') && !v.student_name_en.trim()) e.student_name_en = '여권과 같은 영문 이름을 입력해 주세요.'
      else if (v.student_name_en.trim() && !isValidEnglishName(v.student_name_en)) e.student_name_en = '영문 알파벳으로 입력해 주세요. (예: HONG GILDONG)'
    }
    if (shown('birth_date')) {
      if (req('birth_date') && !v.birth_date) e.birth_date = '생년월일을 입력해 주세요.'
      else if (v.birth_date && !isValidBirthDate(v.birth_date, today)) e.birth_date = '생년월일을 확인해 주세요.'
    }
    if (shown('gender') && req('gender') && !v.gender) e.gender = '성별을 선택해 주세요.'
    if (shown('school') && req('school') && !v.school.trim()) e.school = '학교를 입력해 주세요.'
    if (shown('grade') && req('grade') && !v.grade) e.grade = '학년을 선택해 주세요.'
    if (shown('english_level') && req('english_level') && !v.english_level) e.english_level = '영어 수준을 선택해 주세요.'
    if (!v.parent_name.trim()) e.parent_name = '학부모 이름을 입력해 주세요.'
    if (!isValidMobile(normalizePhone(v.parent_phone))) e.parent_phone = '휴대폰 번호를 정확히 입력해 주세요. (예: 010-1234-5678)'
    if (shown('parent_email')) {
      if (req('parent_email') && !v.parent_email.trim()) e.parent_email = '이메일을 입력해 주세요.'
      else if (v.parent_email.trim() && !isValidEmail(v.parent_email)) e.parent_email = '이메일 형식을 확인해 주세요.'
    }
    if (shown('address') && req('address') && !v.address.trim()) e.address = '주소를 입력해 주세요.'
    if (shown('emergency')) {
      if (req('emergency') && !v.emergency_name.trim()) e.emergency_name = '비상 연락처 이름을 입력해 주세요.'
      if (req('emergency') && !v.emergency_phone.trim()) e.emergency_phone = '비상 연락처 번호를 입력해 주세요.'
      else if (v.emergency_phone.trim() && !isValidPhone(normalizePhone(v.emergency_phone))) e.emergency_phone = '연락처를 확인해 주세요.'
    }
    if (shown('special_notes') && req('special_notes') && !v.special_notes.trim()) e.special_notes = '특이사항을 입력해 주세요. 없으면 "없음"이라고 적어 주세요.'

    const requiredKinds = consents.filter((c) => c.required).map((c) => c.kind)
    const missing = requiredKinds.filter((k) => !agree[k])
    if (missing.length > 0 || !agree.refund) e.consent = '필수 동의 항목에 모두 동의해 주세요.'
    if (form?.program.health_field_enabled && v.health_notes.trim() && !agree.reg_health) {
      e.health = '건강 특이사항을 적으셨다면 민감정보 수집·이용에 동의해 주세요. 동의하지 않으시려면 내용을 지워 주세요.'
    }
    if (!agree.destruction_notice) e.destruction = '개인정보 파기 안내를 확인해 주세요.'
    return e
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitError('')
    setAttempted(true)
    const next = validate()
    if (Object.keys(next).length > 0) {
      document.getElementById(`field-${Object.keys(next)[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (!form) return

    setSubmitting(true)
    try {
      // 우선순위(상담 기록 > 학원 링크 > 직접 선택)는 DB가 다시 판단한다
      const res = await submitRegistration({
        slug,
        token: tokenValid ? token : null,
        partner_code: refCode,
        contact_code: contactCode,
        partner_id: !knownPartner && partnerChoice && partnerChoice !== OTHER && partnerChoice !== NONE ? partnerChoice : null,
        contact_id: !knownContact && contactChoice && contactChoice !== UNKNOWN ? contactChoice : null,
        source_other: partnerChoice === OTHER ? sourceOther.trim() : null,
        ...v,
        student_name_ko: v.student_name_ko.trim(),
        student_name_en: v.student_name_en.trim() ? normalizeEnglishName(v.student_name_en) : '',
        parent_phone: normalizePhone(v.parent_phone),
        emergency_phone: normalizePhone(v.emergency_phone),
        health_notes: form.program.health_field_enabled ? v.health_notes : '',
        agree: { ...agree, reg_partner_share: hasPartner && !!agree.reg_partner_share },
        website,
      })
      const state: RegisterDoneState = {
        waitlisted: res.status === 'waitlisted',
        myToken: res.my_token,
        summary: res.summary,
        kakaoUrl: form.kakao_channel_url || null,
        studentName: v.student_name_ko.trim(),
        programName: form.program.season ? `${form.program.name} (${form.program.season})` : form.program.name,
      }
      navigate('/register/done', { replace: true, state })
    } catch (err) {
      const error = err as SubmitError
      setSubmitError(error.message)
      if (error.code === 'FULL' || error.code === 'NOT_OPEN') {
        getRegisterForm(slug).then(setForm)
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
  if (form === undefined) {
    return (
      <PublicLayout>
        <Spinner />
      </PublicLayout>
    )
  }
  if (form === null) {
    return (
      <PublicLayout>
        <Alert>신청서를 찾을 수 없습니다. 받으신 링크를 다시 확인해 주세요.</Alert>
      </PublicLayout>
    )
  }

  const p = form.program
  const title = p.season ? `${p.name} (${p.season})` : p.name
  const closedNow = form.status !== 'open' || (form.is_full && !form.waitlist_enabled)
  if (closedNow) {
    return (
      <PublicLayout>
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
          <h1 className="text-lg font-bold text-slate-900">{title}</h1>
          <p className="mt-3 text-sm text-slate-600">
            {form.status === 'before'
              ? '아직 모집 전입니다. 모집이 시작되면 다시 안내드리겠습니다.'
              : form.status === 'closed'
                ? '모집이 마감되었습니다.'
                : '정원이 마감되었습니다.'}
          </p>
          {form.kakao_channel_url && <KakaoButton url={form.kakao_channel_url} />}
        </div>
      </PublicLayout>
    )
  }

  const waitlist = !!form.is_full
  const errors: Record<string, string> = attempted ? validate() : {}
  const field = (key: string, node: ReactNode) => <div id={`field-${key}`}>{node}</div>

  return (
    <PublicLayout>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">{title} 등록 신청</h1>
        <dl className="mt-3 space-y-1 rounded-xl bg-white p-4 text-sm ring-1 ring-slate-200">
          {p.country && (
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">국가</dt>
              <dd className="text-slate-900">{p.country}</dd>
            </div>
          )}
          {p.start_date && p.end_date && (
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-slate-500">일정</dt>
              <dd className="text-right text-slate-900">
                {formatDateLongKo(p.start_date)} ~ {formatDateLongKo(p.end_date)}
              </dd>
            </div>
          )}
          {!!p.total_price && (
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">참가비</dt>
              <dd className="font-semibold text-slate-900">{formatWon(p.total_price)}</dd>
            </div>
          )}
        </dl>
        {p.description && <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-slate-600">{p.description}</p>}
      </div>

      {waitlist && (
        <div className="mb-4">
          <Alert tone="amber">
            정원이 모두 찼습니다. 지금 신청하시면 <strong>대기 접수</strong>되며, 자리가 생기면 순서대로 연락드립니다. 대기 접수 단계에서는 납부하실 금액이
            없습니다.
          </Alert>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Section title="알게 된 경로">
          {knownPartner ? (
            <div className="rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-700">
              <strong>{knownPartner.name}</strong>
              {knownContact ? ` ${knownContact.name} 선생님` : ''} 소개로 신청합니다.
            </div>
          ) : (
            field(
              'partner',
              <Field label="어디서 알게 되셨나요?" error={errors.partner}>
                <Select value={partnerChoice} onChange={(e) => void choosePartner(e.target.value)}>
                  <option value="">선택해 주세요</option>
                  {partners.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                      {x.region ? ` (${x.region})` : ''}
                    </option>
                  ))}
                  <option value={OTHER}>기타 (직접 입력)</option>
                  <option value={NONE}>해당 없음</option>
                </Select>
              </Field>,
            )
          )}
          {partnerChoice === OTHER &&
            field(
              'sourceOther',
              <Field label="알게 된 경로" error={errors.sourceOther}>
                <Input value={sourceOther} placeholder="예: 지인 소개, 블로그" onChange={(e) => setSourceOther(e.target.value)} />
              </Field>,
            )}
          {!knownContact && contacts.length > 0 && (
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

        <Section title="학생 정보">
          {field(
            'student_name_ko',
            <Field label="학생 이름(한글)" error={errors.student_name_ko}>
              <Input autoComplete="off" value={v.student_name_ko} onChange={(e) => set('student_name_ko')(e.target.value)} />
            </Field>,
          )}
          {shown('student_name_en') &&
            field(
              'student_name_en',
              <Field
                label={`영문 이름(여권과 동일)${req('student_name_en') ? '' : ' (선택)'}`}
                hint="여권에 적힌 그대로 입력해 주세요. 항공권 발권에 사용합니다."
                error={errors.student_name_en}
              >
                <Input
                  autoComplete="off"
                  autoCapitalize="characters"
                  placeholder="HONG GILDONG"
                  value={v.student_name_en}
                  onChange={(e) => set('student_name_en')(e.target.value)}
                  onBlur={() => v.student_name_en && set('student_name_en')(normalizeEnglishName(v.student_name_en))}
                />
              </Field>,
            )}
          {shown('birth_date') &&
            field(
              'birth_date',
              <Field label={`생년월일${req('birth_date') ? '' : ' (선택)'}`} error={errors.birth_date}>
                <Input type="date" max={todayKst()} value={v.birth_date} onChange={(e) => set('birth_date')(e.target.value)} />
              </Field>,
            )}
          {shown('gender') &&
            field(
              'gender',
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">성별{req('gender') ? '' : ' (선택)'}</p>
                <div className="flex gap-2" role="radiogroup" aria-label="성별">
                  {[
                    { value: 'male', label: '남' },
                    { value: 'female', label: '여' },
                  ].map((o) => (
                    <label
                      key={o.value}
                      className={`flex-1 cursor-pointer rounded-xl py-2.5 text-center text-sm ring-1 has-focus-visible:outline-2 has-focus-visible:outline-brand-600 ${
                        v.gender === o.value ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-300'
                      }`}
                    >
                      <input type="radio" name="gender" className="sr-only" checked={v.gender === o.value} onChange={() => set('gender')(o.value)} />
                      {o.label}
                    </label>
                  ))}
                </div>
                {errors.gender && <p className="mt-1 text-xs text-red-600">{errors.gender}</p>}
              </div>,
            )}
          {shown('school') &&
            field(
              'school',
              <Field label={`학교${req('school') ? '' : ' (선택)'}`} error={errors.school}>
                <Input value={v.school} onChange={(e) => set('school')(e.target.value)} />
              </Field>,
            )}
          {shown('grade') &&
            field(
              'grade',
              <Field label={`학년${req('grade') ? '' : ' (선택)'}`} error={errors.grade}>
                <Select value={v.grade} onChange={(e) => set('grade')(e.target.value)}>
                  <option value="">선택해 주세요</option>
                  {GRADES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </Select>
              </Field>,
            )}
          {shown('english_level') &&
            field(
              'english_level',
              <Field label={`영어 수준${req('english_level') ? '' : ' (선택)'}`} error={errors.english_level}>
                <Select value={v.english_level} onChange={(e) => set('english_level')(e.target.value)}>
                  <option value="">선택해 주세요</option>
                  {ENGLISH_LEVELS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </Select>
              </Field>,
            )}
        </Section>

        <Section title="학부모 정보">
          {field(
            'parent_name',
            <Field label="학부모 이름" error={errors.parent_name}>
              <Input autoComplete="name" value={v.parent_name} onChange={(e) => set('parent_name')(e.target.value)} />
            </Field>,
          )}
          {field(
            'parent_phone',
            <Field label="휴대폰 번호" hint="납부 안내를 이 번호로 보내 드립니다." error={errors.parent_phone}>
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="010-1234-5678"
                value={v.parent_phone}
                onChange={(e) => set('parent_phone')(e.target.value)}
              />
            </Field>,
          )}
          {shown('parent_email') &&
            field(
              'parent_email',
              <Field label={`이메일${req('parent_email') ? '' : ' (선택)'}`} error={errors.parent_email}>
                <Input type="email" inputMode="email" autoComplete="email" value={v.parent_email} onChange={(e) => set('parent_email')(e.target.value)} />
              </Field>,
            )}
          {shown('address') &&
            field(
              'address',
              <Field label={`주소${req('address') ? '' : ' (선택)'}`} error={errors.address}>
                <Input autoComplete="street-address" value={v.address} onChange={(e) => set('address')(e.target.value)} />
              </Field>,
            )}
        </Section>

        {shown('emergency') && (
          <Section title={`비상 연락처${req('emergency') ? '' : ' (선택)'}`} description="프로그램 기간 중 학부모님과 연락이 닿지 않을 때 연락드릴 분입니다.">
            {field(
              'emergency_name',
              <Field label="이름" error={errors.emergency_name}>
                <Input value={v.emergency_name} onChange={(e) => set('emergency_name')(e.target.value)} />
              </Field>,
            )}
            <Field label="관계">
              <Select value={v.emergency_relation} onChange={(e) => set('emergency_relation')(e.target.value)}>
                <option value="">선택해 주세요</option>
                {EMERGENCY_RELATIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
            {field(
              'emergency_phone',
              <Field label="연락처" error={errors.emergency_phone}>
                <Input type="tel" inputMode="tel" placeholder="010-1234-5678" value={v.emergency_phone} onChange={(e) => set('emergency_phone')(e.target.value)} />
              </Field>,
            )}
          </Section>
        )}

        {(shown('special_notes') || p.health_field_enabled) && (
          <Section title="특이사항">
            {shown('special_notes') &&
              field(
                'special_notes',
                <Field
                  label={`특이사항${req('special_notes') ? '' : ' (선택)'}`}
                  hint={p.health_field_enabled ? '건강 관련 내용은 아래 건강 특이사항 항목에 적어 주세요.' : undefined}
                  error={errors.special_notes}
                >
                  <Textarea rows={3} maxLength={2000} value={v.special_notes} onChange={(e) => set('special_notes')(e.target.value)} />
                </Field>,
              )}
            {p.health_field_enabled &&
              field(
                'health',
                <Field
                  label="건강 특이사항 (선택)"
                  hint="알레르기, 복용 중인 약 등. 적으시면 아래 민감정보 수집·이용 동의가 필요합니다."
                  error={errors.health}
                >
                  <Textarea rows={3} maxLength={2000} value={v.health_notes} onChange={(e) => set('health_notes')(e.target.value)} />
                </Field>,
              )}
          </Section>
        )}

        {p.passport_upload_enabled && (
          <Section title="여권 사진">
            <p className="text-sm leading-relaxed text-slate-600">
              항공권 예매를 위해 학생 여권의 사진면(인적사항 면)이 필요합니다. 신청을 마치시면 담당자가 <strong>여권 사진 제출 전용 링크</strong>를 보내
              드립니다. 제출하신 이미지는 암호화하여 보관하며, 지정된 담당자만 열람할 수 있습니다.
            </p>
          </Section>
        )}

        {!waitlist && (
          <Section title="납부 안내" description="오늘 신청하시면 아래 일정으로 납부하시게 됩니다. 입금 계좌는 신청 완료 화면과 안내 메시지로 알려 드립니다.">
            <ScheduleList lines={form.schedule ?? []} />
          </Section>
        )}

        <Section title="동의 및 확인">
          <div id="field-consent" className="space-y-3">
            {consents
              .filter((c) => c.kind !== 'destruction_notice' && c.kind !== 'reg_partner_share')
              .map((c) => (
                <ConsentItem
                  key={c.kind}
                  doc={c}
                  checked={!!agree[c.kind]}
                  onChange={(checked) => setAgree((prev) => ({ ...prev, [c.kind]: checked }))}
                  label={`${c.required ? '[필수]' : '[선택]'} 위 내용을 확인하였으며 동의합니다.`}
                />
              ))}
            {form.refund && (
              <ConsentItem
                doc={{ title: `[필수] 환불 규정 확인 (v${form.refund.version})`, body: form.refund.body }}
                checked={!!agree.refund}
                onChange={(checked) => setAgree((prev) => ({ ...prev, refund: checked }))}
                label="[필수] 환불 규정을 확인했습니다."
              />
            )}
            {hasPartner && doc('reg_partner_share') && (
              <ConsentItem
                doc={{ title: doc('reg_partner_share')!.title, body: doc('reg_partner_share')!.body.replaceAll('{{partner_name}}', partnerName ?? '') }}
                checked={!!agree.reg_partner_share}
                onChange={(checked) => setAgree((prev) => ({ ...prev, reg_partner_share: checked }))}
                label="[선택] 위 내용을 확인하였으며 동의합니다."
              />
            )}
            {errors.consent && <p className="text-xs text-red-600">{errors.consent}</p>}
          </div>
        </Section>

        {form.destroy_date &&
          field(
            'destruction',
            <div className="space-y-2">
              <DestructionNotice destroyDate={form.destroy_date} body={doc('destruction_notice')?.body} />
              <label className="flex items-start gap-2 px-1 text-sm text-slate-800">
                <input
                  type="checkbox"
                  className="mt-0.5 size-5 shrink-0"
                  checked={!!agree.destruction_notice}
                  onChange={(e) => setAgree((prev) => ({ ...prev, destruction_notice: e.target.checked }))}
                />
                [필수] 개인정보 파기 안내를 확인했습니다.
              </label>
              {errors.destruction && <p className="text-xs text-red-600">{errors.destruction}</p>}
            </div>,
          )}

        {/* 허니팟: 화면에 보이지 않음 */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>
            웹사이트
            <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </label>
        </div>

        {submitError && <Alert>{submitError}</Alert>}
        <Button type="submit" className="w-full py-3 text-base" disabled={submitting}>
          {submitting ? '보내는 중…' : waitlist ? '대기 신청하기' : '등록 신청하기'}
        </Button>
      </form>
    </PublicLayout>
  )
}

export function KakaoButton({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="mt-6 flex w-full items-center justify-center rounded-xl bg-[#FEE500] px-4 py-3 text-base font-semibold text-[#191919]"
    >
      인투유학 카카오톡 문의 바로가기
    </a>
  )
}
