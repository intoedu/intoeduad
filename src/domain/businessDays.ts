// 영업일 계산 (DB add_business_days 와 같다): 시작일 다음 날부터 주말·공휴일을 빼고 n번째 영업일
import { addDays, isoWeekday } from './dates'

export function addBusinessDays(from: string, days: number, holidays: ReadonlySet<string>): string {
  let d = from
  let left = Math.max(days, 0)
  while (left > 0) {
    d = addDays(d, 1)
    if (isoWeekday(d) < 6 && !holidays.has(d)) left -= 1
  }
  return d
}

// 커미션 지급 예정일 (PLAN C2·C3): 캠프 = 캠프 시작일, 유학 = 완납일 후 영업일 N일
export function commissionDueDate(input: { programType: 'camp' | 'study_abroad'; startDate: string; fullyPaidOn: string; holidays: ReadonlySet<string>; businessDays?: number }): string {
  return input.programType === 'camp' ? input.startDate : addBusinessDays(input.fullyPaidOn, input.businessDays ?? 10, input.holidays)
}
