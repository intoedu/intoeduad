import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { openedFromAuthLink, supabase, type Tables } from '../../lib/supabase'

type StaffProfile = Tables<'staff_profiles'>

type AuthState = {
  session: Session | null
  profile: StaffProfile | null
  // 초대·비밀번호 재설정 링크로 들어온 경우 (비밀번호 설정 화면으로 보냄)
  recoveryMode: boolean
  loading: boolean
  finishRecovery: () => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<StaffProfile | null>(null)
  const [recoveryMode, setRecoveryMode] = useState(openedFromAuthLink)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null)
      return
    }
    const { data } = await supabase.from('staff_profiles').select('*').eq('id', userId).maybeSingle()
    setProfile(data)
  }, [])

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      await loadProfile(data.session?.user.id)
      if (active) setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true)
      // 콜백 안에서 바로 Supabase를 다시 부르면 교착될 수 있어 다음 틱으로 미룬다
      setTimeout(() => {
        void loadProfile(next?.user.id)
      }, 0)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const value: AuthState = {
    session,
    profile,
    recoveryMode,
    loading,
    finishRecovery: () => {
      setRecoveryMode(false)
      window.history.replaceState(null, '', window.location.pathname)
    },
    signOut: async () => {
      await supabase.auth.signOut()
      setProfile(null)
      setRecoveryMode(false)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('AuthProvider 안에서만 사용할 수 있습니다.')
  return ctx
}
