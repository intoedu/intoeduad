import { describe, expect, it } from 'vitest'
import { addDays, formatDateKo, isoWeekday, startOfWeek } from './dates'

describe('dates', () => {
  it('날짜 더하기 (월말·연말·윤년)', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28')
  })

  it('ISO 요일', () => {
    expect(isoWeekday('2026-11-02')).toBe(1) // 월
    expect(isoWeekday('2026-11-08')).toBe(7) // 일
  })

  it('주의 시작(월요일)', () => {
    expect(startOfWeek('2026-11-08')).toBe('2026-11-02')
    expect(startOfWeek('2026-11-02')).toBe('2026-11-02')
  })

  it('한국어 날짜 표시', () => {
    expect(formatDateKo('2027-01-02')).toBe('2027.01.02(토)')
  })
})
