// 등록 상태 자동 갱신 규칙 (DB compute_registration_status 와 같다 — PLAN 결정 5)
import { addDays } from './dates'

export type RegistrationStatus =
  | 'received'
  | 'deposit_pending'
  | 'deposit_paid'
  | 'balance_pending'
  | 'confirmed'
  | 'waitlisted'
  | 'canceled'
  | 'refunded'

export type StatusSchedule = { kind: 'deposit' | 'balance' | 'extra'; amount_due: number; paid_amount: number; due_date: string; canceled?: boolean }

const AUTO: RegistrationStatus[] = ['deposit_pending', 'deposit_paid', 'balance_pending', 'confirmed']

export function nextRegistrationStatus(input: {
  current: RegistrationStatus
  schedules: StatusSchedule[]
  attributionConfirmed: boolean
  today: string
  balancePendingDays?: number
}): RegistrationStatus {
  if (!AUTO.includes(input.current)) return input.current
  const active = input.schedules.filter((s) => !s.canceled)
  const deposits = active.filter((s) => s.kind === 'deposit')
  const balances = active.filter((s) => s.kind === 'balance')
  const paid = (s: StatusSchedule) => s.paid_amount >= s.amount_due
  const depPaid = deposits.every(paid)
  const core = [...deposits, ...balances]
  const allPaid = core.length > 0 && core.every(paid)
  const balDue = balances.map((s) => s.due_date).sort()[0]
  const days = input.balancePendingDays ?? 14

  if (allPaid && input.attributionConfirmed) return 'confirmed'
  if (depPaid && (allPaid || (balDue !== undefined && balDue <= addDays(input.today, days)))) return 'balance_pending'
  if (depPaid) return 'deposit_paid'
  return 'deposit_pending'
}

// 완납했지만 소개 경로 확인이 남아 확정되지 않은 경우(화면 안내용)
export function waitingAttribution(status: RegistrationStatus, corePaid: boolean, attributionConfirmed: boolean): boolean {
  return status === 'balance_pending' && corePaid && !attributionConfirmed
}
