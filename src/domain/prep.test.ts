import { describe, expect, it } from 'vitest'
import { describeAnchor, isPrepComplete, prepDueDate, prepDueState, prepProgress, reviewMissing, PREP_REVIEW_KEYS } from './prep'

describe('prepDueDate', () => {
  it('모집 시작 7일 전 (월 경계)', () => {
    expect(prepDueDate('recruit_start', -7, '2027-03-02', '2027-07-20')).toBe('2027-02-23')
  })
  it('출국 30일 전', () => {
    expect(prepDueDate('start', -30, null, '2027-07-20')).toBe('2027-06-20')
  })
  it('모집 시작일이 없으면 계산하지 않음', () => {
    expect(prepDueDate('recruit_start', -7, null, '2027-07-20')).toBeNull()
  })
  it('마감 없음', () => {
    expect(prepDueDate('none', 0, '2027-03-02', '2027-07-20')).toBeNull()
  })
})

describe('describeAnchor', () => {
  it('한국어 설명', () => {
    expect(describeAnchor('recruit_start', -7)).toBe('모집 시작 7일 전')
    expect(describeAnchor('recruit_start', 0)).toBe('모집 시작일')
    expect(describeAnchor('start', -30)).toBe('출국 30일 전')
    expect(describeAnchor('start', 3)).toBe('출국 3일 후')
    expect(describeAnchor('none', 0)).toBe('마감 없음(필요 시)')
  })
})

describe('완료 판정·검수', () => {
  it('재확인 필요는 완료가 아님', () => {
    expect(isPrepComplete('distributed', false)).toBe(true)
    expect(isPrepComplete('distributed', true)).toBe(false)
    expect(isPrepComplete('reviewing', false)).toBe(false)
    expect(isPrepComplete('not_applicable', false)).toBe(true)
  })
  it('검수 항목 누락', () => {
    expect(reviewMissing({})).toHaveLength(PREP_REVIEW_KEYS.length)
    const all = Object.fromEntries(PREP_REVIEW_KEYS.map((k) => [k, true]))
    expect(reviewMissing(all)).toEqual([])
    expect(reviewMissing({ ...all, apply_qr: false })).toEqual(['apply_qr'])
  })
})

describe('prepDueState', () => {
  const today = '2027-02-20'
  it('지남·임박(D-7)·여유·완료', () => {
    expect(prepDueState('2027-02-19', today, false)).toBe('overdue')
    expect(prepDueState('2027-02-20', today, false)).toBe('soon')
    expect(prepDueState('2027-02-27', today, false)).toBe('soon')
    expect(prepDueState('2027-02-28', today, false)).toBe('upcoming')
    expect(prepDueState(null, today, false)).toBe('none')
    expect(prepDueState('2027-02-01', today, true)).toBe('complete')
  })
})

describe('prepProgress', () => {
  it('필수 항목 기준 준비율과 모집 전 남은 항목', () => {
    const p = prepProgress([
      { status: 'distributed', needs_recheck: false, required: true, gate_open: true },
      { status: 'distributed', needs_recheck: true, required: true, gate_open: true },
      { status: 'requested', needs_recheck: false, required: false, gate_open: false },
      { status: 'done', needs_recheck: false, required: true, gate_open: false },
    ])
    expect(p).toEqual({ done: 2, total: 3, gatePending: 1 })
  })
})
