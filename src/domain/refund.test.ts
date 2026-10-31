import { describe, expect, it } from 'vitest'
import { daysBeforeStart, deductionRate, expectedRefund, type RefundRule } from './refund'

// 부록 B 기본 공제율 표
const RULES: RefundRule[] = [
  { min_days: 30, max_days: null, rate: 0 },
  { min_days: 20, max_days: 29, rate: 0.1 },
  { min_days: 10, max_days: 19, rate: 0.15 },
  { min_days: 8, max_days: 9, rate: 0.2 },
  { min_days: 1, max_days: 7, rate: 0.3 },
  { min_days: null, max_days: 0, rate: 0.5 },
]
const START = '2027-01-05'

describe('환불 공제율 — 취소일·출국일 기준 경계값', () => {
  it('출국까지 남은 일수(출국 당일 = 0, 연·월 경계)', () => {
    expect(daysBeforeStart('2027-01-05', START)).toBe(0)
    expect(daysBeforeStart('2027-01-04', START)).toBe(1)
    expect(daysBeforeStart('2026-12-06', START)).toBe(30)
    expect(daysBeforeStart('2027-01-06', START)).toBe(-1)
  })

  it.each([
    ['2026-12-06', 30, 0],
    ['2026-12-07', 29, 0.1],
    ['2026-12-16', 20, 0.1],
    ['2026-12-17', 19, 0.15],
    ['2026-12-26', 10, 0.15],
    ['2026-12-27', 9, 0.2],
    ['2026-12-28', 8, 0.2],
    ['2026-12-29', 7, 0.3],
    ['2027-01-04', 1, 0.3],
    ['2027-01-05', 0, 0.5],
    ['2027-01-07', -2, 0.5],
  ])('%s 취소(출국 %i일 전) → 공제율 %f', (requested, days, rate) => {
    expect(daysBeforeStart(requested, START)).toBe(days)
    expect(deductionRate(RULES, days)).toBe(rate)
  })

  it('고객 사정: 납부액 - 총 참가비 × 공제율 (음수면 0)', () => {
    const r = expectedRefund({ reason: 'customer', rules: RULES, requestedOn: '2026-12-20', startDate: START, totalPrice: 5_000_000, paidTotal: 5_000_000 })
    expect(r).toEqual({ days: 16, rate: 0.15, deduction: 750_000, expected: 4_250_000 })
    const small = expectedRefund({ reason: 'customer', rules: RULES, requestedOn: START, startDate: START, totalPrice: 5_000_000, paidTotal: 1_000_000 })
    expect(small.expected).toBe(0)
  })

  it('30일 전 취소: 납부한 예약금 전액 환불', () => {
    expect(expectedRefund({ reason: 'customer', rules: RULES, requestedOn: '2026-11-01', startDate: START, totalPrice: 5_000_000, paidTotal: 1_000_000 }).expected).toBe(
      1_000_000,
    )
  })

  it('회사 사정 전액, 불가항력·중도 귀국은 담당자가 결정', () => {
    expect(expectedRefund({ reason: 'company', rules: RULES, requestedOn: START, startDate: START, totalPrice: 5_000_000, paidTotal: 3_000_000 }).expected).toBe(3_000_000)
    expect(expectedRefund({ reason: 'force_majeure', rules: RULES, requestedOn: START, startDate: START, totalPrice: 5_000_000, paidTotal: 3_000_000 }).expected).toBe(null)
  })
})
