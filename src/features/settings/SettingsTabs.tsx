import { useLocation, useNavigate } from 'react-router'
import { Tabs } from '../../components/ui'

const TABS = [
  { value: '/admin/settings/staff', label: '직원 관리' },
  { value: '/admin/settings/general', label: '기본 설정' },
  { value: '/admin/settings/consents', label: '동의·안내 문구' },
  { value: '/admin/settings/notifications', label: '알림' },
]

// 설정 화면 공통 탭 (관리자 전용)
export function SettingsTabs() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  return <Tabs tabs={TABS} value={pathname} onChange={(to) => navigate(to)} />
}
