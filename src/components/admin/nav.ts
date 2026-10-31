import type { StaffRole } from '../../lib/labels'

export type NavItem = {
  to: string
  label: string
  roles: StaffRole[]
  // 아직 구현 전인 메뉴: 준비 중 화면에 표시할 단계
  milestone?: string
}

const ALL: StaffRole[] = ['admin', 'staff', 'viewer']
const OFFICE: StaffRole[] = ['admin', 'staff']
const ADMIN: StaffRole[] = ['admin']

export const NAV_ITEMS: NavItem[] = [
  { to: '/admin', label: '대시보드', roles: ALL },
  { to: '/admin/leads', label: '상담 신청', roles: OFFICE },
  { to: '/admin/calendar', label: '통합 캘린더', roles: OFFICE, milestone: 'M12' },
  { to: '/admin/slots', label: '상담 시간 관리', roles: OFFICE },
  { to: '/admin/programs', label: '캠프·프로그램', roles: OFFICE, milestone: 'M5' },
  { to: '/admin/prep', label: '캠프 준비사항', roles: OFFICE, milestone: 'M6' },
  { to: '/admin/registrations', label: '등록생', roles: ALL, milestone: 'M9' },
  { to: '/admin/payments', label: '납부·환불', roles: OFFICE, milestone: 'M9' },
  { to: '/admin/events', label: '중요 일정', roles: OFFICE, milestone: 'M12' },
  { to: '/admin/destruction', label: '개인정보 파기', roles: OFFICE, milestone: 'M11' },
  { to: '/admin/partners', label: 'MOU 학원', roles: OFFICE },
  { to: '/admin/commissions', label: '커미션 정산', roles: OFFICE, milestone: 'M10' },
  { to: '/admin/messages', label: '발송 기록', roles: OFFICE, milestone: 'M13' },
  { to: '/admin/logs', label: '여권 접근 기록', roles: ADMIN, milestone: 'M8' },
  { to: '/admin/settings', label: '설정·직원 관리', roles: ADMIN },
]
