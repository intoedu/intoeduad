// 캠프 등록 직접 추가 — 종이 신청서·전화·방문으로 받은 등록을 직원이 넣는다.
// 학부모 신청서와 같은 저장 규칙(필수 항목·납부 일정 자동 생성·얼리버드·학원별 할인·정원/대기)을 쓴다.
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ENTRY_METHODS, entryErrorText, GRADES, PartnerPicker } from '../../components/admin/StaffEntryParts'
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Select, Textarea } from '../../components/ui'
import { formatDateKo } from '../../domain/dates'
import { normalizePhone } from '../../domain/phone'
import { PROGRAM_STATUS } from '../../lib/labels'
import { supabase } from '../../lib/supabase'
import { fieldModes, type FieldMode } from '../programs/api'

const ENGLISH_LEVELS = ['처음 배워요', '기초', '중급', '상급']
const EMERGENCY_RELATIONS = ['어머니', '아버지', '조부모', '친척', '기타']

type ProgramOption = {
  id: string
  name: string
  season: string | null
  status: string
  start_date: string
  form_config: unknown
  health_field_enabled: boolean
  passport_upload_enabled: boolean
  capacity: number | null
}

const EMPTY = {
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

export function RegistrationNewPage() {
  const [params] = useSearchParams()
  const [programs, setPrograms] = useState<ProgramOption[]>([])
  const [programId, setProgramId] = useState(params.get('program') ?? '')
  const [v, setV] = useState(EMPTY)
  const [source, setSource] = useState({ partnerId: '', contactId: '', sourceOther: '' })
  const [method, setMethod] = useState('paper')
  const [consent, setConsent] = useState(false)
  const [agreeHealth, setAgreeHealth] = useState(false)
  const [agreeShare, setAgreeShare] = useState(false)
  const [notify, setNotify] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<{ id: string; status: string; myUrl: string; name: string } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void supabase
      .from('programs')
      .select('id, name, season, status, start_date, form_config, health_field_enabled, passport_upload_enabled, capacity')
      .is('deleted_at', null)
      .order('start_date', { ascending: false })
      .then(({ data }) => setPrograms((data ?? []) as ProgramOption[]))
  }, [])

  const program = programs.find((p) => p.id === programId)
  const modes = useMemo(() => fieldModes(program?.form_config), [program])
  const show = (k: string) => (modes[k] as FieldMode | undefined) !== 'hidden'
  const req = (k: string) => (modes[k] === 'required' ? ' (필수)' : '')
  const set = (k: keyof typeof EMPTY, value: string) => setV((prev) => ({ ...prev, [k]: value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!program) return setError('캠프를 선택해 주세요.')
    if (!v.student_name_ko.trim() || !v.parent_name.trim()) return setError('학생 이름과 학부모 이름을 입력해 주세요.')
    if (!/^01[0-9]{8,9}$/.test(normalizePhone(v.parent_phone))) return setError('학부모 휴대폰 번호를 확인해 주세요.')
    if (!consent) return setError('학부모 동의를 받았는지 확인해 주세요.')
    if (program.health_field_enabled && v.health_notes.trim() && !agreeHealth) return setError('건강 특이사항을 적었다면 민감정보 동의를 받았는지 확인해 주세요.')
    setSaving(true)
    const { data, error: err } = await supabase.rpc('admin_create_registration', {
      p: {
        ...v,
        student_name_ko: v.student_name_ko.trim(),
        parent_name: v.parent_name.trim(),
        parent_phone: normalizePhone(v.parent_phone),
        emergency_phone: v.emergency_phone ? normalizePhone(v.emergency_phone) : '',
        health_notes: program.health_field_enabled ? v.health_notes : '',
        program_id: program.id,
        partner_id: source.partnerId || null,
        contact_id: source.contactId || null,
        source_other: source.sourceOther.trim(),
        entry_method: method,
        consent_confirmed: true,
        agree_health: agreeHealth,
        agree_partner_share: agreeShare,
        notify,
      },
    })
    setSaving(false)
    if (err) return setError(entryErrorText(err))
    const res = data as { registration_id: string; status: string; my_token: string }
    setDone({ id: res.registration_id, status: res.status, myUrl: `${window.location.origin}/my/${res.my_token}`, name: v.student_name_ko.trim() })
    window.scrollTo({ top: 0 })
  }

  if (done) {
    return (
      <>
        <PageHeader title="등록생 직접 추가" />
        <Card>
          <Alert tone="green">
            {done.name} 학생을 {done.status === 'waitlisted' ? '대기 순서로 ' : ''}등록했습니다.
            {done.status === 'waitlisted' ? ' 정원이 차서 대기로 접수되었습니다.' : ' 납부 일정이 자동으로 만들어졌습니다.'}
          </Alert>
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium text-slate-800">학부모용 "신청 내용 확인" 링크</p>
            <p className="text-xs text-slate-500">납부 일정·입금 계좌·여권 제출 안내를 학부모가 볼 수 있습니다. 이 화면에서만 한 번 보여 드리니 필요하면 지금 복사해 보내 주세요.</p>
            <div className="flex flex-wrap gap-2">
              <Input readOnly value={done.myUrl} aria-label="신청 내용 확인 링크" className="min-w-0 flex-1" />
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(done.myUrl)
                    setCopied(true)
                  } catch {
                    setCopied(false)
                  }
                }}
              >
                {copied ? '복사했습니다' : '링크 복사'}
              </Button>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to={`/admin/registrations/${done.id}`} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
              등록생 상세 보기
            </Link>
            <Button
              variant="secondary"
              onClick={() => {
                setDone(null)
                setCopied(false)
                setV(EMPTY)
                setSource({ partnerId: '', contactId: '', sourceOther: '' })
                setConsent(false)
                setAgreeHealth(false)
                setAgreeShare(false)
                setNotify(false)
              }}
            >
              같은 캠프에 한 명 더 추가
            </Button>
          </div>
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="등록생 직접 추가"
        description="종이 신청서·전화·방문으로 받은 캠프 등록을 직접 넣습니다. 학부모 신청서와 똑같이 납부 일정·얼리버드·학원 할인이 자동으로 적용됩니다."
        actions={
          <Link to="/admin/registrations" className="self-center text-sm text-slate-500 hover:text-slate-800">
            목록으로
          </Link>
        }
      />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Card>
          <Field label="캠프 (필수)">
            <Select value={programId} onChange={(e) => setProgramId(e.target.value)}>
              <option value="">캠프 선택</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.season ? ` · ${p.season}` : ''} ({PROGRAM_STATUS[p.status]?.label ?? p.status})
                </option>
              ))}
            </Select>
          </Field>
          {program && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              출국 {formatDateKo(program.start_date)}
              {program.status !== 'open' && <Badge tone="amber">모집 중이 아닌 캠프 — 직원 직접 입력으로만 추가됩니다</Badge>}
            </p>
          )}
        </Card>

        {program && (
          <>
            <Card>
              <p className="mb-3 font-semibold text-slate-900">학생</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="학생 이름(한글) (필수)">
                  <Input value={v.student_name_ko} onChange={(e) => set('student_name_ko', e.target.value)} />
                </Field>
                {show('student_name_en') && (
                  <Field label={`영문 이름(여권과 동일)${req('student_name_en')}`}>
                    <Input value={v.student_name_en} placeholder="HONG GILDONG" onChange={(e) => set('student_name_en', e.target.value)} />
                  </Field>
                )}
                {show('birth_date') && (
                  <Field label={`생년월일${req('birth_date')}`}>
                    <Input type="date" value={v.birth_date} onChange={(e) => set('birth_date', e.target.value)} />
                  </Field>
                )}
                {show('gender') && (
                  <Field label={`성별${req('gender')}`}>
                    <Select value={v.gender} onChange={(e) => set('gender', e.target.value)}>
                      <option value="">선택</option>
                      <option value="male">남</option>
                      <option value="female">여</option>
                    </Select>
                  </Field>
                )}
                {show('school') && (
                  <Field label={`학교${req('school')}`}>
                    <Input value={v.school} onChange={(e) => set('school', e.target.value)} />
                  </Field>
                )}
                {show('grade') && (
                  <Field label={`학년${req('grade')}`}>
                    <Select value={v.grade} onChange={(e) => set('grade', e.target.value)}>
                      <option value="">선택</option>
                      {GRADES.map((g) => (
                        <option key={g}>{g}</option>
                      ))}
                    </Select>
                  </Field>
                )}
                {show('english_level') && (
                  <Field label={`영어 수준${req('english_level')}`}>
                    <Select value={v.english_level} onChange={(e) => set('english_level', e.target.value)}>
                      <option value="">선택</option>
                      {ENGLISH_LEVELS.map((g) => (
                        <option key={g}>{g}</option>
                      ))}
                    </Select>
                  </Field>
                )}
              </div>
            </Card>

            <Card>
              <p className="mb-3 font-semibold text-slate-900">학부모·비상 연락처</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="학부모 이름 (필수)">
                  <Input value={v.parent_name} onChange={(e) => set('parent_name', e.target.value)} />
                </Field>
                <Field label="학부모 휴대폰 (필수)">
                  <Input inputMode="tel" placeholder="010-1234-5678" value={v.parent_phone} onChange={(e) => set('parent_phone', e.target.value)} />
                </Field>
                {show('parent_email') && (
                  <Field label={`학부모 이메일${req('parent_email')}`}>
                    <Input type="email" value={v.parent_email} onChange={(e) => set('parent_email', e.target.value)} />
                  </Field>
                )}
                {show('address') && (
                  <Field label={`주소${req('address')}`}>
                    <Input value={v.address} onChange={(e) => set('address', e.target.value)} />
                  </Field>
                )}
                {show('emergency') && (
                  <>
                    <Field label={`비상 연락처 이름${req('emergency')}`}>
                      <Input value={v.emergency_name} onChange={(e) => set('emergency_name', e.target.value)} />
                    </Field>
                    <Field label="비상 연락처 관계">
                      <Select value={v.emergency_relation} onChange={(e) => set('emergency_relation', e.target.value)}>
                        <option value="">선택</option>
                        {EMERGENCY_RELATIONS.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={`비상 연락처 번호${req('emergency')}`}>
                      <Input inputMode="tel" value={v.emergency_phone} onChange={(e) => set('emergency_phone', e.target.value)} />
                    </Field>
                  </>
                )}
              </div>
              {(show('special_notes') || program.health_field_enabled) && (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {show('special_notes') && (
                    <Field label={`특이사항${req('special_notes')}`}>
                      <Textarea rows={3} value={v.special_notes} onChange={(e) => set('special_notes', e.target.value)} />
                    </Field>
                  )}
                  {program.health_field_enabled && (
                    <Field label="건강 특이사항 (선택)" hint="알레르기·복용 약 등. 적으면 민감정보 동의 확인이 필요합니다">
                      <Textarea rows={3} value={v.health_notes} onChange={(e) => set('health_notes', e.target.value)} />
                    </Field>
                  )}
                </div>
              )}
            </Card>

            <Card>
              <p className="mb-3 font-semibold text-slate-900">소개 경로</p>
              <PartnerPicker partnerId={source.partnerId} contactId={source.contactId} sourceOther={source.sourceOther} onChange={setSource} />
              <p className="mt-2 text-xs text-slate-500">학원을 고르면 그 학원의 할인이 있을 때 자동으로 적용되고, 커미션 대상이 됩니다(소개 경로 확인은 등록생 상세에서).</p>
            </Card>

            <Card>
              <p className="mb-3 font-semibold text-slate-900">입력 방법·동의 확인</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="어떻게 받은 신청인가요?">
                  <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                    {ENTRY_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <label className="mt-4 flex items-start gap-2 text-sm text-slate-800">
                <input type="checkbox" className="mt-0.5 size-4" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>
                  <strong>[필수]</strong> 학부모에게 개인정보 수집·이용, {program.passport_upload_enabled ? '고유식별정보(여권), ' : ''}제3자 제공, 법정대리인 동의,
                  환불 규정, 개인정보 파기 안내를 설명하고 동의를 받았습니다.
                  <span className="block text-xs text-slate-500">종이 신청서라면 서명한 동의서를 보관해 주세요. 입력한 직원 이름과 방법이 동의 기록에 함께 남습니다.</span>
                </span>
              </label>
              {program.health_field_enabled && (
                <label className="mt-3 flex items-start gap-2 text-sm text-slate-800">
                  <input type="checkbox" className="mt-0.5 size-4" checked={agreeHealth} onChange={(e) => setAgreeHealth(e.target.checked)} />
                  <span>[선택] 건강 특이사항(민감정보) 수집·이용 동의를 받았습니다.</span>
                </label>
              )}
              {source.partnerId && (
                <label className="mt-3 flex items-start gap-2 text-sm text-slate-800">
                  <input type="checkbox" className="mt-0.5 size-4" checked={agreeShare} onChange={(e) => setAgreeShare(e.target.checked)} />
                  <span>[선택] 소개 학원에 학생 이름·등록 여부를 알리는 것에 동의를 받았습니다.</span>
                </label>
              )}
              <label className="mt-3 flex items-start gap-2 text-sm text-slate-800">
                <input type="checkbox" className="mt-0.5 size-4" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
                <span>
                  학부모에게 등록 접수·납부 안내 알림톡 보내기
                  <span className="block text-xs text-slate-500">알림 설정이 꺼져 있으면 보내지 않고 기록만 남습니다.</span>
                </span>
              </label>
            </Card>

            {error && <Alert>{error}</Alert>}
            <Button type="submit" disabled={saving}>
              {saving ? '저장 중…' : '등록생 추가'}
            </Button>
          </>
        )}
      </form>
    </>
  )
}
