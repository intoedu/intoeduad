import { describe, expect, it } from 'vitest'
import { agencyFee, agencyServiceLabels, isValidPassportName, isValidPassportNo, normalizePassportName, normalizePassportNo } from './agency'

describe('항공권·ESTA·보험 대행료', () => {
  it('1개 3만·2개 5만·3개 6만 (기본)', () => {
    expect([0, 1, 2, 3].map((n) => agencyFee(n))).toEqual([0, 30000, 50000, 60000])
  })
  it('설정 금액을 따른다', () => {
    expect(agencyFee(2, { '1': 40000, '2': 70000, '3': 90000 })).toBe(70000)
  })
  it('항목 이름', () => {
    expect(agencyServiceLabels(['esta', 'flight'])).toBe('항공권·ESTA')
  })
})

describe('여권 정보 입력', () => {
  it('영문 이름: 대문자·공백 정리', () => {
    expect(normalizePassportName('  hong   gil-dong ')).toBe('HONG GIL-DONG')
    expect(isValidPassportName('hong gildong')).toBe(true)
    expect(isValidPassportName('홍길동')).toBe(false)
  })
  it('여권번호: 공백 제거·대문자, 영문·숫자 7~12자', () => {
    expect(normalizePassportNo('m1234 5678')).toBe('M12345678')
    expect(isValidPassportNo('M12345678')).toBe(true)
    expect(isValidPassportNo('M12-345')).toBe(false)
  })
})
