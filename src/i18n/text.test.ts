import { describe, expect, it } from 'vitest'
import { errorText, formatDateLong, formatMoney, optionText } from './text'
import { inflowText, validateInflow, validateKakao } from '../domain/formSettings'

describe('신청서 영어 표기', () => {
  it('날짜·금액', () => {
    expect(formatDateLong('2027-01-02', 'ko')).toBe('2027년 1월 2일(토)')
    expect(formatDateLong('2027-01-02', 'en')).toBe('Sat, Jan 2, 2027')
    expect(formatMoney(1500000, 'ko')).toBe('1,500,000원')
    expect(formatMoney(1500000, 'en')).toBe('KRW 1,500,000')
  })

  it('고르는 항목은 저장 값(한국어)을 바꾸지 않고 보이는 글자만 바꾼다', () => {
    expect(optionText('중2', 'en')).toBe('Grade 8 (Middle school)')
    expect(optionText('중2', 'ko')).toBe('중2')
    expect(optionText('관리자가 만든 보기', 'en')).toBe('관리자가 만든 보기')
  })

  it('서버 오류 코드 → 영어 문구, 한국어 화면은 서버 문구 그대로', () => {
    expect(errorText('SLOT_UNAVAILABLE', '마감', 'ko')).toBe('마감')
    expect(errorText('SLOT_UNAVAILABLE', '마감', 'en')).toMatch(/just taken/)
    expect(errorText(undefined, '알 수 없음', 'en')).toMatch(/try again/)
  })

  it('기본 유입 경로 이름만 영어로, 새로 만든 경로 이름은 그대로', () => {
    expect(inflowText('학원 소개', 'en')).toBe('Referred by an academy')
    expect(inflowText('학원 소개', 'ko')).toBe('학원 소개')
    expect(inflowText('동네 전단지', 'en')).toBe('동네 전단지')
  })

  it('검사 문구도 영어로', () => {
    expect(validateKakao({ use: '', altPhone: '', altContact: '' }, 'en')).toMatch(/KakaoTalk/)
    expect(validateInflow({ label: 'x', channels: [] }, { channelId: '', partnerId: '', contactId: '', detail: '' }, false, 'en')).toMatch(/heard about us/)
  })
})
