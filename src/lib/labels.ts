// DB 영문 코드 → 화면 한국어 표시
export type StaffRole = 'admin' | 'staff' | 'viewer'

export const ROLE_LABELS: Record<StaffRole, string> = {
  admin: '관리자',
  staff: '직원',
  viewer: '현지 팀(열람)',
}

export const ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  admin: '전체 읽기·쓰기, 직원·설정 관리, 여권 열람',
  staff: '고객·상담·등록·납부·일정 관리 (여권 열람은 별도 권한)',
  viewer: '담당 프로그램 등록생 열람·메모 작성 (여권 열람 불가)',
}

export const CONTACT_ROLE_LABELS: Record<string, string> = {
  director: '원장',
  counselor: '상담실장',
  staff: '학원 직원',
  other: '기타',
}

export const AGREEMENT_TYPE_LABELS: Record<string, string> = {
  basic: '기본형',
  exclusive: '독점권형',
}

export const AGREEMENT_FORM_LABELS: Record<string, string> = {
  into: '인투유학판',
  counselor: '상담실장판',
}

export const AGREEMENT_STATUS: Record<string, { label: string; tone: 'gray' | 'blue' | 'green' | 'amber' | 'red' }> = {
  active: { label: '협약 중', tone: 'green' },
  renewal_window: { label: '갱신 검토(종료 14일 이내)', tone: 'amber' },
  scheduled: { label: '시작 전', tone: 'blue' },
  expired: { label: '만료', tone: 'red' },
  terminated: { label: '해지', tone: 'gray' },
}

export const SETTLEMENT_METHOD_LABELS: Record<string, string> = {
  withholding: '원천징수(본사 부담)',
  tax_invoice: '세금계산서',
  invoice: '계산서',
}

type Tone = 'gray' | 'blue' | 'green' | 'amber' | 'red'

export const LEAD_STATUS: Record<string, { label: string; tone: Tone }> = {
  new: { label: '신규', tone: 'red' },
  contacting: { label: '연락 중', tone: 'amber' },
  scheduled: { label: '상담 예정', tone: 'blue' },
  consulted: { label: '상담 완료', tone: 'green' },
  converted: { label: '등록 전환', tone: 'green' },
  on_hold: { label: '보류', tone: 'gray' },
  closed: { label: '종료', tone: 'gray' },
}

export const CONSULT_METHOD: Record<string, string> = {
  undecided: '미정',
  phone: '전화',
  video: '화상',
}

export const CONSULT_STATUS: Record<string, { label: string; tone: Tone }> = {
  scheduled: { label: '예정', tone: 'blue' },
  done: { label: '완료', tone: 'green' },
  canceled: { label: '취소', tone: 'gray' },
  no_show: { label: '노쇼', tone: 'red' },
}

export const INTEREST_LABELS: Record<string, string> = { study_abroad: '유학', camp: '캠프' }

export const TOPIC_LABELS: Record<string, string> = {
  camp: '캠프',
  study_abroad: '유학',
  cost: '비용',
  schedule: '일정',
  other: '기타',
}

export const ATTRIBUTION_SOURCE: Record<string, string> = {
  link: '링크·QR',
  form: '신청서에서 선택',
  staff: '직원 확인',
}
