import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { NAV_ITEMS } from './components/admin/nav'
import { Spinner } from './components/ui'
import { RequireStaff } from './features/auth/RequireStaff'
import { NotFoundPage } from './features/common/ComingSoonPage'
import { ApplyDonePage } from './features/public/ApplyDonePage'
import { ApplyPage } from './features/public/ApplyPage'
import type { StaffRole } from './lib/labels'

// 관리자 화면은 필요할 때만 내려받는다 (학부모용 신청서를 휴대폰에서 빨리 열기 위해)
const AdminLayout = lazy(() => import('./components/admin/AdminLayout').then((m) => ({ default: m.AdminLayout })))
const LoginPage = lazy(() => import('./features/auth/LoginPage').then((m) => ({ default: m.LoginPage })))
const SetPasswordPage = lazy(() => import('./features/auth/SetPasswordPage').then((m) => ({ default: m.SetPasswordPage })))
const ComingSoonPage = lazy(() => import('./features/common/ComingSoonPage').then((m) => ({ default: m.ComingSoonPage })))
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const PartnersListPage = lazy(() => import('./features/partners/PartnersListPage').then((m) => ({ default: m.PartnersListPage })))
const PartnerNewPage = lazy(() => import('./features/partners/PartnerNewPage').then((m) => ({ default: m.PartnerNewPage })))
const PartnerDetailPage = lazy(() => import('./features/partners/PartnerDetailPage').then((m) => ({ default: m.PartnerDetailPage })))
const LeadsListPage = lazy(() => import('./features/leads/LeadsListPage').then((m) => ({ default: m.LeadsListPage })))
const LeadDetailPage = lazy(() => import('./features/leads/LeadDetailPage').then((m) => ({ default: m.LeadDetailPage })))
const SlotsPage = lazy(() => import('./features/slots/SlotsPage').then((m) => ({ default: m.SlotsPage })))
const StaffPage = lazy(() => import('./features/settings/StaffPage').then((m) => ({ default: m.StaffPage })))

const OFFICE: StaffRole[] = ['admin', 'staff']

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Spinner />}>{children}</Suspense>
}

function guarded(roles: StaffRole[], page: ReactNode) {
  return (
    <RequireStaff roles={roles}>
      <Lazy>{page}</Lazy>
    </RequireStaff>
  )
}

// 아직 만들지 않은 메뉴는 "준비 중" 화면으로 연결
const comingSoonRoutes = NAV_ITEMS.filter((item) => item.milestone).map((item) => ({
  path: item.to.replace('/admin/', ''),
  element: guarded(item.roles, <ComingSoonPage title={item.label} milestone={item.milestone!} />),
}))

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/admin" replace /> },

  // 학부모용 공개 화면
  { path: '/apply', element: <ApplyPage /> },
  { path: '/apply/done', element: <ApplyDonePage /> },
  { path: '/apply/:partnerCode', element: <ApplyPage /> },

  // 직원용
  { path: '/login', element: <Lazy><LoginPage /></Lazy> },
  { path: '/auth/set-password', element: <Lazy><SetPasswordPage /></Lazy> },
  {
    path: '/admin',
    element: (
      <RequireStaff>
        <Lazy>
          <AdminLayout />
        </Lazy>
      </RequireStaff>
    ),
    children: [
      { index: true, element: <Lazy><DashboardPage /></Lazy> },
      { path: 'partners', element: guarded(OFFICE, <PartnersListPage />) },
      { path: 'partners/new', element: guarded(OFFICE, <PartnerNewPage />) },
      { path: 'partners/:id', element: guarded(OFFICE, <PartnerDetailPage />) },
      { path: 'leads', element: guarded(OFFICE, <LeadsListPage />) },
      { path: 'leads/:id', element: guarded(OFFICE, <LeadDetailPage />) },
      { path: 'slots', element: guarded(OFFICE, <SlotsPage />) },
      { path: 'settings', element: <Navigate to="/admin/settings/staff" replace /> },
      { path: 'settings/staff', element: guarded(['admin'], <StaffPage />) },
      ...comingSoonRoutes,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
