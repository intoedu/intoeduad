import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Alert, Badge, Button, EmptyState, Field, PageHeader, Select, Spinner } from '../../components/ui'
import { formatKst } from '../../lib/datetime'
import { invokeFunction, supabase, type Tables } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'

type Log = Tables<'message_logs'> & { staff_profiles: { name: string } | null }

export const MESSAGE_PURPOSE: Record<string, string> = {
  lead_received: '상담 접수 안내',
  registration_payment_notice: '등록·납부 안내',
  registration_waitlisted: '대기 접수 안내',
  payment_notice_correction: '납부 정정 안내',
  staff_new_lead: '직원: 신규 상담',
  staff_new_registration: '직원: 신규 등록',
  staff_passport_uploaded: '직원: 여권 업로드',
  staff_destruction_overdue: '관리자: 파기 미승인',
  staff_commission_overdue: '관리자: 커미션 지연',
  staff_test: '테스트',
}
export const MESSAGE_STATUS: Record<string, { label: string; tone: 'gray' | 'blue' | 'green' | 'amber' | 'red' }> = {
  queued: { label: '대기', tone: 'blue' },
  sent: { label: '보냄', tone: 'green' },
  failed: { label: '실패', tone: 'red' },
  skipped: { label: '보내지 않음', tone: 'gray' },
}
const CHANNEL: Record<string, string> = { alimtalk: '알림톡', sms: '문자', lms: '문자', email: '이메일' }

export function MessageHistory({ relatedId }: { relatedId: string }) {
  const [rows, setRows] = useState<Log[]>([])
  useEffect(() => {
    supabase
      .from('message_logs')
      .select('*, staff_profiles:recipient_staff_id(name)')
      .eq('related_id', relatedId)
      .is('recipient_staff_id', null)
      .order('created_at')
      .then(({ data }) => setRows((data ?? []) as Log[]))
  }, [relatedId])
  if (rows.length === 0) return null
  return (
    <ul className="space-y-1 text-sm" aria-label="알림 발송 기록">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-2">
          <Badge tone={MESSAGE_STATUS[r.status]?.tone ?? 'gray'}>{MESSAGE_STATUS[r.status]?.label ?? r.status}</Badge>
          <span>{MESSAGE_PURPOSE[r.purpose] ?? r.purpose}</span>
          <span className="text-xs text-slate-500">
            {formatKst(r.sent_at ?? r.created_at)}
            {r.error ? ` · ${r.error}` : ''}
          </span>
        </li>
      ))}
    </ul>
  )
}

// 발송 기록 — 번호는 가린 형태로만, 내용(이름 등)은 남기지 않는다
export function MessagesPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [rows, setRows] = useState<Log[] | null>(null)
  const [status, setStatus] = useState('')
  const [purpose, setPurpose] = useState('')
  const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string } | null>(null)

  const load = useCallback(async () => {
    let q = supabase.from('message_logs').select('*, staff_profiles:recipient_staff_id(name)').order('created_at', { ascending: false }).limit(300)
    if (status) q = q.eq('status', status)
    if (purpose) q = q.eq('purpose', purpose)
    const { data } = await q
    setRows((data ?? []) as Log[])
  }, [status, purpose])
  useEffect(() => {
    void load()
  }, [load])

  async function runNow() {
    try {
      const r = await invokeFunction<{ sent: number; skipped: number; failed: number; retry: number }>('message-sender', {})
      setMessage({ tone: 'green', text: `대기 건 처리: 보냄 ${r.sent} · 보내지 않음 ${r.skipped} · 실패 ${r.failed} · 재시도 예정 ${r.retry}` })
    } catch (e) {
      setMessage({ tone: 'red', text: (e as Error).message })
    }
    await load()
  }

  return (
    <>
      <PageHeader
        title="발송 기록"
        description="알림톡·문자·이메일 발송 결과입니다. 번호는 가린 형태로만 남고 내용은 저장하지 않습니다. 대기 건은 매분 자동으로 보냅니다."
        actions={
          <Button variant="secondary" onClick={() => void runNow()}>
            대기 건 지금 보내기
          </Button>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Field label="상태">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">전체</option>
            {Object.entries(MESSAGE_STATUS).map(([v, s]) => (
              <option key={v} value={v}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="종류">
          <Select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
            <option value="">전체</option>
            {Object.entries(MESSAGE_PURPOSE).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {message && (
        <div className="mb-3">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}
      {!rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState>발송 기록이 없습니다.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2">요청 일시</th>
                <th className="px-4 py-2">종류</th>
                <th className="px-4 py-2">채널</th>
                <th className="px-4 py-2">받는 사람</th>
                <th className="px-4 py-2">상태</th>
                <th className="px-4 py-2">사유·연결</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 whitespace-nowrap">{formatKst(r.created_at)}</td>
                  <td className="px-4 py-2">{MESSAGE_PURPOSE[r.purpose] ?? r.purpose}</td>
                  <td className="px-4 py-2">{CHANNEL[r.channel] ?? r.channel}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.staff_profiles?.name ?? r.to_masked ?? '-'}</td>
                  <td className="px-4 py-2">
                    <Badge tone={MESSAGE_STATUS[r.status]?.tone ?? 'gray'}>{MESSAGE_STATUS[r.status]?.label ?? r.status}</Badge>
                    {r.sent_at && <span className="block text-xs text-slate-500">{formatKst(r.sent_at)}</span>}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-600">
                    {r.error}
                    {r.related_type === 'lead' && r.related_id && (
                      <Link to={`/admin/leads/${r.related_id}`} className="ml-1 text-brand-600 hover:underline">
                        상담
                      </Link>
                    )}
                    {r.related_type === 'registration' && r.related_id && (
                      <Link to={`/admin/registrations/${r.related_id}`} className="ml-1 text-brand-600 hover:underline">
                        등록
                      </Link>
                    )}
                    {isAdmin && (r.status === 'failed' || r.status === 'skipped') && (
                      <button
                        type="button"
                        className="ml-2 text-brand-600 underline"
                        onClick={async () => {
                          const { error } = await supabase.rpc('retry_message', { p_log_id: r.id })
                          setMessage(error ? { tone: 'red', text: '다시 보내지 못했습니다.' } : { tone: 'green', text: '다시 보내도록 대기열에 넣었습니다.' })
                          await load()
                        }}
                      >
                        다시 보내기
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
