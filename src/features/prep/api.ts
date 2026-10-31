import { supabase, type Tables } from '../../lib/supabase'

export type PrepItem = Tables<'program_prep_items'>
export type PrepVersion = Tables<'program_prep_versions'>
export type PrepTemplate = Tables<'prep_item_templates'>

export async function getPrepItems(programId: string) {
  const [items, versions] = await Promise.all([
    supabase.from('program_prep_items').select('*').eq('program_id', programId).is('deleted_at', null).order('sort').order('created_at'),
    supabase
      .from('program_prep_versions')
      .select('*, program_prep_items!inner(program_id)')
      .eq('program_prep_items.program_id', programId)
      .order('version', { ascending: false }),
  ])
  return { items: items.data ?? [], versions: (versions.data ?? []) as PrepVersion[] }
}

// DB 오류 문구가 한국어면 그대로, 아니면 기본 문구
export function prepErrorText(error: { message?: string } | null, fallback = '저장하지 못했습니다.'): string {
  if (error?.message && /[가-힣]/.test(error.message)) return error.message
  return fallback
}

// "모집 중" 전환이 준비사항 경고로 막혔는지
export function isPrepIncomplete(error: { message?: string } | null): boolean {
  return !!error?.message?.startsWith('PREP_INCOMPLETE')
}
