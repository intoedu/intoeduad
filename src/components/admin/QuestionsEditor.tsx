import { useCallback, useEffect, useState } from 'react'
import { Alert, Badge, Button, Field, Input, Select, Textarea } from '../ui'
import { hasOptions, QUESTION_TYPES, questionTypeLabel, type QuestionType } from '../../domain/formSettings'
import { supabase, type Tables } from '../../lib/supabase'

type Question = Tables<'form_questions'>
type Draft = { id?: string; label: string; help: string; type: QuestionType; options: string; required: boolean }
const EMPTY: Draft = { label: '', help: '', type: 'short_text', options: '', required: false }

function errorText(message: string) {
  return /[가-힣]/.test(message) ? message : '저장하지 못했습니다. 입력 내용을 확인해 주세요.'
}

// 추가 질문 만들기·고치기·순서·사용 여부 (상담 신청서 / 캠프 신청서 공통 / 캠프별)
export function QuestionsEditor({ form, programId, readOnly = false }: { form: 'lead' | 'registration'; programId: string | null; readOnly?: boolean }) {
  const [rows, setRows] = useState<Question[] | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    let q = supabase.from('form_questions').select('*').eq('form', form).order('sort').order('created_at')
    q = programId ? q.eq('program_id', programId) : q.is('program_id', null)
    const { data } = await q
    setRows(data ?? [])
  }, [form, programId])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    if (!draft) return
    const options = draft.options
      .split('\n')
      .map((o) => o.trim())
      .filter(Boolean)
    if (!draft.label.trim()) return setMessage({ tone: 'red', text: '질문 문구를 적어 주세요.' })
    if (hasOptions(draft.type) && options.length === 0) return setMessage({ tone: 'red', text: '선택지를 한 줄에 하나씩 적어 주세요.' })
    setBusy(true)
    const body = {
      label: draft.label.trim(),
      help: draft.help.trim() || null,
      type: draft.type,
      options: hasOptions(draft.type) ? options : [],
      required: draft.required,
    }
    const res = draft.id
      ? await supabase.from('form_questions').update(body).eq('id', draft.id)
      : await supabase
          .from('form_questions')
          .insert({ ...body, form, program_id: programId, sort: ((rows ?? []).at(-1)?.sort ?? 0) + 10 })
    setBusy(false)
    if (res.error) return setMessage({ tone: 'red', text: errorText(res.error.message) })
    setMessage({ tone: 'green', text: draft.id ? '질문을 고쳤습니다.' : '질문을 추가했습니다.' })
    setDraft(null)
    await load()
  }

  async function patch(id: string, body: Partial<Question>, text: string) {
    const { error } = await supabase.from('form_questions').update(body).eq('id', id)
    setMessage(error ? { tone: 'red', text: errorText(error.message) } : { tone: 'green', text })
    await load()
  }

  async function move(index: number, dir: -1 | 1) {
    if (!rows) return
    const other = rows[index + dir]
    const cur = rows[index]
    if (!other) return
    // 순서 값을 다시 매긴다(같은 값이 섞여 있어도 확실히 바뀌게)
    const order = rows.map((r) => r.id)
    order[index] = other.id
    order[index + dir] = cur.id
    await Promise.all(order.map((id, i) => supabase.from('form_questions').update({ sort: (i + 1) * 10 }).eq('id', id)))
    await load()
  }

  async function remove(q: Question) {
    if (!window.confirm(`「${q.label}」 질문을 지울까요?\n이미 받은 답변은 신청 건에 그대로 남습니다.`)) return
    const { error } = await supabase.from('form_questions').delete().eq('id', q.id)
    setMessage(error ? { tone: 'red', text: errorText(error.message) } : { tone: 'green', text: '질문을 지웠습니다.' })
    await load()
  }

  if (rows === null) return <p className="text-sm text-slate-500">불러오는 중…</p>

  return (
    <div className="space-y-3">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {rows.length === 0 && <p className="text-sm text-slate-500">추가 질문이 없습니다.</p>}
      <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
        {rows.map((q, i) => (
          <li key={q.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className={`text-sm font-medium ${q.active ? 'text-slate-900' : 'text-slate-400 line-through'}`}>{q.label}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-500">
                <Badge>{questionTypeLabel(q.type)}</Badge>
                {q.required ? <Badge tone="amber">필수</Badge> : <Badge>선택</Badge>}
                {!q.active && <Badge tone="gray">사용 안 함</Badge>}
                {q.options.length > 0 && <span className="truncate">{q.options.join(' · ')}</span>}
              </div>
            </div>
            {!readOnly && (
              <div className="flex shrink-0 flex-wrap gap-1">
                <Button variant="ghost" aria-label="위로" disabled={i === 0} onClick={() => void move(i, -1)}>
                  ↑
                </Button>
                <Button variant="ghost" aria-label="아래로" disabled={i === rows.length - 1} onClick={() => void move(i, 1)}>
                  ↓
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    setDraft({ id: q.id, label: q.label, help: q.help ?? '', type: q.type as QuestionType, options: q.options.join('\n'), required: q.required })
                  }
                >
                  고치기
                </Button>
                <Button variant="ghost" onClick={() => void patch(q.id, { active: !q.active }, q.active ? '신청서에서 숨겼습니다.' : '다시 보이게 했습니다.')}>
                  {q.active ? '숨기기' : '다시 쓰기'}
                </Button>
                <Button variant="ghost" onClick={() => void remove(q)}>
                  지우기
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {!readOnly && !draft && (
        <Button variant="secondary" onClick={() => setDraft(EMPTY)}>
          + 질문 추가
        </Button>
      )}

      {draft && (
        <div className="space-y-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <p className="text-sm font-semibold text-slate-900">{draft.id ? '질문 고치기' : '새 질문'}</p>
          <Field label="질문 문구">
            <Input maxLength={200} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
          </Field>
          <Field label="안내 문구 (선택)" hint="질문 아래 작게 보입니다.">
            <Input maxLength={500} value={draft.help} onChange={(e) => setDraft({ ...draft, help: e.target.value })} />
          </Field>
          <Field label="답변 형식">
            <Select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as QuestionType })}>
              {QUESTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          {hasOptions(draft.type) && (
            <Field label="선택지 (한 줄에 하나)">
              <Textarea rows={4} value={draft.options} onChange={(e) => setDraft({ ...draft, options: e.target.value })} />
            </Field>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-800">
            <input type="checkbox" className="size-4" checked={draft.required} onChange={(e) => setDraft({ ...draft, required: e.target.checked })} />
            필수 질문 (답하지 않으면 신청할 수 없음)
          </label>
          <p className="text-xs text-slate-500">
            건강·종교·주민등록번호처럼 별도 동의가 필요한 정보는 추가 질문으로 받지 마세요. 건강 정보는 캠프의 "건강 특이사항 받기"를 쓰면 민감정보 동의와 함께 받습니다.
          </p>
          <div className="flex gap-2">
            <Button onClick={() => void save()} disabled={busy}>
              {busy ? '저장 중…' : '저장'}
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              취소
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
