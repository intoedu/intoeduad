import { useState, type FormEvent } from 'react'
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Select } from '../../components/ui'
import { addDays, formatDateKo } from '../../domain/dates'
import { commissionNoticeDeadline } from '../../domain/paymentRules'
import { MILESTONE_CATEGORY } from '../../lib/labels'
import { supabase } from '../../lib/supabase'
import type { Milestone, Program } from './api'

// 자주 쓰는 일정: 출국일 기준 제안 날짜 (바꿀 수 있음)
const SUGGESTIONS: Array<{ title: string; category: string; daysBefore: number }> = [
  { title: '서류 마감', category: 'document_deadline', daysBefore: 60 },
  { title: '비자 신청', category: 'visa', daysBefore: 45 },
  { title: '항공권 발권', category: 'flight_ticketing', daysBefore: 30 },
  { title: '출국 전 오리엔테이션', category: 'orientation', daysBefore: 7 },
]

export function StepMilestones({
  program,
  milestones,
  onSaved,
}: {
  program: Program
  milestones: Milestone[]
  onSaved: (message: string) => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [category, setCategory] = useState('other')
  const [showDday, setShowDday] = useState(true)
  const [error, setError] = useState('')

  async function add(row: { title: string; date: string; category: string; show_dday: boolean }) {
    setError('')
    const { error } = await supabase.from('program_milestones').insert({ program_id: program.id, ...row })
    if (error) return setError('일정을 추가하지 못했습니다.')
    await onSaved(`"${row.title}" 일정을 추가했습니다.`)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !date) return setError('일정 이름과 날짜를 입력해 주세요.')
    await add({ title: title.trim(), date, category, show_dday: showDday })
    setTitle('')
    setDate('')
  }

  const existingTitles = new Set(milestones.map((m) => m.title))
  const system = [
    { title: '커미션 사전 고지 기한 (MOU 학원)', date: commissionNoticeDeadline(program.start_date) },
    { title: '출국', date: program.start_date },
    { title: '귀국', date: program.end_date },
  ]

  return (
    <div className="space-y-4">
      <Alert tone="blue">여기서 등록한 일정은 통합 캘린더와 대시보드 D-Day에 자동으로 표시됩니다.</Alert>

      <Card>
        <p className="mb-3 font-semibold text-slate-900">자동 일정</p>
        <ul className="space-y-1 text-sm">
          {system.map((s) => (
            <li key={s.title} className="flex justify-between gap-2">
              <span className="text-slate-700">{s.title}</span>
              <span className="text-slate-900">{formatDateKo(s.date)}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <p className="mb-3 font-semibold text-slate-900">주요 일정</p>
        {milestones.length === 0 && <EmptyState>등록된 일정이 없습니다.</EmptyState>}
        <ul className="divide-y divide-slate-100">
          {milestones.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{MILESTONE_CATEGORY[m.category] ?? m.category}</Badge>
                <span className="text-sm text-slate-800">{m.title}</span>
                {m.show_dday && <Badge tone="blue">D-Day 표시</Badge>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-700">{formatDateKo(m.date)}</span>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    if (!window.confirm(`"${m.title}" 일정을 삭제할까요?`)) return
                    await supabase.from('program_milestones').delete().eq('id', m.id)
                    await onSaved('일정을 삭제했습니다.')
                  }}
                >
                  삭제
                </Button>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap gap-2">
          {SUGGESTIONS.filter((s) => !existingTitles.has(s.title)).map((s) => (
            <Button
              key={s.title}
              variant="secondary"
              onClick={() => void add({ title: s.title, category: s.category, date: addDays(program.start_date, -s.daysBefore), show_dday: true })}
            >
              + {s.title} (출국 {s.daysBefore}일 전)
            </Button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_160px_160px_auto] sm:items-end">
          <Field label="일정 이름">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="날짜">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="분류">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {Object.entries(MILESTONE_CATEGORY).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit">추가</Button>
          <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-4">
            <input type="checkbox" className="size-4" checked={showDday} onChange={(e) => setShowDday(e.target.checked)} />
            대시보드 D-Day에 표시
          </label>
        </form>
        {error && (
          <div className="mt-3">
            <Alert>{error}</Alert>
          </div>
        )}
      </Card>
    </div>
  )
}
