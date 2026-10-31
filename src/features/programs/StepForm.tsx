import { useState } from 'react'
import { Alert, Button, Card } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { fieldModes, FORM_FIELDS, type FieldMode, type Program } from './api'

const MODES: Array<{ value: FieldMode; label: string }> = [
  { value: 'required', label: '필수' },
  { value: 'optional', label: '선택' },
  { value: 'hidden', label: '숨김' },
]

// 등록 신청서 항목: 캠프마다 필수/선택/숨김을 정한다
export function StepForm({ program, onSaved }: { program: Program; onSaved: (message: string) => Promise<void> }) {
  const [modes, setModes] = useState<Record<string, FieldMode>>(() => fieldModes(program.form_config))
  const [passport, setPassport] = useState(program.passport_upload_enabled)
  const [health, setHealth] = useState(program.health_field_enabled)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true)
    setError('')
    const base = program.form_config && typeof program.form_config === 'object' ? program.form_config : {}
    const { error } = await supabase
      .from('programs')
      .update({ form_config: { ...(base as object), fields: modes }, passport_upload_enabled: passport, health_field_enabled: health })
      .eq('id', program.id)
    setSaving(false)
    if (error) return setError('저장하지 못했습니다.')
    await onSaved('신청서 항목을 저장했습니다.')
  }

  return (
    <div className="space-y-4">
      <Alert tone="blue">학생 한글 이름, 학부모 이름·연락처는 항상 필수입니다. 나머지 항목을 이 캠프에 맞게 정해 주세요.</Alert>
      <Card>
        <ul className="divide-y divide-slate-100">
          {FORM_FIELDS.map((f) => (
            <li key={f.key} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-800">{f.label}</p>
                {f.note && <p className="text-xs text-slate-500">{f.note}</p>}
              </div>
              <div className="flex gap-1" role="radiogroup" aria-label={f.label}>
                {MODES.map((m) => (
                  <label
                    key={m.value}
                    className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm ring-1 ${
                      modes[f.key] === m.value ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      className="sr-only"
                      name={`field-${f.key}`}
                      checked={modes[f.key] === m.value}
                      onChange={() => setModes((prev) => ({ ...prev, [f.key]: m.value }))}
                    />
                    {m.label}
                  </label>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <div className="space-y-3">
          <label className="flex items-start gap-2 text-sm text-slate-800">
            <input type="checkbox" className="mt-0.5 size-4" checked={passport} onChange={(e) => setPassport(e.target.checked)} />
            <span>
              <strong>여권 사진 업로드 받기</strong>
              <span className="block text-xs text-slate-500">항공권 예매용. 고유식별정보 별도 동의를 받고 암호화해 보관하며, 종료 후 파기합니다.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-800">
            <input type="checkbox" className="mt-0.5 size-4" checked={health} onChange={(e) => setHealth(e.target.checked)} />
            <span>
              <strong>건강 특이사항 받기</strong>
              <span className="block text-xs text-slate-500">알레르기·복용 약 등. 입력 시 민감정보 별도 동의가 필요합니다.</span>
            </span>
          </label>
        </div>
      </Card>
      {error && <Alert>{error}</Alert>}
      <Button onClick={() => void save()} disabled={saving}>
        {saving ? '저장 중…' : '신청서 항목 저장'}
      </Button>
    </div>
  )
}
