import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../features/auth/AuthProvider'
import { formatKstWithDay } from '../../lib/datetime'
import { supabase, type Tables } from '../../lib/supabase'
import { Button, Card, EmptyState, Textarea } from '../ui'

type Note = Tables<'notes'> & { author: { name: string } | null }
type EntityType = 'lead' | 'registration' | 'program' | 'partner'

// 메모: 작성자·시각은 자동 기록, 수정은 작성자 본인만(DB 규칙)
export function NotesPanel({
  entityType,
  entityId,
  onChanged,
}: {
  entityType: EntityType
  entityId: string
  onChanged?: () => void
}) {
  const { profile } = useAuth()
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('notes')
      .select('*, author:staff_profiles!notes_author_id_fkey(name)')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    setNotes((data as Note[] | null) ?? [])
  }, [entityType, entityId])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!body.trim() || !profile) return
    setSaving(true)
    setError('')
    const { error } = await supabase
      .from('notes')
      .insert({ entity_type: entityType, entity_id: entityId, author_id: profile.id, body: body.trim() })
    setSaving(false)
    if (error) {
      setError('메모를 저장하지 못했습니다.')
      return
    }
    setBody('')
    await load()
    onChanged?.()
  }

  return (
    <Card>
      <p className="mb-3 font-semibold text-slate-900">메모</p>
      <form onSubmit={handleSubmit} className="mb-4 space-y-2">
        <Textarea
          aria-label="메모 입력"
          rows={3}
          placeholder="통화 내용, 다음 연락 예정 등을 남겨 주세요"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <Button type="submit" disabled={saving || !body.trim()}>
          {saving ? '저장 중…' : '메모 남기기'}
        </Button>
      </form>
      {notes && notes.length === 0 && <EmptyState>아직 메모가 없습니다.</EmptyState>}
      <ul className="space-y-3">
        {notes?.map((n) => (
          <li key={n.id} className="rounded-lg bg-slate-50 p-3">
            <p className="text-sm whitespace-pre-wrap text-slate-800">{n.body}</p>
            <p className="mt-1 text-xs text-slate-500">
              {n.author?.name ?? '알 수 없음'} · {formatKstWithDay(n.created_at)}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  )
}
