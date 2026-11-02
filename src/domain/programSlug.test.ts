import { describe, expect, it } from 'vitest'
import { programSlug } from './programSlug'

describe('캠프 신청서 링크 주소 추천', () => {
  it('자주 쓰는 단어는 영어로 (띄어쓰기 없어도)', () => {
    expect(programSlug('미국스쿨링캠프')).toBe('usa-schooling-camp')
    expect(programSlug('미국 스쿨링 캠프')).toBe('usa-schooling-camp')
    expect(programSlug('필리핀 영어캠프')).toBe('philippines-english-camp')
    expect(programSlug('캐나다 조기유학')).toBe('canada-early-study-abroad')
  })
  it('기수·시즌: 계절은 영어, "1차·2기"는 숫자만', () => {
    expect(programSlug('미국스쿨링캠프 2027 겨울 1차')).toBe('usa-schooling-camp-2027-winter-1')
    expect(programSlug('호주 홈스테이 2027 여름 2기')).toBe('australia-homestay-2027-summer-2')
  })
  it('같은 단어는 한 번만(숫자는 유지)', () => {
    expect(programSlug('겨울 미국 스쿨링캠프 2027 겨울 1차')).toBe('winter-usa-schooling-camp-2027-1')
    expect(programSlug('2027 캠프 2027')).toBe('2027-camp-2027')
  })
  it('사전에 없는 한글은 로마자로', () => {
    expect(programSlug('미국 하버드 탐방')).toBe('usa-habeodeu-tour')
  })
  it('영문·숫자는 그대로 소문자로, 링크 규칙(영문 소문자·숫자·하이픈)을 지킴', () => {
    expect(programSlug('USA Camp! 2027')).toBe('usa-camp-2027')
    expect(programSlug('미국스쿨링캠프 2027 겨울 1차')).toMatch(/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/)
  })
  it('길이 제한', () => {
    expect(programSlug('미국 스쿨링 캠프', 10)).toBe('usa-school')
  })
})
