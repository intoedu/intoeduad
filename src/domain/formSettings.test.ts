import { describe, expect, it } from 'vitest'
import {
  cleanAnswers,
  fieldLabel,
  inflowPayload,
  kakaoPayload,
  leadModes,
  PARTNER_NOT_LISTED,
  savedAnswers,
  validateAnswers,
  validateInflow,
  validateKakao,
  type InflowConfig,
  type PublicQuestion,
} from './formSettings'

const Q: PublicQuestion[] = [
  { id: 'a', label: '연락 시간', help: null, type: 'dropdown', options: ['오전', '오후'], required: true },
  { id: 'b', label: '관심 국가', help: null, type: 'multi_choice', options: ['미국', '캐나다'], required: false },
  { id: 'c', label: '인원', help: null, type: 'number', options: [], required: false },
  { id: 'd', label: '동반', help: null, type: 'yes_no', options: [], required: false },
]

const CONFIG: InflowConfig = {
  label: '어디서 알게 되셨나요?',
  channels: [
    { id: 'p', label: '학원 소개', kind: 'partner', detail_label: null, detail_required: false },
    { id: 'i', label: '인스타그램', kind: 'plain', detail_label: null, detail_required: false },
    { id: 'o', label: '기타', kind: 'detail', detail_label: '알게 된 경로', detail_required: true },
  ],
}

describe('기본 질문 설정', () => {
  it('허용되지 않은 값은 기본값(상담 시간은 필수 불가)', () => {
    const m = leadModes({ grade: 'optional', slot: 'required', student_name: 'hidden' })
    expect(m.grade).toBe('optional')
    expect(m.slot).toBe('optional')
    expect(m.student_name).toBe('required')
    expect(m.relation).toBe('required')
  })
  it('바꾼 문구가 없으면 기본 문구', () => {
    expect(fieldLabel({ grade: { label: '  ' } }, 'grade', '학년')).toBe('학년')
    expect(fieldLabel({ grade: { label: '자녀 학년' } }, 'grade', '학년')).toBe('자녀 학년')
  })
})

describe('추가 질문 답변', () => {
  it('필수·형식 검사', () => {
    expect(validateAnswers(Q, {})).toEqual({ a: '답해 주세요.' })
    expect(validateAnswers(Q, {}, false)).toEqual({})
    expect(validateAnswers(Q, { a: '저녁', b: ['미국', '영국'], c: '두 명', d: '네' })).toEqual({
      a: '다시 골라 주세요.',
      b: '다시 골라 주세요.',
      c: '숫자만 입력해 주세요.',
      d: '다시 골라 주세요.',
    })
    expect(validateAnswers(Q, { a: '오후', b: ['캐나다'], c: '3', d: '예' })).toEqual({})
  })
  it('빈 답 빼고 보낸다', () => {
    expect(cleanAnswers(Q, { a: ' 오후 ', b: [], c: '', zz: 'x' })).toEqual({ a: '오후' })
  })
  it('저장된 답변 읽기', () => {
    expect(savedAnswers([{ id: 'a', label: '연락 시간', type: 'dropdown', value: '오후' }, null, { id: 'x' }])).toHaveLength(1)
    expect(savedAnswers(null)).toEqual([])
  })
})

describe('유입 경로', () => {
  const v = { channelId: '', partnerId: '', contactId: '', detail: '' }
  it('학원 링크로 오면 묻지 않는다', () => {
    expect(validateInflow(CONFIG, v, true)).toBeNull()
    expect(inflowPayload(CONFIG, { ...v, channelId: 'i' }, true)).toEqual({ inflow_channel_id: null, inflow_detail: null, partner_id: null, contact_id: null })
  })
  it('필수 검사', () => {
    expect(validateInflow(CONFIG, v, false)).toBe('알게 된 경로를 선택해 주세요.')
    expect(validateInflow(CONFIG, { ...v, channelId: 'p' }, false)).toBe('소개해 준 학원을 골라 주세요.')
    expect(validateInflow(CONFIG, { ...v, channelId: 'p', partnerId: PARTNER_NOT_LISTED }, false)).toBe('학원 이름을 적어 주세요.')
    expect(validateInflow(CONFIG, { ...v, channelId: 'o' }, false)).toBe('알게 된 경로을(를) 적어 주세요.')
    expect(validateInflow(CONFIG, { ...v, channelId: 'i' }, false)).toBeNull()
  })
  it('보낼 값: 학원을 고르면 학원·선생님, 목록에 없으면 학원 이름을 내용으로', () => {
    expect(inflowPayload(CONFIG, { channelId: 'p', partnerId: 'x1', contactId: 'c1', detail: '' }, false)).toEqual({
      inflow_channel_id: 'p',
      inflow_detail: null,
      partner_id: 'x1',
      contact_id: 'c1',
    })
    expect(inflowPayload(CONFIG, { channelId: 'p', partnerId: PARTNER_NOT_LISTED, contactId: '', detail: ' 새학원 ' }, false)).toEqual({
      inflow_channel_id: 'p',
      inflow_detail: '새학원',
      partner_id: null,
      contact_id: null,
    })
    expect(inflowPayload(CONFIG, { channelId: 'i', partnerId: '', contactId: '', detail: '무시' }, false).inflow_detail).toBeNull()
  })
})

describe('카카오톡 사용 여부', () => {
  it('미사용이면 대신 받을 번호나 연락 방법 필수', () => {
    expect(validateKakao({ use: '', altPhone: '', altContact: '' })).toBe('카카오톡 사용 여부를 골라 주세요.')
    expect(validateKakao({ use: 'yes', altPhone: '', altContact: '' })).toBeNull()
    expect(validateKakao({ use: 'no', altPhone: '', altContact: '' })).toMatch('하나는 적어')
    expect(validateKakao({ use: 'no', altPhone: '02-123', altContact: '' })).toMatch('번호를 확인')
    expect(validateKakao({ use: 'no', altPhone: '', altContact: '라인 abc' })).toBeNull()
  })
  it('보낼 값', () => {
    expect(kakaoPayload({ use: 'yes', altPhone: '010', altContact: 'x' })).toEqual({ kakao_use: true, kakao_alt_phone: null, alt_contact: null })
    expect(kakaoPayload({ use: 'no', altPhone: '010-7777-8888', altContact: ' ' })).toEqual({
      kakao_use: false,
      kakao_alt_phone: '01077778888',
      alt_contact: null,
    })
  })
})
