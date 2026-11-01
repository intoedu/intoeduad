import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Badge, EmptyState, Field, Input, PageHeader, Select, Spinner } from '../../components/ui'
import { addDays, kstDayStartIso } from '../../domain/dates'
import { formatKst, todayKst } from '../../lib/datetime'
import { supabase, type Tables } from '../../lib/supabase'

type Log = Tables<'passport_access_logs'>

const ACTIONS: Record<string, { label: string; tone: 'gray' | 'blue' | 'amber' | 'red' | 'green' }> = {
  upload: { label: '업로드', tone: 'green' },
  view: { label: '열람', tone: 'blue' },
  download: { label: '다운로드', tone: 'amber' },
  delete: { label: '삭제', tone: 'red' },
  auto_delete: { label: '자동 파기', tone: 'red' },
}

// 여권 사진 접속기록 (관리자 전용, 2년 이상 보관 — 수정·삭제 불가 테이블)
export function PassportLogsPage() {
  const [rows, setRows] = useState<Log[] | null>(null)
  const [action, setAction] = useState('')
  const [from, setFrom] = useState(addDays(todayKst(), -30))
  const [to, setTo] = useState(todayKst())

  useEffect(() => {
    let q = supabase
      .from('passport_access_logs')
      .select('*')
      .gte('created_at', kstDayStartIso(from))
      .lt('created_at', kstDayStartIso(addDays(to, 1)))
      .order('created_at', { ascending: false })
      .limit(500)
    if (action) q = q.eq('action', action)
    q.then(({ data }) => setRows(data ?? []))
  }, [action, from, to])

  return (
    <>
      <PageHeader
        title="여권 접근 기록"
        description="여권 사진의 업로드·열람·다운로드·삭제 기록입니다. 수정·삭제할 수 없으며 2년 이상 보관합니다. (한 번에 최대 500건)"
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Field label="동작">
          <Select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">전체</option>
            {Object.entries(ACTIONS).map(([v, a]) => (
              <option key={v} value={v}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="시작일">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="종료일">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      {!rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState>기록이 없습니다.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2">일시</th>
                <th className="px-4 py-2">동작</th>
                <th className="px-4 py-2">한 사람</th>
                <th className="px-4 py-2">IP</th>
                <th className="px-4 py-2">등록생</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const a = ACTIONS[r.action]
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-2 whitespace-nowrap">{formatKst(r.created_at, 'yyyy-MM-dd HH:mm:ss')}</td>
                    <td className="px-4 py-2">{a ? <Badge tone={a.tone}>{a.label}</Badge> : r.action}</td>
                    <td className="px-4 py-2">{r.actor_name ?? (r.action === 'upload' ? '학부모' : r.action === 'auto_delete' ? '자동 작업' : '-')}</td>
                    <td className="px-4 py-2 font-mono text-xs">{(r.ip as string | null) ?? '-'}</td>
                    <td className="px-4 py-2">
                      <Link to={`/admin/registrations/${r.registration_id}`} className="text-brand-600 hover:underline">
                        보기
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
