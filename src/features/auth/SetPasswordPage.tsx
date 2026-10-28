import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { Alert, Button, Card, Field, Input, Spinner } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { useAuth } from './AuthProvider'

const MIN_LENGTH = 10

export function SetPasswordPage() {
  const { session, loading, finishRecovery } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (loading) return <Spinner />
  // 링크가 만료되었거나 직접 주소로 들어온 경우
  if (!session) return <Navigate to="/login" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < MIN_LENGTH || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError(`비밀번호는 영문과 숫자를 포함해 ${MIN_LENGTH}자 이상이어야 합니다.`)
      return
    }
    if (password !== confirm) {
      setError('비밀번호가 서로 다릅니다.')
      return
    }
    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (error) {
      setError('비밀번호를 저장하지 못했습니다. 링크가 만료되었다면 관리자에게 재발송을 요청해 주세요.')
      return
    }
    finishRecovery()
    navigate('/admin', { replace: true })
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-2xl font-bold text-brand-600">인투유학</p>
          <p className="mt-1 text-sm text-slate-500">비밀번호 설정</p>
        </div>
        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-slate-600">{session.user.email} 계정의 비밀번호를 설정합니다.</p>
            <Field label="새 비밀번호" hint={`영문과 숫자를 포함해 ${MIN_LENGTH}자 이상`}>
              <Input
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field label="새 비밀번호 확인">
              <Input
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
            {error && <Alert>{error}</Alert>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? '저장 중…' : '비밀번호 저장'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
