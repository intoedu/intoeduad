import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Card, Field, Input, Textarea } from '../../components/ui'
import { getDefaults, renderTemplate, thirdPartyValues, type Program, type RefundRule, type ThirdParties } from './api'
import { supabase } from '../../lib/supabase'

// 환불 규정(캠프별 수정, 버전 관리) + 제3자 제공·국외 이전 대상 → 동의 문구 자동 반영
export function StepPolicies({ program, onSaved }: { program: Program; onSaved: (message: string) => Promise<void> }) {
  const [text, setText] = useState(program.refund_policy_text ?? '')
  const [rules, setRules] = useState<RefundRule[]>(() => (Array.isArray(program.refund_rules) ? (program.refund_rules as RefundRule[]) : []))
  const [tp, setTp] = useState<ThirdParties>(() => (program.third_party_recipients as ThirdParties) ?? {})
  const [defaults, setDefaults] = useState<{ refundRules: RefundRule[]; refundText: string; thirdPartyTemplate: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getDefaults().then((d) => {
      setDefaults(d)
      setText((t) => t || renderTemplate(d.refundText, { program_name: program.name }))
      setRules((r) => (r.length ? r : d.refundRules))
    })
  }, [program.name])

  function setRule(i: number, patch: Partial<RefundRule>) {
    setRules((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  async function save() {
    setError('')
    if (!text.trim()) return setError('환불 규정을 입력해 주세요.')
    if (rules.some((r) => r.rate < 0 || r.rate > 1)) return setError('공제율은 0~100% 사이여야 합니다.')
    const changed =
      text !== (program.refund_policy_text ?? '') || JSON.stringify(rules) !== JSON.stringify(program.refund_rules ?? [])
    setSaving(true)
    const { error } = await supabase
      .from('programs')
      .update({
        refund_policy_text: text,
        refund_rules: rules,
        // 내용이 바뀌면 버전을 올린다 → 신청 시점의 버전이 등록 기록에 남는다
        refund_policy_version: changed && program.refund_policy_text ? program.refund_policy_version + 1 : program.refund_policy_version,
        third_party_recipients: tp,
      })
      .eq('id', program.id)
    setSaving(false)
    if (error) return setError('저장하지 못했습니다.')
    await onSaved(changed && program.refund_policy_text ? `동의·환불 규정을 저장했습니다. (환불 규정 v${program.refund_policy_version + 1})` : '동의·환불 규정을 저장했습니다.')
  }

  const preview = defaults ? renderTemplate(defaults.thirdPartyTemplate, thirdPartyValues(tp)) : ''

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-slate-900">환불 규정</p>
            <Badge>v{program.refund_policy_version}</Badge>
          </div>
          {defaults && (
            <Button
              variant="ghost"
              onClick={() => {
                if (window.confirm('기본안으로 바꿀까요? 지금 입력한 내용은 사라집니다.')) {
                  setText(renderTemplate(defaults.refundText, { program_name: program.name }))
                  setRules(defaults.refundRules)
                }
              }}
            >
              기본안 불러오기
            </Button>
          )}
        </div>
        <Textarea aria-label="환불 규정" rows={12} value={text} onChange={(e) => setText(e.target.value)} />
        <p className="mt-2 text-xs text-slate-500">기본안은 공정위 국외여행 소비자분쟁해결기준을 참고한 초안입니다. 운영 전 법률 검토 후 확정해 주세요.</p>
      </Card>

      <Card>
        <p className="mb-1 font-semibold text-slate-900">환불 공제율 표 (환불 예상액 자동 계산에 사용)</p>
        <p className="mb-3 text-xs text-slate-500">취소 요청일 기준 출국까지 남은 일수(출국 당일 = 0일)가 이 구간이면 총 참가비에서 공제할 비율. 예: 20~29일 → 10%</p>
        <div className="space-y-2">
          {rules.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
              <Field label="출국까지 남은 일수: 최소">
                <Input
                  type="number"
                  value={r.min_days ?? ''}
                  placeholder="0 (당일)"
                  onChange={(e) => setRule(i, { min_days: e.target.value === '' ? null : Number(e.target.value) })}
                />
              </Field>
              <Field label="최대 (비우면 제한 없음)">
                <Input
                  type="number"
                  value={r.max_days ?? ''}
                  placeholder="제한 없음"
                  onChange={(e) => setRule(i, { max_days: e.target.value === '' ? null : Number(e.target.value) })}
                />
              </Field>
              <Field label="공제율(%)">
                <Input type="number" min={0} max={100} value={Math.round(r.rate * 1000) / 10} onChange={(e) => setRule(i, { rate: Number(e.target.value) / 100 })} />
              </Field>
              <Button variant="ghost" onClick={() => setRules((prev) => prev.filter((_, idx) => idx !== i))}>
                삭제
              </Button>
            </div>
          ))}
          <Button variant="secondary" onClick={() => setRules((prev) => [...prev, { min_days: null, max_days: null, rate: 0 }])}>
            + 구간 추가
          </Button>
        </div>
      </Card>

      <Card>
        <p className="mb-1 font-semibold text-slate-900">개인정보 제3자 제공·국외 이전 대상</p>
        <p className="mb-3 text-xs text-slate-500">입력한 내용이 등록 신청서의 동의 문구(부록 A-2 3번)에 자동으로 들어갑니다.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="항공권 발권처">
            <Input value={tp.ticketing ?? ''} onChange={(e) => setTp({ ...tp, ticketing: e.target.value })} />
          </Field>
          <div />
          <Field label="현지 학교·기관명">
            <Input value={tp.school?.name ?? ''} onChange={(e) => setTp({ ...tp, school: { ...tp.school, name: e.target.value } })} />
          </Field>
          <Field label="학교·기관 국가">
            <Input value={tp.school?.country ?? ''} onChange={(e) => setTp({ ...tp, school: { ...tp.school, country: e.target.value } })} />
          </Field>
          <Field label="홈스테이·숙소 기관명">
            <Input value={tp.lodging?.name ?? ''} onChange={(e) => setTp({ ...tp, lodging: { ...tp.lodging, name: e.target.value } })} />
          </Field>
          <Field label="숙소 국가">
            <Input value={tp.lodging?.country ?? ''} onChange={(e) => setTp({ ...tp, lodging: { ...tp.lodging, country: e.target.value } })} />
          </Field>
        </div>
        {preview && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-brand-600">학부모에게 보일 동의 문구 미리보기</summary>
            <pre className="mt-2 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed whitespace-pre-wrap text-slate-700 ring-1 ring-slate-200">{preview}</pre>
          </details>
        )}
      </Card>

      {error && <Alert>{error}</Alert>}
      <Button onClick={() => void save()} disabled={saving}>
        {saving ? '저장 중…' : '동의·환불 규정 저장'}
      </Button>
    </div>
  )
}
