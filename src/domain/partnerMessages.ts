// 원장님 안내 문구 (MOU 카드 MOU-03·04·05·13·15) 자동 채움 — 내부에서 복사해 카카오톡·이메일로 보낸다.
// 문구는 운영 매뉴얼 원문을 확인하지 못해 초안으로 작성했다(매뉴얼 원문으로 바꿔 쓰기). 학부모에게는 보내지 않는다.
// 학생 이름: 소개 학원 제공 동의가 없으면 가린다(홍*동) — 개인정보 제3자 제공 최소화
import { formatDateLongKo } from './dates'
import { formatWon, maskName } from './registration'

export type PartnerStudent = {
  studentName: string | null
  shareAgreed: boolean
  programName: string
  status: string // 화면 표시용 한국어 상태
  registeredOn: string
  amount: number | null
  dueDate: string | null
  paidOn: string | null
  commissionStatus: 'scheduled' | 'paid' | 'held' | 'excluded' | 'canceled'
}

export function studentLabel(s: Pick<PartnerStudent, 'studentName' | 'shareAgreed'>): string {
  if (!s.studentName) return '(정보 파기됨)'
  return s.shareAgreed ? s.studentName : maskName(s.studentName)
}

// MOU-03 등록 현황
export function registrationStatusMessage(partnerName: string, directorName: string | null, students: PartnerStudent[]): string {
  const lines = students.map((s) => `- ${studentLabel(s)} / ${s.programName} / ${s.status}`)
  return [`[인투유학] ${partnerName} 소개 학생 등록 현황`, '', `${directorName ?? ''} 원장님, 안녕하세요. 인투유학입니다.`, '소개해 주신 학생들의 현재 등록 현황을 알려 드립니다.', '', ...lines, '', '궁금하신 점은 언제든 말씀해 주세요. 감사합니다.'].join('\n')
}

// MOU-04 지급 예정일
export function payoutScheduleMessage(partnerName: string, directorName: string | null, students: PartnerStudent[]): string {
  const due = students.filter((s) => s.commissionStatus === 'scheduled' && s.amount !== null)
  const total = due.reduce((a, s) => a + (s.amount ?? 0), 0)
  const lines = due.map((s) => `- ${studentLabel(s)} / ${s.programName} / ${formatWon(s.amount ?? 0)} / ${s.dueDate ? formatDateLongKo(s.dueDate) : '미정'} 지급 예정`)
  return [
    `[인투유학] ${partnerName} 소개 수수료 지급 예정 안내`,
    '',
    `${directorName ?? ''} 원장님, 안녕하세요. 인투유학입니다.`,
    '협약서 제7조에 따른 소개 수수료 지급 예정 내역을 안내드립니다.',
    '',
    ...lines,
    '',
    `지급 예정 합계: ${formatWon(total)} (세무 비용은 본사 부담, 안내 금액이 실수령액입니다)`,
    '캠프는 캠프 시작일, 유학은 완납 후 영업일 10일 이내에 지급됩니다.',
  ].join('\n')
}

// MOU-05 취소·환불
export function cancellationMessage(partnerName: string, directorName: string | null, s: PartnerStudent, refundNote: string): string {
  return [
    `[인투유학] ${partnerName} 소개 학생 취소·환불 안내`,
    '',
    `${directorName ?? ''} 원장님, 안녕하세요. 인투유학입니다.`,
    `소개해 주신 ${studentLabel(s)} 학생(${s.programName})의 참가가 취소되었습니다.`,
    refundNote,
    '협약서 제7조⑤에 따라 참가 전 취소·전액 환불된 건은 소개 수수료 지급 대상에서 제외되며, 부분 환불 건은 별도로 협의드리겠습니다.',
  ].join('\n')
}

// MOU-13 월말 현황 보고 (협약서 제6조②, 부록 D)
export function monthlyReport(input: {
  partnerName: string
  directorName: string | null
  month: string // YYYY-MM
  newStudents: PartnerStudent[]
  paidThisMonth: PartnerStudent[]
  upcoming: PartnerStudent[]
}): { email: string; kakao: string } {
  const [y, m] = input.month.split('-').map(Number)
  const paidTotal = input.paidThisMonth.reduce((a, s) => a + (s.amount ?? 0), 0)
  const upcomingTotal = input.upcoming.reduce((a, s) => a + (s.amount ?? 0), 0)
  const list = (xs: PartnerStudent[], f: (s: PartnerStudent) => string) => (xs.length ? xs.map((s) => `- ${f(s)}`) : ['- 없음'])
  const email = [
    `[인투유학] ${input.partnerName} ${y}년 ${m}월 소개 현황 보고`,
    '',
    `${input.directorName ?? ''} 원장님, 안녕하세요. 인투유학입니다.`,
    `협약서 제6조에 따라 ${y}년 ${m}월 소개 현황을 보고드립니다.`,
    '',
    `1. 이번 달 신규 신청 (${input.newStudents.length}명)`,
    ...list(input.newStudents, (s) => `${studentLabel(s)} / ${s.programName} / ${s.status}`),
    '',
    `2. 이번 달 지급 내역 (합계 ${formatWon(paidTotal)})`,
    ...list(input.paidThisMonth, (s) => `${studentLabel(s)} / ${s.programName} / ${formatWon(s.amount ?? 0)} / ${s.paidOn ? formatDateLongKo(s.paidOn) : ''} 지급`),
    '',
    `3. 다음 지급 예정 (합계 ${formatWon(upcomingTotal)})`,
    ...list(input.upcoming, (s) => `${studentLabel(s)} / ${s.programName} / ${formatWon(s.amount ?? 0)} / ${s.dueDate ? formatDateLongKo(s.dueDate) : '미정'}`),
    '',
    '안내 금액은 실수령액이며 세무 비용은 본사가 부담합니다. 문의 사항은 회신 주시면 확인하겠습니다.',
    '감사합니다.',
  ].join('\n')
  const kakao = `[인투유학] ${y}년 ${m}월 소개 현황\n신규 신청 ${input.newStudents.length}명 · 이번 달 지급 ${formatWon(paidTotal)} · 다음 지급 예정 ${formatWon(upcomingTotal)}\n자세한 내용은 이메일로 보내 드렸습니다.`
  return { email, kakao }
}

// MOU-15 새 프로그램 커미션 사전 고지 (협약서 제8조: 개시 30일 전까지 서면 고지, 이의 제기 7일)
export function programNoticeMessage(input: { programName: string; startDate: string; amount: number | null; objectionDays?: number }): string {
  return [
    `[인투유학] 신규 프로그램 소개 수수료 안내 — ${input.programName}`,
    '',
    '원장님, 안녕하세요. 인투유학입니다.',
    `협약서 제8조에 따라 ${input.programName}(${formatDateLongKo(input.startDate)} 시작)의 소개 수수료를 미리 안내드립니다.`,
    '',
    `- 1인당 소개 수수료: ${input.amount === null ? '추후 안내' : formatWon(input.amount)} (실수령액, 세무 비용 본사 부담)`,
    '- 지급 시점: 캠프 시작일',
    '',
    `이의가 있으시면 이 안내를 받으신 날부터 ${input.objectionDays ?? 7}일 이내에 말씀해 주세요.`,
  ].join('\n')
}
