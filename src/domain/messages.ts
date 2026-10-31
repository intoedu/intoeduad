// 학부모 알림톡 문안 (카카오 템플릿 심사 제출용 원문 + 발송 시 변수 채우기)
// 근거(2026-10-31 확인):
// - 변수 형식 #{변수명}, 웹링크(WL) 버튼 URL에 변수 사용 가능, 일반 버튼 최대 5개 — 솔라피 알림톡 가이드
// - 모든 변수에 예시 필요, 변수만으로 된 본문·버튼명 변수·변수 40개 초과 반려, 광고성 문구 한 줄이라도 섞이면 반려,
//   고객 요청·신청에 따른 정보만 발송 가능 — 카카오비즈니스 알림톡 심사 가이드
// 확인하지 못한 것: 본문 최대 글자 수, 변수 값 안의 줄바꿈 허용 여부 → 본문은 짧게(500자 이내), 변수 값은 한 줄로만 만든다.
// 이 파일은 외부 의존성이 없어야 한다(M13 발송 Edge Function에서도 같은 문안을 쓴다).
import { formatDateLongKo } from './dates'
import { formatWon } from './registration'

export type TemplateCode = 'lead_received' | 'registration_payment_notice' | 'registration_waitlisted' | 'payment_notice_correction'

export type TemplateButton = { type: 'WL'; name: string; url: string }

export type AlimtalkTemplate = {
  code: TemplateCode
  name: string
  // 언제 보내는지 (심사 시 "발송 근거"로도 쓰는 설명)
  trigger: string
  body: string
  buttons: TemplateButton[]
  // 심사 제출용 변수 예시
  examples: Record<string, string>
}

const KAKAO_BUTTON: TemplateButton = { type: 'WL', name: '카카오톡으로 문의하기', url: '#{카카오채널}' }
const MY_BUTTON: TemplateButton = { type: 'WL', name: '신청 내용 확인', url: '#{확인링크}' }

