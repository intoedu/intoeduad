// 캠프 준비사항 — 마감 계산·완료 판정·준비율 (DB 함수 prep_due_date·prep_item_complete와 같은 규칙)
import { addDays } from './dates'

export type DueAnchor = 'recruit_start' | 'start' | 'none'
export type PrepStatus = 'requested' | 'producing' | 'reviewing' | 'approved' | 'distributed' | 'todo' | 'done' | 'not_applicable'

// 교차 검수 항목 키 — DB prep_review_keys()와 같아야 한다
export const PREP_REVIEW_KEYS = [
  'brand_name',
  'price_dates',
  'inclusions',
  'apply_qr',
  'no_guarantee',
  'admission_disclaimer',
  'photo_consent',
  'school_logo',
  'file_version',
] as const

export function prepDueDate(anchor: DueAnchor, offsetDays: number, recruitStart: string | null, start: string): string | null {
  if (anchor === 'recruit_start') return recruitStart ? addDays(recruitStart, offsetDays) : null
  if (anchor === 'start') return addDays(start, offsetDays)
  return null
}

export function describeAnchor(anchor: DueAnchor, offsetDays: number): string {
  if (anchor === 'none') return '마감 없음(필요 시)'
  const base = anchor === 'recruit_start' ? '모집 시작' : '출국'
  if (offsetDays === 0) return `${base}일`
  return offsetDays < 0 ? `${base} ${-offsetDays}일 전` : `${base} ${offsetDays}일 후`
}

export function isPrepComplete(status: PrepStatus, needsRecheck: boolean): boolean {
  return ['approved', 'distributed', 'done', 'not_applicable'].includes(status) && !needsRecheck
}

export function reviewMissing(checklist: unknown): string[] {
  const c = (checklist && typeof checklist === 'object' ? checklist : {}) as Record<string, unknown>
  return PREP_REVIEW_KEYS.filter((k) => c[k] !== true)
}

export type DueState = 'overdue' | 'soon' | 'upcoming' | 'none' | 'complete'

// 마감 임박 = 7일 이내(D-7), 지난 것 = 빨간 경고
export function prepDueState(dueDate: string | null, today: string, complete: boolean): DueState {
  if (complete) return 'complete'
  if (!dueDate) return 'none'
  if (dueDate < today) return 'overdue'
  if (dueDate <= addDays(today, 7)) return 'soon'
  return 'upcoming'
}

export type PrepLike = { status: PrepStatus; needs_recheck: boolean; required: boolean; gate_open: boolean }

export function prepProgress(items: PrepLike[]): { done: number; total: number; gatePending: number } {
  const required = items.filter((i) => i.required)
  return {
    done: required.filter((i) => isPrepComplete(i.status, i.needs_recheck)).length,
    total: required.length,
    gatePending: items.filter((i) => i.gate_open && !isPrepComplete(i.status, i.needs_recheck)).length,
  }
}
