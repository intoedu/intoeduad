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
