// 출국 서류 정보 (/my/:token/travel) — 항공권·ESTA·보험 대행을 신청한 학부모가 출국자 정보를 낸다(M17).
// 여권과 같은 영문 이름 + ESTA 신청 항목. 주민등록번호·ESTA 자격 질문(건강·범죄 이력)은 받지 않는다(담당자가 직접 확인).
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { Alert, Button, Field, Input, Select, Spinner, Textarea } from '../../components/ui'
import { agencyServiceLabels, isValidPassportName, isValidPassportNo, normalizePassportName, normalizePassportNo } from '../../domain/agency'
import { formatDateLongKo } from '../../domain/dates'
import { formatPhone, normalizePhone } from '../../domain/phone'
import { formatWon } from '../../domain/registration'
import { PublicLayout, Section } from './PublicLayout'
import { getTravelForm, submitTravel, type TravelForm, type TravelerInput } from './registerApi'

const GUARDIAN_RELATIONS = ['어머니', '아버지', '조부모', '기타']

function blank(type: 'student' | 'guardian'): TravelerInput {
  return {
    traveler_type: type,
    relation: '',
    surname_en: '',
    given_name_en: '',
    gender: '',
    birth_date: '',
    birth_city_en: '',
    birth_country: '대한민국',
    other_citizenship: '',
    passport_no: '',
    passport_no_masked: null,
    passport_issue_date: '',
    passport_expiry_date: '',
    father_name_en: '',
    mother_name_en: '',
    home_address_en: '',
    phone: '',
    email: '',
    employer: '',
    job_title: '',
    emergency_name: '',
    emergency_phone: '',
    memo: '',
  }
}

function fromSaved(t: TravelForm['travelers'][number]): TravelerInput {
  const b = blank(t.traveler_type)
  const out: Record<string, unknown> = { ...b }
  for (const k of Object.keys(b)) {
    const val = (t as Record<string, unknown>)[k]
    if (val !== null && val !== undefined) out[k] = String(val)
  }
  out.passport_no = ''
  out.passport_no_masked = t.passport_no_masked ?? null
  out.phone = t.phone ? formatPhone(String(t.phone)) : ''
  out.emergency_phone = t.emergency_phone ? formatPhone(String(t.emergency_phone)) : ''
  return out as TravelerInput
}

function errorsOf(t: TravelerInput): Record<string, string> {
  const e: Record<string, string> = {}
  if (!t.surname_en.trim() || !isValidPassportName(t.surname_en)) e.surname_en = '여권과 같은 영문 성을 입력해 주세요.'
  if (!t.given_name_en.trim() || !isValidPassportName(t.given_name_en)) e.given_name_en = '여권과 같은 영문 이름을 입력해 주세요.'
  if (!t.gender) e.gender = '성별을 선택해 주세요.'
  if (!t.birth_date) e.birth_date = '생년월일을 입력해 주세요.'
  if (!t.passport_no.trim() && !t.passport_no_masked) e.passport_no = '여권번호를 입력해 주세요.'
  else if (t.passport_no.trim() && !isValidPassportNo(t.passport_no)) e.passport_no = '여권번호는 영문·숫자로 입력해 주세요. (예: M12345678)'
  if (!t.passport_expiry_date) e.passport_expiry_date = '여권 만료일을 입력해 주세요.'
  if (t.traveler_type === 'guardian' && !t.relation) e.relation = '학생과의 관계를 선택해 주세요.'
  return e
}

