// 캠프별 납부 규칙 → 실제 납부 기한 계산 (모든 날짜는 KST 기준 YYYY-MM-DD)
// 이 파일은 외부 의존성이 없어야 한다: 등록 신청 Edge Function(Deno)에서도 같은 계산을 쓴다.
import { addDays } from './dates'

export type DueRuleType = 'fixed' | 'after_registration' | 'before_start'
export type PaymentKind = 'deposit' | 'balance' | 'extra'

export type PaymentRule = {
  id?: string
  kind: PaymentKind
  label: string
  amount: number
  due_rule_type: DueRuleType
  due_fixed_date: string | null
  due_offset_days: number | null
  sort?: number
}

export type ScheduledPayment = {
  rule_id?: string
  kind: PaymentKind
  label: string
  amount: number
  due_date: string
  // 계산된 기한이 신청일보다 이르면 신청일로 당긴다(이미 지난 기한)
  adjusted: boolean
}

export function computeDueDate(rule: Pick<PaymentRule, 'due_rule_type' | 'due_fixed_date' | 'due_offset_days'>, registeredOn: string, startDate: string): string {
  switch (rule.due_rule_type) {
    case 'fixed':
      if (!rule.due_fixed_date) throw new Error('고정 날짜가 없습니다')
      return rule.due_fixed_date
    case 'after_registration':
      return addDays(registeredOn, rule.due_offset_days ?? 0)
    case 'before_start':
      return addDays(startDate, -(rule.due_offset_days ?? 0))
  }
}

const KIND_ORDER: Record<PaymentKind, number> = { deposit: 0, balance: 1, extra: 2 }

export function computeSchedule(rules: PaymentRule[], registeredOn: string, startDate: string): ScheduledPayment[] {
  return [...rules]
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (a.sort ?? 0) - (b.sort ?? 0))
    .map((rule) => {
      const raw = computeDueDate(rule, registeredOn, startDate)
      const adjusted = raw < registeredOn
      return {
        rule_id: rule.id,
        kind: rule.kind,
        label: rule.label,
        amount: rule.amount,
        due_date: adjusted ? registeredOn : raw,
        adjusted,
      }
    })
}

// 규칙 설명 (내부 화면용)
export function describeRule(rule: Pick<PaymentRule, 'due_rule_type' | 'due_fixed_date' | 'due_offset_days'>): string {
  switch (rule.due_rule_type) {
    case 'fixed':
      return `${rule.due_fixed_date ?? '날짜 미정'}까지`
    case 'after_registration':
      return `신청 후 ${rule.due_offset_days ?? 0}일 이내`
    case 'before_start':
      return `출국 ${rule.due_offset_days ?? 0}일 전까지`
  }
}

// 예약금 + 잔금 = 참가비, 추가 항목(항공권 등)은 별도
export function participationTotal(rules: PaymentRule[]): number {
  return rules.filter((r) => r.kind !== 'extra').reduce((sum, r) => sum + r.amount, 0)
}

export function validateRules(rules: PaymentRule[], totalPrice: number, startDate: string): string[] {
  const errors: string[] = []
  const deposit = rules.filter((r) => r.kind === 'deposit')
  const balance = rules.filter((r) => r.kind === 'balance')
  if (deposit.length > 1) errors.push('예약금은 하나만 둘 수 있습니다.')
  if (balance.length > 1) errors.push('잔금은 하나만 둘 수 있습니다.')
  if (balance.length === 0) errors.push('잔금(원금) 규칙을 입력해 주세요.')
  if (participationTotal(rules) !== totalPrice) {
    errors.push(`예약금과 잔금의 합(${participationTotal(rules).toLocaleString('ko-KR')}원)이 총 참가비(${totalPrice.toLocaleString('ko-KR')}원)와 다릅니다.`)
  }
  for (const r of rules) {
    if (r.amount < 0) errors.push(`${r.label}: 금액이 올바르지 않습니다.`)
    if (r.due_rule_type === 'fixed' && !r.due_fixed_date) errors.push(`${r.label}: 날짜를 입력해 주세요.`)
    if (r.due_rule_type !== 'fixed' && (r.due_offset_days === null || r.due_offset_days < 0)) errors.push(`${r.label}: 일수를 입력해 주세요.`)
    if (r.due_rule_type === 'fixed' && r.due_fixed_date && startDate && r.due_fixed_date > startDate) {
      errors.push(`${r.label}: 기한이 출국일보다 늦습니다.`)
    }
  }
  return errors
}

// 개인정보 파기 예정일 = 종료일 + N일
export function destroyDate(endDate: string, days: number): string {
  return addDays(endDate, days)
}

// 커미션 사전 고지 기한 = 프로그램 개시 30일 전 (협약서 제8조)
export function commissionNoticeDeadline(startDate: string): string {
  return addDays(startDate, -30)
}
