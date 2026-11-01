import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router'
import { Alert, Button, Card, Field, Input } from '../../components/ui'
import { isLoginIdAccount, toLoginEmail } from '../../domain/loginId'
import { supabase } from '../../lib/supabase'
import { useAuth } from './AuthProvider'

export function LoginPage() {
  const { session, profile, loading, recoveryMode } = useAuth()
  const location = useLocation()
  const [mode, setMode] = useState<'login' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  if (!loading && (recoveryMode || (session && profile?.must_change_password))) return <Navigate to="/auth/set-password" replace />
  if (!loading && session && profile?.active) {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from ?? '/admin'} replace />
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const { error } = await supabase.auth.signInWithPassword({ email: toLoginEmail(email), password })
    setSubmitting(false)
    if (error) {
      setError(
        error.message.includes('banned')
          ? '비활성화된 계정입니다. 관리자에게 문의해 주세요.'
          : '아이디(이메일) 또는 비밀번호가 올바르지 않습니다.',
      )
    }
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault()
    setError('')
    setNotice('')
    // 아이디로 만든 계정은 메일을 받을 수 없다 → 관리자에게 임시 비밀번호 재발급 요청
    if (isLoginIdAccount(toLoginEmail(email))) {
      setError('아이디로 만든 계정은 관리자(행정실)에게 임시 비밀번호 재발급을 요청해 주세요.')
      return
    }
    setSubmitting(true)
    await supabase.auth.resetPasswordForEmail(toLoginEmail(email), {
      redirectTo: `${window.location.origin}/auth/set-password`,
    })
    setSubmitting(false)
    // 계정 존재 여부를 노출하지 않도록 항상 같은 안내
    setNotice('입력하신 이메일이 등록되어 있다면 비밀번호 재설정 메일이 발송됩니다.')
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-2xl font-bold text-brand-600">인투유학</p>
          <p className="mt-1 text-sm text-slate-500">고객·등록 관리 시스템</p>
        </div>
        <Card>
          {session && profile && !profile.active && (
            <div className="mb-4">
              <Alert>비활성화된 계정입니다. 관리자에게 문의해 주세요.</Alert>
            </div>
          )}
          {session && !loading && !profile && (
            <div className="mb-4">
              <Alert>직원 정보가 등록되지 않은 계정입니다. 관리자에게 문의해 주세요.</Alert>
            </div>
          )}
          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <Field label="아이디 또는 이메일">
                <Input
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field label="비밀번호">
                <Input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              {error && <Alert>{error}</Alert>}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? '로그인 중…' : '로그인'}
              </Button>
              <button
                type="button"
                className="w-full text-center text-sm text-slate-500 hover:text-slate-700"
                onClick={() => {
                  setMode('forgot')
                  setError('')
                }}
              >
                비밀번호를 잊으셨나요?
              </button>
            </form>
          ) : (
            <form onSubmit={handleForgot} className="space-y-4">
              <p className="text-sm text-slate-600">
                이메일로 만든 계정은 재설정 링크를 메일로 보내 드립니다. 아이디로 만든 계정은 관리자(행정실)에게 임시 비밀번호 재발급을
                요청해 주세요.
              </p>
              <Field label="아이디 또는 이메일">
                <Input type="text" autoCapitalize="none" spellCheck={false} required value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              {error && <Alert>{error}</Alert>}
              {notice && <Alert tone="green">{notice}</Alert>}
              <Button type="submit" className="w-full" disabled={submitting}>
                재설정 메일 받기
              </Button>
              <button
                type="button"
                className="w-full text-center text-sm text-slate-500 hover:text-slate-700"
                onClick={() => {
                  setMode('login')
                  setNotice('')
                }}
              >
                로그인으로 돌아가기
              </button>
            </form>
          )}
        </Card>
        <p className="mt-6 text-center text-xs text-slate-400">계정은 관리자만 만들 수 있습니다.</p>
      </div>
    </div>
  )
}
