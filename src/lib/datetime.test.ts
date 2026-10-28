import { describe, expect, it } from 'vitest'
import { formatKst } from './datetime'

describe('formatKst', () => {
  it('UTC 시각을 KST로 표시한다', () => {
    expect(formatKst('2026-12-31T15:30:00Z')).toBe('2027-01-01 00:30')
  })

  it('KST 자정 직전 경계', () => {
    expect(formatKst('2026-12-31T14:59:59Z', 'yyyy-MM-dd')).toBe('2026-12-31')
  })

  it('빈 값은 빈 문자열', () => {
    expect(formatKst(null)).toBe('')
  })
})
