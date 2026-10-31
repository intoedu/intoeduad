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

export const PROGRAM_TYPE: Record<string, string> = { camp: '캠프', study_abroad: '유학' }

export const PROGRAM_STATUS: Record<string, { label: string; tone: Tone }> = {
  before: { label: '모집 전', tone: 'gray' },
  open: { label: '모집 중', tone: 'green' },
  closed: { label: '마감', tone: 'red' },
}

export const DUE_RULE_LABELS: Record<string, string> = {
  fixed: '고정 날짜',
  after_registration: '신청 후 N일',
  before_start: '출국 N일 전',
}

export const MILESTONE_CATEGORY: Record<string, string> = {
  document_deadline: '서류 마감',
  visa: '비자 신청',
  flight_ticketing: '항공권 발권',
  orientation: '오리엔테이션',
  departure: '출국',
  return: '귀국',
  other: '기타',
}

// 커미션 지급 기준 (협약서 제7조④, 2026-10-31 확정) — 내부 화면 전용
export const COMMISSION_PAY_RULE: Record<string, string> = {
  camp: '캠프 시작일(출국일)에 지급',
  study_abroad: '유학비 완납 후 영업일 10일 이내 지급',
}

// 캠프 준비사항
export const PREP_STATUS: Record<string, { label: string; tone: Tone }> = {
  requested: { label: '요청서 작성', tone: 'gray' },
  producing: { label: '제작 중', tone: 'blue' },
  reviewing: { label: '교차 검수', tone: 'amber' },
  approved: { label: '확인 완료', tone: 'green' },
  distributed: { label: '배포 완료', tone: 'green' },
  todo: { label: '할 일', tone: 'gray' },
  done: { label: '완료', tone: 'green' },
  not_applicable: { label: '해당 없음', tone: 'gray' },
}

export const PREP_KIND: Record<string, string> = { material: '제작물', task: '할 일' }

export const DUE_ANCHOR_LABELS: Record<string, string> = {
  recruit_start: '모집 시작일 기준',
  start: '출국일 기준',
  none: '마감 없음',
}

// 교차 검수 체크리스트(운영 매뉴얼 11) — 키는 src/domain/prep.ts PREP_REVIEW_KEYS와 같다
export const PREP_REVIEW_ITEMS: Record<string, string> = {
  brand_name: '회사명 "인투유학" 표기 통일',
  price_dates: '금액·날짜·요일이 기준 정보와 일치',
  inclusions: '포함/미포함 내역 일치',
  apply_qr: '신청 링크·QR이 실제로 열림',
  no_guarantee: '보장·최상급 표현 없음(예: "100% 합격", "최고")',
  admission_disclaimer: '진학 실적에 단서(개인차·기간) 표기',
  photo_consent: '사용한 사진·영상의 촬영 동의 확인',
  school_logo: '학교·기관 로고 사용 허락 확인',
  file_version: '파일명에 버전 표기(예: _v2)',
}

// 제작 요청서 항목
export const PREP_REQUEST_FIELDS: Array<{ key: string; label: string; type: 'text' | 'textarea' | 'check'; hint?: string }> = [
  { key: 'purpose', label: '목적', type: 'text', hint: '예: 학원 게시용 모집 안내' },
  { key: 'audience', label: '보는 사람', type: 'text', hint: '예: 초5~중2 학부모' },
  { key: 'usage', label: '사용처', type: 'text', hint: '예: 학원 게시판, 카카오톡 공유' },
  { key: 'spec', label: '규격', type: 'text', hint: '예: A2 세로, 1080×1920 세로 영상 60초' },
  { key: 'key_message', label: '꼭 전할 내용', type: 'textarea' },
  { key: 'include_price', label: '금액·일정 포함', type: 'check' },
  { key: 'partner_logo', label: '학원 로고 포함', type: 'check' },
  { key: 'photo_consent', label: '학생 사진·영상 사용(촬영 동의 필요)', type: 'check' },
]
