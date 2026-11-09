import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { KakaoField } from '../../components/shared/KakaoField'
import { Alert, Button, Field, Input, Select, Spinner } from '../../components/ui'
import { EMPTY_KAKAO, validateKakao, type KakaoValue } from '../../domain/formSettings'
import { formatPhone, isValidMobile, isValidPhone, normalizePhone } from '../../domain/phone'
import { isValidEmail, isValidEnglishName, normalizeEnglishName } from '../../domain/registration'
import { useAuth } from '../auth/AuthProvider'
import { useLang } from '../../i18n/context'
import { ConsentKoreanNote } from '../../i18n/lang'
import { optionText } from '../../i18n/text'
import { PublicLayout, Section } from '../public/PublicLayout'
import {
  changePassword,
  deleteAccount,
  deleteStudent,
  enabledProviders,
  MEMBER_PASSWORD_MIN,
  memberConsent,
  saveProfile,
  saveStudent,
  sendPasswordReset,
  signInWithEmail,
  signInWithProvider,
  signUpWithEmail,
  useCustomer,
  type CustomerProfile,
  type CustomerStudent,
  type Provider,
} from './customerApi'

const GRADES = ['초1', '초2', '초3', '초4', '초5', '초6', '중1', '중2', '중3', '고1', '고2', '고3', '기타']
const RELATIONS = ['어머니', '아버지', '조부모', '기타']
const ENGLISH_LEVELS = ['처음 배워요', '기초', '중급', '상급']

// 영어 화면: 서버가 돌려준 한국어 오류 대신 일반 안내
const errText = (e: unknown, en: boolean, fallback: string) => (en ? fallback : (e as Error).message)

// 돌아갈 화면: 같은 사이트 안의 경로만
function safeNext(raw: string | null, fallback = '/account') {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : fallback
}

