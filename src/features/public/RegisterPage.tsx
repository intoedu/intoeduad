import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { Alert, Button, Field, Input, Select, Spinner, Textarea } from '../../components/ui'
import { isValidMobile, isValidPhone, normalizePhone } from '../../domain/phone'
import { isValidBirthDate, isValidEmail, isValidEnglishName, normalizeEnglishName } from '../../domain/registration'
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
import { AgencyChooser } from '../../components/shared/AgencyChooser'
import type { AgencyChoice, AgencyService } from '../../domain/agency'
import { PassportPicker } from './PassportPicker'
import { uploadPassport } from './passportUpload'
import { DestructionNotice, DiscountList, ScheduleList } from './RegistrationParts'
import { InflowField } from '../../components/shared/InflowField'
import { QuestionFields } from '../../components/shared/QuestionFields'
import { KakaoField } from '../../components/shared/KakaoField'
import { ChildPicker } from '../account/ChildPicker'
import { anyLoginMethod, rememberFromForm, useCustomer, useLoginMethods, type CustomerStudent } from '../account/customerApi'
import { formatPhone } from '../../domain/phone'
import { useLang } from '../../i18n/context'
import { errorText, formatDateLong, formatMoney, optionText } from '../../i18n/text'
import { ConsentKoreanNote } from '../../i18n/lang'
import {
  CONSULTED_OPTIONS,
  CONTACT_UNKNOWN,
  EMPTY_INFLOW,
  EMPTY_KAKAO,
  kakaoPayload,
  validateKakao,
  type KakaoValue,
  PARTNER_NOT_LISTED,
  cleanAnswers,
  fieldHelp,
  fieldLabel,
  inflowPayload,
  inflowText,
  validateAnswers,
  validateInflow,
  type AnswerMap,
  type InflowValue,
} from '../../domain/formSettings'

const GRADES = ['초1', '초2', '초3', '초4', '초5', '초6', '중1', '중2', '중3', '고1', '고2', '고3', '기타']
const ENGLISH_LEVELS = ['처음 배워요', '기초', '중급', '상급']
const EMERGENCY_RELATIONS = ['어머니', '아버지', '조부모', '친척', '기타']

