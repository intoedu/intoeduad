import { createBrowserRouter, Navigate } from 'react-router'
import { AdminLayout } from './components/admin/AdminLayout'
import { NAV_ITEMS } from './components/admin/nav'
import { LoginPage } from './features/auth/LoginPage'
import { RequireStaff } from './features/auth/RequireStaff'
import { SetPasswordPage } from './features/auth/SetPasswordPage'
import { ComingSoonPage, NotFoundPage } from './features/common/ComingSoonPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { PartnerDetailPage } from './features/partners/PartnerDetailPage'
import { PartnerNewPage } from './features/partners/PartnerNewPage'
import { PartnersListPage } from './features/partners/PartnersListPage'
import { StaffPage } from './features/settings/StaffPage'
import type { StaffRole } from './lib/labels'

const OFFICE: StaffRole[] = ['admin', 'staff']

// 아직 만들지 않은 메뉴는 "준비 중" 화면으로 연결
const comingSoonRoutes = NAV_ITEMS.filter((item) => item.milestone).map((item) => ({
  path: item.to.replace('/admin/', ''),
  element: (
    <RequireStaff roles={item.roles}>
      <ComingSoonPage title={item.label} milestone={item.milestone!} />
    </RequireStaff>
  ),
}))

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/admin" replace /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/auth/set-password', element: <SetPasswordPage /> },
  {
    path: '/admin',
    element: (
      <RequireStaff>
        <AdminLayout />
      </RequireStaff>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'settings', element: <Navigate to="/admin/settings/staff" replace /> },
      {
        path: 'settings/staff',
        element: (
          <RequireStaff roles={['admin']}>
            <StaffPage />
          </RequireStaff>
        ),
      },
      { path: 'partners', element: <RequireStaff roles={OFFICE}><PartnersListPage /></RequireStaff> },
      { path: 'partners/new', element: <RequireStaff roles={OFFICE}><PartnerNewPage /></RequireStaff> },
      { path: 'partners/:id', element: <RequireStaff roles={OFFICE}><PartnerDetailPage /></RequireStaff> },
      ...comingSoonRoutes,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
