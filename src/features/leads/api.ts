import { CONSULT_METHOD, CONSULT_STATUS, LEAD_STATUS } from '../../lib/labels'
import { supabase, type Tables } from '../../lib/supabase'

export type Consultation = Tables<'consultations'>

export type LeadRow = Tables<'leads'> & {
  partner: { id: string; name: string; code: string } | null
  contact: { id: string; name: string } | null
  assignee: { id: string; name: string } | null
  interests_programs: Array<{ program: { id: string; name: string; season: string | null } | null }>
  consultations: Consultation[]
}

const LEAD_SELECT = `*,
  partner:partners(id, name, code),
  contact:partner_contacts(id, name),
  assignee:staff_profiles!leads_assigned_to_fkey(id, name),
  interests_programs:lead_program_interests(program:programs(id, name, season)),
  consultations(*)`

export type LeadFilters = {
  status: string
  partnerId: string
  programId: string
  assigneeId: string
  from: string
  to: string
  query: string
  unconfirmedOnly: boolean
}

export const EMPTY_FILTERS: LeadFilters = {
  status: '',
  partnerId: '',
  programId: '',
  assigneeId: '',
  from: '',
  to: '',
  query: '',
  unconfirmedOnly: false,
}

export async function listLeads(f: LeadFilters): Promise<LeadRow[]> {
  let q = supabase.from('leads').select(LEAD_SELECT).is('deleted_at', null).order('created_at', { ascending: false }).limit(300)
  if (f.status) q = q.eq('status', f.status)
  if (f.partnerId === 'none') q = q.is('partner_id', null)
  else if (f.partnerId) q = q.eq('partner_id', f.partnerId)
  if (f.assigneeId === 'none') q = q.is('assigned_to', null)
  else if (f.assigneeId) q = q.eq('assigned_to', f.assigneeId)
  if (f.from) q = q.gte('created_at', `${f.from}T00:00:00+09:00`)
  if (f.to) q = q.lte('created_at', `${f.to}T23:59:59+09:00`)
  if (f.unconfirmedOnly) q = q.is('attribution_confirmed_at', null)
  const text = f.query.trim()
  if (text) {
    const digits = text.replace(/\D/g, '')
    const safe = text.replace(/[,()%]/g, ' ')
    q = digits.length >= 4
      ? q.or(`parent_phone.ilike.%${digits}%,student_name.ilike.%${safe}%,parent_name.ilike.%${safe}%`)
      : q.or(`student_name.ilike.%${safe}%,parent_name.ilike.%${safe}%`)
  }
  const { data, error } = await q
  if (error) throw error
  let rows = (data ?? []) as unknown as LeadRow[]
  if (f.programId) rows = rows.filter((r) => r.interests_programs.some((ip) => ip.program?.id === f.programId))
  return rows
}

export async function getLead(id: string): Promise<LeadRow | null> {
  const { data } = await supabase.from('leads').select(LEAD_SELECT).eq('id', id).maybeSingle()
  return (data as unknown as LeadRow | null) ?? null
}

// 가장 최근의 유효한 상담(취소 제외)
export function activeConsultation(lead: Pick<LeadRow, 'consultations'>): Consultation | null {
  return (
    [...lead.consultations]
      .filter((c) => c.status !== 'canceled')
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0] ?? null
  )
}

// ---------------------------------------------------------------------------
// 타임라인: 감사 기록(상태·담당자·상담 변경) + 메모를 시간순으로
// ---------------------------------------------------------------------------
export type TimelineItem = { at: string; actor: string | null; text: string; kind: 'apply' | 'status' | 'consult' | 'note' | 'attribution' | 'other' }

type Log = Tables<'activity_logs'>