export const ALIMTALK_TEMPLATES: Record<TemplateCode, AlimtalkTemplate> = {
  lead_received: {
    code: 'lead_received',
    name: '상담 신청 접수 안내',
    trigger: '학부모가 상담 신청서를 제출한 직후 1회',
    body: `[인투유학] 상담 신청 접수 안내

#{학부모명}님, 인투유학 상담 신청이 접수되었습니다.

■ 자녀 이름: #{자녀명}
■ 상담 희망 일시: #{상담일시}

담당자가 신청 내용을 확인한 뒤 연락드립니다.
상담 방식(전화 또는 화상)은 문의 내용에 맞춰 담당자가 안내드립니다.

※ 이 메시지는 상담 신청에 따라 1회 발송되는 안내입니다.`,
    buttons: [KAKAO_BUTTON],
    examples: {
      학부모명: '김민지',
      자녀명: '이하늘',
      상담일시: '2026년 11월 3일(화) 14:00',
      카카오채널: 'https://pf.kakao.com/_AkclX/chat',
    },
  },
  registration_payment_notice: {
    code: 'registration_payment_notice',
    name: '캠프 등록 신청 접수·납부 안내',
    trigger: '학부모가 캠프 등록 신청서를 제출한 직후 1회(대기 접수 제외), 대기에서 등록으로 바뀐 직후 1회',
    body: `[인투유학] 등록 신청 접수 및 납부 안내

#{학부모명}님, #{학생명} 학생의 #{프로그램명} 등록 신청이 접수되었습니다.

■ 일정: #{일정}
■ 예약금: #{예약금}
■ 잔금: #{잔금}
■ 추가 납부: #{추가납부}
■ 입금 계좌: #{입금계좌}

입금하실 때 학생 이름으로 보내 주시면 확인이 빠릅니다.

■ 개인정보 파기 안내
제출하신 개인정보(여권·건강 정보 포함)는 프로그램 종료 후 #{파기일}에 파기됩니다.

※ 이 메시지는 등록 신청에 따라 1회 발송되는 안내입니다.`,
    buttons: [MY_BUTTON, KAKAO_BUTTON],
    examples: {
      학부모명: '김민지',
      학생명: '이하늘',
      프로그램명: '미국 스쿨링 캠프 (2027 겨울)',
      일정: '2027년 1월 5일(화) ~ 2027년 1월 30일(토)',
      예약금: '1,000,000원 (2026년 11월 7일(토)까지)',
      잔금: '4,000,000원 (2026년 12월 6일(일)까지)',
      추가납부: '항공권 1,500,000원 (2026년 12월 1일(화)까지)',
      입금계좌: '국민은행 123456-01-234567 (예금주 인투유학)',
      파기일: '2027년 2월 4일(목)',
      확인링크: 'https://intoedu.example/my/AbCdEf123',
      카카오채널: 'https://pf.kakao.com/_AkclX/chat',
    },
  },
  registration_waitlisted: {
    code: 'registration_waitlisted',
    name: '캠프 대기 접수 안내',
    trigger: '정원이 차서 대기로 접수된 직후 1회',
    body: `[인투유학] 대기 접수 안내

#{학부모명}님, #{학생명} 학생의 #{프로그램명} 신청이 대기 순서로 접수되었습니다.

정원이 모두 차 대기로 접수되었으며, 자리가 생기면 순서대로 연락드립니다.
대기 단계에서는 납부하실 금액이 없습니다.

■ 개인정보 파기 안내
등록으로 이어지지 않으면 제출하신 개인정보는 #{파기일}에 파기됩니다.

※ 이 메시지는 등록 신청에 따라 1회 발송되는 안내입니다.`,
    buttons: [MY_BUTTON, KAKAO_BUTTON],
    examples: {
      학부모명: '김민지',
      학생명: '이하늘',
      프로그램명: '미국 스쿨링 캠프 (2027 겨울)',
      파기일: '2027년 2월 4일(목)',
      확인링크: 'https://intoedu.example/my/AbCdEf123',
      카카오채널: 'https://pf.kakao.com/_AkclX/chat',
    },
  },
  payment_notice_correction: {
    code: 'payment_notice_correction',
    name: '납부 안내 변경',
    trigger: '이미 안내한 납부 금액·기한이 바뀌었을 때 담당자가 버튼을 눌러 1회(발송 기록 남김)',
    body: `[인투유학] 납부 안내 변경

#{학부모명}님, #{학생명} 학생의 #{프로그램명} 납부 안내가 아래와 같이 변경되었습니다.

■ 예약금: #{예약금}
■ 잔금: #{잔금}
■ 추가 납부: #{추가납부}
■ 입금 계좌: #{입금계좌}
■ 변경 내용: #{변경내용}

※ 이 메시지는 등록 신청하신 프로그램의 납부 조건 변경에 따라 발송되는 안내입니다.`,
    buttons: [MY_BUTTON, KAKAO_BUTTON],
    examples: {
      학부모명: '김민지',
      학생명: '이하늘',
      프로그램명: '미국 스쿨링 캠프 (2027 겨울)',
      예약금: '1,000,000원 (납부 완료)',
      잔금: '3,800,000원 (2026년 12월 10일(목)까지)',
      추가납부: '없음',
      입금계좌: '국민은행 123456-01-234567 (예금주 인투유학)',
      변경내용: '현지 숙소 변경으로 잔금 200,000원 감액',
      확인링크: 'https://intoedu.example/my/AbCdEf123',
      카카오채널: 'https://pf.kakao.com/_AkclX/chat',
    },
  },
}

