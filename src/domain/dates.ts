// 날짜 문자열(YYYY-MM-DD, KST 기준 날짜) 계산 — 시간대 영향을 받지 않도록 UTC 자정으로만 다룬다
const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토']

function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`)
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDays(date: string, days: number): string {
  const d = toUtc(date)
  d.setUTCDate(d.getUTCDate() + days)
  return fromUtc(d)
}

// ISO 요일: 1=월 … 7=일
export function isoWeekday(date: string): number {
  const day = toUtc(date).getUTCDay()
  return day === 0 ? 7 : day
}

export function startOfWeek(date: string): string {
  return addDays(date, 1 - isoWeekday(date))
}

export function weekdayKo(date: string): string {
  return WEEKDAYS_KO[toUtc(date).getUTCDay()]
}

// 예: 2027-01-02 → 2027.01.02(토)
export function formatDateKo(date: string): string {
  return `${date.replaceAll('-', '.')}(${weekdayKo(date)})`
}

// KST 하루의 시작·끝(다음날 0시)을 timestamptz 비교용 ISO 문자열로
export function kstDayStartIso(date: string): string {
  return `${date}T00:00:00+09:00`
}

// 예: 2027-01-05 → 2027년 1월 5일(화) — 학부모 안내용 (DB format_date_ko 와 같은 형식)
export function formatDateLongKo(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return `${y}년 ${m}월 ${d}일(${weekdayKo(date)})`
}
