import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Spinner } from '../../components/ui'
import { addDays, formatDateKo, isoWeekday, kstDayStartIso, startOfWeek } from '../../domain/dates'
import { formatKst, todayKst } from '../../lib/datetime'
import { supabase, type Tables } from '../../lib/supabase'

type Slot = Tables<'consultation_slots'>

const WEEKDAY_OPTIONS = [
  { value: 1, label: '월' },
  { value: 2, label: '화' },
  { value: 3, label: '수' },
  { value: 4, label: '목' },
  { value: 5, label: '금' },
  { value: 6, label: '토' },
  { value: 7, label: '일' },
]

export function SlotsPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(todayKst()))
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string } | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('consultation_slots')
      .select('*')
      .gte('starts_at', kstDayStartIso(weekStart))
      .lt('starts_at', kstDayStartIso(addDays(weekStart, 7)))
      .order('starts_at')
    setSlots(data ?? [])
  }, [weekStart])

  useEffect(() => {
    void load()
  }, [load])

  async function setOpen(ids: string[], isOpen: boolean) {
    if (ids.length === 0) return
    const { error } = await supabase.from('consultation_slots').update({ is_open: isOpen }).in('id', ids)
    setMessage(error ? { tone: 'red', text: '변경하지 못했습니다.' } : null)
    await load()
  }

  async function remove(slot: Slot) {
    if (slot.booked_count > 0) return
    const { error } = await supabase.from('consultation_slots').delete().eq('id', slot.id)
    setMessage(error ? { tone: 'red', text: '삭제하지 못했습니다. 예약이 있는 시간은 삭제할 수 없습니다.' } : null)
    await load()
  }

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const now = Date.now()

  return (
    <>
      <PageHeader
        title="상담 시간 관리"
        description="학부모가 신청서에서 고를 수 있는 상담 시간을 만들고 열고 닫습니다. 같은 시간에 정원보다 많이 예약되지 않도록 DB에서 막습니다."
      />
      {message && (
        <div className="mb-4">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}

      <GenerateForm
        onGenerated={async (count) => {
          setMessage({ tone: 'green', text: count > 0 ? `상담 시간 ${count}개를 만들었습니다.` : '새로 만들 시간이 없습니다(이미 있는 시간은 건너뜁니다).' })
          await load()
        }}
        onError={(text) => setMessage({ tone: 'red', text })}
      />

      <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-slate-900">
          {formatDateKo(weekStart)} ~ {formatDateKo(addDays(weekStart, 6))}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            이전 주
          </Button>
          <Button variant="secondary" onClick={() => setWeekStart(startOfWeek(todayKst()))}>
            이번 주
          </Button>
          <Button variant="secondary" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            다음 주
          </Button>
        </div>
      </div>

      {!slots ? (
        <Spinner />
      ) : (
        <div className="space-y-3">
          {days.map((day) => {
            const daySlots = slots.filter((s) => formatKst(s.starts_at, 'yyyy-MM-dd') === day)
            const openFuture = daySlots.filter((s) => s.is_open && new Date(s.starts_at).getTime() > now)
            const closedFuture = daySlots.filter((s) => !s.is_open && new Date(s.starts_at).getTime() > now)
            return (
              <Card key={day} className={isoWeekday(day) >= 6 ? 'bg-slate-50' : ''}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-slate-900">
                    {formatDateKo(day)}
                    {day === todayKst() && <span className="ml-2 text-xs text-brand-600">오늘</span>}
                  </p>
                  {daySlots.length > 0 && (
                    <div className="flex gap-2">
                      {openFuture.length > 0 && (
                        <Button
                          variant="ghost"
                          onClick={() => {
                            if (window.confirm(`${formatDateKo(day)}을(를) 휴무로 처리할까요? 남은 시간을 모두 닫습니다. (이미 예약된 상담은 유지)`)) {
                              void setOpen(openFuture.map((s) => s.id), false)
                            }
                          }}
                        >
                          이 날 휴무
                        </Button>
                      )}
                      {closedFuture.length > 0 && (
                        <Button variant="ghost" onClick={() => void setOpen(closedFuture.map((s) => s.id), true)}>
                          모두 열기
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                {daySlots.length === 0 ? (
                  <p className="text-sm text-slate-400">상담 시간 없음</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {daySlots.map((s) => {
                      const past = new Date(s.starts_at).getTime() <= now
                      const full = s.booked_count >= s.capacity
                      return (
                        <div
                          key={s.id}
                          className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm ring-1 ${
                            past
                              ? 'bg-slate-100 text-slate-400 ring-slate-200'
                              : !s.is_open
                                ? 'bg-slate-100 text-slate-500 line-through ring-slate-300'
                                : full
                                  ? 'bg-amber-50 text-amber-900 ring-amber-200'
                                  : 'bg-white text-slate-800 ring-slate-300'
                          }`}
                        >
                          <button
                            type="button"
                            disabled={past}
                            title={s.is_open ? '눌러서 닫기' : '눌러서 열기'}
                            onClick={() => void setOpen([s.id], !s.is_open)}
                            className="disabled:cursor-default"
                          >
                            {formatKst(s.starts_at, 'HH:mm')}
                          </button>
                          <Badge tone={s.booked_count > 0 ? 'blue' : 'gray'}>
                            {s.booked_count}/{s.capacity}
                          </Badge>
                          {s.booked_count === 0 && !past && (
                            <button
                              type="button"
                              aria-label={`${formatKst(s.starts_at, 'HH:mm')} 삭제`}
                              onClick={() => void remove(s)}
                              className="px-1 text-slate-400 hover:text-red-600"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            )
          })}
          <p className="text-xs text-slate-500">시간을 누르면 열기/닫기가 바뀝니다. 숫자는 예약/정원입니다. 예약이 없는 시간만 삭제할 수 있습니다.</p>
        </div>
      )}
    </>
  )
}

function GenerateForm({ onGenerated, onError }: { onGenerated: (count: number) => Promise<void>; onError: (text: string) => void }) {
  const today = todayKst()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(addDays(today, 27))
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5])
  const [start, setStart] = useState('10:00')
  const [end, setEnd] = useState('18:00')
  const [interval, setIntervalMinutes] = useState('30')
  const [useBreak, setUseBreak] = useState(true)
  const [breakStart, setBreakStart] = useState('12:00')
  const [breakEnd, setBreakEnd] = useState('13:00')
  const [capacity, setCapacity] = useState('1')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (weekdays.length === 0) return onError('요일을 하나 이상 선택해 주세요.')
    setSaving(true)
    const { data, error } = await supabase.rpc('generate_consultation_slots', {
      p_from: from,
      p_to: to,
      p_weekdays: weekdays,
      p_start: start,
      p_end: end,
      p_interval_minutes: Number(interval),
      p_breaks: useBreak ? [{ start: breakStart, end: breakEnd }] : [],
      p_capacity: Math.max(1, Number(capacity) || 1),
    })
    setSaving(false)
    if (error) return onError(/[가-힣]/.test(error.message) ? error.message : '상담 시간을 만들지 못했습니다.')
    await onGenerated(data ?? 0)
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="font-semibold text-slate-900">상담 시간 한꺼번에 만들기</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="시작일">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="종료일">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label="상담 시작 시각">
            <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="상담 종료 시각">
            <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
          <Field label="간격(분)">
            <Input type="number" min={10} max={240} step={5} value={interval} onChange={(e) => setIntervalMinutes(e.target.value)} />
          </Field>
          <Field label="시간당 동시 예약 수" hint="보통 1">
            <Input type="number" min={1} max={20} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">요일</legend>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_OPTIONS.map((w) => (
              <label key={w.value} className="flex items-center gap-1.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={weekdays.includes(w.value)}
                  onChange={(e) => setWeekdays(e.target.checked ? [...weekdays, w.value] : weekdays.filter((d) => d !== w.value))}
                />
                {w.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
            <input type="checkbox" className="size-4" checked={useBreak} onChange={(e) => setUseBreak(e.target.checked)} />
            점심시간 제외
          </label>
          {useBreak && (
            <>
              <Field label="제외 시작">
                <Input type="time" value={breakStart} onChange={(e) => setBreakStart(e.target.value)} />
              </Field>
              <Field label="제외 끝">
                <Input type="time" value={breakEnd} onChange={(e) => setBreakEnd(e.target.value)} />
              </Field>
            </>
          )}
        </div>
        <Button type="submit" disabled={saving}>
          {saving ? '만드는 중…' : '상담 시간 만들기'}
        </Button>
      </form>
    </Card>
  )
}