function describeLeadLog(log: Log, staff: Map<string, string>): TimelineItem[] {
  const actor = log.actor_id ? (staff.get(log.actor_id) ?? '직원') : null
  if (log.action === 'insert') return [{ at: log.created_at, actor, text: '상담 신청 접수', kind: 'apply' }]
  const before = (log.before ?? {}) as Record<string, unknown>
  const after = (log.after ?? {}) as Record<string, unknown>
  const items: TimelineItem[] = []
  for (const field of log.changed_fields ?? []) {
    if (field === 'status') {
      items.push({
        at: log.created_at,
        actor,
        text: `상태 변경: ${LEAD_STATUS[String(before.status)]?.label ?? before.status} → ${LEAD_STATUS[String(after.status)]?.label ?? after.status}`,
        kind: 'status',
      })
    } else if (field === 'assigned_to') {
      const name = after.assigned_to ? (staff.get(String(after.assigned_to)) ?? '직원') : '없음'
      items.push({ at: log.created_at, actor, text: `담당자 지정: ${name}`, kind: 'other' })
    } else if (field === 'attribution_confirmed_at') {
      items.push({
        at: log.created_at,
        actor,
        text: after.attribution_confirmed_at ? '소개 경로 확인' : '소개 경로 확인 해제',
        kind: 'attribution',
      })
    } else if (field === 'partner_id' || field === 'partner_contact_id') {
      if (!items.some((i) => i.text === '소개 경로 변경')) items.push({ at: log.created_at, actor, text: '소개 경로 변경', kind: 'attribution' })
    }
  }
  return items
}

function describeConsultLog(log: Log, staff: Map<string, string>): TimelineItem[] {
  const actor = log.actor_id ? (staff.get(log.actor_id) ?? '직원') : null
  const after = (log.after ?? {}) as Record<string, unknown>
  if (log.action === 'insert') {
    return [{ at: log.created_at, actor, text: '상담 일정 등록', kind: 'consult' }]
  }
  const items: TimelineItem[] = []
  const fields = log.changed_fields ?? []
  if (fields.includes('method')) {
    items.push({ at: log.created_at, actor, text: `상담 방식: ${CONSULT_METHOD[String(after.method)] ?? after.method}`, kind: 'consult' })
  }
  if (fields.includes('status')) {
    items.push({ at: log.created_at, actor, text: `상담 ${CONSULT_STATUS[String(after.status)]?.label ?? after.status}`, kind: 'consult' })
  }
  if (fields.includes('scheduled_at') || fields.includes('slot_id')) {
    items.push({ at: log.created_at, actor, text: '상담 일정 변경', kind: 'consult' })
  }
  return items
}

export async function loadTimeline(lead: LeadRow): Promise<TimelineItem[]> {
  const consultIds = lead.consultations.map((c) => c.id)
  const [leadLogs, consultLogs, notes, staff] = await Promise.all([
    supabase.from('activity_logs').select('*').eq('entity_type', 'leads').eq('entity_id', lead.id).order('created_at'),
    consultIds.length
      ? supabase.from('activity_logs').select('*').eq('entity_type', 'consultations').in('entity_id', consultIds).order('created_at')
      : Promise.resolve({ data: [] as Log[] }),
    supabase.from('notes').select('created_at, author_id, body').eq('entity_type', 'lead').eq('entity_id', lead.id).is('deleted_at', null),
    supabase.from('staff_profiles').select('id, name'),
  ])
  const names = new Map((staff.data ?? []).map((s) => [s.id, s.name]))
  const items: TimelineItem[] = [
    ...(leadLogs.data ?? []).flatMap((l) => describeLeadLog(l, names)),
    ...(consultLogs.data ?? []).flatMap((l) => describeConsultLog(l, names)),
    ...(notes.data ?? []).map((n) => ({
      at: n.created_at,
      actor: names.get(n.author_id) ?? '직원',
      text: `메모: ${n.body.length > 60 ? `${n.body.slice(0, 60)}…` : n.body}`,
      kind: 'note' as const,
    })),
  ]
  // 신청 기록이 감사 기록보다 먼저 생긴 경우(이전 데이터) 대비
  if (!items.some((i) => i.kind === 'apply')) items.push({ at: lead.created_at, actor: null, text: '상담 신청 접수', kind: 'apply' })
  return items.sort((a, b) => a.at.localeCompare(b.at))
}
