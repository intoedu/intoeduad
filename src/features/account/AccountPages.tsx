import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { KakaoField } from '../../components/shared/KakaoField'
import { Alert, Button, Field, Input, Select, Spinner } from '../../components/ui'
import { EMPTY_KAKAO, validateKakao, type KakaoValue } from '../../domain/formSettings'
import { formatPhone, isValidMobile, isValidPhone, normalizePhone } from '../../domain/phone'
import { isValidEmail, isValidEnglishName, normalizeEnglishName } from '../../domain/registration'
import { useAuth } from '../auth/AuthProvider'
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
      setMessage({ tone: 'red', text: (e as Error).message })
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    if (!isValidEmail(email)) return setMessage({ tone: 'red', text: '이메일 주소를 확인해 주세요.' })
    if (mode === 'reset') {
      setBusy(true)
      try {
        await sendPasswordReset(email)
        setMessage({ tone: 'green', text: '비밀번호를 다시 정하는 메일을 보냈습니다. 메일의 링크를 눌러 주세요.' })
      } catch (err) {
        setMessage({ tone: 'red', text: (err as Error).message })
      }
      setBusy(false)
      return
    }
    if (password.length < (mode === 'signup' ? MEMBER_PASSWORD_MIN : 1)) {
      return setMessage({ tone: 'red', text: `비밀번호는 ${MEMBER_PASSWORD_MIN}자 이상으로 정해 주세요.` })
    }
    if (mode === 'signup' && password !== password2) return setMessage({ tone: 'red', text: '비밀번호 확인이 맞지 않습니다.' })
    setBusy(true)
    try {
      if (mode === 'signup') {
        const r = await signUpWithEmail(email, password, next)
        if (r === 'check_email') {
          setMessage({ tone: 'green', text: `${email}로 인증 메일을 보냈습니다. 메일의 링크를 누르시면 가입이 마무리됩니다.` })
        }
      } else {
        await signInWithEmail(email, password)
      }
    } catch (err) {
      setMessage({ tone: 'red', text: (err as Error).message })
    }
    setBusy(false)
  }

  if (state.status === 'staff') {
    return (
      <PublicLayout>
        <Alert tone="amber">직원 계정으로 로그인되어 있습니다. 학부모 회원 기능을 쓰려면 직원 계정에서 로그아웃해 주세요.</Alert>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout>
      <h1 className="mb-1 text-xl font-bold text-slate-900">인투유학 회원</h1>
      <p className="mb-5 text-sm text-slate-600">학생·학부모 정보를 저장해 두면 상담·캠프 신청서에 자동으로 채워 드립니다.</p>
      {!providers ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          {(providers.kakao || providers.google) && (
            <div className="space-y-2">
              {providers.kakao && (
                <button type="button" onClick={() => void go('kakao')} className="w-full rounded-xl bg-[#FEE500] px-4 py-3 text-base font-semibold text-[#191919]">
                  카카오로 시작하기
                </button>
              )}
              {providers.google && (
                <button type="button" onClick={() => void go('google')} className="w-full rounded-xl bg-white px-4 py-3 text-base font-semibold text-slate-800 ring-1 ring-slate-300">
                  구글로 시작하기
                </button>
              )}
            </div>
          )}
          {providers.email && (
            <Section title={mode === 'signup' ? '이메일로 회원가입' : mode === 'reset' ? '비밀번호 찾기' : '이메일로 로그인'}>
              <form onSubmit={submit} className="space-y-3" noValidate>
                <Field label="이메일">
                  <Input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                {mode !== 'reset' && (
                  <Field label="비밀번호" hint={mode === 'signup' ? `${MEMBER_PASSWORD_MIN}자 이상` : undefined}>
                    <Input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
                  </Field>
                )}
                {mode === 'signup' && (
                  <Field label="비밀번호 확인">
                    <Input type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
                  </Field>
                )}
                {message && <Alert tone={message.tone}>{message.text}</Alert>}
                <Button type="submit" className="w-full py-3 text-base" disabled={busy}>
                  {busy ? '처리 중…' : mode === 'signup' ? '회원가입' : mode === 'reset' ? '메일 보내기' : '로그인'}
                </Button>
              </form>
              <div className="flex flex-wrap justify-center gap-4 text-sm">
                {mode !== 'login' && (
                  <button type="button" className="text-brand-600 hover:underline" onClick={() => setMode('login')}>
                    로그인
                  </button>
                )}
                {mode !== 'signup' && (
                  <button type="button" className="text-brand-600 hover:underline" onClick={() => setMode('signup')}>
                    이메일로 회원가입
                  </button>
                )}
                {mode !== 'reset' && (
                  <button type="button" className="text-slate-500 hover:underline" onClick={() => setMode('reset')}>
                    비밀번호 찾기
                  </button>
                )}
              </div>
            </Section>
          )}
          {!providers.email && message && <Alert tone={message.tone}>{message.text}</Alert>}
          {!providers.kakao && !providers.google && !providers.email && (
            <Alert tone="blue">회원 로그인은 준비 중입니다. 회원가입 없이 신청하실 수 있습니다.</Alert>
          )}
          <Link to={next === '/account' ? '/apply' : next} className="block text-center text-sm text-slate-500 hover:underline">
            회원가입 없이 신청하기
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
  const [error] = useState(() => {
    const raw = new URLSearchParams(window.location.hash.slice(1)).get('error_description') ?? params.get('error_description')
    return raw ? '로그인하지 못했습니다. 다시 시도해 주세요.' : ''
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
          {error}{' '}
          <Link to={`/account/login?next=${encodeURIComponent(next)}`} className="underline">
            로그인 화면으로
          </Link>
        </Alert>
      ) : state.status === 'staff' ? (
        <Alert tone="amber">직원 계정으로 로그인되어 있습니다.</Alert>
      ) : (
        <Spinner label="로그인 중…" />
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

function validateParent(v: ParentForm, kakao: KakaoValue): string | null {
  if (!v.parent_name.trim()) return '학부모 이름을 입력해 주세요.'
  if (!isValidMobile(normalizePhone(v.parent_phone))) return '휴대폰 번호를 확인해 주세요. (예: 010-1234-5678)'
  if (v.parent_email.trim() && !isValidEmail(v.parent_email)) return '이메일 형식을 확인해 주세요.'
  if (v.emergency_phone.trim() && !isValidPhone(normalizePhone(v.emergency_phone))) return '비상 연락처 번호를 확인해 주세요.'
  return validateKakao(kakao)
}

function ParentFields({ v, onChange, kakao, onKakao }: { v: ParentForm; onChange: (v: ParentForm) => void; kakao: KakaoValue; onKakao: (k: KakaoValue) => void }) {
  const set = (k: keyof ParentForm) => (e: { target: { value: string } }) => onChange({ ...v, [k]: e.target.value })
  return (
    <div className="space-y-3">
      <Field label="학부모 이름">
        <Input autoComplete="name" value={v.parent_name} onChange={set('parent_name')} />
      </Field>
      <Field label="휴대폰 번호" hint="상담·납부 안내를 이 번호로 보내 드립니다.">
        <Input type="tel" inputMode="tel" autoComplete="tel" placeholder="010-1234-5678" value={v.parent_phone} onChange={set('parent_phone')} />
      </Field>
      <KakaoField value={kakao} onChange={onKakao} />
      <Field label="자녀와의 관계 (선택)">
        <Select value={v.relation} onChange={set('relation')}>
          <option value="">선택해 주세요</option>
          {RELATIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="이메일 (선택)">
        <Input type="email" inputMode="email" autoComplete="email" value={v.parent_email} onChange={set('parent_email')} />
      </Field>
      <Field label="주소 (선택)">
        <Input autoComplete="street-address" value={v.address} onChange={set('address')} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="비상 연락처 이름 (선택)">
          <Input value={v.emergency_name} onChange={set('emergency_name')} />
        </Field>
        <Field label="관계 (선택)">
          <Input value={v.emergency_relation} onChange={set('emergency_relation')} />
        </Field>
        <Field label="비상 연락처 번호 (선택)">
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

function validateStudent(s: StudentForm): string | null {
  if (!s.name_ko.trim()) return '자녀 이름을 입력해 주세요.'
  if (s.name_en.trim() && !isValidEnglishName(s.name_en)) return '영문 이름은 여권과 같은 영문으로 입력해 주세요. (예: HONG GILDONG)'
  return null
}

function StudentFields({ v, onChange, idPrefix }: { v: StudentForm; onChange: (v: StudentForm) => void; idPrefix: string }) {
  const set = (k: keyof StudentForm) => (e: { target: { value: string } }) => onChange({ ...v, [k]: e.target.value })
  return (
    <div className="space-y-3">
      <Field label="자녀 이름(한글)">
        <Input autoComplete="off" value={v.name_ko} onChange={set('name_ko')} />
      </Field>
      <Field label="영문 이름(여권과 동일, 선택)">
        <Input
          autoCapitalize="characters"
          placeholder="HONG GILDONG"
          value={v.name_en}
          onChange={set('name_en')}
          onBlur={() => v.name_en && onChange({ ...v, name_en: normalizeEnglishName(v.name_en) })}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="생년월일 (선택)">
          <Input type="date" value={v.birth_date} onChange={set('birth_date')} />
        </Field>
        <Field label="성별 (선택)">
          <Select id={`${idPrefix}-gender`} value={v.gender} onChange={set('gender')}>
            <option value="">선택해 주세요</option>
            <option value="male">남</option>
            <option value="female">여</option>
          </Select>
        </Field>
        <Field label="학교 (선택)">
          <Input value={v.school} onChange={set('school')} />
        </Field>
        <Field label="학년 (선택)">
          <Select value={v.grade} onChange={set('grade')}>
            <option value="">선택해 주세요</option>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="영어 수준 (선택)">
          <Select value={v.english_level} onChange={set('english_level')}>
            <option value="">선택해 주세요</option>
            {ENGLISH_LEVELS.map((g) => (
              <option key={g} value={g}>
                {g}
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
    const pe = validateParent(parent, kakao)
    if (pe) return setError(pe)
    const se = validateStudent(student)
    if (se) return setError(se)
    if (!agree) return setError('회원 개인정보 수집·이용에 동의해 주세요.')
    setBusy(true)
    try {
      await saveProfile({ ...profilePayload(parent, kakao), agree_privacy: true })
      await saveStudent(studentPayload(student))
      await reload()
      navigate(next, { replace: true })
    } catch (err) {
      setError((err as Error).message)
    }
    setBusy(false)
  }

  if (state.status === 'loading' || state.status === 'guest') return <PublicLayout><Spinner /></PublicLayout>
  if (state.status === 'staff') {
    return (
      <PublicLayout>
        <Alert tone="amber">직원 계정으로는 회원 정보를 만들 수 없습니다.</Alert>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout>
      <h1 className="mb-1 text-xl font-bold text-slate-900">회원 정보 입력</h1>
      <p className="mb-5 text-sm text-slate-600">한 번만 입력해 두시면 상담·캠프 신청서에 자동으로 채워 드립니다. 언제든 [내 정보]에서 고치실 수 있습니다.</p>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Section title="학부모 정보">
          <ParentFields v={parent} onChange={setParent} kakao={kakao} onKakao={setKakao} />
        </Section>
        <Section title="자녀 정보" description="자녀가 여럿이면 가입 후 [내 정보]에서 더 추가하실 수 있습니다.">
          <StudentFields v={student} onChange={setStudent} idPrefix="setup" />
        </Section>
        <Section title="동의">
          {consent && (
            <div className="max-h-56 overflow-y-auto rounded-lg bg-slate-50 p-3 text-xs leading-relaxed whitespace-pre-wrap text-slate-600 ring-1 ring-slate-200">
              {consent.body}
            </div>
          )}
          <label className="flex items-start gap-2 text-sm text-slate-800">
            <input type="checkbox" className="mt-0.5 size-5 shrink-0" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            {consent?.title ?? '[필수] 회원 개인정보 수집·이용 동의'} — 위 내용을 확인하였으며 동의합니다.
          </label>
        </Section>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" className="w-full py-3 text-base" disabled={busy}>
          {busy ? '저장 중…' : '저장하고 계속하기'}
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
        {state.status === 'staff' ? <Alert tone="amber">직원 계정으로 로그인되어 있습니다.</Alert> : <Spinner />}
      </PublicLayout>
    )
  }

  async function saveParent() {
    setMessage(null)
    const pe = validateParent(parent!, kakao)
    if (pe) return setMessage({ tone: 'red', text: pe })
    setBusy(true)
    try {
      await saveProfile(profilePayload(parent!, kakao))
      await reload()
      setMessage({ tone: 'green', text: '학부모 정보를 저장했습니다.' })
    } catch (e) {
      setMessage({ tone: 'red', text: (e as Error).message })
    }
    setBusy(false)
  }

  async function saveChild() {
    if (!editing) return
    setMessage(null)
    const se = validateStudent(editing)
    if (se) return setMessage({ tone: 'red', text: se })
    setBusy(true)
    try {
      await saveStudent(studentPayload(editing))
      await reload()
      setEditing(null)
      setMessage({ tone: 'green', text: '자녀 정보를 저장했습니다.' })
    } catch (e) {
      setMessage({ tone: 'red', text: (e as Error).message })
    }
    setBusy(false)
  }

  async function removeChild(s: CustomerStudent) {
    if (!window.confirm(`${s.name_ko} 정보를 지울까요? (이미 낸 신청서에는 영향이 없습니다)`)) return
    await deleteStudent(s.id).catch(() => setMessage({ tone: 'red', text: '지우지 못했습니다.' }))
    await reload()
  }

  async function withdraw() {
    if (!window.confirm('탈퇴하면 저장된 학부모·자녀 정보가 바로 삭제됩니다.\n이미 낸 상담·캠프 신청은 그대로 진행됩니다.\n탈퇴할까요?')) return
    setBusy(true)
    try {
      await deleteAccount()
      navigate('/apply', { replace: true })
    } catch (e) {
      setMessage({ tone: 'red', text: (e as Error).message })
    }
    setBusy(false)
  }

  async function updatePassword() {
    setMessage(null)
    if (newPassword.length < MEMBER_PASSWORD_MIN) return setMessage({ tone: 'red', text: `비밀번호는 ${MEMBER_PASSWORD_MIN}자 이상으로 정해 주세요.` })
    try {
      await changePassword(newPassword)
      setNewPassword('')
      setMessage({ tone: 'green', text: '비밀번호를 바꿨습니다.' })
    } catch (e) {
      setMessage({ tone: 'red', text: (e as Error).message })
    }
  }

  return (
    <PublicLayout>
      <div className="mb-5 flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-slate-900">내 정보</h1>
        <Button
          variant="ghost"
          onClick={async () => {
            await signOut()
            navigate('/apply')
          }}
        >
          로그아웃
        </Button>
      </div>
      {params.get('reset') && usesPassword && <Alert tone="blue">새 비밀번호를 아래에서 정해 주세요.</Alert>}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Link to="/apply" className="rounded-xl bg-brand-600 px-4 py-3 text-center text-sm font-semibold text-white">
            상담 신청하기
          </Link>
          <Link to="/register" className="rounded-xl bg-white px-4 py-3 text-center text-sm font-semibold text-brand-700 ring-1 ring-brand-600">
            캠프 신청하기
          </Link>
        </div>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <Section title="학부모 정보">
          <ParentFields v={parent} onChange={setParent} kakao={kakao} onKakao={setKakao} />
          <Button onClick={() => void saveParent()} disabled={busy}>
            학부모 정보 저장
          </Button>
        </Section>
        <Section title="자녀">
          <ul className="divide-y divide-slate-100">
            {state.students.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="text-slate-800">
                  {s.name_ko}
                  <span className="ml-1 text-slate-500">{[s.grade, s.school].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="flex gap-1">
                  <Button variant="ghost" onClick={() => setEditing(studentFrom(s))}>
                    고치기
                  </Button>
                  <Button variant="ghost" onClick={() => void removeChild(s)}>
                    지우기
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
                  자녀 정보 저장
                </Button>
                <Button variant="ghost" onClick={() => setEditing(null)}>
                  취소
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setEditing(EMPTY_STUDENT)}>
              + 자녀 추가
            </Button>
          )}
        </Section>
        {usesPassword && (
          <Section title="비밀번호 바꾸기">
            <Field label="새 비밀번호" hint={`${MEMBER_PASSWORD_MIN}자 이상`}>
              <Input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </Field>
            <Button variant="secondary" onClick={() => void updatePassword()}>
              비밀번호 바꾸기
            </Button>
          </Section>
        )}
        <Section title="회원 탈퇴" description="저장된 학부모·자녀 정보를 바로 삭제합니다. 이미 낸 상담·캠프 신청 기록은 각 신청서에서 동의하신 기간 동안 보관됩니다.">
          <Button variant="ghost" onClick={() => void withdraw()} disabled={busy}>
            탈퇴하기
          </Button>
        </Section>
      </div>
    </PublicLayout>
  )
}
