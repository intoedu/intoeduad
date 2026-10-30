import { describe, expect, it } from 'vitest'
import { formatBusinessNo, formatPhone, isValidMobile, normalizePhone } from './phone'

describe('phone', () => {
  it('숫자만 남긴다', () => {
    expect(normalizePhone('010-1234 5678')).toBe('01012345678')
  })

  it('휴대폰 형식 검증', () => {
    expect(isValidMobile('01012345678')).toBe(true)
    expect(isValidMobile('0212345678')).toBe(false)
  })

  it('표시 형식', () => {
    expect(formatPhone('01012345678')).toBe('010-1234-5678')
    expect(formatPhone('0313342414')).toBe('031-334-2414')
    expect(formatPhone('0212345678')).toBe('02-1234-5678')
    expect(formatPhone('021234567')).toBe('02-123-4567')
  })

  it('사업자등록번호 표시', () => {
    expect(formatBusinessNo('1234567890')).toBe('123-45-67890')
  })
})
