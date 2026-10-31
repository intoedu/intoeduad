import { describe, expect, it } from 'vitest'
import { formatDateLongKo } from './dates'
import { formatWon, isValidBirthDate, isValidEmail, isValidEnglishName, maskName, normalizeEnglishName } from './registration'

describe('등록 신청서 입력 검증', () => {
  it('영문 이름은 대문자·한 칸 공백으로 정리', () => {
    expect(normalizeEnglishName('  lee   bada ')).toBe('LEE BADA')
    expect(isValidEnglishName('lee bada')).toBe(true)
    expect(isValidEnglishName('KIM-PARK JI')).toBe(true)
    expect(isValidEnglishName('이바다')).toBe(false)
    expect(isValidEnglishName('')).toBe(false)
    expect(isValidEnglishName('LEE1')).toBe(false)
  })

  it('이메일 형식', () => {
    expect(isValidEmail('mom@example.com')).toBe(true)
    expect(isValidEmail('mom@example')).toBe(false)
    expect(isValidEmail('mom example.com')).toBe(false)
  })

  it('생년월일: 없는 날짜·미래·너무 이른 날짜는 거부', () => {
    expect(isValidBirthDate('2015-03-02', '2026-10-31')).toBe(true)
    expect(isValidBirthDate('2015-02-30', '2026-10-31')).toBe(false)
    expect(isValidBirthDate('2026-11-01', '2026-10-31')).toBe(false)
    expect(isValidBirthDate('2026-10-31', '2026-10-31')).toBe(true)
    expect(isValidBirthDate('1949-12-31', '2026-10-31')).toBe(false)
    expect(isValidBirthDate('2015-3-2', '2026-10-31')).toBe(false)
  })

  it('금액·날짜 표기', () => {
    expect(formatWon(1000000)).toBe('1,000,000원')
    expect(formatDateLongKo('2027-01-05')).toBe('2027년 1월 5일(화)')
    expect(formatDateLongKo('2027-02-04')).toBe('2027년 2월 4일(목)')
  })

  it('학원 안내용 이름 가림', () => {
    expect(maskName('홍길동')).toBe('홍*동')
    expect(maskName('김하')).toBe('김*')
    expect(maskName('남궁민수')).toBe('남**수')
    expect(maskName('이')).toBe('이')
  })
})
