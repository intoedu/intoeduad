import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useAuth } from '../../features/auth/AuthProvider'
import { ROLE_LABELS, type StaffRole } from '../../lib/labels'
import { NAV_ITEMS } from './nav'

export function AdminLayout() {
  const { profile, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const role = profile?.role as StaffRole
  const items = NAV_ITEMS.filter((item) => item.roles.includes(role))

  const nav = (
    <nav className="space-y-0.5">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/admin'}
          onClick={() => setMenuOpen(false)}
          className={({ isActive }) =>
            `flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
              isActive ? 'bg-brand-50 font-semibold text-brand-700' : 'text-slate-600 hover:bg-slate-100'
            }`
          }
        >
          {item.label}
          {item.milestone && <span className="text-[10px] text-slate-400">준비 중</span>}
        </NavLink>
      ))}
    </nav>
  )

  const userBox = profile && (
    <div className="border-t border-slate-200 pt-4">
      <p className="text-sm font-medium text-slate-800">{profile.name}</p>
      <p className="text-xs text-slate-500">{ROLE_LABELS[role]}</p>
      <button type="button" onClick={() => void signOut()} className="mt-2 text-xs text-slate-500 hover:text-slate-800">
        로그아웃
      </button>
    </div>
  )

  return (
    <div className="min-h-dvh lg:flex">
      {/* PC 사이드바 */}
      <aside className="hidden w-60 shrink-0 flex-col justify-between border-r border-slate-200 bg-white p-4 lg:flex">
        <div>
          <p className="mb-6 px-3 text-lg font-bold text-brand-600">인투유학</p>
          {nav}
        </div>
        {userBox}
      </aside>

      {/* 모바일 상단 바 */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <p className="text-base font-bold text-brand-600">인투유학</p>
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-label="메뉴 열기"
          onClick={() => setMenuOpen((v) => !v)}
          className="rounded-lg px-3 py-1.5 text-sm text-slate-700 ring-1 ring-slate-300"
        >
          {menuOpen ? '닫기' : '메뉴'}
        </button>
      </header>
      {menuOpen && (
        <div className="fixed inset-x-0 top-[53px] bottom-0 z-10 overflow-y-auto bg-white p-4 lg:hidden">
          {nav}
          <div className="mt-6">{userBox}</div>
        </div>
      )}

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  )
}
