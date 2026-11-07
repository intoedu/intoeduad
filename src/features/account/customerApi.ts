import { useCallback, useEffect, useState } from 'react'
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase, type Tables } from '../../lib/supabase'
import { toAuthPassword } from '../../domain/password'
import { useAuth } from '../auth/AuthProvider'

// 고객(학부모) 회원 — 회원 정보는 본인만 읽고(RLS), 저장은 DB 함수로만 한다.
export type CustomerProfile = Tables<'customer_profiles'>
export type CustomerStudent = Tables<'customer_students'>
export type Provider = 'kakao' | 'google'

// 회원 비밀번호: 8자 이상(서버 규칙을 못 맞추는 비밀번호는 직원 로그인과 같은 방식으로 꼬리표를 붙여 보낸다)
export const MEMBER_PASSWORD_MIN = 8

export type CustomerState =
  | { status: 'loading' }
  | { status: 'guest' }
  | { status: 'staff' }
  | { status: 'needs_setup'; email: string | null }
  | { status: 'member'; email: string | null; profile: CustomerProfile; students: CustomerStudent[] }

export function useCustomer() {
  const { session, profile: staffProfile, loading } = useAuth()
  const [state, setState] = useState<CustomerState>({ status: 'loading' })
  const uid = session?.user.id

  const reload = useCallback(async () => {
    if (!uid) return
    const [p, s] = await Promise.all([
      supabase.from('customer_profiles').select('*').eq('id', uid).maybeSingle(),
      supabase.from('customer_students').select('*').eq('customer_id', uid).order('sort').order('created_at'),
    ])
    const email = session?.user.email ?? null
    setState(p.data ? { status: 'member', email, profile: p.data, students: s.data ?? [] } : { status: 'needs_setup', email })
  }, [uid, session?.user.email])

  useEffect(() => {
    if (loading || !uid || staffProfile) return
    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) return reload()
    })
    return () => {
      cancelled = true
    }
  }, [loading, uid, staffProfile, reload])

  // 로그인 안 함 / 직원 계정은 바로 판단
  const current: CustomerState = loading ? { status: 'loading' } : !uid ? { status: 'guest' } : staffProfile ? { status: 'staff' } : state
  return { state: current, reload }
}

// 이메일 회원가입·로그인: 인증 메일을 보낼 메일 서버(SMTP)를 연결하기 전까지 운영에서는 숨긴다(2026-11-07 결정 C).
// 메일 서버를 연결한 뒤 배포 환경변수 VITE_MEMBER_EMAIL_SIGNUP=on 으로 다시 켠다. 개발·시험 환경에서는 항상 켠다.
const EMAIL_SIGNUP_ON = !import.meta.env.PROD || import.meta.env.VITE_MEMBER_EMAIL_SIGNUP === 'on'

export type LoginMethods = { kakao: boolean; google: boolean; email: boolean }
let cached: Promise<LoginMethods> | null = null

// 켜져 있는 로그인 수단(관리자가 Supabase에서 켠 것만 버튼으로 보인다)
export function enabledProviders(): Promise<LoginMethods> {
  cached ??= (async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY } })
      const json = (await res.json()) as { external?: Record<string, boolean>; disable_signup?: boolean }
      const ext = json.external ?? {}
      return { kakao: !!ext.kakao, google: !!ext.google, email: EMAIL_SIGNUP_ON && !!ext.email && !json.disable_signup }
    } catch {
      return { kakao: false, google: false, email: false }
    }
  })()
  return cached
}

export function anyLoginMethod(m: LoginMethods | null) {
  return !!m && (m.kakao || m.google || m.email)
}

// 로그인 수단(하나도 없으면 회원 안내·로그인 링크를 숨긴다)
export function useLoginMethods() {
  const [methods, setMethods] = useState<LoginMethods | null>(null)
  useEffect(() => {
    let cancelled = false
    enabledProviders().then((m) => !cancelled && setMethods(m))
    return () => {
      cancelled = true
    }
  }, [])
  return methods
}

function callbackUrl(next: string) {
  return `${window.location.origin}/account/callback?next=${encodeURIComponent(next)}`
}

export async function signInWithProvider(provider: Provider, next: string) {
  const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: callbackUrl(next) } })
  if (error) throw new Error('로그인 화면으로 이동하지 못했습니다. 잠시 후 다시 시도해 주세요.')
}

// 이메일 가입: 이메일 인증을 켠 경우 세션 없이 돌아온다(인증 메일 확인 후 로그인)
export async function signUpWithEmail(email: string, password: string, next: string): Promise<'signed_in' | 'check_email'> {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password: toAuthPassword(password),
    options: { emailRedirectTo: callbackUrl(next) },
  })
  if (error) {
    if (/registered|already/i.test(error.message)) throw new Error('이미 가입된 이메일입니다. 로그인해 주세요.')
    if (/rate|limit/i.test(error.message)) throw new Error('잠시 후 다시 시도해 주세요.')
    throw new Error('가입하지 못했습니다. 입력하신 내용을 확인해 주세요.')
  }
  return data.session ? 'signed_in' : 'check_email'
}