// ---------------------------------------------------------------------------
// 로그인·회원가입
// ---------------------------------------------------------------------------
export function AccountLoginPage() {
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const navigate = useNavigate()
  const { state } = useCustomer()
  const [providers, setProviders] = useState<{ kakao: boolean; google: boolean; email: boolean } | null>(null)
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [message, setMessage] = useState<{ tone: 'red' | 'green' | 'blue'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const { en, tr } = useLang()

  useEffect(() => {
    enabledProviders().then(setProviders)
  }, [])

  useEffect(() => {
    if (state.status === 'member') navigate(next, { replace: true })
    if (state.status === 'needs_setup') navigate(`/account/setup?next=${encodeURIComponent(next)}`, { replace: true })
  }, [state.status, navigate, next])

  async function go(p: Provider) {
    setMessage(null)
    try {
      await signInWithProvider(p, next)
    } catch (e) {
      setMessage({ tone: 'red', text: errText(e, en, 'Could not open the login page. Please try again in a moment.') })
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    if (!isValidEmail(email)) return setMessage({ tone: 'red', text: tr("이메일 주소를 확인해 주세요.", "Please check the email address.") })
    if (mode === 'reset') {
      setBusy(true)
      try {
        await sendPasswordReset(email)
        setMessage({ tone: 'green', text: tr("비밀번호를 다시 정하는 메일을 보냈습니다. 메일의 링크를 눌러 주세요.", "We sent you an email to reset your password. Please open the link in the email.") })
      } catch (err) {
        setMessage({ tone: 'red', text: errText(err, en, 'Could not send the email. Please try again in a moment.') })
      }
      setBusy(false)
      return
    }
    if (password.length < (mode === 'signup' ? MEMBER_PASSWORD_MIN : 1)) {
      return setMessage({ tone: 'red', text: tr(`비밀번호는 ${MEMBER_PASSWORD_MIN}자 이상으로 정해 주세요.`, `Please use at least ${MEMBER_PASSWORD_MIN} characters.`) })
    }
    if (mode === 'signup' && password !== password2) return setMessage({ tone: 'red', text: tr("비밀번호 확인이 맞지 않습니다.", "The passwords do not match.") })
    setBusy(true)
    try {
      if (mode === 'signup') {
        const r = await signUpWithEmail(email, password, next)
        if (r === 'check_email') {
          setMessage({
            tone: 'green',
            text: tr(`${email}로 인증 메일을 보냈습니다. 메일의 링크를 누르시면 가입이 마무리됩니다.`, `We sent a verification email to ${email}. Open the link to finish signing up.`),
          })
        }
      } else {
        await signInWithEmail(email, password)
      }
    } catch (err) {
      setMessage({ tone: 'red', text: errText(err, en, 'Could not sign in. Please check your email and password.') })
    }
    setBusy(false)
  }

  if (state.status === 'staff') {
    return (
      <PublicLayout>
        <Alert tone="amber">{tr("직원 계정으로 로그인되어 있습니다. 학부모 회원 기능을 쓰려면 직원 계정에서 로그아웃해 주세요.", "You are signed in with a staff account. Please sign out to use parent membership.")}</Alert>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout>
      <h1 className="mb-1 text-xl font-bold text-slate-900">{tr("인투유학 회원", "INTOEDU Membership")}</h1>
      <p className="mb-5 text-sm text-slate-600">
        {tr("학생·학부모 정보를 저장해 두면 상담·캠프 신청서에 자동으로 채워 드립니다.", "Save your student and parent details once, and we will fill in the consultation and camp forms for you.")}
      </p>
      {!providers ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          {(providers.kakao || providers.google) && (
            <div className="space-y-2">
              {providers.kakao && (
                <button type="button" onClick={() => void go('kakao')} className="w-full rounded-xl bg-[#FEE500] px-4 py-3 text-base font-semibold text-[#191919]">
                  {tr("카카오로 시작하기", "Continue with Kakao")}
                </button>
              )}
              {providers.google && (
                <button type="button" onClick={() => void go('google')} className="w-full rounded-xl bg-white px-4 py-3 text-base font-semibold text-slate-800 ring-1 ring-slate-300">
                  {tr("구글로 시작하기", "Continue with Google")}
                </button>
              )}
            </div>
          )}
          {providers.email && (
            <Section
              title={
                mode === 'signup' ? tr("이메일로 회원가입", "Sign up with email") : mode === 'reset' ? tr("비밀번호 찾기", "Reset password") : tr("이메일로 로그인", "Log in with email")
              }
            >
              <form onSubmit={submit} className="space-y-3" noValidate>
                <Field label={tr("이메일", "Email")}>
                  <Input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                {mode !== 'reset' && (
                  <Field label={tr("비밀번호", "Password")} hint={mode === 'signup' ? tr(`${MEMBER_PASSWORD_MIN}자 이상`, `At least ${MEMBER_PASSWORD_MIN} characters`) : undefined}>
                    <Input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
                  </Field>
                )}
                {mode === 'signup' && (
                  <Field label={tr("비밀번호 확인", "Confirm password")}>
                    <Input type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
                  </Field>
                )}
                {message && <Alert tone={message.tone}>{message.text}</Alert>}
                <Button type="submit" className="w-full py-3 text-base" disabled={busy}>
                  {busy
                    ? tr("처리 중…", "Please wait…")
                    : mode === 'signup'
                      ? tr("회원가입", "Sign up")
                      : mode === 'reset'
                        ? tr("메일 보내기", "Send email")
                        : tr("로그인", "Log in")}
                </Button>
              </form>
              <div className="flex flex-wrap justify-center gap-4 text-sm">
                {mode !== 'login' && (
                  <button type="button" className="text-brand-600 hover:underline" onClick={() => setMode('login')}>
                    {tr("로그인", "Log in")}
                  </button>
                )}
                {mode !== 'signup' && (
                  <button type="button" className="text-brand-600 hover:underline" onClick={() => setMode('signup')}>
                    {tr("이메일로 회원가입", "Sign up with email")}
                  </button>
                )}
                {mode !== 'reset' && (
                  <button type="button" className="text-slate-500 hover:underline" onClick={() => setMode('reset')}>
                    {tr("비밀번호 찾기", "Forgot password")}
                  </button>
                )}
              </div>
            </Section>
          )}
          {!providers.email && message && <Alert tone={message.tone}>{message.text}</Alert>}
          {!providers.kakao && !providers.google && !providers.email && (
            <Alert tone="blue">{tr("회원 로그인은 준비 중입니다. 회원가입 없이 신청하실 수 있습니다.", "Member login is not available yet. You can apply without signing up.")}</Alert>
          )}
          <Link to={next === '/account' ? '/apply' : next} className="block text-center text-sm text-slate-500 hover:underline">
            {tr("회원가입 없이 신청하기", "Continue without signing up")}
          </Link>
        </div>
      )}
    </PublicLayout>
  )
}

// ---------------------------------------------------------------------------
// 로그인 후 돌아오는 곳(카카오·구글·인증 메일)
// ---------------------------------------------------------------------------
export function AccountCallbackPage() {
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const navigate = useNavigate()
  const { state } = useCustomer()
  const { tr } = useLang()
  const [error] = useState(() => {
    const raw = new URLSearchParams(window.location.hash.slice(1)).get('error_description') ?? params.get('error_description')
    return raw ? 'failed' : ''
  })

  useEffect(() => {
    if (error) return
    if (state.status === 'member') navigate(next, { replace: true })
    else if (state.status === 'needs_setup') navigate(`/account/setup?next=${encodeURIComponent(next)}`, { replace: true })
  }, [state.status, navigate, next, error])

  // 세션이 끝내 생기지 않으면 로그인 화면으로
  useEffect(() => {
    if (error || state.status !== 'guest') return
    const t = setTimeout(() => navigate(`/account/login?next=${encodeURIComponent(next)}`, { replace: true }), 4000)
    return () => clearTimeout(t)
  }, [state.status, navigate, next, error])

  return (
    <PublicLayout>
      {error ? (
        <Alert>
          {tr("로그인하지 못했습니다. 다시 시도해 주세요.", "We could not sign you in. Please try again.")}{' '}
          <Link to={`/account/login?next=${encodeURIComponent(next)}`} className="underline">
            {tr("로그인 화면으로", "Back to login")}
          </Link>
        </Alert>
      ) : state.status === 'staff' ? (
        <Alert tone="amber">{tr("직원 계정으로 로그인되어 있습니다.", "You are signed in with a staff account.")}</Alert>
      ) : (
        <Spinner label={tr("로그인 중…", "Signing in…")} />
      )}
    </PublicLayout>
  )
}

// ---------------------------------------------------------------------------
// 회원 정보 입력 폼(처음 가입 · 내 정보)
// ---------------------------------------------------------------------------
type ParentForm = {
  parent_name: string
  parent_phone: string
  parent_email: string
  relation: string
  address: string
  emergency_name: string
  emergency_relation: string
  emergency_phone: string
}

function parentFrom(p: CustomerProfile | null, email: string | null): ParentForm {
  return {
    parent_name: p?.parent_name ?? '',
    parent_phone: p?.parent_phone ? formatPhone(p.parent_phone) : '',
    parent_email: p?.parent_email ?? email ?? '',
    relation: p?.relation ?? '',
    address: p?.address ?? '',
    emergency_name: p?.emergency_name ?? '',
    emergency_relation: p?.emergency_relation ?? '',
    emergency_phone: p?.emergency_phone ? formatPhone(p.emergency_phone) : '',
  }
}

function kakaoFrom(p: CustomerProfile | null): KakaoValue {
  if (!p || p.kakao_use === null) return EMPTY_KAKAO
  return { use: p.kakao_use ? 'yes' : 'no', altPhone: p.kakao_alt_phone ? formatPhone(p.kakao_alt_phone) : '', altContact: p.alt_contact ?? '' }
}

function validateParent(v: ParentForm, kakao: KakaoValue, lang: 'ko' | 'en'): string | null {
  const en = lang === 'en'
  if (!v.parent_name.trim()) return en ? "Please enter the parent's name." : '학부모 이름을 입력해 주세요.'
  if (!isValidMobile(normalizePhone(v.parent_phone))) return en ? 'Please check the mobile number. (e.g. 010-1234-5678)' : '휴대폰 번호를 확인해 주세요. (예: 010-1234-5678)'
  if (v.parent_email.trim() && !isValidEmail(v.parent_email)) return en ? 'Please check the email address.' : '이메일 형식을 확인해 주세요.'
  if (v.emergency_phone.trim() && !isValidPhone(normalizePhone(v.emergency_phone))) return en ? 'Please check the emergency contact number.' : '비상 연락처 번호를 확인해 주세요.'
  return validateKakao(kakao, lang)
}

function ParentFields({ v, onChange, kakao, onKakao }: { v: ParentForm; onChange: (v: ParentForm) => void; kakao: KakaoValue; onKakao: (k: KakaoValue) => void }) {
  const set = (k: keyof ParentForm) => (e: { target: { value: string } }) => onChange({ ...v, [k]: e.target.value })
  const { lang, tr } = useLang()
  return (
    <div className="space-y-3">
      <Field label={tr("학부모 이름", "Parent's name")}>
        <Input autoComplete="name" value={v.parent_name} onChange={set('parent_name')} />
      </Field>
      <Field label={tr("휴대폰 번호", "Mobile number")} hint={tr("상담·납부 안내를 이 번호로 보내 드립니다.", "We send consultation and payment notices to this number.")}>
        <Input type="tel" inputMode="tel" autoComplete="tel" placeholder="010-1234-5678" value={v.parent_phone} onChange={set('parent_phone')} />
      </Field>
      <KakaoField value={kakao} onChange={onKakao} />
      <Field label={tr("자녀와의 관계 (선택)", "Relationship to the child (optional)")}>
        <Select value={v.relation} onChange={set('relation')}>
          <option value="">{tr("선택해 주세요", "Please select")}</option>
          {RELATIONS.map((r) => (
            <option key={r} value={r}>
              {optionText(r, lang)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={tr("이메일 (선택)", "Email (optional)")}>
        <Input type="email" inputMode="email" autoComplete="email" value={v.parent_email} onChange={set('parent_email')} />
      </Field>
      <Field label={tr("주소 (선택)", "Address (optional)")}>
        <Input autoComplete="street-address" value={v.address} onChange={set('address')} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={tr("비상 연락처 이름 (선택)", "Emergency contact name (optional)")}>
          <Input value={v.emergency_name} onChange={set('emergency_name')} />
        </Field>
        <Field label={tr("관계 (선택)", "Relationship (optional)")}>
          <Input value={v.emergency_relation} onChange={set('emergency_relation')} />
        </Field>
        <Field label={tr("비상 연락처 번호 (선택)", "Emergency contact number (optional)")}>
          <Input type="tel" inputMode="tel" value={v.emergency_phone} onChange={set('emergency_phone')} />
        </Field>
      </div>
    </div>
  )
}

function profilePayload(v: ParentForm, kakao: KakaoValue) {
  return {
    parent_name: v.parent_name.trim(),
    parent_phone: normalizePhone(v.parent_phone),
    parent_email: v.parent_email.trim(),
    relation: v.relation,
    address: v.address.trim(),
    kakao_use: kakao.use === '' ? null : kakao.use === 'yes',
    kakao_alt_phone: kakao.use === 'no' ? normalizePhone(kakao.altPhone) || null : null,
    alt_contact: kakao.use === 'no' ? kakao.altContact.trim() || null : null,
    emergency_name: v.emergency_name.trim(),
    emergency_relation: v.emergency_relation.trim(),
    emergency_phone: normalizePhone(v.emergency_phone),
  }
}

type StudentForm = { id?: string; name_ko: string; name_en: string; birth_date: string; gender: string; school: string; grade: string; english_level: string }
const EMPTY_STUDENT: StudentForm = { name_ko: '', name_en: '', birth_date: '', gender: '', school: '', grade: '', english_level: '' }

function studentFrom(s: CustomerStudent): StudentForm {
  return {
    id: s.id,
    name_ko: s.name_ko,
    name_en: s.name_en ?? '',
    birth_date: s.birth_date ?? '',
    gender: s.gender ?? '',
    school: s.school ?? '',
    grade: s.grade ?? '',
    english_level: s.english_level ?? '',
  }
}

function validateStudent(s: StudentForm, lang: 'ko' | 'en'): string | null {
  const en = lang === 'en'
  if (!s.name_ko.trim()) return en ? "Please enter the child's name." : '자녀 이름을 입력해 주세요.'
  if (s.name_en.trim() && !isValidEnglishName(s.name_en)) return en ? 'Please enter the English name exactly as in the passport. (e.g. HONG GILDONG)' : '영문 이름은 여권과 같은 영문으로 입력해 주세요. (예: HONG GILDONG)'
  return null
}

function StudentFields({ v, onChange, idPrefix }: { v: StudentForm; onChange: (v: StudentForm) => void; idPrefix: string }) {
  const set = (k: keyof StudentForm) => (e: { target: { value: string } }) => onChange({ ...v, [k]: e.target.value })
  const { lang, tr } = useLang()
  return (
    <div className="space-y-3">
      <Field label={tr("자녀 이름(한글)", "Child's name")} hint={lang === 'en' ? "The child's Korean name if they have one; otherwise the English name." : undefined}>
        <Input autoComplete="off" value={v.name_ko} onChange={set('name_ko')} />
      </Field>
      <Field label={tr("영문 이름(여권과 동일, 선택)", "Name in English (as in passport, optional)")}>
        <Input
          autoCapitalize="characters"
          placeholder="HONG GILDONG"
          value={v.name_en}
          onChange={set('name_en')}
          onBlur={() => v.name_en && onChange({ ...v, name_en: normalizeEnglishName(v.name_en) })}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={tr("생년월일 (선택)", "Date of birth (optional)")}>
          <Input type="date" value={v.birth_date} onChange={set('birth_date')} />
        </Field>
        <Field label={tr("성별 (선택)", "Gender (optional)")}>
          <Select id={`${idPrefix}-gender`} value={v.gender} onChange={set('gender')}>
            <option value="">{tr("선택해 주세요", "Please select")}</option>
            <option value="male">{tr("남", "Male")}</option>
            <option value="female">{tr("여", "Female")}</option>
          </Select>
        </Field>
        <Field label={tr("학교 (선택)", "School (optional)")}>
          <Input value={v.school} onChange={set('school')} />
        </Field>
        <Field label={tr("학년 (선택)", "Grade in Korea (optional)")}>
          <Select value={v.grade} onChange={set('grade')}>
            <option value="">{tr("선택해 주세요", "Please select")}</option>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {optionText(g, lang)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr("영어 수준 (선택)", "English level (optional)")}>
          <Select value={v.english_level} onChange={set('english_level')}>
            <option value="">{tr("선택해 주세요", "Please select")}</option>
            {ENGLISH_LEVELS.map((g) => (
              <option key={g} value={g}>
                {optionText(g, lang)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </div>
  )
}

function studentPayload(s: StudentForm) {
  return {
    id: s.id,
    name_ko: s.name_ko.trim(),
    name_en: s.name_en.trim() ? normalizeEnglishName(s.name_en) : null,
    birth_date: s.birth_date || null,
    gender: s.gender || null,
    school: s.school.trim() || null,
    grade: s.grade || null,
    english_level: s.english_level || null,
  }
}

// ---------------------------------------------------------------------------
// 처음 가입: 동의 + 학부모·자녀 정보
// ---------------------------------------------------------------------------
export function AccountSetupPage() {
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const navigate = useNavigate()
  const { state, reload } = useCustomer()
  const [consent, setConsent] = useState<{ version: number; title: string; body: string } | null>(null)
  const [agree, setAgree] = useState(false)
  const [parent, setParent] = useState<ParentForm>(() => parentFrom(null, null))
  const [kakao, setKakao] = useState<KakaoValue>(EMPTY_KAKAO)
  const [student, setStudent] = useState<StudentForm>(EMPTY_STUDENT)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { lang, en, tr } = useLang()

  useEffect(() => {
    memberConsent().then(setConsent)
  }, [])

  useEffect(() => {
    if (state.status === 'guest') navigate(`/account/login?next=${encodeURIComponent(next)}`, { replace: true })
    if (state.status === 'member') navigate(next, { replace: true })
    if (state.status === 'needs_setup' && state.email) setParent((prev) => (prev.parent_email ? prev : { ...prev, parent_email: state.email ?? '' }))
  }, [state, navigate, next])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const pe = validateParent(parent, kakao, lang)
    if (pe) return setError(pe)
    const se = validateStudent(student, lang)
    if (se) return setError(se)
    if (!agree) return setError(tr("회원 개인정보 수집·이용에 동의해 주세요.", "Please agree to the collection and use of personal information."))
    setBusy(true)
    try {
      await saveProfile({ ...profilePayload(parent, kakao), agree_privacy: true })
      await saveStudent(studentPayload(student))
      await reload()
      navigate(next, { replace: true })
    } catch (err) {
      setError(errText(err, en, 'Could not save. Please check your entries and try again.'))
    }
    setBusy(false)
  }

  if (state.status === 'loading' || state.status === 'guest') return <PublicLayout><Spinner /></PublicLayout>
  if (state.status === 'staff') {
    return (
      <PublicLayout>
        <Alert tone="amber">{tr("직원 계정으로는 회원 정보를 만들 수 없습니다.", "A staff account cannot create a member profile.")}</Alert>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout>
      <h1 className="mb-1 text-xl font-bold text-slate-900">{tr("회원 정보 입력", "Member profile")}</h1>
      <p className="mb-5 text-sm text-slate-600">
        {tr("한 번만 입력해 두시면 상담·캠프 신청서에 자동으로 채워 드립니다. 언제든 [내 정보]에서 고치실 수 있습니다.", "Enter this once and we will fill in the consultation and camp forms for you. You can change it anytime in [My info]. You may answer in Korean or English.")}
      </p>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Section title={tr("학부모 정보", "Parent information")}>
          <ParentFields v={parent} onChange={setParent} kakao={kakao} onKakao={setKakao} />
        </Section>
        <Section
          title={tr("자녀 정보", "Child information")}
          description={tr("자녀가 여럿이면 가입 후 [내 정보]에서 더 추가하실 수 있습니다.", "If you have more than one child, you can add them later in [My info].")}
        >
          <StudentFields v={student} onChange={setStudent} idPrefix="setup" />
        </Section>
        <Section title={tr("동의", "Consent")}>
          {en && <ConsentKoreanNote />}
          {consent && (
            <div className="max-h-56 overflow-y-auto rounded-lg bg-slate-50 p-3 text-xs leading-relaxed whitespace-pre-wrap text-slate-600 ring-1 ring-slate-200">
              {consent.body}
            </div>
          )}
          <label className="flex items-start gap-2 text-sm text-slate-800">
            <input type="checkbox" className="mt-0.5 size-5 shrink-0" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            {en
              ? '[Required] I have read the consent above (collection and use of personal information for members) and agree.'
              : `${consent?.title ?? '[필수] 회원 개인정보 수집·이용 동의'} — 위 내용을 확인하였으며 동의합니다.`}
          </label>
        </Section>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" className="w-full py-3 text-base" disabled={busy}>
          {busy ? tr("저장 중…", "Saving…") : tr("저장하고 계속하기", "Save and continue")}
        </Button>
      </form>
    </PublicLayout>
  )
}

// ---------------------------------------------------------------------------
// 내 정보: 학부모·자녀 정보 고치기, 비밀번호, 로그아웃, 탈퇴
// ---------------------------------------------------------------------------
export function AccountPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { state, reload } = useCustomer()
  const { signOut, session } = useAuth()
  const [parent, setParent] = useState<ParentForm | null>(null)
  const [kakao, setKakao] = useState<KakaoValue>(EMPTY_KAKAO)
  const [editing, setEditing] = useState<StudentForm | null>(null)
  const [message, setMessage] = useState<{ tone: 'red' | 'green'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const { lang, en, tr } = useLang()
  const usesPassword = session?.user.app_metadata?.provider === 'email'

  useEffect(() => {
    if (state.status === 'guest') navigate('/account/login', { replace: true })
    if (state.status === 'needs_setup') navigate('/account/setup', { replace: true })
    if (state.status === 'member' && parent === null) {
      setParent(parentFrom(state.profile, state.email))
      setKakao(kakaoFrom(state.profile))
    }
  }, [state, navigate, parent])

  if (state.status !== 'member' || !parent) {
    return (
      <PublicLayout>
        {state.status === 'staff' ? <Alert tone="amber">{tr("직원 계정으로 로그인되어 있습니다.", "You are signed in with a staff account.")}</Alert> : <Spinner />}
      </PublicLayout>
    )
  }

  async function saveParent() {
    setMessage(null)
    const pe = validateParent(parent!, kakao, lang)
    if (pe) return setMessage({ tone: 'red', text: pe })
    setBusy(true)
    try {
      await saveProfile(profilePayload(parent!, kakao))
      await reload()
      setMessage({ tone: 'green', text: tr("학부모 정보를 저장했습니다.", "Parent information saved.") })
    } catch (e) {
      setMessage({ tone: 'red', text: errText(e, en, 'Something went wrong. Please try again.') })
    }
    setBusy(false)
  }

  async function saveChild() {
    if (!editing) return
    setMessage(null)
    const se = validateStudent(editing, lang)
    if (se) return setMessage({ tone: 'red', text: se })
    setBusy(true)
    try {
      await saveStudent(studentPayload(editing))
      await reload()
      setEditing(null)
      setMessage({ tone: 'green', text: tr("자녀 정보를 저장했습니다.", "Child information saved.") })
    } catch (e) {
      setMessage({ tone: 'red', text: errText(e, en, 'Something went wrong. Please try again.') })
    }
    setBusy(false)
  }

  async function removeChild(s: CustomerStudent) {
    if (!window.confirm(tr(`${s.name_ko} 정보를 지울까요? (이미 낸 신청서에는 영향이 없습니다)`, `Delete ${s.name_ko}? (Forms already submitted are not affected)`))) return
    await deleteStudent(s.id).catch(() => setMessage({ tone: 'red', text: tr("지우지 못했습니다.", "Could not delete.") }))
    await reload()
  }

  async function withdraw() {
    if (
      !window.confirm(
        tr("탈퇴하면 저장된 학부모·자녀 정보가 바로 삭제됩니다.\n이미 낸 상담·캠프 신청은 그대로 진행됩니다.\n탈퇴할까요?", "If you delete your account, your saved parent and child details are deleted right away.\nApplications already submitted will continue as usual.\nDelete your account?"),
      )
    )
      return
    setBusy(true)
    try {
      await deleteAccount()
      navigate('/apply', { replace: true })
    } catch (e) {
      setMessage({ tone: 'red', text: errText(e, en, 'Something went wrong. Please try again.') })
    }
    setBusy(false)
  }

  async function updatePassword() {
    setMessage(null)
    if (newPassword.length < MEMBER_PASSWORD_MIN) return setMessage({ tone: 'red', text: tr(`비밀번호는 ${MEMBER_PASSWORD_MIN}자 이상으로 정해 주세요.`, `Please use at least ${MEMBER_PASSWORD_MIN} characters.`) })
    try {
      await changePassword(newPassword)
      setNewPassword('')
      setMessage({ tone: 'green', text: tr("비밀번호를 바꿨습니다.", "Password changed.") })
    } catch (e) {
      setMessage({ tone: 'red', text: errText(e, en, 'Something went wrong. Please try again.') })
    }
  }

  return (
    <PublicLayout>
      <div className="mb-5 flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-slate-900">{tr("내 정보", "My info")}</h1>
        <Button
          variant="ghost"
          onClick={async () => {
            await signOut()
            navigate('/apply')
          }}
        >
          {tr("로그아웃", "Log out")}
        </Button>
      </div>
      {params.get('reset') && usesPassword && <Alert tone="blue">{tr("새 비밀번호를 아래에서 정해 주세요.", "Please set a new password below.")}</Alert>}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Link to="/apply" className="rounded-xl bg-brand-600 px-4 py-3 text-center text-sm font-semibold text-white">
            {tr("상담 신청하기", "Request a consultation")}
          </Link>
          <Link to="/register" className="rounded-xl bg-white px-4 py-3 text-center text-sm font-semibold text-brand-700 ring-1 ring-brand-600">
            {tr("캠프 신청하기", "Register for a camp")}
          </Link>
        </div>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <Section title={tr("학부모 정보", "Parent information")}>
          <ParentFields v={parent} onChange={setParent} kakao={kakao} onKakao={setKakao} />
          <Button onClick={() => void saveParent()} disabled={busy}>
            {tr("학부모 정보 저장", "Save parent information")}
          </Button>
        </Section>
        <Section title={tr("자녀", "Children")}>
          <ul className="divide-y divide-slate-100">
            {state.students.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="text-slate-800">
                  {s.name_ko}
                  <span className="ml-1 text-slate-500">{[s.grade ? optionText(s.grade, lang) : null, s.school].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="flex gap-1">
                  <Button variant="ghost" onClick={() => setEditing(studentFrom(s))}>
                    {tr("고치기", "Edit")}
                  </Button>
                  <Button variant="ghost" onClick={() => void removeChild(s)}>
                    {tr("지우기", "Delete")}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
          {editing ? (
            <div className="space-y-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <StudentFields v={editing} onChange={setEditing} idPrefix="edit" />
              <div className="flex gap-2">
                <Button onClick={() => void saveChild()} disabled={busy}>
                  {tr("자녀 정보 저장", "Save child")}
                </Button>
                <Button variant="ghost" onClick={() => setEditing(null)}>
                  {tr("취소", "Cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setEditing(EMPTY_STUDENT)}>
              {tr("+ 자녀 추가", "+ Add a child")}
            </Button>
          )}
        </Section>
        {usesPassword && (
          <Section title={tr("비밀번호 바꾸기", "Change password")}>
            <Field label={tr("새 비밀번호", "New password")} hint={tr(`${MEMBER_PASSWORD_MIN}자 이상`, `At least ${MEMBER_PASSWORD_MIN} characters`)}>
              <Input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </Field>
            <Button variant="secondary" onClick={() => void updatePassword()}>
              {tr("비밀번호 바꾸기", "Change password")}
            </Button>
          </Section>
        )}
        <Section
          title={tr("회원 탈퇴", "Delete account")}
          description={tr("저장된 학부모·자녀 정보를 바로 삭제합니다. 이미 낸 상담·캠프 신청 기록은 각 신청서에서 동의하신 기간 동안 보관됩니다.", "Your saved parent and child details are deleted right away. Records of applications already submitted are kept for the period you agreed to on each form.")}
        >
          <Button variant="ghost" onClick={() => void withdraw()} disabled={busy}>
            {tr("탈퇴하기", "Delete account")}
          </Button>
        </Section>
      </div>
    </PublicLayout>
  )
}
