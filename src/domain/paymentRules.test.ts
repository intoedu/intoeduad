import { describe, expect, it } from 'vitest'
import {
  commissionNoticeDeadline,
  computeDueDate,
  computeSchedule,
  describeRule,
  destroyDate,
  validateRules,
  type PaymentRule,
} from './paymentRules'

const START = '2027-01-02'

const deposit: PaymentRule = { kind: 'deposit', label: '예약금', amount: 1_000_000, due_rule_type: 'after_registration', due_fixed_date: null, due_offset_days: 7 }
const balance: PaymentRule = { kind: 'balance', label: '잔금', amount: 4_990_000, due_rule_type: 'before_start', due_fixed_date: null, due_offset_days: 30 }
const flight: PaymentRule = { kind: 'extra', label: '항공권', amount: 1_800_000, due_rule_type: 'fixed', due_fixed_date: '2026-11-20', due_offset_days: null }

describe('computeDueDate', () => {
  it('고정 날짜', () => {
    expect(computeDueDate(flight, '2026-11-01', START)).toBe('2026-11-20')
  })
  it('신청일 기준 +N일 (월말·연말 경계)', () => {
    expect(computeDueDate(deposit, '2026-12-28', START)).toBe('2027-01-04')
    expect(computeDueDate(deposit, '2026-11-24', START)).toBe('2026-12-01')
  })
  it('출국일 기준 -N일', () => {
    expect(computeDueDate(balance, '2026-11-01', START)).toBe('2026-12-03')
  })
  it('0일은 당일', () => {
    expect(computeDueDate({ ...deposit, due_offset_days: 0 }, '2026-11-01', START)).toBe('2026-11-01')
  })
})

describe('computeSchedule', () => {
  it('예약금 → 잔금 → 추가 항목 순서', () => {
    const s = computeSchedule([flight, balance, deposit], '2026-11-01', START)
    expect(s.map((x) => x.kind)).toEqual(['deposit', 'balance', 'extra'])
    expect(s.map((x) => x.due_date)).toEqual(['2026-11-08', '2026-12-03', '2026-11-20'])
  })
  it('이미 지난 기한은 신청일로 당기고 표시', () => {
    const s = computeSchedule([deposit, balance, flight], '2026-12-10', START)
    const b = s.find((x) => x.kind === 'balance')!
    expect(b.due_date).toBe('2026-12-10')
    expect(b.adjusted).toBe(true)
    expect(s.find((x) => x.kind === 'extra')!.adjusted).toBe(true)
    expect(s.find((x) => x.kind === 'deposit')!.adjusted).toBe(false)
  })
})

describe('validateRules', () => {
  it('정상', () => {
    expect(validateRules([deposit, balance, flight], 5_990_000, START)).toEqual([])
  })
  it('합계 불일치', () => {
    expect(validateRules([deposit, balance], 6_000_000, START)[0]).toContain('총 참가비')
  })
  it('잔금 누락', () => {
    expect(validateRules([{ ...deposit, amount: 5_990_000 }], 5_990_000, START)).toContain('잔금(원금) 규칙을 입력해 주세요.')
  })
  it('고정 기한이 출국일보다 늦음', () => {
    expect(validateRules([deposit, balance, { ...flight, due_fixed_date: '2027-01-05' }], 5_990_000, START)).toContain('항공권: 기한이 출국일보다 늦습니다.')
  })
})

describe('기타 날짜', () => {
  it('규칙 설명', () => {
    expect(describeRule(deposit)).toBe('신청 후 7일 이내')
    expect(describeRule(balance)).toBe('출국 30일 전까지')
  })
  it('파기 예정일 = 종료일 + 5일', () => {
    expect(destroyDate('2027-01-29', 5)).toBe('2027-02-03')
  })
  it('커미션 고지 기한 = 출국 30일 전 (매뉴얼 예: 2027.01.02 출발 → 2026.12.03)', () => {
    expect(commissionNoticeDeadline('2027-01-02')).toBe('2026-12-03')
  })
})