export async function signInWithEmail(email: string, password: string) {
  const id = email.trim().toLowerCase()
  let { error } = await supabase.auth.signInWithPassword({ email: id, password: toAuthPassword(password) })
  if (error && toAuthPassword(password) !== password && password.length >= 6) {
    ;({ error } = await supabase.auth.signInWithPassword({ email: id, password }))
  }
  if (error) {
    if (/confirm/i.test(error.message)) throw new Error('이메일 인증을 마쳐 주세요. 받은 편지함에서 인투유학 인증 메일을 확인해 주세요.')
    throw new Error('이메일 또는 비밀번호가 맞지 않습니다.')
  }
}

export async function sendPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${window.location.origin}/account/callback?next=${encodeURIComponent('/account?reset=1')}`,
  })
  if (error) throw new Error('메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.')
}

export async function changePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password: toAuthPassword(password) })
  if (error) throw new Error('비밀번호를 바꾸지 못했습니다.')
}

export async function memberConsent(): Promise<{ version: number; title: string; body: string } | null> {
  const { data } = await supabase.rpc('public_member_consent')
  return (data as { version: number; title: string; body: string } | null) ?? null
}

function dbMessage(error: { message?: string } | null, fallback: string) {
  return error?.message && /[가-힣]/.test(error.message) ? error.message : fallback
}

export type ProfileInput = {
  parent_name: string
  parent_phone: string
  parent_email: string
  relation: string
  address: string
  kakao_use: boolean | null
  kakao_alt_phone: string | null
  alt_contact: string | null
  emergency_name: string
  emergency_relation: string
  emergency_phone: string
  agree_privacy?: boolean
}

export async function saveProfile(p: ProfileInput) {
  const { error } = await supabase.rpc('customer_save_profile', { p })
  if (error) throw new Error(dbMessage(error, '저장하지 못했습니다.'))
}

export type StudentInput = {
  id?: string
  name_ko: string
  name_en?: string | null
  birth_date?: string | null
  gender?: string | null
  school?: string | null
  grade?: string | null
  english_level?: string | null
}

export async function saveStudent(p: StudentInput): Promise<string> {
  const { data, error } = await supabase.rpc('customer_save_student', { p })
  if (error) throw new Error(dbMessage(error, '자녀 정보를 저장하지 못했습니다.'))
  return data as string
}

export async function deleteStudent(id: string) {
  const { error } = await supabase.rpc('customer_delete_student', { p_id: id })
  if (error) throw new Error('지우지 못했습니다.')
}

export async function deleteAccount() {
  const { error } = await supabase.functions.invoke('customer-account', { body: { action: 'delete' } })
  if (error) throw new Error('탈퇴를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.')
  await supabase.auth.signOut()
}

// 신청서를 낸 뒤 회원 정보 보완: 빈 칸만 채우고, 처음 보는 자녀는 추가한다(실패해도 신청은 이미 끝남)
export async function rememberFromForm(
  state: CustomerState,
  student: StudentInput,
  parent: Partial<Pick<ProfileInput, 'parent_email' | 'address' | 'emergency_name' | 'emergency_relation' | 'emergency_phone' | 'relation'>>,
) {
  if (state.status !== 'member') return
  const norm = (s: string) => s.replace(/\s/g, '')
  const known = state.students.find((s) => norm(s.name_ko) === norm(student.name_ko))
  const merged: StudentInput = known
    ? {
        id: known.id,
        name_ko: known.name_ko,
        name_en: known.name_en ?? student.name_en ?? null,
        birth_date: known.birth_date ?? student.birth_date ?? null,
        gender: known.gender ?? student.gender ?? null,
        school: known.school ?? student.school ?? null,
        grade: student.grade || known.grade,
        english_level: known.english_level ?? student.english_level ?? null,
      }
    : student
  try {
    await saveStudent(merged)
    const pr = state.profile
    const fill = (a: string | null, b: string | undefined) => a ?? (b?.trim() ? b.trim() : '')
    await saveProfile({
      parent_name: pr.parent_name,
      parent_phone: pr.parent_phone,
      parent_email: fill(pr.parent_email, parent.parent_email),
      relation: fill(pr.relation, parent.relation),
      address: fill(pr.address, parent.address),
      kakao_use: pr.kakao_use,
      kakao_alt_phone: pr.kakao_alt_phone,
      alt_contact: pr.alt_contact,
      emergency_name: fill(pr.emergency_name, parent.emergency_name),
      emergency_relation: fill(pr.emergency_relation, parent.emergency_relation),
      emergency_phone: fill(pr.emergency_phone, parent.emergency_phone),
    })
  } catch {
    // 회원 정보 보완 실패는 신청 결과에 영향 없음
  }
}
