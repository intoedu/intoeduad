// 발송 함수(supabase/functions/message-sender/build.ts)가 문안 코드(src/domain/messages.ts)와 같은 값을 만드는지,
// 솔라피 인증 헤더가 공식 형식(HMAC-SHA256 apiKey, date, salt, signature)인지 확인
import { describe, expect, it } from 'vitest'
import * as sender from '../../supabase/functions/message-sender/build'
import { ALIMTALK_TEMPLATES, paymentNoticeVariables, templateVariables } from './messages'

const input = {
  parentName: '김민지',
  studentName: '이하늘',
  programName: '미국 스쿨링 캠프 (2027 겨울)',
  startDate: '2027-01-05',
  endDate: '2027-01-30',
  destroyDate: '2027-02-04',
  bank: { bank: '국민은행', number: '123456-01-234567', holder: '인투유학' },
  myUrl: 'https://example.com/my/abc',
  kakaoUrl: 'https://pf.kakao.com/_AkclX/chat',
  schedule: [
    { kind: 'deposit' as const, label: '예약금', amount: 1000000, due_date: '2026-11-07', paid: 1000000 },
    { kind: 'balance' as const, label: '잔금', amount: 4000000, due_date: '2026-12-06', paid: 0 },
    { kind: 'extra' as const, label: '항공권', amount: 1500000, due_date: '2026-12-01' },
  ],
}

describe('알림 발송 함수', () => {
  it('납부 안내 변수: 문안 코드와 같은 결과', () => {
    expect(sender.paymentNoticeVariables(input)).toEqual(paymentNoticeVariables(input))
  })

  it('템플릿별 변수 목록이 문안(본문·버튼)과 같음', () => {
    for (const t of Object.values(ALIMTALK_TEMPLATES)) {
      expect([...sender.TEMPLATE_VARIABLES[t.code]].sort(), t.code).toEqual(templateVariables(t).sort())
    }
  })

  it('솔라피 변수 형식 #{변수}, 빠진 값이면 보내지 않음', () => {
    const v = sender.toSolapiVariables('lead_received', { 학부모명: '김민지', 자녀명: '이\n하늘', 상담일시: '2026년 11월 3일(화) 14:00', 카카오채널: 'https://pf.kakao.com/x' })
    expect(v['#{자녀명}']).toBe('이 하늘')
    expect(() => sender.toSolapiVariables('lead_received', { 학부모명: '김민지' })).toThrow('#{자녀명}')
  })

  it('솔라피 인증 헤더(공식 형식)', async () => {
    const h = await sender.solapiAuthHeader('KEY123', 'test-secret', '2019-07-01T00:41:48Z', 'salt-123456789012')
    expect(h).toBe('HMAC-SHA256 apiKey=KEY123, date=2019-07-01T00:41:48Z, salt=salt-123456789012, signature=79ce13b92a891c7c99457d4d6160b5384b5347a83e28888a9dc3bffc7bad3317')
    const random = await sender.solapiAuthHeader('K', 'S')
    expect(random).toMatch(/salt=[0-9a-f]{32}, signature=[0-9a-f]{64}$/)
  })

  it('직원 알림: 개인정보 없음, 문자 길이에 따라 SMS/LMS', () => {
    for (const t of Object.values(sender.STAFF_TEXT)) expect(t).not.toMatch(/학부모명|학생명|010/)
    expect(sender.smsType('[인투유학] 알림 발송 테스트입니다.')).toBe('SMS')
    expect(sender.smsType(sender.STAFF_TEXT.staff_destruction_overdue)).toBe('LMS')
  })

  it('번호 가림·KST 일시', () => {
    expect(sender.maskPhone('01012345678')).toBe('010-****-5678')
    expect(sender.kstDateTime('2026-11-03T05:00:00Z')).toBe('2026년 11월 3일(화) 14:00')
  })
})
