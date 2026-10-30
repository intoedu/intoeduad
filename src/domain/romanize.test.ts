import { describe, expect, it } from 'vitest'
import { romanize, slugify, suggestContactCode, suggestPartnerCode } from './romanize'

describe('romanize', () => {
  it('기본 음절', () => {
    expect(romanize('대전')).toBe('daejeon')
    expect(romanize('수원')).toBe('suwon')
    expect(romanize('영통')).toBe('yeongtong')
    expect(romanize('인투')).toBe('intu')
  })

  it('한글이 아닌 문자는 그대로', () => {
    // 음절 단위 변환이라 연음(학원→hagwon)은 반영하지 않는다
    expect(romanize('A1 학원')).toBe('A1 hakwon')
  })
})

describe('slugify', () => {
  it('공백·기호를 하이픈으로, 앞뒤 하이픈 제거', () => {
    expect(slugify(' 대전 서구 / 인투! ')).toBe('daejeon-seogu-intu')
  })

  it('길이 제한 후 끝 하이픈 제거', () => {
    expect(slugify('가나다라마바사', 7)).toBe('ganadar')
    expect(slugify('ab cd', 3)).toBe('ab')
  })
})

describe('suggestPartnerCode', () => {
  it('지역 첫 단어 + 학원명(학원 접미사 제거)', () => {
    expect(suggestPartnerCode('대전 서구', '인투학원')).toBe('daejeon-intu')
    expect(suggestPartnerCode('수원', '해피 어학원')).toBe('suwon-haepi')
    expect(suggestPartnerCode('대전 유성구', '해피 영어학원')).toBe('daejeon-haepi')
  })

  it('지역이 없으면 학원명만', () => {
    expect(suggestPartnerCode('', '인투학원')).toBe('intu')
  })
})

describe('suggestContactCode', () => {
  it('이름 로마자', () => {
    expect(suggestContactCode('김상담')).toBe('gimsangdam')
  })
})
