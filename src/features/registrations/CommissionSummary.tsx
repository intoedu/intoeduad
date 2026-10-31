import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Badge, Card } from '../../components/ui'
import { formatDateKo } from '../../domain/dates'
import { formatWon } from '../../domain/registration'
import { supabase, type Views } from '../../lib/supabase'
import { COMMISSION_STATUS } from '../commissions/CommissionsPage'

// 등록생 상세: 이 등록으로 생긴 커미션(내부 전용)
export function CommissionSummary({ registrationId }: { registrationId: string }) {
  const [rows, setRows] = useState<Views<'v_commissions'>[]>([])
  useEffect(() => {
    supabase
      .from('v_commissions')
      .select('*')
      .eq('registration_id', registrationId)
      .then(({ data }) => setRows(data ?? []))
  }, [registrationId])
  if (rows.length === 0) return null
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <p className="font-semibold text-slate-900">커미션 (내부 전용)</p>
        <Link to="/admin/commissions" className="text-sm text-brand-600 hover:underline">
          커미션 정산
        </Link>
      </div>
      <ul className="space-y-1 text-sm">
        {rows.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2">
            <Badge tone={COMMISSION_STATUS[c.status ?? '']?.tone ?? 'gray'}>{COMMISSION_STATUS[c.status ?? '']?.label}</Badge>
            <span>
              {c.partner_name} {c.kind === 'referral' ? '(학원 간 소개)' : ''} · {c.amount === null ? '금액 미정' : formatWon(c.amount)}
              {c.due_date ? ` · ${formatDateKo(c.due_date)} 지급 예정` : ''}
              {c.status_reason ? ` · ${c.status_reason}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
