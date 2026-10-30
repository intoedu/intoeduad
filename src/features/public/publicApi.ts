import { supabase } from '../../lib/supabase'

// 공개 신청 폼에서 쓰는 조회 — 모두 개인정보 없는 전용 함수(RPC)만 호출한다
export type PublicConsent = { kind: string; version: number; title: string; body: string }
export type PublicFormConfig = { kakao_channel_url: string | null; consents: PublicConsent[] }
export type PublicContact = { id: string; name: string; role: string; code?: string }
export type PublicPartner = { id: string; name: string; contacts: PublicContact[] }
export type PublicSlot = { id: string; starts_at: string; ends_at: string }

export async function getFormConfig(): Promise<PublicFormConfig> {
  const { data, error } = await supabase.rpc('public_lead_form_config')
  if (error) throw error
  return data as unknown as PublicFormConfig
}

export async function getPartnerByCode(code: string): Promise<PublicPartner | null> {
  const { data } = await supabase.rpc('public_partner_by_code', { p_code: code })
  const row = data?.[0]
  if (!row) return null
  return { id: row.id, name: row.name, contacts: (row.contacts as unknown as PublicContact[]) ?? [] }
}

export async function listPartners() {
  const { data } = await supabase.rpc('public_partners')
  return data ?? []
}

export async function listPartnerContacts(partnerId: string): Promise<PublicContact[]> {
  const { data } = await supabase.rpc('public_partner_contacts', { p_partner_id: partnerId })
  return data ?? []
}

export async function listPrograms() {
  const { data } = await supabase.rpc('public_programs')
  return data ?? []
}

export async function listAvailableSlots(from: string, to: string): Promise<PublicSlot[]> {
  const { data } = await supabase.rpc('public_available_slots', { p_from: from, p_to: to })
  return data ?? []
}

export type LeadSubmission = {
  partner_code?: string | null
  contact_code?: string | null
  partner_id?: string | null
  contact_id?: string | null
  source_other?: string | null
  student_name: string
  student_grade: string
  interests: string[]
  program_ids: string[]
  parent_name: string
  parent_phone: string
  relation: string
  topics: string[]
  message: string
  slot_id: string | null
  agree_privacy: boolean
  agree_guardian: boolean
  website: string
}

export class SubmitError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.code = code
  }
}

export async function submitLead(body: LeadSubmission): Promise<{ scheduled_at: string | null }> {
  const { data, error } = await supabase.functions.invoke<{ ok: boolean; scheduled_at: string | null }>('public-lead-submit', {
    body,
  })
  if (error) {
    let message = '신청을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.'
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
  return { scheduled_at: data?.scheduled_at ?? null }
}
