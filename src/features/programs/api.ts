import type { PaymentRule } from '../../domain/paymentRules'
import { supabase, type Tables } from '../../lib/supabase'

export type Program = Tables<'programs'>
export type Milestone = Tables<'program_milestones'>

// 등록 신청서 항목 설정: 필수 / 선택 / 숨김 (학생 한글 이름·학부모 이름·연락처는 항상 필수)
export type FieldMode = 'required' | 'optional' | 'hidden'

export const FORM_FIELDS: Array<{ key: string; label: string; default: FieldMode; note?: string }> = [
  { key: 'student_name_en', label: '학생 영문 이름(여권과 동일)', default: 'required', note: '항공권 발권에 필요' },
  { key: 'birth_date', label: '생년월일', default: 'required' },
  { key: 'gender', label: '성별', default: 'required', note: '숙소 배정에 필요' },
  { key: 'school', label: '학교', default: 'optional' },
  { key: 'grade', label: '학년', default: 'required' },
  { key: 'english_level', label: '영어 수준', default: 'optional' },
  { key: 'parent_email', label: '학부모 이메일', default: 'required' },
  { key: 'address', label: '주소', default: 'optional' },
  { key: 'emergency', label: '비상 연락처(이름·관계·연락처)', default: 'required' },
  { key: 'special_notes', label: '특이사항', default: 'optional' },
]

export function fieldModes(config: unknown): Record<string, FieldMode> {
  const saved = (config && typeof config === 'object' ? (config as { fields?: Record<string, FieldMode> }).fields : undefined) ?? {}
  return Object.fromEntries(FORM_FIELDS.map((f) => [f.key, saved[f.key] ?? f.default]))
}

export type RefundRule = { min_days: number | null; max_days: number | null; rate: number }

export type ThirdParties = {
  ticketing?: string
  school?: { name?: string; country?: string }
  lodging?: { name?: string; country?: string }
}

export async function getProgram(id: string) {
  const [program, rules, milestones] = await Promise.all([
    supabase.from('programs').select('*').eq('id', id).maybeSingle(),
    supabase.from('program_payment_rules').select('*').eq('program_id', id).order('sort'),
    supabase.from('program_milestones').select('*').eq('program_id', id).order('date'),
  ])
  return {
    program: program.data,
    rules: (rules.data ?? []) as Array<PaymentRule & { id: string }>,
    milestones: milestones.data ?? [],
  }
}

export async function getDefaults() {
  const [refundRules, refundDoc, thirdPartyDoc] = await Promise.all([
    supabase.from('settings').select('value').eq('key', 'refund_rules_default').maybeSingle(),
    supabase.from('consent_documents').select('body, version').eq('kind', 'refund_default').order('version', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('consent_documents').select('body, version').eq('kind', 'reg_third_party').order('version', { ascending: false }).limit(1).maybeSingle(),
  ])
  return {
    refundRules: (refundRules.data?.value as RefundRule[] | undefined) ?? [],
    refundText: refundDoc.data?.body ?? '',
    thirdPartyTemplate: thirdPartyDoc.data?.body ?? '',
  }
}

export function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] || `(${key} 미입력)`)
}

export function thirdPartyValues(tp: ThirdParties): Record<string, string> {
  return {
    ticketing_agent: tp.ticketing ?? '',
    school_name: tp.school?.name ?? '',
    school_country: tp.school?.country ?? '',
    lodging_name: tp.lodging?.name ?? '',
    lodging_country: tp.lodging?.country ?? '',
  }
}

export function won(n: number | null | undefined): string {
  return n === null || n === undefined ? '-' : `${n.toLocaleString('ko-KR')}원`
}
