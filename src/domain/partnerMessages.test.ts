import { describe, expect, it } from 'vitest'
import { monthlyReport, payoutScheduleMessage, programNoticeMessage, studentLabel, type PartnerStudent } from './partnerMessages'

const s = (over: Partial<PartnerStudent>): PartnerStudent => ({
  studentName: '홍길동', shareAgreed: false, programName: '미국 캠프', status: '등록 확정', registeredOn: '2026-11-02',
  amount: 300000, dueDate: '2027-01-05', paidOn: null, commissionStatus: 'scheduled', ...over,
})

describe('원장님 안내 문구', () => {
  it('학원 제공 동의가 없으면 이름을 가림, 파기 후에는 표시 안 함', () => {
    expect(studentLabel(s({}))).toBe('홍*동')
    expect(studentLabel(s({ shareAgreed: true }))).toBe('홍길동')
    expect(studentLabel(s({ studentName: null }))).toBe('(정보 파기됨)')
  })
  it('지급 예정 안내: 예정 건만, 합계', () => {
    const msg = payoutScheduleMessage('대전학원', '홍원장', [s({}), s({ studentName: '김하늘', amount: 200000, commissionStatus: 'held' })])
    expect(msg).toContain('홍*동 / 미국 캠프 / 300,000원 / 2027년 1월 5일(화) 지급 예정')
    expect(msg).toContain('지급 예정 합계: 300,000원')
    expect(msg).not.toContain('김*늘')
  })
  it('월말 보고: 이메일·카톡 요약', () => {
    const r = monthlyReport({ partnerName: '대전학원', directorName: '홍원장', month: '2026-11', newStudents: [s({})], paidThisMonth: [s({ paidOn: '2026-11-20', commissionStatus: 'paid' })], upcoming: [] })
    expect(r.email).toContain('2026년 11월 소개 현황')
    expect(r.email).toContain('2. 이번 달 지급 내역 (합계 300,000원)')
    expect(r.email).toContain('3. 다음 지급 예정 (합계 0원)\n- 없음')
    expect(r.kakao).toContain('신규 신청 1명 · 이번 달 지급 300,000원')
  })
  it('새 프로그램 고지(제8조): 이의 제기 7일', () => {
    expect(programNoticeMessage({ programName: '미국 캠프 (2027 겨울)', startDate: '2027-01-05', amount: 300000 })).toContain('7일 이내')
  })
})
