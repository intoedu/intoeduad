import { supabase } from '../../lib/supabase'
import { SubmitError } from './publicApi'

// 캠프 등록 신청서 — 조회는 개인정보 없는 공개 함수, 미리 채움·저장·확인은 Edge Function(public-register)
export type FieldMode = 'required' | 'optional' | 'hidden'
export type RegisterFieldKey =
  | 'student_name_en'
  | 'birth_date'
  | 'gender'
  | 'school'
  | 'grade'
  | 'english_level'
  | 'parent_email'
  | 'address'
  | 'emergency'
  | 'special_notes'

export type ScheduleLine = { kind: 'deposit' | 'balance' | 'extra'; label: string; amount: number; due_date: string }
export type RegisterConsent = { kind: string; version: number; title: string; body: string; required: boolean }

export type RegisterForm = {
  status: 'before' | 'open' | 'closed'
  is_full?: boolean
  waitlist_enabled?: boolean
  program: {
    slug?: string
    type?: string
    name: string
    season: string | null
    country?: string | null
    start_date?: string
    end_date?: string
    total_price?: number
    description?: string | null
    passport_upload_enabled?: boolean
    health_field_enabled?: boolean
  }
  fields?: Record<RegisterFieldKey, FieldMode>
  schedule?: ScheduleLine[]
  destroy_date?: string
  consents?: RegisterConsent[]
  refund?: { version: number; body: string }
  kakao_channel_url: string | null
}

export type Prefill = {
  student_name: string | null
  student_grade: string | null
  parent_name: string | null
  parent_phone: string | null
  partner: { id: string; name: string } | null
  contact: { id: string; name: string } | null
}

export type BankAccount = { bank: string; number: string; holder: string }

export type RegistrationSummary = {
  status: string
  destroyed: boolean
  student_name: string | null
  parent_name: string | null
  registered_on: string
  passport_status: string
  destroy_date: string | null
  program: { name: string; season: string | null; country: string | null; start_date: string; end_date: string; end_plus_days: number }
  schedule: Array<ScheduleLine & { paid: number; status: 'scheduled' | 'partial' | 'paid' | 'overdue' | 'canceled' }>
  bank_account: BankAccount | null
  kakao_channel_url: string | null
}

export type RegistrationSubmission = {
  slug: string
  token: string | null
  partner_code: string | null
  contact_code: string | null
  partner_id: string | null
  contact_id: string | null
  source_other: string | null
  student_name_ko: string
  student_name_en: string
  birth_date: string
  gender: string
  school: string
  grade: string
  english_level: string
  parent_name: string
  parent_phone: string
  parent_email: string
  address: string
  emergency_name: string
  emergency_relation: string
  emergency_phone: string
  special_notes: string
  health_notes: string
  agree: Record<string, boolean>
  website: string
}

export async function getRegisterForm(slug: string): Promise<RegisterForm | null> {
  const { data, error } = await supabase.rpc('public_register_form', { p_slug: slug })
  if (error) throw error
  return (data as unknown as RegisterForm) ?? null
}

async function invoke<T>(body: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('public-register', { body })
  if (error) {
    let message = fallback
    let code: string | undefined
    const context = (error as { context?: Response }).context
    if (context && typeof context.json === 'function') {
      try {
        const payload = await context.json()
        if (payload?.error) message = payload.error
        code = payload?.code
      } catch {
        // 본문이 JSON이 아니면 기본 메시지
      }
    }
    throw new SubmitError(message, code)
  }
  return data as T
}

export async function getPrefill(token: string): Promise<Prefill | null> {
  try {
    const res = await invoke<{ prefill: Prefill | null }>({ action: 'prefill', token }, '')
    return res.prefill
  } catch {
    return null
  }
}

export async function submitRegistration(body: RegistrationSubmission) {
  return invoke<{ ok: boolean; status: string; my_token: string | null; summary: RegistrationSummary | null }>(
    { action: 'submit', ...body },
    '신청을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.',
  )
}

export async function getMySummary(token: string): Promise<RegistrationSummary> {
  const res = await invoke<{ summary: RegistrationSummary }>({ action: 'my', token }, '신청 내용을 불러오지 못했습니다.')
  return res.summary
}
