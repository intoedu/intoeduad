import { supabase, type Tables } from '../../lib/supabase'

export type Registration = Tables<'registrations'> & {
  programs: Pick<Tables<'programs'>, 'id' | 'name' | 'season' | 'start_date' | 'end_date' | 'passport_upload_enabled' | 'total_price' | 'refund_rules' | 'type'> | null
  partners: Pick<Tables<'partners'>, 'id' | 'name' | 'code'> | null
  partner_contacts: Pick<Tables<'partner_contacts'>, 'id' | 'name'> | null
}

export type ConsentRecord = Pick<Tables<'consent_records'>, 'id' | 'kind' | 'document_version' | 'agreed' | 'agreed_at' | 'rendered_text' | 'withdrawn_at'>

export async function getRegistration(id: string) {
  const [reg, health, consents, board] = await Promise.all([
    supabase
      .from('registrations')
      .select(
        '*, programs(id, name, season, start_date, end_date, passport_upload_enabled, total_price, refund_rules, type), partners(id, name, code), partner_contacts(id, name)',
      )
      .eq('id', id)
      .maybeSingle(),
    supabase.from('registration_health_notes').select('body').eq('registration_id', id).maybeSingle(),
    supabase
      .from('consent_records')
      .select('id, kind, document_version, agreed, agreed_at, rendered_text, withdrawn_at')
      .eq('registration_id', id)
      .order('created_at'),
    supabase.from('v_registration_board').select('total_due, total_paid, core_paid').eq('id', id).maybeSingle(),
  ])
  return {
    paidTotal: board.data?.total_paid ?? 0,
    corePaid: !!board.data?.core_paid,
    registration: (reg.data as Registration | null) ?? null,
    health: health.data?.body ?? null,
    consents: (consents.data ?? []) as ConsentRecord[],
  }
}

export const CONSENT_RECORD_LABELS: Record<string, string> = {
  reg_privacy: '개인정보 수집·이용',
  reg_passport: '고유식별정보(여권)',
  reg_third_party: '제3자 제공·국외 이전',
  reg_health: '민감정보(건강)',
  reg_guardian: '법정대리인 확인',
  reg_partner_share: '소개 학원 제공(선택)',
  refund_policy: '환불 규정 확인',
  destruction_notice: '파기 안내 확인',
}
