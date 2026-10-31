import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Spinner, Textarea } from '../../components/ui'
import { ddayLabel } from '../../domain/calendar'
import { addDays, formatDateKo } from '../../domain/dates'
import { todayKst } from '../../lib/datetime'
import { supabase, type Tables } from '../../lib/supabase'

type Event = Tables<'important_events'> & { programs: { name: string; season: string | null } | null; staff_profiles: { name: string } | null }
type Msg = { tone: 'green' | 'red'; text: string } | null
const err = (e: { message?: string } | null, fallback: string) => (e?.message && /[가-힣]/.test(e.message) ? e.message : fallback)

const CATEGORY: Record<string, string> = {
  general: '일반',
  deadline: '마감',
  meeting: '회의·설명회',
  privacy_destruction: '개인정보 파기',
  other: '기타',
}

type Draft = { id?: string; title: string; date: string; category: string; priority: string; program_id: string; owner_id: string; memo: string; show_dday: boolean }
const EMPTY: Draft = { title: '', date: todayKst(), category: 'general', priority: 'normal', program_id: '', owner_id: '', memo: '', show_dday: true }

// 중요 일정(D-Day): 직접 등록 + 시스템이 만든 일정(파기 승인 등, 완료 처리만 가능)
export function EventsPage() {
  const [params] = useSearchParams()
  const focus = params.get('id')
  const [events, setEvents] = useState<Event[] | null>(null)
  const [programs, setPrograms] = useState<Array<{ id: string; name: string; season: string | null }>>([])
  const [staff, setStaff] = useState<Array<{ id: string; name: string }>>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [message, setMessage] = useState<Msg>(null)
  const today = todayKst()

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('important_events')
      .select('*, programs(name, season), staff_profiles(name)')
      .is('deleted_at', null)
      .order('date')
    setEvents((data ?? []) as Event[])
  }, [])
  useEffect(() => {
    void load()
    supabase
      .from('programs')
      .select('id, name, season')
      .is('deleted_at', null)
      .order('start_date', { ascending: false })
      .then(({ data }) => setPrograms(data ?? []))
    supabase
      .from('staff_profiles')
      .select('id, name')
      .eq('active', true)
      .neq('role', 'viewer')
      .order('name')
      .then(({ data }) => setStaff(data ?? []))
  }, [load])

  async function save() {
    if (!draft) return
    const row = {
      title: draft.title.trim(),
      date: draft.date,
      category: draft.category,
      priority: draft.priority,
      program_id: draft.program_id || null,
      owner_id: draft.owner_id || null,
      memo: draft.memo.trim() || null,
      show_dday: draft.show_dday,
    }
    const { error } = draft.id ? await supabase.from('important_events').update(row).eq('id', draft.id) : await supabase.from('important_events').insert(row)
    setMessage(error ? { tone: 'red', text: err(error, '저장하지 못했습니다.') } : { tone: 'green', text: `"${row.title}" 일정을 저장했습니다.` })
    if (!error) setDraft(null)
    await load()
  }

  async function patch(e: Event, values: Partial<Tables<'important_events'>>, ok: string) {
    const { error } = await supabase.from('important_events').update(values).eq('id', e.id)
    setMessage(error ? { tone: 'red', text: err(error, '처리하지 못했습니다.') } : { tone: 'green', text: ok })
    await load()
  }

  if (!events) return <Spinner />
  const list = events.filter((e) => showDone || !e.done_at)
  return (
    <>
      <PageHeader
        title="중요 일정"
        description="D-Day로 챙길 일정입니다. 개인정보 파기 승인처럼 시스템이 자동으로 만든 일정은 지울 수 없고 완료 처리만 할 수 있습니다."
        actions={!draft && <Button onClick={() => setDraft({ ...EMPTY })}>+ 일정 추가</Button>}
      />
      <div className="space-y-4">
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        {draft && (
          <Card>
            <p className="mb-3 font-semibold text-slate-900">{draft.id ? '일정 수정' : '일정 추가'}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="제목">
                <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </Field>
              <Field label="날짜">
                <Input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
              </Field>
              <Field label="분류">
                <Select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                  {Object.entries(CATEGORY)
                    .filter(([v]) => v !== 'privacy_destruction')
                    .map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="연결 프로그램(선택)">
                <Select value={draft.program_id} onChange={(e) => setDraft({ ...draft, program_id: e.target.value })}>
                  <option value="">없음</option>
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.season ? ` (${p.season})` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="담당자">
                <Select value={draft.owner_id} onChange={(e) => setDraft({ ...draft, owner_id: e.target.value })}>
                  <option value="">없음</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="중요도">
                <Select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })}>
                  <option value="normal">보통</option>
                  <option value="critical">중요(놓치면 안 됨)</option>
                </Select>
              </Field>
            </div>
            <div className="mt-3">
              <Field label="메모">
                <Textarea rows={2} value={draft.memo} onChange={(e) => setDraft({ ...draft, memo: e.target.value })} />
              </Field>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" checked={draft.show_dday} onChange={(e) => setDraft({ ...draft, show_dday: e.target.checked })} />
              대시보드 D-Day에 표시
            </label>
            <div className="mt-4 flex gap-2">
              <Button disabled={!draft.title.trim() || !draft.date} onClick={() => void save()}>
                저장
              </Button>
              <Button variant="ghost" onClick={() => setDraft(null)}>
                취소
              </Button>
            </div>
          </Card>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" className="size-4" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          완료한 일정도 보기
        </label>
        {list.length === 0 ? (
          <EmptyState>중요 일정이 없습니다.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {list.map((e) => {
              const past = e.date < today
              const near = !past && e.date <= addDays(today, 7)
              return (
                <li
                  key={e.id}
                  aria-label={`중요 일정 ${e.title}`}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-4 shadow-sm ring-1 ${
                    focus === e.id ? 'ring-2 ring-brand-500' : e.done_at ? 'ring-slate-200 opacity-60' : past && e.priority === 'critical' ? 'ring-red-300' : 'ring-slate-200'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={e.done_at ? 'gray' : past ? 'red' : near ? 'amber' : 'blue'}>{e.done_at ? '완료' : ddayLabel(e.date, today)}</Badge>
                    {e.priority === 'critical' && <Badge tone="red">중요</Badge>}
                    <span className="font-medium text-slate-900">{e.title}</span>
                    <span className="text-xs text-slate-500">
                      {formatDateKo(e.date)} · {CATEGORY[e.category] ?? e.category}
                      {e.programs ? ` · ${e.programs.name}` : ''}
                      {e.staff_profiles ? ` · 담당 ${e.staff_profiles.name}` : ''}
                      {e.is_system ? ' · 자동 생성' : ''}
                    </span>
                    {e.memo && <span className="w-full text-xs text-slate-500">{e.memo}</span>}
                  </div>
                  <div className="flex gap-1">
                    {!e.done_at ? (
                      <Button variant="secondary" onClick={() => void patch(e, { done_at: new Date().toISOString() }, '완료로 표시했습니다.')}>
                        완료
                      </Button>
                    ) : (
                      <Button variant="ghost" onClick={() => void patch(e, { done_at: null }, '완료를 취소했습니다.')}>
                        완료 취소
                      </Button>
                    )}
                    {!e.is_system && (
                      <>
                        <Button
                          variant="ghost"
                          onClick={() =>
                            setDraft({
                              id: e.id,
                              title: e.title,
                              date: e.date,
                              category: e.category,
                              priority: e.priority,
                              program_id: e.program_id ?? '',
                              owner_id: e.owner_id ?? '',
                              memo: e.memo ?? '',
                              show_dday: e.show_dday,
                            })
                          }
                        >
                          수정
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            if (window.confirm(`"${e.title}" 일정을 지울까요?`)) void patch(e, { deleted_at: new Date().toISOString() }, '일정을 지웠습니다.')
                          }}
                        >
                          삭제
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}
