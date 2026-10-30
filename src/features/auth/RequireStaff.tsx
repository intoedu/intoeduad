import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { Spinner } from '../../components/ui'
import type { StaffRole } from '../../lib/labels'
import { useAuth } from './AuthProvider'

// 화면 접근 제어 (실제 데이터 보호는 DB의 RLS가 담당하고, 이 가드는 화면 흐름용)
export function RequireStaff({ roles, children }: { roles?: StaffRole[]; children: ReactNode }) {
  const { session, profile, loading, recoveryMode } = useAuth()
  const location = useLocation()

  if (loading) return <Spinner />
  if (recoveryMode) return <Navigate to="/auth/set-password" replace />
  if (!session || !profile || !profile.active) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  if (roles && !roles.includes(profile.role as StaffRole)) {
    return (
      <div className="py-20 text-center">
        <p className="text-lg font-semibold text-slate-800">접근 권한이 없습니다</p>
        <p className="mt-2 text-sm text-slate-500">이 화면은 {roles.length === 1 && roles[0] === 'admin' ? '관리자' : '권한이 있는 직원'}만 볼 수 있습니다.</p>
      </div>
    )
  }
  return <>{children}</>
}
