import { Field, Input, Select, Textarea } from '../ui'
import { YES_NO, type AnswerMap, type AnswerValue, type PublicQuestion } from '../../domain/formSettings'

// 추가 질문 입력칸 (학부모 신청서·직원 직접 입력 공용)
export function QuestionFields({
  questions,
  values,
  onChange,
  errors,
  requiredMark = true,
}: {
  questions: PublicQuestion[]
  values: AnswerMap
  onChange: (next: AnswerMap) => void
  errors?: Record<string, string>
  // 직원 입력 화면은 필수 표시 없이 받는다
  requiredMark?: boolean
}) {
  const set = (id: string, v: AnswerValue) => onChange({ ...values, [id]: v })
  return (
    <div className="space-y-4">
      {questions.map((q) => {
        const label = `${q.label}${q.required && requiredMark ? '' : ' (선택)'}`
        const error = errors?.[q.id]
        const value = values[q.id]
        const text = typeof value === 'string' ? value : ''
        const list = Array.isArray(value) ? value : []
        return (
          <div key={q.id} id={`field-q-${q.id}`}>
            {q.type === 'short_text' && (
              <Field label={label} hint={q.help ?? undefined} error={error}>
                <Input maxLength={300} value={text} onChange={(e) => set(q.id, e.target.value)} />
              </Field>
            )}
            {q.type === 'long_text' && (
              <Field label={label} hint={q.help ?? undefined} error={error}>
                <Textarea rows={3} maxLength={2000} value={text} onChange={(e) => set(q.id, e.target.value)} />
              </Field>
            )}
            {q.type === 'number' && (
              <Field label={label} hint={q.help ?? undefined} error={error}>
                <Input inputMode="decimal" maxLength={20} value={text} onChange={(e) => set(q.id, e.target.value)} />
              </Field>
            )}
            {q.type === 'date' && (
              <Field label={label} hint={q.help ?? undefined} error={error}>
                <Input type="date" value={text} onChange={(e) => set(q.id, e.target.value)} />
              </Field>
            )}
            {q.type === 'dropdown' && (
              <Field label={label} hint={q.help ?? undefined} error={error}>
                <Select value={text} onChange={(e) => set(q.id, e.target.value)}>
                  <option value="">선택해 주세요</option>
                  {q.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {(q.type === 'single_choice' || q.type === 'yes_no') && (
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-slate-700">{label}</legend>
                {q.help && <p className="-mt-1 mb-2 text-xs text-slate-500">{q.help}</p>}
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={q.label}>
                  {(q.type === 'yes_no' ? [...YES_NO] : q.options).map((o) => (
                    <label
                      key={o}
                      className={`cursor-pointer rounded-full px-4 py-2 text-sm ring-1 select-none has-focus-visible:outline-2 has-focus-visible:outline-brand-600 ${
                        text === o ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-300'
                      }`}
                    >
                      <input type="radio" name={`q-${q.id}`} className="sr-only" checked={text === o} onChange={() => set(q.id, o)} />
                      {o}
                    </label>
                  ))}
                </div>
                {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
              </fieldset>
            )}
            {q.type === 'multi_choice' && (
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-slate-700">{label}</legend>
                {q.help && <p className="-mt-1 mb-2 text-xs text-slate-500">{q.help}</p>}
                <div className="flex flex-wrap gap-2">
                  {q.options.map((o) => {
                    const checked = list.includes(o)
                    return (
                      <label
                        key={o}
                        className={`cursor-pointer rounded-full px-4 py-2 text-sm ring-1 select-none has-focus-visible:outline-2 has-focus-visible:outline-brand-600 ${
                          checked ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          onChange={(e) => set(q.id, e.target.checked ? [...list, o] : list.filter((x) => x !== o))}
                        />
                        {o}
                      </label>
                    )
                  })}
                </div>
                {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
              </fieldset>
            )}
          </div>
        )
      })}
    </div>
  )
}
