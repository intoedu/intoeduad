// 상담 신청 직접 등록 — 전화·방문·카카오톡 등으로 받은 상담 문의를 직원이 넣는다
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ENTRY_METHODS, entryErrorText, GRADES, PartnerPicker } from '../../components/admin/StaffEntryParts'
import { Alert, Button, Card, Field, Input, PageHeader, Select, Textarea } from '../../components/ui'
import { normalizePhone } from '../../domain/phone'
import { supabase } from '../../lib/supabase'

const RELATIONS = ['어머니', '아버지', '조부모', '기타']

export function LeadNewPage() {
  const navigate = useNavigate()
  const [programs, setPrograms] = useState<Array<{ id: string; name: string; season: string | null }>>([])
  const [v, setV] = useState({
    student_name: '',
    student_grade: '',
    parent_name: '',
    parent_phone: '',
    relation: '',
    message: '',
    entry_method: 'phone',
  })
  const [interests, setInterests] = useState<string[]>([])
  const [programIds, setProgramIds] = useState<string[]>([])
  const [source, setSource] = useState({ partnerId: '', contactId: '', sourceOther: '' })
  const [consent, setConsent] = useState(false)
  const [notify, setNotify] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void supabase
      .from('programs')
      .select('id, name, season')
      .is('deleted_at', null)
      .in('status', ['before', 'open'])
      .order('start_date')
      .then(({ data }) => setPrograms(data ?? []))
  }, [])

  const set = (k: keyof typeof v, value: string) => setV((prev) => ({ ...prev, [k]: value }))
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const phone = normalizePhone(v.parent_phone)
    if (!v.student_name.trim() || !v.parent_name.trim()) return setError('학생 이름과 학부모 이름을 입력해 주세요.')
    if (!/^01[0-9]{8,9}$/.test(phone)) return setError('학부모 휴대폰 번호를 확인해 주세요.')
    if (!consent) return setError('고객에게 개인정보 수집·이용 동의를 받았는지 확인해 주세요.')
    setSaving(true)
    const { data, error: err } = await supabase.rpc('admin_create_lead', {
      p: {
        student_name: v.student_name.trim(),
        student_grade: v.student_grade,
        parent_name: v.parent_name.trim(),
        parent_phone: phone,
        relation: v.relation,
        message: v.message.trim(),
        interests,
        program_ids: programIds,
        partner_id: source.partnerId || null,
        contact_id: source.contactId || null,
        source_other: source.sourceOther.trim(),
        entry_method: v.entry_method,
        consent_confirmed: true,
        notify,
      },
    })
    setSaving(false)
    if (err) return setError(entryErrorText(err))
    const id = (data as { lead_id?: string } | null)?.lead_id
    if (id) navigate(`/admin/leads/${id}`, { state: { message: '상담 신청을 등록했습니다. 아래 [+ 상담 추가]로 상담 일정을 잡을 수 있습니다.' } })
  }

  return (
    <>
      <PageHeader
        title="상담 신청 직접 등록"
        description="전화·방문·카카오톡 등으로 받은 상담 문의를 직접 넣습니다. 저장하면 고객 카드가 만들어지고, 거기서 상담 일정을 잡을 수 있습니다."
        actions={
          <Link to="/admin/leads" className="self-center text-sm text-slate-500 hover:text-slate-800">
            목록으로
          </Link>
        }
      />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Card>
          <p className="mb-3 font-semibold text-slate-900">학생·학부모</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="학생 이름 (필수)">
              <Input value={v.student_name} onChange={(e) => set('student_name', e.target.value)} />
            </Field>
            <Field label="학년">
              <Select value={v.student_grade} onChange={(e) => set('student_grade', e.target.value)}>
                <option value="">선택 안 함</option>
                {GRADES.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </Select>
            </Field>
            <Field label="학부모 이름 (필수)">
              <Input value={v.parent_name} onChange={(e) => set('parent_name', e.target.value)} />
            </Field>
            <Field label="학부모 휴대폰 (필수)">
              <Input inputMode="tel" placeholder="010-1234-5678" value={v.parent_phone} onChange={(e) => set('parent_phone', e.target.value)} />
            </Field>
            <Field label="자녀와의 관계">
              <Select value={v.relation} onChange={(e) => set('relation', e.target.value)}>
                <option value="">선택 안 함</option>
                {RELATIONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>

        <Card>
          <p className="mb-3 font-semibold text-slate-900">관심 분야·캠프</p>
          <div className="mb-3 flex flex-wrap gap-4 text-sm text-slate-800">
            {[
              { value: 'camp', label: '캠프' },
              { value: 'study_abroad', label: '유학' },
            ].map((o) => (
              <label key={o.value} className="flex items-center gap-2">
                <input type="checkbox" className="size-4" checked={interests.includes(o.value)} onChange={() => setInterests((l) => toggle(l, o.value))} />
                {o.label}
              </label>
            ))}
          </div>
          {programs.length > 0 && (
            <fieldset>
              <legend className="mb-1 text-sm font-medium text-slate-700">관심 캠프 (선택)</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-800">
                {programs.map((p) => (
                  <label key={p.id} className="flex items-center gap-2">
                    <input type="checkbox" className="size-4" checked={programIds.includes(p.id)} onChange={() => setProgramIds((l) => toggle(l, p.id))} />
                    {p.name}
                    {p.season ? ` · ${p.season}` : ''}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="mt-3">
            <Field label="문의 내용·메모">
              <Textarea rows={3} value={v.message} onChange={(e) => set('message', e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card>
          <p className="mb-3 font-semibold text-slate-900">소개 경로</p>
          <PartnerPicker partnerId={source.partnerId} contactId={source.contactId} sourceOther={source.sourceOther} onChange={setSource} />
        </Card>

        <Card>
          <p className="mb-3 font-semibold text-slate-900">입력 방법·동의</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="어떻게 받은 문의인가요?">
              <Select value={v.entry_method} onChange={(e) => set('entry_method', e.target.value)}>
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
              <strong>[필수]</strong> 고객에게 개인정보 수집·이용(상담 목적, 보관 기간)과 법정대리인 동의 내용을 안내하고 동의를 받았습니다.
              <span className="block text-xs text-slate-500">입력한 직원 이름과 방법이 동의 기록에 함께 남습니다.</span>
            </span>
          </label>
          <label className="mt-3 flex items-start gap-2 text-sm text-slate-800">
            <input type="checkbox" className="mt-0.5 size-4" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            <span>
              학부모에게 상담 접수 안내 알림톡 보내기
              <span className="block text-xs text-slate-500">알림 설정이 꺼져 있으면 보내지 않고 기록만 남습니다.</span>
            </span>
          </label>
        </Card>

        {error && <Alert>{error}</Alert>}
        <Button type="submit" disabled={saving}>
          {saving ? '저장 중…' : '상담 신청 등록'}
        </Button>
      </form>
    </>
  )
}
