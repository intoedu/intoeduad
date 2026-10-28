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
