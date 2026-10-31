// 취소·환불 예상액 계산 (DB cancel_registration·refund_deduction_rate 와 같다)
// - 출국까지 남은 일수: 출국일 - 취소 요청일 (출국 당일 = 0, 지나면 음수)
// - 공제 기준: 총 참가비(추가 항목 제외, PLAN 결정 7)
import { daysBetween } from './dates'

export type RefundRule = { min_days: number | null; max_days: number | null; rate: number }
export type RefundReason = 'customer' | 'company' | 'force_majeure' | 'mid_return'

export function daysBeforeStart(requestedOn: string, startDate: string): number {
  return daysBetween(requestedOn, startDate)
}

export function deductionRate(rules: RefundRule[], days: number): number | null {
  const rule = rules.find((r) => (r.min_days === null || days >= r.min_days) && (r.max_days === null || days <= r.max_days))
  return rule ? rule.rate : null
}

export function expectedRefund(input: {
  reason: RefundReason
  rules: RefundRule[]
  requestedOn: string
  startDate: string
  totalPrice: number
  paidTotal: number
}): { days: number; rate: number | null; deduction: number | null; expected: number | null } {
  const days = daysBeforeStart(input.requestedOn, input.startDate)
  if (input.reason === 'company') return { days, rate: 0, deduction: 0, expected: input.paidTotal }
  if (input.reason !== 'customer') return { days, rate: null, deduction: null, expected: null }
  const rate = deductionRate(input.rules, days) ?? 0
  const deduction = Math.round(input.totalPrice * rate)
  return { days, rate, deduction, expected: Math.max(input.paidTotal - deduction, 0) }
}