// 본문·버튼에 쓰인 변수 이름 (순서대로, 중복 제거)
export function templateVariables(t: Pick<AlimtalkTemplate, 'body' | 'buttons'>): string[] {
  const all = [t.body, ...t.buttons.map((b) => b.url)].join('\n')
  return [...new Set([...all.matchAll(/#\{([^}]+)\}/g)].map((m) => m[1]))]
}

// 심사 규칙 점검 (반려 사유를 미리 막는다)
export function lintTemplate(t: AlimtalkTemplate): string[] {
  const problems: string[] = []
  const vars = templateVariables(t)
  if (vars.length > 40) problems.push('변수가 40개를 넘습니다.')
  for (const v of vars) if (!t.examples[v]) problems.push(`변수 #{${v}}의 예시가 없습니다.`)
  if (!t.body.replace(/#\{[^}]+\}/g, '').trim()) problems.push('변수만으로 된 본문입니다.')
  if ((t.body.match(/#\{/g) ?? []).length !== (t.body.match(/#\{[^}]+\}/g) ?? []).length) problems.push('닫히지 않은 변수가 있습니다.')
  for (const b of t.buttons) if (/#\{/.test(b.name)) problems.push(`버튼 이름 "${b.name}"에 변수가 있습니다.`)
  if (t.buttons.length > 5) problems.push('버튼이 5개를 넘습니다.')
  if (t.body.length > 500) problems.push('본문이 500자를 넘습니다(공식 상한 미확인, 내부 기준).')
  return problems
}

export class MissingVariableError extends Error {}

// 실제 값 채우기 — 변수 값은 한 줄로 만들고, 빠진 값이 있으면 발송하지 않도록 오류
export function renderTemplate(t: AlimtalkTemplate, values: Record<string, string>): { text: string; buttons: TemplateButton[] } {
  const fill = (s: string) =>
    s.replace(/#\{([^}]+)\}/g, (_, key: string) => {
      const v = values[key]
      if (v === undefined || v === '') throw new MissingVariableError(`#{${key}} 값이 없습니다.`)
      return v.replace(/\s*\n\s*/g, ' ')
    })
  return { text: fill(t.body), buttons: t.buttons.map((b) => ({ ...b, url: fill(b.url) })) }
}

// ---------------------------------------------------------------------------
// 등록 신청 → 납부 안내 변수
// ---------------------------------------------------------------------------
export type NoticeScheduleLine = { kind: 'deposit' | 'balance' | 'extra'; label: string; amount: number; due_date: string; paid?: number }

function lineText(l: NoticeScheduleLine, withLabel: boolean): string {
  const head = withLabel ? `${l.label} ` : ''
  if (l.paid !== undefined && l.paid >= l.amount) return `${head}${formatWon(l.amount)} (납부 완료)`
  return `${head}${formatWon(l.amount)} (${formatDateLongKo(l.due_date)}까지)`
}

export function paymentNoticeVariables(input: {
  parentName: string
  studentName: string
  programName: string
  startDate: string
  endDate: string
  destroyDate: string
  schedule: NoticeScheduleLine[]
  bank: { bank: string; number: string; holder: string } | null
  myUrl: string
  kakaoUrl: string
}): Record<string, string> {
  const deposit = input.schedule.find((l) => l.kind === 'deposit')
  const balance = input.schedule.find((l) => l.kind === 'balance')
  const extras = input.schedule.filter((l) => l.kind === 'extra')
  const bank = input.bank && input.bank.bank && input.bank.number
  return {
    학부모명: input.parentName,
    학생명: input.studentName,
    프로그램명: input.programName,
    일정: `${formatDateLongKo(input.startDate)} ~ ${formatDateLongKo(input.endDate)}`,
    예약금: deposit ? lineText(deposit, false) : '없음',
    잔금: balance ? lineText(balance, false) : '없음',
    추가납부: extras.length ? extras.map((l) => lineText(l, true)).join(', ') : '없음',
    입금계좌: bank ? `${input.bank!.bank} ${input.bank!.number}${input.bank!.holder ? ` (예금주 ${input.bank!.holder})` : ''}` : '담당자가 따로 안내드립니다',
    파기일: formatDateLongKo(input.destroyDate),
    확인링크: input.myUrl,
    카카오채널: input.kakaoUrl,
  }
}
