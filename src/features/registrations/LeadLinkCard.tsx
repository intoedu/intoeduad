import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Badge, Button, Card } from '../../components/ui'
import { CONSULTED_LABELS, LEAD_LINK_LABELS } from '../../domain/formSettings'
import { formatPhone } from '../../domain/phone'
import { formatKstWithDay } from '../../lib/datetime'
import { LEAD_STATUS } from '../../lib/labels'
import { supabase } from '../../lib/supabase'
import type { Registration } from './api'

type Candidate = {
  id: string
  student_name: string | null
  parent_name: string | null
  parent_phone: string | null
  status: string
  created_at: string
  partner: { name: string } | null
}

// 상담 기록 연결: 신청서의 "상담 신청 여부" 답, 자동 연결 결과, 같은 번호·이름의 상담 기록 후보와 직접 연결·해제
export function LeadLinkCard({
  registration: r,
  onChanged,
  onMessage,
}: {
  registration: Registration
  onChanged: () => void
  onMessage: (m: { tone: 'green' | 'red'; text: string } | null) => void
}) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (r.destroyed_at) return
    const name = (r.student_name_ko ?? '').replace(/[,()%]/g, ' ').trim()
    const filters = [r.parent_phone ? `parent_phone.eq.${r.parent_phone}` : null, name ? `student_name.ilike.%${name}%` : null].filter(Boolean)
    if (filters.length === 0) return
    void supabase
      .from('leads')
      .select('id, student_name, parent_name, parent_phone, status, created_at, partner:partners(name)')
      .is('deleted_at', null)
      .is('destroyed_at', null)
      .or(filters.join(','))
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => setCandidates((data ?? []) as unknown as Candidate[]))
  }, [r.parent_phone, r.student_name_ko, r.destroyed_at])

  async function link(leadId: string | null) {
    setBusy(true)
    const { data, error } = await supabase.rpc('set_registration_lead', { p_registration_id: r.id, p_lead_id: leadId as string })
    setBusy(false)
    if (error) return onMessage({ tone: 'red', text: /[가-힣]/.test(error.message) ? error.message : '연결하지 못했습니다.' })
    const attr = (data as { attribution?: string } | null)?.attribution
    onMessage({
      tone: 'green',
      text: !leadId
        ? '상담 기록 연결을 해제했습니다. 소개 경로는 그대로입니다.'
        : attr === 'copied'
          ? '상담 기록과 연결하고, 상담 기록의 소개 학원을 이어받았습니다. 소개 경로를 확인 처리해 주세요(학원 할인은 신청 시점 기준이라 다시 계산되지 않습니다).'
          : attr === 'different'
            ? '상담 기록과 연결했습니다. 상담 기록과 등록의 소개 학원이 달라 등록의 학원을 그대로 두었습니다 — 소개 경로를 확인해 주세요.'
            : '상담 기록과 연결했습니다.',
    })
    onChanged()
  }

  const others = candidates.filter((c) => c.id !== r.lead_id)

  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="font-semibold text-slate-900">상담 기록 연결</p>
        {r.lead_check_needed && <Badge tone="amber">확인 필요</Badge>}
        {r.lead_id && r.lead_link_method && <Badge tone="green">{LEAD_LINK_LABELS[r.lead_link_method] ?? '연결됨'}</Badge>}
      </div>
      <p className="text-sm text-slate-600">
        신청서 답: 상담 신청한 적 {r.consulted_before ? <strong>{CONSULTED_LABELS[r.consulted_before]}</strong> : '(묻지 않음)'}
      </p>
      {r.lead_id ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <Link to={`/admin/leads/${r.lead_id}`} className="text-brand-600 hover:underline">
            연결된 상담 기록 보기
          </Link>
          <Button variant="ghost" disabled={busy} onClick={() => void link(null)}>
            연결 해제
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-500">연결된 상담 기록이 없습니다.</p>
      )}
      {!r.destroyed_at && others.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium text-slate-500">같은 학부모 번호 또는 비슷한 학생 이름의 상담 기록</p>
          <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
            {others.map((c) => (
              <li key={c.id} className="flex flex-col gap-1 p-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Link to={`/admin/leads/${c.id}`} className="font-medium text-slate-800 hover:underline">
                    {c.student_name}
                  </Link>{' '}
                  <span className="text-slate-500">
                    · {c.parent_name} {formatPhone(c.parent_phone)} · {formatKstWithDay(c.created_at)} · {LEAD_STATUS[c.status]?.label ?? c.status}
                    {c.partner ? ` · ${c.partner.name}` : ''}
                  </span>
                </div>
                <Button variant="secondary" disabled={busy} onClick={() => void link(c.id)}>
                  {r.lead_id ? '이 기록으로 바꾸기' : '이 상담 기록과 연결'}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}
