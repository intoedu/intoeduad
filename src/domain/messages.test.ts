import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ALIMTALK_TEMPLATES, lintTemplate, MissingVariableError, paymentNoticeVariables, renderTemplate, templateVariables } from './messages'

const base = {
  parentName: '김민지',
  studentName: '이하늘',
  programName: '미국 스쿨링 캠프 (2027 겨울)',
  startDate: '2027-01-05',
  endDate: '2027-01-30',
  destroyDate: '2027-02-04',
  bank: { bank: '국민은행', number: '123456-01-234567', holder: '인투유학' },
  myUrl: 'https://example.com/my/abc',
  kakaoUrl: 'https://pf.kakao.com/_AkclX/chat',
}

describe('알림톡 문안', () => {
  it('모든 템플릿이 심사 규칙 점검을 통과', () => {
    for (const t of Object.values(ALIMTALK_TEMPLATES)) expect(lintTemplate(t), t.code).toEqual([])
  })

  it('광고성 표현·커미션 정보 없음', () => {
    for (const t of Object.values(ALIMTALK_TEMPLATES)) {
      expect(t.body).not.toMatch(/할인|이벤트|쿠폰|혜택|특가|커미션|수수료|100%|최고/)
    }
  })

  it('예시 값으로 채우면 변수가 남지 않음', () => {
    for (const t of Object.values(ALIMTALK_TEMPLATES)) {
      const { text, buttons } = renderTemplate(t, t.examples)
      expect(text).not.toMatch(/#\{/)
      for (const b of buttons) expect(b.url).toMatch(/^https:\/\//)
    }
  })

  it('빠진 값이 있으면 보내지 않음', () => {
    expect(() => renderTemplate(ALIMTALK_TEMPLATES.lead_received, { 학부모명: '김민지' })).toThrow(MissingVariableError)
  })

  it('변수 값의 줄바꿈은 한 줄로', () => {
    const t = ALIMTALK_TEMPLATES.lead_received
    const { text } = renderTemplate(t, { ...t.examples, 자녀명: '이\n하늘' })
    expect(text).toContain('자녀 이름: 이 하늘')
  })

  it('납부 안내 변수: 예약금·잔금·추가 납부·계좌·파기일', () => {
    const v = paymentNoticeVariables({
      ...base,
      schedule: [
        { kind: 'deposit', label: '예약금', amount: 1000000, due_date: '2026-11-07' },
        { kind: 'balance', label: '잔금', amount: 4000000, due_date: '2026-12-06' },
        { kind: 'extra', label: '항공권', amount: 1500000, due_date: '2026-12-01' },
        { kind: 'extra', label: '보험', amount: 50000, due_date: '2026-12-01' },
      ],
    })
    expect(v.예약금).toBe('1,000,000원 (2026년 11월 7일(토)까지)')
    expect(v.잔금).toBe('4,000,000원 (2026년 12월 6일(일)까지)')
    expect(v.추가납부).toBe('항공권 1,500,000원 (2026년 12월 1일(화)까지), 보험 50,000원 (2026년 12월 1일(화)까지)')
    expect(v.입금계좌).toBe('국민은행 123456-01-234567 (예금주 인투유학)')
    expect(v.파기일).toBe('2027년 2월 4일(목)')
    const vars = templateVariables(ALIMTALK_TEMPLATES.registration_payment_notice)
    for (const key of vars) expect(v[key], key).toBeTruthy()
  })

  it('예약금이 없거나 계좌 미설정이어도 문장이 깨지지 않음', () => {
    const v = paymentNoticeVariables({
      ...base,
      bank: { bank: '', number: '', holder: '' },
      schedule: [{ kind: 'balance', label: '참가비', amount: 3000000, due_date: '2026-12-06', paid: 3000000 }],
    })
    expect(v.예약금).toBe('없음')
    expect(v.잔금).toBe('3,000,000원 (납부 완료)')
    expect(v.추가납부).toBe('없음')
    expect(v.입금계좌).toBe('담당자가 따로 안내드립니다')
  })

  it('심사 제출 문서(docs/alimtalk-templates.md)와 코드 문안이 같음', () => {
    const doc = readFileSync(new URL('../../docs/alimtalk-templates.md', import.meta.url), 'utf8')
    for (const t of Object.values(ALIMTALK_TEMPLATES)) {
      expect(doc, t.code).toContain(t.body)
      for (const b of t.buttons) expect(doc, `${t.code} ${b.name}`).toContain(b.name)
    }
  })
})
