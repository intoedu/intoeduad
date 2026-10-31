import { describe, expect, it } from 'vitest'
import { nextRegistrationStatus, waitingAttribution, type StatusSchedule } from './registrationStatus'

const dep = (paid: number): StatusSchedule => ({ kind: 'deposit', amount_due: 1_000_000, paid_amount: paid, due_date: '2026-11-07' })
const bal = (paid: number, due = '2026-12-06'): StatusSchedule => ({ kind: 'balance', amount_due: 4_000_000, paid_amount: paid, due_date: due })
const base = { current: 'deposit_pending' as const, attributionConfirmed: true, today: '2026-11-01' }

describe('등록 상태 자동 갱신', () => {
  it('직원 처리 상태(신청 접수·대기·취소·환불)는 바꾸지 않음', () => {
    for (const current of ['received', 'waitlisted', 'canceled', 'refunded'] as const) {
      expect(nextRegistrationStatus({ ...base, current, schedules: [dep(1_000_000), bal(4_000_000)] })).toBe(current)
    }
  })
  it('예약금 미납 → 예약금 대기, 일부 납부도 대기', () => {
    expect(nextRegistrationStatus({ ...base, schedules: [dep(0), bal(0)] })).toBe('deposit_pending')
    expect(nextRegistrationStatus({ ...base, schedules: [dep(500_000), bal(0)] })).toBe('deposit_pending')
  })
  it('예약금 완납 → 예약금 완료, 잔금 기한 14일 이내면 잔금 대기', () => {
    expect(nextRegistrationStatus({ ...base, schedules: [dep(1_000_000), bal(0, '2026-11-16')] })).toBe('deposit_paid')
    expect(nextRegistrationStatus({ ...base, schedules: [dep(1_000_000), bal(0, '2026-11-15')] })).toBe('balance_pending')
  })
  it('예약금+잔금 완납 + 소개 경로 확인 → 등록 확정', () => {
    expect(nextRegistrationStatus({ ...base, schedules: [dep(1_000_000), bal(4_000_000)] })).toBe('confirmed')
  })
  it('완납이어도 소개 경로 확인 전이면 잔금 대기로 두고 안내', () => {
    expect(nextRegistrationStatus({ ...base, attributionConfirmed: false, schedules: [dep(1_000_000), bal(4_000_000)] })).toBe('balance_pending')
    expect(waitingAttribution('balance_pending', true, false)).toBe(true)
  })
  it('추가 항목(항공권)은 확정 조건에 넣지 않고, 취소된 일정은 무시', () => {
    const extra: StatusSchedule = { kind: 'extra', amount_due: 1_500_000, paid_amount: 0, due_date: '2026-12-01' }
    expect(nextRegistrationStatus({ ...base, schedules: [dep(1_000_000), bal(4_000_000), extra] })).toBe('confirmed')
    expect(nextRegistrationStatus({ ...base, schedules: [{ ...dep(0), canceled: true }, bal(4_000_000)] })).toBe('confirmed')
  })
  it('무효 처리로 납부가 줄면 다시 내려감', () => {
    expect(nextRegistrationStatus({ ...base, current: 'confirmed', schedules: [dep(1_000_000), bal(0, '2027-01-01')] })).toBe('deposit_paid')
  })
})
