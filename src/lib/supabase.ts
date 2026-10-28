import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY 환경변수를 설정해 주세요.')
}

// 초대·비밀번호 재설정 링크 여부는 클라이언트가 주소의 토큰을 지우기 전에 기록해 둔다
const hash = typeof window !== 'undefined' ? window.location.hash : ''
export const openedFromAuthLink = hash.includes('type=invite') || hash.includes('type=recovery')

export const supabase = createClient<Database>(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

// Edge Function 호출: 실패 시 함수가 돌려준 한국어 메시지를 그대로 꺼낸다
export async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body })
  if (error) {
    let message = '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'
    const context = (error as { context?: Response }).context
    if (context && typeof context.json === 'function') {
      try {
        const payload = await context.json()
        if (payload?.error) message = payload.error
      } catch {
        // 본문이 JSON이 아니면 기본 메시지 사용
      }
    }
    throw new Error(message)
  }
  return data as T
}