export type RegisterDoneState = {
  waitlisted: boolean
  myToken: string | null
  summary: RegistrationSummary | null
  kakaoUrl: string | null
  studentName: string
  programName: string
  // 여권 사진: 함께 올림 / 올리기 실패 / 나중에 제출 / 받지 않는 캠프
  passport: 'uploaded' | 'failed' | 'later' | 'none'
  passportError?: string
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
  const { tr } = useLang()
  return (
    <div className="rounded-xl ring-1 ring-slate-200">
      <details className="group">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-800">
          {doc.title}
          <span className="ml-1 text-xs font-normal text-brand-600 group-open:hidden">{tr('내용 보기', 'View')}</span>
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
  const location = useLocation()
  const { lang, en, tr } = useLang()
  const { state: member } = useCustomer()
  const loginMethods = useLoginMethods()
  const [childId, setChildId] = useState('')
  const [memberFilled, setMemberFilled] = useState(false)

  const [form, setForm] = useState<RegisterForm | null | undefined>(undefined)
  const [loadError, setLoadError] = useState(false)
  const [v, setV] = useState<Values>(EMPTY)
  const [tokenValid, setTokenValid] = useState(false)
  // 소개 경로
  const [knownPartner, setKnownPartner] = useState<{ id: string; name: string } | null>(null)
  const [knownContact, setKnownContact] = useState<{ id: string; name: string } | null>(null)
  const [partners, setPartners] = useState<Array<{ id: string; name: string; region: string | null }>>([])
  // 링크로 학원이 정해졌을 때 선생님 고르기
  const [contacts, setContacts] = useState<PublicContact[]>([])
  const [contactChoice, setContactChoice] = useState('')
  // 링크가 없으면 유입 경로(필수)
  const [inflow, setInflow] = useState<InflowValue>(EMPTY_INFLOW)
  const [consulted, setConsulted] = useState<'' | 'yes' | 'no' | 'unsure'>('')
  const [answers, setAnswers] = useState<AnswerMap>({})
  const [kakao, setKakao] = useState<KakaoValue>(EMPTY_KAKAO)

  const [agree, setAgree] = useState<Record<string, boolean>>({})
  const [passportMode, setPassportMode] = useState<'' | 'now' | 'later'>('')
  const [agency, setAgency] = useState<{ choice: AgencyChoice | ''; services: AgencyService[] }>({ choice: '', services: [] })
  const [passportFile, setPassportFile] = useState<File | null>(null)
  const [website, setWebsite] = useState('') // 허니팟
  const [attempted, setAttempted] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    getRegisterForm(slug, refCode)
      .then(setForm)
      .catch(() => setLoadError(true))
  }, [slug, refCode])

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

  const loadContacts = useCallback((partnerId: string) => listPartnerContacts(partnerId), [])

  function childValues(c: CustomerStudent | null) {
    return {
      student_name_ko: c?.name_ko ?? '',
      student_name_en: c?.name_en ?? '',
      birth_date: c?.birth_date ?? '',
      gender: c?.gender ?? '',
      school: c?.school ?? '',
      grade: c?.grade && GRADES.includes(c.grade) ? c.grade : '',
      english_level: c?.english_level && ENGLISH_LEVELS.includes(c.english_level) ? c.english_level : '',
    }
  }

  function pickChild(c: CustomerStudent | null) {
    setChildId(c ? c.id : 'new')
    setV((prev) => ({ ...prev, ...childValues(c) }))
  }

  // 회원 정보로 한 번 채운다(상담 기록 링크로 채운 칸·이미 적은 칸은 그대로)
  useEffect(() => {
    if (member.status !== 'member' || memberFilled) return
    const p = member.profile
    setMemberFilled(true)
    const only = member.students.length === 1 ? member.students[0] : null
    if (only) setChildId(only.id)
    setV((prev) => {
      const next = { ...prev }
      const fill = (k: keyof Values, val: string | null | undefined) => {
        if (!next[k] && val) next[k] = val
      }
      fill('parent_name', p.parent_name)
      fill('parent_phone', formatPhone(p.parent_phone))
      fill('parent_email', p.parent_email)
      fill('address', p.address)
      fill('emergency_name', p.emergency_name)
      fill('emergency_relation', p.emergency_relation && EMERGENCY_RELATIONS.includes(p.emergency_relation) ? p.emergency_relation : '')
      fill('emergency_phone', p.emergency_phone ? formatPhone(p.emergency_phone) : '')
      if (only) for (const [k, val] of Object.entries(childValues(only))) fill(k as keyof Values, val)
      return next
    })
    if (p.kakao_use !== null) {
      setKakao((k) =>
        k.use ? k : { use: p.kakao_use ? 'yes' : 'no', altPhone: p.kakao_alt_phone ? formatPhone(p.kakao_alt_phone) : '', altContact: p.alt_contact ?? '' },
      )
    }
  }, [member, memberFilled])

  const set = (key: keyof Values) => (value: string) => setV((prev) => ({ ...prev, [key]: value }))
  const mode = (key: RegisterFieldKey): FieldMode => form?.fields?.[key] ?? 'optional'
  const shown = (key: RegisterFieldKey) => mode(key) !== 'hidden'
  const req = (key: RegisterFieldKey) => mode(key) === 'required'

  const consents = form?.consents ?? []
  const doc = (kind: string): RegisterConsent | undefined => consents.find((c) => c.kind === kind)
  const partnerName =
    knownPartner?.name ??
    (inflow.partnerId && inflow.partnerId !== PARTNER_NOT_LISTED ? (partners.find((p) => p.id === inflow.partnerId)?.name ?? null) : null)
  // 영어 화면에서는 관리자가 한국어로 바꾼 항목 이름·도움말 대신 영어 기본 문구를 쓴다
  const texts = en ? null : form?.texts
  const label = (key: string, fallback: string, enText: string, optional = false) =>
    `${en ? enText : fieldLabel(texts, key, fallback)}${optional ? tr(' (선택)', ' (optional)') : ''}`
  const help = (key: string, ko?: string, enText?: string) => (en ? enText : fieldHelp(texts, key, ko))
  const questions = form?.questions ?? []
  const hasPartner = !!partnerName

  function validate(): Record<string, string> {
    const e: Record<string, string> = {}
    const today = todayKst()
    const inflowError = form?.inflow ? validateInflow(form.inflow, inflow, !!knownPartner, lang) : null
    if (inflowError) e.inflow = inflowError
    if (!tokenValid && form?.consulted_label && !consulted) e.consulted = tr('상담 신청 여부를 골라 주세요.', "Please tell us whether you have requested a consultation before.")
    if (!v.student_name_ko.trim()) e.student_name_ko = tr('학생 이름을 입력해 주세요.', "Please enter the student's name.")
    if (shown('student_name_en')) {
      if (req('student_name_en') && !v.student_name_en.trim()) e.student_name_en = tr('여권과 같은 영문 이름을 입력해 주세요.', "Please enter the student's name exactly as in the passport.")
      else if (v.student_name_en.trim() && !isValidEnglishName(v.student_name_en)) e.student_name_en = tr('영문 알파벳으로 입력해 주세요. (예: HONG GILDONG)', "Please use English letters only. (e.g. HONG GILDONG)")
    }
    if (shown('birth_date')) {
      if (req('birth_date') && !v.birth_date) e.birth_date = tr('생년월일을 입력해 주세요.', "Please enter the date of birth.")
      else if (v.birth_date && !isValidBirthDate(v.birth_date, today)) e.birth_date = tr('생년월일을 확인해 주세요.', "Please check the date of birth.")
    }
    if (shown('gender') && req('gender') && !v.gender) e.gender = tr('성별을 선택해 주세요.', "Please select the gender.")
    if (shown('school') && req('school') && !v.school.trim()) e.school = tr('학교를 입력해 주세요.', "Please enter the school.")
    if (shown('grade') && req('grade') && !v.grade) e.grade = tr('학년을 선택해 주세요.', "Please select a grade.")
    if (shown('english_level') && req('english_level') && !v.english_level) e.english_level = tr('영어 수준을 선택해 주세요.', "Please select the English level.")
    if (!v.parent_name.trim()) e.parent_name = tr('학부모 이름을 입력해 주세요.', "Please enter the parent's name.")
    if (!isValidMobile(normalizePhone(v.parent_phone))) e.parent_phone = tr('휴대폰 번호를 정확히 입력해 주세요. (예: 010-1234-5678)', "Please enter a valid Korean mobile number. (e.g. 010-1234-5678)")
    const kakaoError = validateKakao(kakao, lang)
    if (kakaoError) e.kakao = kakaoError
    if (shown('parent_email')) {
      if (req('parent_email') && !v.parent_email.trim()) e.parent_email = tr('이메일을 입력해 주세요.', "Please enter an email address.")
      else if (v.parent_email.trim() && !isValidEmail(v.parent_email)) e.parent_email = tr('이메일 형식을 확인해 주세요.', "Please check the email address.")
    }
    if (shown('address') && req('address') && !v.address.trim()) e.address = tr('주소를 입력해 주세요.', "Please enter the address.")
    if (shown('emergency')) {
      if (req('emergency') && !v.emergency_name.trim()) e.emergency_name = tr('비상 연락처 이름을 입력해 주세요.', "Please enter the emergency contact's name.")
      if (req('emergency') && !v.emergency_phone.trim()) e.emergency_phone = tr('비상 연락처 번호를 입력해 주세요.', "Please enter the emergency contact number.")
      else if (v.emergency_phone.trim() && !isValidPhone(normalizePhone(v.emergency_phone))) e.emergency_phone = tr('연락처를 확인해 주세요.', "Please check the phone number.")
    }
    if (shown('special_notes') && req('special_notes') && !v.special_notes.trim()) e.special_notes = tr('특이사항을 입력해 주세요. 없으면 "없음"이라고 적어 주세요.', "Please enter any special notes, or write \"None\".")

    const requiredKinds = consents.filter((c) => c.required).map((c) => c.kind)
    const missing = requiredKinds.filter((k) => !agree[k])
    if (missing.length > 0 || !agree.refund) e.consent = tr('필수 동의 항목에 모두 동의해 주세요.', "Please agree to all required items.")
    if (form?.program.health_field_enabled && v.health_notes.trim() && !agree.reg_health) {
      e.health = tr('건강 특이사항을 적으셨다면 민감정보 수집·이용에 동의해 주세요. 동의하지 않으시려면 내용을 지워 주세요.', "If you entered health notes, please agree to the collection and use of sensitive information, or delete the notes.")
    }
    for (const [id, msg] of Object.entries(validateAnswers(questions, answers, true, lang))) e[`q-${id}`] = msg
    if (!agree.destruction_notice) e.destruction = tr('개인정보 파기 안내를 확인해 주세요.', "Please confirm the personal data deletion notice.")
    if (form?.agency) {
      if (!agency.choice) e.agency = tr('항공권·ESTA·여행자보험 대행 여부를 선택해 주세요.', "Please choose whether you want us to arrange flights, ESTA and travel insurance.")
      else if (agency.choice === 'agency' && agency.services.length === 0) e.agency = tr('대행할 항목을 하나 이상 골라 주세요.', "Please choose at least one item.")
    }
    if (form?.program.passport_upload_enabled && !form.is_full) {
      if (!passportMode) e.passport = tr('여권 사진을 지금 올리실지, 나중에 제출하실지 골라 주세요.', "Please choose whether to upload the passport photo now or later.")
      else if (passportMode === 'now' && !passportFile) e.passport = tr('여권 사진을 선택해 주세요. 지금 없으시면 "나중에 제출"을 골라 주세요.', "Please choose a passport photo, or select \"Submit later\".")
    }
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
      // 우선순위(상담 기록 > 학원 링크 > 직접 선택)와 같은 학생의 상담 기록 연결은 DB가 다시 판단한다
      const route = inflowPayload(form.inflow, inflow, !!knownPartner)
      const res = await submitRegistration({
        slug,
        token: tokenValid ? token : null,
        partner_code: refCode,
        contact_code: contactCode,
        partner_id: route.partner_id,
        contact_id: route.contact_id ?? (knownPartner && !knownContact && contactChoice && contactChoice !== CONTACT_UNKNOWN ? contactChoice : null),
        source_other: null,
        inflow_channel_id: route.inflow_channel_id,
        inflow_detail: route.inflow_detail,
        answers: cleanAnswers(questions, answers),
        ...kakaoPayload(kakao),
        consulted_before: tokenValid ? 'yes' : consulted || null,
        ...v,
        student_name_ko: v.student_name_ko.trim(),
        student_name_en: v.student_name_en.trim() ? normalizeEnglishName(v.student_name_en) : '',
        parent_phone: normalizePhone(v.parent_phone),
        emergency_phone: normalizePhone(v.emergency_phone),
        health_notes: form.program.health_field_enabled ? v.health_notes : '',
        agree: { ...agree, reg_partner_share: hasPartner && !!agree.reg_partner_share },
        agency_choice: form.agency ? agency.choice || null : null,
        agency_services: form.agency && agency.choice === 'agency' ? agency.services : [],
        website,
      })
      // 여권 사진은 신청 저장 뒤 따로 올린다(신청과 파일 업로드 2단계 분리)
      let passport: RegisterDoneState['passport'] = form.program.passport_upload_enabled ? 'later' : 'none'
      let passportError: string | undefined
      if (form.program.passport_upload_enabled && passportMode === 'now' && passportFile && res.my_token && res.status !== 'waitlisted') {
        try {
          await uploadPassport(res.my_token, passportFile, true)
          passport = 'uploaded'
        } catch (err) {
          passport = 'failed'
          passportError = (err as Error).message
        }
      }
      const state: RegisterDoneState = {
        passport,
        passportError,
        waitlisted: res.status === 'waitlisted',
        myToken: res.my_token,
        summary: res.summary,
        kakaoUrl: form.kakao_channel_url || null,
        studentName: v.student_name_ko.trim(),
        programName: form.program.season ? `${form.program.name} (${form.program.season})` : form.program.name,
      }
      await rememberFromForm(
        member,
        {
          name_ko: v.student_name_ko.trim(),
          name_en: v.student_name_en.trim() ? normalizeEnglishName(v.student_name_en) : null,
          birth_date: v.birth_date || null,
          gender: v.gender || null,
          school: v.school.trim() || null,
          grade: v.grade || null,
          english_level: v.english_level || null,
        },
        {
          parent_email: v.parent_email,
          address: v.address,
          emergency_name: v.emergency_name,
          emergency_relation: v.emergency_relation,
          emergency_phone: normalizePhone(v.emergency_phone),
        },
      )
      navigate('/register/done', { replace: true, state })
    } catch (err) {
      const error = err as SubmitError
      setSubmitError(errorText(error.code, error.message, lang))
      if (error.code === 'FULL' || error.code === 'NOT_OPEN') {
        getRegisterForm(slug, refCode).then(setForm)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loadError) {
    return (
      <PublicLayout>
        <Alert>{tr('신청서를 불러오지 못했습니다. 잠시 후 다시 접속해 주세요.', 'We could not load the form. Please try again in a moment.')}</Alert>
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
        <Alert>{tr('신청서를 찾을 수 없습니다. 받으신 링크를 다시 확인해 주세요.', 'We could not find this form. Please check the link you received.')}</Alert>
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
              ? tr('아직 모집 전입니다. 모집이 시작되면 다시 안내드리겠습니다.', 'Registration has not opened yet. We will let you know when it opens.')
              : form.status === 'closed'
                ? tr('모집이 마감되었습니다.', 'Registration has closed.')
                : tr('정원이 마감되었습니다.', 'This program is full.')}
          </p>
          {form.kakao_channel_url && <KakaoButton url={form.kakao_channel_url} />}
        </div>
      </PublicLayout>
    )
  }

  const waitlist = !!form.is_full
  const errors: Record<string, string> = attempted ? validate() : {}
  const field = (key: string, node: ReactNode) => <div id={`field-${key}`}>{node}</div>
  const questionErrors = Object.fromEntries(
    Object.entries(errors)
      .filter(([k]) => k.startsWith('q-'))
      .map(([k, v]) => [k.slice(2), v]),
  )
  const hubQuery = new URLSearchParams()
  if (refCode) hubQuery.set('ref', refCode)
  if (contactCode) hubQuery.set('c', contactCode)

  return (
    <PublicLayout>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">{en ? `${title} Registration` : `${title} 등록 신청`}</h1>
        <dl className="mt-3 space-y-1 rounded-xl bg-white p-4 text-sm ring-1 ring-slate-200">
          {p.country && (
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">{tr('국가', 'Country')}</dt>
              <dd className="text-slate-900">{p.country}</dd>
            </div>
          )}
          {p.start_date && p.end_date && (
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-slate-500">{tr('일정', 'Dates')}</dt>
              <dd className="text-right text-slate-900">
                {formatDateLong(p.start_date, lang)} ~ {formatDateLong(p.end_date, lang)}
              </dd>
            </div>
          )}
          {!!p.total_price && (
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">{tr('참가비', 'Program fee')}</dt>
              <dd className="font-semibold text-slate-900">{formatMoney(p.total_price, lang)}</dd>
            </div>
          )}
        </dl>
        {p.description && <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-slate-600">{p.description}</p>}
        {!en && form.intro && <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-slate-600">{form.intro}</p>}
        {en && (
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Fields are in English, but you may answer in Korean or English. The program description above is provided by INTOEDU in Korean.
          </p>
        )}
        {!tokenValid && (
          <Link to={`/register${hubQuery.size ? `?${hubQuery}` : ''}`} className="mt-3 inline-block text-sm text-brand-600 hover:underline">
            {tr('← 다른 캠프 보기', '← See other camps')}
          </Link>
        )}
      </div>

      {waitlist && (
        <div className="mb-4">
          <Alert tone="amber">
            {en ? (
              <>
                This program is full. If you apply now, you will be added to the <strong>waitlist</strong> and we will contact you in order when a place
                opens up. No payment is needed while you are on the waitlist.
              </>
            ) : (
              <>
                정원이 모두 찼습니다. 지금 신청하시면 <strong>대기 접수</strong>되며, 자리가 생기면 순서대로 연락드립니다. 대기 접수 단계에서는 납부하실
                금액이 없습니다.
              </>
            )}
          </Alert>
        </div>
      )}

      {member.status === 'guest' && !tokenValid && anyLoginMethod(loginMethods) && (
        <p className="mb-4 rounded-xl bg-white px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
          {tr('인투유학 회원이시면', 'INTOEDU member?')}{' '}
          <Link to={`/account/login?next=${encodeURIComponent(location.pathname + location.search)}`} className="font-semibold text-brand-600 underline">
            {tr('로그인', 'Log in')}
          </Link>
          {tr('하고 저장된 정보로 바로 채우세요.', ' to fill in the form with your saved details.')}
        </p>
      )}
      {memberFilled && !tokenValid && (
        <div className="mb-4">
          <Alert tone="green">{tr('회원 정보로 채웠습니다. 바뀐 내용이 있으면 고쳐 주세요.', 'We filled in the form from your profile. Please update anything that has changed.')}</Alert>
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Section title={tr('알게 된 경로', 'Referral source')}>
          {knownPartner ? (
            <div className="rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-700">
              {en ? (
                <>
                  Referred by <strong>{knownPartner.name}</strong>
                  {knownContact ? ` (${knownContact.name})` : ''}
                </>
              ) : (
                <>
                  <strong>{knownPartner.name}</strong>
                  {knownContact ? ` ${knownContact.name} 선생님` : ''} 소개로 신청합니다.
                </>
              )}
            </div>
          ) : form.inflow ? (
            <InflowField
              config={form.inflow}
              value={inflow}
              onChange={setInflow}
              partners={partners}
              loadContacts={loadContacts}
              error={errors.inflow}
            />
          ) : null}
          {knownPartner && !knownContact && contacts.length > 0 && (
            <Field label={tr('소개해 주신 선생님 (선택)', 'Teacher who referred you (optional)')}>
              <Select value={contactChoice} onChange={(e) => setContactChoice(e.target.value)}>
                <option value="">{tr('선택 안 함', 'Not selected')}</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {en ? '' : (CONTACT_ROLE_LABELS[c.role] ?? '')}
                  </option>
                ))}
                <option value={CONTACT_UNKNOWN}>{tr('잘 모르겠어요', "I'm not sure")}</option>
              </Select>
            </Field>
          )}
          {!tokenValid &&
            form.consulted_label &&
            field(
              'consulted',
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-slate-700">{inflowText(form.consulted_label, lang)}</legend>
                <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={inflowText(form.consulted_label, lang)}>
                  {CONSULTED_OPTIONS.map((o) => (
                    <label
                      key={o.value}
                      className={`cursor-pointer rounded-xl px-3 py-2.5 text-center text-sm ring-1 has-focus-visible:outline-2 has-focus-visible:outline-brand-600 ${
                        consulted === o.value ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-300'
                      }`}
                    >
                      <input type="radio" name="consulted" className="sr-only" checked={consulted === o.value} onChange={() => setConsulted(o.value)} />
                      {en ? o.en : o.label}
                    </label>
                  ))}
                </div>
                {consulted === 'yes' && (
                  <p className="mt-2 text-xs text-slate-500">
                    {tr(
                      '상담 때 남기신 학부모 휴대폰 번호와 학생 이름을 같게 적어 주시면 상담 내용과 연결됩니다.',
                      'Please use the same parent mobile number and student name as in your consultation request so we can link them.',
                    )}
                  </p>
                )}
                {errors.consulted && <p className="mt-1 text-xs text-red-600">{errors.consulted}</p>}
              </fieldset>,
            )}
        </Section>

        <Section title={tr('학생 정보', 'Student information')}>
          {member.status === 'member' && !tokenValid && <ChildPicker students={member.students} value={childId} onPick={pickChild} />}
          {field(
            'student_name_ko',
            <Field label={label('student_name_ko', '학생 이름(한글)', 'Student name')}
              hint={help('student_name_ko', undefined, "The student's Korean name if they have one; otherwise the English name.")} error={errors.student_name_ko}>
              <Input autoComplete="off" value={v.student_name_ko} onChange={(e) => set('student_name_ko')(e.target.value)} />
            </Field>,
          )}
          {shown('student_name_en') &&
            field(
              'student_name_en',
              <Field
                label={label('student_name_en', '영문 이름(여권과 동일)', 'Name in English (as in passport)', !req('student_name_en'))}
                hint={help('student_name_en', '여권에 적힌 그대로 입력해 주세요. 항공권 발권에 사용합니다.', 'Enter it exactly as in the passport. We use it to book flights.')}
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
              <Field label={label('birth_date', '생년월일', 'Date of birth', !req('birth_date'))} hint={help('birth_date')} error={errors.birth_date}>
                <Input type="date" max={todayKst()} value={v.birth_date} onChange={(e) => set('birth_date')(e.target.value)} />
              </Field>,
            )}
          {shown('gender') &&
            field(
              'gender',
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">{label('gender', '성별', 'Gender', !req('gender'))}</p>
                <div className="flex gap-2" role="radiogroup" aria-label={tr('성별', 'Gender')}>
                  {[
                    { value: 'male', label: tr('남', 'Male') },
                    { value: 'female', label: tr('여', 'Female') },
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
              <Field label={label('school', '학교', 'School', !req('school'))} hint={help('school')} error={errors.school}>
                <Input value={v.school} onChange={(e) => set('school')(e.target.value)} />
              </Field>,
            )}
          {shown('grade') &&
            field(
              'grade',
              <Field label={label('grade', '학년', 'Grade (in Korea)', !req('grade'))} hint={help('grade')} error={errors.grade}>
                <Select value={v.grade} onChange={(e) => set('grade')(e.target.value)}>
                  <option value="">{tr('선택해 주세요', 'Please select')}</option>
                  {GRADES.map((g) => (
                    <option key={g} value={g}>
                      {optionText(g, lang)}
                    </option>
                  ))}
                </Select>
              </Field>,
            )}
          {shown('english_level') &&
            field(
              'english_level',
              <Field label={label('english_level', '영어 수준', 'English level', !req('english_level'))} hint={help('english_level')} error={errors.english_level}>
                <Select value={v.english_level} onChange={(e) => set('english_level')(e.target.value)}>
                  <option value="">{tr('선택해 주세요', 'Please select')}</option>
                  {ENGLISH_LEVELS.map((g) => (
                    <option key={g} value={g}>
                      {optionText(g, lang)}
                    </option>
                  ))}
                </Select>
              </Field>,
            )}
        </Section>

        <Section title={tr('학부모 정보', 'Parent information')}>
          {field(
            'parent_name',
            <Field label={label('parent_name', '학부모 이름', "Parent's name")} hint={help('parent_name')} error={errors.parent_name}>
              <Input autoComplete="name" value={v.parent_name} onChange={(e) => set('parent_name')(e.target.value)} />
            </Field>,
          )}
          {field(
            'parent_phone',
            <Field label={label('parent_phone', '휴대폰 번호', 'Mobile number')}
              hint={help('parent_phone', '납부 안내를 이 번호로 보내 드립니다.', 'We will send payment notices to this number.')} error={errors.parent_phone}>
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
          <KakaoField value={kakao} onChange={setKakao} error={errors.kakao} />
          {shown('parent_email') &&
            field(
              'parent_email',
              <Field label={label('parent_email', '이메일', 'Email', !req('parent_email'))} hint={help('parent_email')} error={errors.parent_email}>
                <Input type="email" inputMode="email" autoComplete="email" value={v.parent_email} onChange={(e) => set('parent_email')(e.target.value)} />
              </Field>,
            )}
          {shown('address') &&
            field(
              'address',
              <Field label={label('address', '주소', 'Address', !req('address'))} hint={help('address')} error={errors.address}>
                <Input autoComplete="street-address" value={v.address} onChange={(e) => set('address')(e.target.value)} />
              </Field>,
            )}
        </Section>

        {shown('emergency') && (
          <Section
            title={label('emergency', '비상 연락처', 'Emergency contact', !req('emergency'))}
            description={help(
              'emergency',
              '프로그램 기간 중 학부모님과 연락이 닿지 않을 때 연락드릴 분입니다.',
              'Someone we can contact during the program if we cannot reach you.',
            )}
          >
            {field(
              'emergency_name',
              <Field label={tr('이름', 'Name')} error={errors.emergency_name}>
                <Input value={v.emergency_name} onChange={(e) => set('emergency_name')(e.target.value)} />
              </Field>,
            )}
            <Field label={tr('관계', 'Relationship')}>
              <Select value={v.emergency_relation} onChange={(e) => set('emergency_relation')(e.target.value)}>
                <option value="">{tr('선택해 주세요', 'Please select')}</option>
                {EMERGENCY_RELATIONS.map((r) => (
                  <option key={r} value={r}>
                    {optionText(r, lang)}
                  </option>
                ))}
              </Select>
            </Field>
            {field(
              'emergency_phone',
              <Field label={tr('연락처', 'Phone number')} error={errors.emergency_phone}>
                <Input type="tel" inputMode="tel" placeholder="010-1234-5678" value={v.emergency_phone} onChange={(e) => set('emergency_phone')(e.target.value)} />
              </Field>,
            )}
          </Section>
        )}

        {(shown('special_notes') || p.health_field_enabled) && (
          <Section title={tr('특이사항', 'Special notes')}>
            {shown('special_notes') &&
              field(
                'special_notes',
                <Field
                  label={label('special_notes', '특이사항', 'Special notes', !req('special_notes'))}
                  hint={help(
                    'special_notes',
                    p.health_field_enabled ? '건강 관련 내용은 아래 건강 특이사항 항목에 적어 주세요.' : undefined,
                    p.health_field_enabled ? 'Please write health-related notes in the health notes field below.' : undefined,
                  )}
                  error={errors.special_notes}
                >
                  <Textarea rows={3} maxLength={2000} value={v.special_notes} onChange={(e) => set('special_notes')(e.target.value)} />
                </Field>,
              )}
            {p.health_field_enabled &&
              field(
                'health',
                <Field
                  label={tr('건강 특이사항 (선택)', 'Health notes (optional)')}
                  hint={tr(
                    '알레르기, 복용 중인 약 등. 적으시면 아래 민감정보 수집·이용 동의가 필요합니다.',
                    'Allergies, medication, etc. If you fill this in, consent to the collection of sensitive information below is required.',
                  )}
                  error={errors.health}
                >
                  <Textarea rows={3} maxLength={2000} value={v.health_notes} onChange={(e) => set('health_notes')(e.target.value)} />
                </Field>,
              )}
          </Section>
        )}

        {p.passport_upload_enabled && (
          <Section title={tr('여권 사진', 'Passport photo')}>
            {field(
              'passport',
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={tr('여권 사진 제출', 'Passport photo submission')}>
                  {(
                    [
                      ['now', tr('지금 올리기', 'Upload now')],
                      ['later', tr('나중에 제출', 'Submit later')],
                    ] as const
                  ).map(([value, label]) => (
                    <label
                      key={value}
                      className={`cursor-pointer rounded-xl py-2.5 text-center text-sm ring-1 has-focus-visible:outline-2 has-focus-visible:outline-brand-600 ${
                        passportMode === value ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-300'
                      }`}
                    >
                      <input type="radio" name="passport-mode" className="sr-only" checked={passportMode === value} onChange={() => setPassportMode(value)} />
                      {label}
                    </label>
                  ))}
                </div>
                {passportMode === 'now' && <PassportPicker file={passportFile} onChange={setPassportFile} error={errors.passport} />}
                {passportMode === 'later' && (
                  <p className="text-sm text-slate-600">
                    {tr(
                      '신청 후 받으시는 [신청 내용 확인] 페이지나 담당자가 보내 드리는 링크로 제출하실 수 있습니다.',
                      'You can submit it later on your registration page or through the link your advisor sends you.',
                    )}
                  </p>
                )}
                {passportMode !== 'now' && errors.passport && <p className="text-xs text-red-600">{errors.passport}</p>}
                <p className="text-xs text-slate-500">
                  {tr('제출하신 이미지는 암호화하여 보관하며, 지정된 담당자만 열람할 수 있습니다.', 'Your image is stored encrypted and only designated staff can view it.')}
                </p>
                {waitlist && (
                  <p className="text-xs text-slate-500">
                    {tr('대기 접수는 자리가 확정된 뒤 여권 사진을 받습니다.', 'For waitlisted applicants, we collect the passport photo once a place is confirmed.')}
                  </p>
                )}
              </div>,
            )}
          </Section>
        )}

        {questions.length > 0 && (
          <Section title={tr('추가 질문', 'Additional questions')}>
            <QuestionFields questions={questions} values={answers} onChange={setAnswers} errors={questionErrors} />
          </Section>
        )}

        {form.agency && (
          <Section
            title={tr('항공권·ESTA·여행자보험 대행', 'Flights, ESTA and travel insurance')}
            description={tr('대행을 원하시면 항목을 골라 주세요. 직접 준비하셔도 됩니다.', 'Choose the items you want us to arrange, or arrange them yourself.')}
          >
            <AgencyChooser fees={form.agency.fees} choice={agency.choice} services={agency.services} onChange={setAgency} error={errors.agency} />
          </Section>
        )}

        {!waitlist && (
          <Section
            title={tr('납부 안내', 'Payment information')}
            description={tr(
              '오늘 신청하시면 아래 일정으로 납부하시게 됩니다. 입금 계좌는 신청 완료 화면과 안내 메시지로 알려 드립니다.',
              'If you register today, you will pay according to the schedule below. We will share the bank account on the next screen and by message.',
            )}
          >
            <div className="space-y-3">
              <DiscountList discounts={form.discounts} />
              <ScheduleList lines={form.schedule ?? []} />
            </div>
          </Section>
        )}

        <Section title={tr('동의 및 확인', 'Consent and confirmation')}>
          <div id="field-consent" className="space-y-3">
            {en && <ConsentKoreanNote />}
            {consents
              .filter((c) => c.kind !== 'destruction_notice' && c.kind !== 'reg_partner_share')
              .map((c) => (
                <ConsentItem
                  key={c.kind}
                  doc={c}
                  checked={!!agree[c.kind]}
                  onChange={(checked) => setAgree((prev) => ({ ...prev, [c.kind]: checked }))}
                  label={
                    en
                      ? `${c.required ? '[Required]' : '[Optional]'} I have read the above and agree.`
                      : `${c.required ? '[필수]' : '[선택]'} 위 내용을 확인하였으며 동의합니다.`
                  }
                />
              ))}
            {form.refund && (
              <ConsentItem
                doc={{ title: tr(`[필수] 환불 규정 확인 (v${form.refund.version})`, `[Required] Refund policy (v${form.refund.version})`), body: form.refund.body }}
                checked={!!agree.refund}
                onChange={(checked) => setAgree((prev) => ({ ...prev, refund: checked }))}
                label={tr('[필수] 환불 규정을 확인했습니다.', '[Required] I have read the refund policy.')}
              />
            )}
            {hasPartner && doc('reg_partner_share') && (
              <ConsentItem
                doc={{ title: doc('reg_partner_share')!.title, body: doc('reg_partner_share')!.body.replaceAll('{{partner_name}}', partnerName ?? '') }}
                checked={!!agree.reg_partner_share}
                onChange={(checked) => setAgree((prev) => ({ ...prev, reg_partner_share: checked }))}
                label={tr('[선택] 위 내용을 확인하였으며 동의합니다.', '[Optional] I have read the above and agree.')}
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
                {tr('[필수] 개인정보 파기 안내를 확인했습니다.', '[Required] I have read the personal data deletion notice.')}
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
          {submitting ? tr('보내는 중…', 'Sending…') : waitlist ? tr('대기 신청하기', 'Join the waitlist') : tr('등록 신청하기', 'Register')}
        </Button>
      </form>
    </PublicLayout>
  )
}

export function KakaoButton({ url }: { url: string }) {
  const { tr } = useLang()
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="mt-6 flex w-full items-center justify-center rounded-xl bg-[#FEE500] px-4 py-3 text-base font-semibold text-[#191919]"
    >
      {tr('인투유학 카카오톡 문의 바로가기', 'Contact INTOEDU on KakaoTalk')}
    </a>
  )
}
