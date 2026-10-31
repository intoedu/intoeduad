// 캘린더·D-Day 계산 (KST 날짜 문자열)
import { addDays, daysBetween, weekdayKo } from './dates'

// 월 달력: 일요일 시작 6주(42일) 고정 — 달마다 높이가 바뀌지 않게
export function monthGrid(month: string): string[][] {
  const first = `${month}-01`
  const dow = new Date(`${first}T00:00:00Z`).getUTCDay()
  const start = addDays(first, -dow)
  return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)))
}

// 주 보기: 일요일 시작 7일
export function weekDays(date: string): string[] {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay()
  const start = addDays(date, -dow)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const t = y * 12 + (m - 1) + delta
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}

export function ddayLabel(date: string, today: string): string {
  const d = daysBetween(today, date)
  if (d === 0) return 'D-Day'
  return d > 0 ? `D-${d}` : `D+${-d}`
}

export function dayHeading(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  return `${m}월 ${d}일(${weekdayKo(date)})`
}
