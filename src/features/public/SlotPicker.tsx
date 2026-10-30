import { useEffect, useMemo, useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { ko } from 'react-day-picker/locale'
import 'react-day-picker/style.css'
import { addDays } from '../../domain/dates'
import { formatKst, todayKst } from '../../lib/datetime'
import { listAvailableSlots, type PublicSlot } from './publicApi'

const RANGE_DAYS = 60

// 날짜를 고르면 그날 열려 있는 상담 시간만 보여 준다 (이미 찬 시간·지난 시간은 나오지 않음)
export function SlotPicker({
  value,
  onChange,
  reloadKey,
}: {
  value: PublicSlot | null
  onChange: (slot: PublicSlot | null) => void
  reloadKey: number
}) {
  const [slots, setSlots] = useState<PublicSlot[] | null>(null)
  const [day, setDay] = useState<string | null>(value ? formatKst(value.starts_at, 'yyyy-MM-dd') : null)

  useEffect(() => {
    const from = todayKst()
    listAvailableSlots(from, addDays(from, RANGE_DAYS)).then(setSlots)
  }, [reloadKey])

  const byDay = useMemo(() => {
    const map = new Map<string, PublicSlot[]>()
    for (const s of slots ?? []) {
      const key = formatKst(s.starts_at, 'yyyy-MM-dd')
      map.set(key, [...(map.get(key) ?? []), s])
    }
    return map
  }, [slots])

  if (!slots) return <p className="text-sm text-slate-500">상담 가능한 시간을 불러오는 중…</p>
  if (slots.length === 0) {
    return (
      <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
        지금은 예약 가능한 상담 시간이 없습니다. 신청만 남겨 주시면 담당자가 연락드립니다.
      </p>
    )
  }

  const today = todayKst()
  const toDate = (d: string) => new Date(`${d}T00:00:00`)
  const toKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const daySlots = day ? (byDay.get(day) ?? []) : []
  // 예약 가능한 첫 날이 있는 달부터 보여 준다 (월말에 열면 빈 달만 보이는 문제 방지)
  const firstAvailable = [...byDay.keys()].sort()[0]

  return (
    <div className="space-y-4">
      <div className="flex justify-center overflow-x-auto">
        <DayPicker
          mode="single"
          locale={ko}
          selected={day ? toDate(day) : undefined}
          onSelect={(d) => {
            const key = d ? toKey(d) : null
            setDay(key)
            if (value && key !== formatKst(value.starts_at, 'yyyy-MM-dd')) onChange(null)
          }}
          defaultMonth={toDate(day ?? firstAvailable ?? today)}
          startMonth={toDate(today)}
          endMonth={toDate(addDays(today, RANGE_DAYS))}
          disabled={(d) => !byDay.has(toKey(d))}
          modifiers={{ available: (d) => byDay.has(toKey(d)) }}
          modifiersClassNames={{ available: 'font-semibold text-brand-700' }}
        />
      </div>

      {day ? (
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">{formatKst(`${day}T12:00:00+09:00`, 'M월 d일')} 상담 가능한 시간</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {daySlots.map((s) => {
              const selected = value?.id === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onChange(selected ? null : s)}
                  className={`rounded-lg px-2 py-2.5 text-sm ring-1 ${
                    selected ? 'bg-brand-600 font-semibold text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-300'
                  }`}
                >
                  {formatKst(s.starts_at, 'HH:mm')}
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <p className="text-center text-sm text-slate-500">진하게 표시된 날짜를 눌러 시간을 골라 주세요.</p>
      )}
    </div>
  )
}