export function TravelPage() {
  const { token = '' } = useParams()
  const [form, setForm] = useState<TravelForm | null>(null)
  const [loadError, setLoadError] = useState('')
  const [travelers, setTravelers] = useState<TravelerInput[]>([])
  const [agree, setAgree] = useState<Record<string, boolean>>({})
  const [attempted, setAttempted] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    getTravelForm(token)
      .then((f) => {
        setForm(f)
        if (f.travelers.length > 0) {
          setTravelers(f.travelers.map(fromSaved))
        } else {
          // 신청서 내용으로 학생 정보 미리 채움 (영문 이름은 "성 이름"으로 나눠 제안)
          const s = blank('student')
          const [sur, ...given] = (f.student.name_en ?? '').trim().split(/\s+/)
          s.surname_en = sur ?? ''
          s.given_name_en = given.join(' ')
          s.gender = f.student.gender ?? ''
          s.birth_date = f.student.birth_date ?? ''
          s.phone = f.parent.phone ? formatPhone(f.parent.phone) : ''
          s.email = f.parent.email ?? ''
          s.emergency_name = f.emergency.name ?? ''
          s.emergency_phone = f.emergency.phone ? formatPhone(f.emergency.phone) : ''
          setTravelers([s])
        }
      })
      .catch((e: Error) => setLoadError(e.message))
  }, [token])

  const set = (i: number, k: keyof TravelerInput, value: string) =>
    setTravelers((prev) => prev.map((t, idx) => (idx === i ? { ...t, [k]: value } : t)))

  const allErrors = travelers.map(errorsOf)
  const consentOk = (form?.consents ?? []).every((c) => agree[c.kind])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setAttempted(true)
    setError('')
    const firstBad = allErrors.findIndex((x) => Object.keys(x).length > 0)
    if (firstBad >= 0) {
      document.getElementById(`traveler-${firstBad}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    if (!consentOk) return setError('필수 동의 항목에 모두 동의해 주세요.')
    setBusy(true)
    try {
      await submitTravel(
        token,
        travelers.map((t) => ({
          ...t,
          surname_en: normalizePassportName(t.surname_en),
          given_name_en: normalizePassportName(t.given_name_en),
          passport_no: t.passport_no.trim() ? normalizePassportNo(t.passport_no) : '',
          phone: t.phone ? normalizePhone(t.phone) : '',
          emergency_phone: t.emergency_phone ? normalizePhone(t.emergency_phone) : '',
          father_name_en: t.father_name_en.trim().toUpperCase(),
          mother_name_en: t.mother_name_en.trim().toUpperCase(),
          birth_city_en: t.birth_city_en.trim().toUpperCase(),
        })),
        agree,
      )
      setDone(true)
      window.scrollTo({ top: 0 })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (loadError) {
    return (
      <PublicLayout>
        <Alert>{loadError}</Alert>
      </PublicLayout>
    )
  }
  if (!form) {
    return (
      <PublicLayout>
        <Spinner />
      </PublicLayout>
    )
  }
  if (!form.allowed) {
    return (
      <PublicLayout>
        <Section title="출국 서류 정보">
          <p className="text-sm text-slate-600">항공권·ESTA·여행자보험 대행을 신청하신 경우에만 이 화면에서 정보를 내실 수 있습니다. 대행을 원하시면 카카오톡으로 문의해 주세요.</p>
          <Link to={`/my/${token}`} className="text-sm text-brand-600 hover:underline">
            신청 내용 확인으로 돌아가기
          </Link>
        </Section>
      </PublicLayout>
    )
  }
  if (done) {
    return (
      <PublicLayout>
        <Section title="출국 서류 정보를 받았습니다">
          <p className="text-sm text-slate-700">
            담당자가 확인한 뒤 대행을 진행합니다. ESTA 신청 때 필요한 확인 질문(건강·여행 이력 등)은 담당자가 따로 여쭤봅니다.
          </p>
          <Link to={`/my/${token}`} className="inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            신청 내용 확인으로 돌아가기
          </Link>
        </Section>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout>
      <h1 className="mb-1 text-xl font-bold text-slate-900">출국 서류 정보</h1>
      <p className="mb-4 text-sm text-slate-600">
        {form.program.name}
        {form.program.season ? ` (${form.program.season})` : ''} · {formatDateLongKo(form.program.start_date)} 출국 · 대행 {agencyServiceLabels(form.agency.services)} (
        {formatWon(form.agency.fee)})
      </p>
      <Alert tone="blue">
        <strong>여권에 적힌 영문 이름 그대로</strong> 입력해 주세요. 철자가 다르면 항공권·ESTA를 다시 신청해야 할 수 있습니다. 주민등록번호는 받지 않습니다.
      </Alert>

      <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
        {travelers.map((t, i) => {
          const err = attempted ? allErrors[i] : {}
          return (
            <div key={i} id={`traveler-${i}`}>
              <Section
                title={t.traveler_type === 'student' ? '학생' : `함께 출국하는 보호자 ${i}`}
                description={t.traveler_type === 'student' ? '캠프에 참가하는 학생의 여권 정보입니다.' : '보호자도 같은 항공편·ESTA 대행이 필요한 경우 입력해 주세요.'}
              >
                {t.traveler_type === 'guardian' && (
                  <Field label="학생과의 관계" error={err.relation}>
                    <Select value={t.relation ?? ''} onChange={(e) => set(i, 'relation', e.target.value)}>
                      <option value="">선택</option>
                      {GUARDIAN_RELATIONS.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </Select>
                  </Field>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="영문 성 (여권과 동일)" hint="예: HONG" error={err.surname_en}>
                    <Input value={t.surname_en} autoCapitalize="characters" onChange={(e) => set(i, 'surname_en', e.target.value)} />
                  </Field>
                  <Field label="영문 이름 (여권과 동일)" hint="예: GILDONG" error={err.given_name_en}>
                    <Input value={t.given_name_en} autoCapitalize="characters" onChange={(e) => set(i, 'given_name_en', e.target.value)} />
                  </Field>
                  <Field label="성별" error={err.gender}>
                    <Select value={t.gender} onChange={(e) => set(i, 'gender', e.target.value)}>
                      <option value="">선택</option>
                      <option value="male">남</option>
                      <option value="female">여</option>
                    </Select>
                  </Field>
                  <Field label="생년월일" error={err.birth_date}>
                    <Input type="date" value={t.birth_date} onChange={(e) => set(i, 'birth_date', e.target.value)} />
                  </Field>
                  <Field label="출생 도시 (영문)" hint="예: SEOUL">
                    <Input value={t.birth_city_en} onChange={(e) => set(i, 'birth_city_en', e.target.value)} />
                  </Field>
                  <Field label="출생 국가">
                    <Input value={t.birth_country} onChange={(e) => set(i, 'birth_country', e.target.value)} />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field
                    label="여권번호"
                    hint={t.passport_no_masked ? `저장됨: ${t.passport_no_masked} (바꿀 때만 입력)` : '예: M12345678'}
                    error={err.passport_no}
                  >
                    <Input value={t.passport_no} autoCapitalize="characters" autoComplete="off" onChange={(e) => set(i, 'passport_no', e.target.value)} />
                  </Field>
                  <Field label="여권 발급일">
                    <Input type="date" value={t.passport_issue_date} onChange={(e) => set(i, 'passport_issue_date', e.target.value)} />
                  </Field>
                  <Field label="여권 만료일" error={err.passport_expiry_date}>
                    <Input type="date" value={t.passport_expiry_date} onChange={(e) => set(i, 'passport_expiry_date', e.target.value)} />
                  </Field>
                </div>
                <Field label="다른 국적 (있을 때만)">
                  <Input value={t.other_citizenship} onChange={(e) => set(i, 'other_citizenship', e.target.value)} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="아버지 영문 성명" hint="ESTA 신청 항목입니다 (예: HONG GILSAN)">
                    <Input value={t.father_name_en} onChange={(e) => set(i, 'father_name_en', e.target.value)} />
                  </Field>
                  <Field label="어머니 영문 성명" hint="예: KIM YOUNGHEE">
                    <Input value={t.mother_name_en} onChange={(e) => set(i, 'mother_name_en', e.target.value)} />
                  </Field>
                </div>
                <Field label="집 주소 (영문)" hint="예: 12, Teheran-ro 1-gil, Gangnam-gu, Seoul">
                  <Input value={t.home_address_en} onChange={(e) => set(i, 'home_address_en', e.target.value)} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="연락처">
                    <Input inputMode="tel" value={t.phone} onChange={(e) => set(i, 'phone', e.target.value)} />
                  </Field>
                  <Field label="이메일">
                    <Input type="email" value={t.email} onChange={(e) => set(i, 'email', e.target.value)} />
                  </Field>
                </div>
                {t.traveler_type === 'guardian' && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="직장명 (영문)" hint="ESTA 신청 항목입니다. 없으면 비워 두세요">
                      <Input value={t.employer} onChange={(e) => set(i, 'employer', e.target.value)} />
                    </Field>
                    <Field label="직위·직업 (영문)">
                      <Input value={t.job_title} onChange={(e) => set(i, 'job_title', e.target.value)} />
                    </Field>
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="비상 연락처 이름" hint="출국자와 함께 출국하지 않는 분">
                    <Input value={t.emergency_name} onChange={(e) => set(i, 'emergency_name', e.target.value)} />
                  </Field>
                  <Field label="비상 연락처 번호">
                    <Input inputMode="tel" value={t.emergency_phone} onChange={(e) => set(i, 'emergency_phone', e.target.value)} />
                  </Field>
                </div>
                <Field label="전달할 내용 (선택)" hint="예: 희망 출발 공항, 동반 좌석 요청">
                  <Textarea rows={2} value={t.memo} onChange={(e) => set(i, 'memo', e.target.value)} />
                </Field>
                {t.traveler_type === 'guardian' && (
                  <Button variant="ghost" onClick={() => setTravelers((prev) => prev.filter((_, idx) => idx !== i))}>
                    이 보호자 빼기
                  </Button>
                )}
              </Section>
            </div>
          )
        })}

        {travelers.filter((t) => t.traveler_type === 'guardian').length < 2 && (
          <Button variant="secondary" onClick={() => setTravelers((prev) => [...prev, blank('guardian')])}>
            + 함께 출국하는 보호자 추가
          </Button>
        )}

        <Section title="동의">
          {form.consents.map((c) => (
            <div key={c.kind} className="space-y-2">
              <details className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
                <summary className="cursor-pointer text-sm font-medium text-slate-800">{c.title} 내용 보기</summary>
                <p className="mt-2 whitespace-pre-line">{c.body}</p>
              </details>
              <label className="flex items-start gap-2 text-sm text-slate-800">
                <input type="checkbox" className="mt-0.5 size-4" checked={!!agree[c.kind]} onChange={(e) => setAgree((a) => ({ ...a, [c.kind]: e.target.checked }))} />
                <span>{c.title}에 동의합니다.</span>
              </label>
            </div>
          ))}
          {attempted && !consentOk && <p className="text-xs text-red-600">필수 동의 항목에 모두 동의해 주세요.</p>}
        </Section>

        {error && <Alert>{error}</Alert>}
        {attempted && allErrors.some((x) => Object.keys(x).length > 0) && <Alert>빨간 글씨로 표시된 항목을 확인해 주세요.</Alert>}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? '저장 중…' : form.submitted_at ? '수정한 내용 저장' : '출국 서류 정보 보내기'}
        </Button>
      </form>
    </PublicLayout>
  )
}
