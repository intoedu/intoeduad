import { supabase, type Tables } from '../../lib/supabase'
import type { Database } from '../../types/database'

export type Partner = Tables<'partners'>
export type PartnerContact = Tables<'partner_contacts'>
export type PayoutAccount = Tables<'payout_accounts'>
export type PartnerAgreement = Database['public']['Views']['v_partner_agreements']['Row']

export type PartnerListItem = Partner & {
  contactCount: number
  leadCount: number
  registrationCount: number
  agreement: PartnerAgreement | null
}

// 학원별 대표 협약: 현재 유효한 것 우선, 없으면 가장 최근 것
function pickAgreement(list: PartnerAgreement[]): PartnerAgreement | null {
  const order = ['active', 'renewal_window', 'scheduled', 'expired', 'terminated']
  return (
    [...list].sort(
      (a, b) =>
        order.indexOf(a.status ?? '') - order.indexOf(b.status ?? '') ||
        (b.start_date ?? '').localeCompare(a.start_date ?? ''),
    )[0] ?? null
  )
}

export async function listPartners(): Promise<PartnerListItem[]> {
  const [partners, contacts, agreements, counts] = await Promise.all([
    supabase.from('partners').select('*').is('deleted_at', null).order('name'),
    supabase.from('partner_contacts').select('partner_id').eq('active', true),
    supabase.from('v_partner_agreements').select('*'),
    supabase.rpc('partner_referral_counts'),
  ])
  if (partners.error) throw partners.error

  const contactCount = new Map<string, number>()
  for (const c of contacts.data ?? []) contactCount.set(c.partner_id, (contactCount.get(c.partner_id) ?? 0) + 1)
  const agreementsBy = new Map<string, PartnerAgreement[]>()
  for (const a of agreements.data ?? []) {
    if (!a.partner_id) continue
    agreementsBy.set(a.partner_id, [...(agreementsBy.get(a.partner_id) ?? []), a])
  }
  const countBy = new Map((counts.data ?? []).map((c) => [c.partner_id, c]))

  return partners.data.map((p) => ({
    ...p,
    contactCount: contactCount.get(p.id) ?? 0,
    leadCount: Number(countBy.get(p.id)?.lead_count ?? 0),
    registrationCount: Number(countBy.get(p.id)?.registration_count ?? 0),
    agreement: pickAgreement(agreementsBy.get(p.id) ?? []),
  }))
}

export async function isPartnerCodeTaken(code: string, exceptId?: string): Promise<boolean> {
  let query = supabase.from('partners').select('id').eq('code', code)
  if (exceptId) query = query.neq('id', exceptId)
  const { data } = await query.limit(1)
  return (data?.length ?? 0) > 0
}

// 같은 지역에 유효한 독점권 협약이 있는 다른 학원 (신규 협약 전 대조 — 매뉴얼 MOU-10)
export async function findExclusiveConflicts(region: string, exceptPartnerId?: string) {
  const key = region.trim()
  if (!key) return []
  const { data } = await supabase
    .from('v_partner_agreements')
    .select('partner_id, exclusive_region, status')
    .eq('agreement_type', 'exclusive')
    .in('status', ['active', 'renewal_window', 'scheduled'])
  const hits = (data ?? []).filter(
    (a) =>
      a.partner_id !== exceptPartnerId &&
      a.exclusive_region &&
      (a.exclusive_region.includes(key) || key.includes(a.exclusive_region.trim().split(/\s+/)[0])),
  )
  if (hits.length === 0) return []
  const { data: partners } = await supabase
    .from('partners')
    .select('id, name')
    .in('id', hits.map((h) => h.partner_id!))
  return hits.map((h) => ({
    partnerName: partners?.find((p) => p.id === h.partner_id)?.name ?? '',
    region: h.exclusive_region ?? '',
  }))
}

export function errorMessage(error: { message?: string; code?: string } | null, fallback: string): string {
  if (!error) return fallback
  if (error.code === '23505') return '이미 사용 중인 코드입니다. 다른 코드를 입력해 주세요.'
  if (error.code === '23514') return '입력 형식을 확인해 주세요.'
  if (error.message && /[가-힣]/.test(error.message)) return error.message
  return fallback
}
