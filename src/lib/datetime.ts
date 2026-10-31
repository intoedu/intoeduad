import { formatInTimeZone } from 'date-fns-tz'

export const KST = 'Asia/Seoul'

// 모든 화면 표시는 KST 기준
export function formatKst(value: string | Date | null | undefined, pattern = 'yyyy-MM-dd HH:mm'): string {
  if (!value) return ''
  return formatInTimeZone(value, KST, pattern)
}

export function todayKst(): string {
  return formatInTimeZone(new Date(), KST, 'yyyy-MM-dd')
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

// 예: 2026.11.03(화) 10:00
export function formatKstWithDay(value: string | Date | null | undefined, withTime = true): string {
  if (!value) return ''
  const day = WEEKDAYS[Number(formatInTimeZone(value, KST, 'i')) % 7]
  return `${formatInTimeZone(value, KST, 'yyyy.MM.dd')}(${day})${withTime ? ` ${formatInTimeZone(value, KST, 'HH:mm')}` : ''}`
}

// <input type="datetime-local"> 값(KST로 해석) → ISO
export function kstLocalToIso(local: string): string {
  return new Date(`${local}:00+09:00`).toISOString()
}

export function isoToKstLocal(iso: string | null | undefined): string {
  return iso ? formatInTimeZone(iso, KST, "yyyy-MM-dd'T'HH:mm") : ''
}
