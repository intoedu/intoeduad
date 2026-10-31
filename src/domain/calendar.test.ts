import { describe, expect, it } from 'vitest'
import { ddayLabel, monthGrid, shiftMonth, weekDays } from './calendar'

describe('캘린더 계산', () => {
  it('월 달력: 일요일 시작 6주, 2027년 2월', () => {
    const g = monthGrid('2027-02')
    expect(g).toHaveLength(6)
    expect(g[0][0]).toBe('2027-01-31')
    expect(g[0][1]).toBe('2027-02-01')
    expect(g[5][6]).toBe('2027-03-13')
  })
  it('주 보기: 일요일 시작', () => {
    expect(weekDays('2026-11-04')).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'])
  })
  it('월 이동(연도 경계)', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2027-01', -1)).toBe('2026-12')
  })
  it('D-Day 표시', () => {
    expect(ddayLabel('2026-11-07', '2026-10-31')).toBe('D-7')
    expect(ddayLabel('2026-10-31', '2026-10-31')).toBe('D-Day')
    expect(ddayLabel('2026-10-29', '2026-10-31')).toBe('D+2')
  })
})
