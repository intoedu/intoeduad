import { describe, expect, it } from 'vitest'
import { addBusinessDays, commissionDueDate } from './businessDays'

// 2027 설 연휴(2/6~9) 포함
const H = new Set(['2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09', '2027-03-01'])

describe('영업일·커미션 지급 예정일', () => {
  it('주말을 건너뜀 (금 + 1영업일 = 월)', () => {
    expect(addBusinessDays('2027-01-08', 1, new Set())).toBe('2027-01-11')
  })
  it('설 연휴·대체공휴일을 건너뜀', () => {
    // 2/5(금) 완납 → 2/10(수)부터 영업일 1
    expect(addBusinessDays('2027-02-05', 1, H)).toBe('2027-02-10')
    expect(addBusinessDays('2027-02-05', 10, H)).toBe('2027-02-23')
  })
  it('0일이면 그날', () => {
    expect(addBusinessDays('2027-02-05', 0, H)).toBe('2027-02-05')
  })
  it('캠프는 시작일, 유학은 완납일 후 영업일 10일', () => {
    expect(commissionDueDate({ programType: 'camp', startDate: '2027-01-05', fullyPaidOn: '2026-11-20', holidays: H })).toBe('2027-01-05')
    expect(commissionDueDate({ programType: 'study_abroad', startDate: '2027-08-20', fullyPaidOn: '2027-02-26', holidays: H })).toBe('2027-03-15')
  })
})
