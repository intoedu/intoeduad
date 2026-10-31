import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader, Spinner, Tabs } from '../../components/ui'
import { formatDateKo } from '../../domain/dates'
import { formatKst, todayKst } from '../../lib/datetime'
import { invokeFunction, supabase, type Views } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'

type Row = Views<'v_destruction_board'>
type Msg = { tone: 'green' | 'red'; text: string } | null
const err = (e: { message?: string } | null, fallback: string) => (e?.message && /[가-힣]/.test(e.message) ? e.message : fallback)

const STATUS: Record<string, { label: string; tone: 'gray' | 'blue' | 'green' | 'amber' | 'red' }> = {
  pending: { label: '승인 대기', tone: 'amber' },
  approved: { label: '승인됨(예정일 파기)', tone: 'blue' },
  held: { label: '보류', tone: 'gray' },
  executed: { label: '파기 완료', tone: 'green' },
  failed: { label: '실패(다시 시도)', tone: 'red' },
}

type Group = { key: string; title: string; confirm: string; dueDate: string; rows: Row[]; programId: string | null }

function groupRows(rows: Row[]): Group[] {
  const m = new Map<string, Group>()
  for (const r of rows) {
    const isLead = !r.registration_id
    const key = `${isLead ? 'lead' : r.program_id}|${r.due_date}`
    const g = m.get(key) ?? {
      key,
      title: isLead ? '상담 신청(등록하지 않은 고객, 1년 경과)' : `${r.program_name}${r.program_season ? ` (${r.program_season})` : ''}`,
      confirm: isLead ? '상담 신청' : (r.program_name ?? ''),
      dueDate: r.due_date!,
      rows: [],
      programId: r.program_id,
    }
    g.rows.push(r)
    m.set(key, g)
  }
  return [...m.values()].sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

function GroupCard({ g, isAdmin, onDone }: { g: Group; isAdmin: boolean; onDone: (m: Msg) => Promise<void> }) {
  const [confirm, setConfirm] = useState('')
  const [open, setOpen] = useState(false)
  const today = todayKst()
  const overdue = g.dueDate < today
  const waiting = g.rows.filter((r) => r.status === 'pending' || r.status === 'held')

  return (
    <section aria-label={`파기 그룹 ${g.title}`}>
      <Card className={overdue ? 'ring-red-300' : ''}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-semibold text-slate-900">{g.title}</p>
            <p className="text-sm text-slate-600">
              파기 예정일 {formatDateKo(g.dueDate)} · {g.rows.length}명{g.rows[0]?.program_end && ` · 종료일 ${formatDateKo(g.rows[0].program_end)}`}
            </p>
          </div>
          {overdue && waiting.length > 0 && <Badge tone="red">예정일 지남 — 승인 필요</Badge>}
        </div>
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {g.rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2" aria-label={`파기 대상 ${r.student_name ?? ''}`}>
              <span className="flex flex-wrap items-center gap-2">
                {STATUS[r.status ?? ''] && <Badge tone={STATUS[r.status ?? ''].tone}>{STATUS[r.status ?? ''].label}</Badge>}
                {r.registration_id ? (
                  <Link to={`/admin/registrations/${r.registration_id}`} className="text-brand-700 hover:underline">
                    {r.student_name ?? '(파기됨)'}
                  </Link>
                ) : (
                  <Link to={`/admin/leads/${r.lead_id}`} className="text-brand-700 hover:underline">
                    {r.student_name ?? '(파기됨)'}
                  </Link>
                )}
                {!!r.passport_files && <span className="text-xs text-slate-500">여권 파일 {r.passport_files}개</span>}
                {r.hold_reason && <span className="text-xs text-slate-500">보류: {r.hold_reason}</span>}
                {r.error && <span className="text-xs text-red-600">{r.error}</span>}
              </span>
              {isAdmin && (
                <span className="flex gap-1">
                  {(r.status === 'pending' || r.status === 'approved' || r.status === 'failed') && (
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        const reason = window.prompt('보류 사유를 적어 주세요(예: 분쟁·법적 보관 필요)') ?? ''
                        if (!reason.trim()) return
                        const { error } = await supabase.rpc('hold_destruction', { p_request_id: r.id!, p_reason: reason })
                        await onDone(error ? { tone: 'red', text: err(error, '보류하지 못했습니다.') } : { tone: 'green', text: '파기를 보류했습니다.' })
                      }}
                    >
                      보류
                    </Button>
                  )}
                  {r.status === 'held' && (
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        const { error } = await supabase.rpc('release_destruction_hold', { p_request_id: r.id! })
                        await onDone(
                          error ? { tone: 'red', text: err(error, '해제하지 못했습니다.') } : { tone: 'green', text: '보류를 풀었습니다. 다시 승인해 주세요.' },
                        )
                      }}
                    >
                      보류 해제
                    </Button>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
        {isAdmin && waiting.some((r) => r.status === 'pending') && (
          <div className="mt-3 rounded-lg bg-red-50 p-3">
            {!open ? (
              <Button variant="danger" onClick={() => setOpen(true)}>
                파기 승인
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-red-800">
                  승인하면 예정일({formatDateKo(g.dueDate)})에 여권 파일·건강 정보·연락처 등 개인정보가 <strong>되돌릴 수 없게</strong> 파기됩니다
                  {overdue ? '(예정일이 지나 승인 즉시 파기)' : ''}. 확인을 위해 <strong>{g.confirm}</strong>을(를) 그대로 입력해 주세요.
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="확인 문구">
                    <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={g.confirm} />
                  </Field>
                  <Button
                    variant="danger"
                    disabled={confirm.trim() !== g.confirm}
                    onClick={async () => {
                      const ids = g.rows.filter((r) => r.status === 'pending').map((r) => r.id!)
                      const { data, error } = await supabase.rpc('approve_destruction', { p_request_ids: ids, p_confirm: confirm })
                      if (error) return onDone({ tone: 'red', text: err(error, '승인하지 못했습니다.') })
                      let text = `${data}명 파기를 승인했습니다.`
                      if (g.dueDate <= todayKst()) {
                        try {
                          const res = await invokeFunction<{ executed: number; failed: number }>('destruction-run', {})
                          text += ` 예정일이 되어 바로 파기했습니다(완료 ${res.executed}, 실패 ${res.failed}).`
                        } catch (e) {
                          text += ` 바로 파기하지 못했습니다: ${(e as Error).message}`
                        }
                      } else {
                        text += ` ${formatDateKo(g.dueDate)}에 자동으로 파기됩니다.`
                      }
                      await onDone({ tone: 'green', text })
                    }}
                  >
                    승인
                  </Button>
                  <Button variant="ghost" onClick={() => setOpen(false)}>
                    닫기
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </section>
  )
}

export function DestructionPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [rows, setRows] = useState<Row[] | null>(null)
  const [tab, setTab] = useState<'waiting' | 'done'>('waiting')
  const [message, setMessage] = useState<Msg>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('v_destruction_board').select('*').order('due_date')
    setRows(data ?? [])
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const waiting = useMemo(() => (rows ?? []).filter((r) => r.status !== 'executed'), [rows])
  const done = useMemo(() => (rows ?? []).filter((r) => r.status === 'executed').reverse(), [rows])
  const overdue = waiting.filter((r) => r.overdue).length

  async function onDone(m: Msg) {
    setMessage(m)
    await load()
  }

  return (
    <>
      <PageHeader
        title="개인정보 파기"
        description="프로그램 종료 다음 날 파기 승인 대기 목록이 자동으로 만들어집니다. 관리자가 승인하면 파기 예정일(종료일 + 5일)에 자동으로 파기되고, 기록이 남습니다."
        actions={
          isAdmin && (
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  const res = await invokeFunction<{ queued: number; executed: number; failed: number }>('destruction-run', {})
                  await onDone({ tone: 'green', text: `대기 목록 갱신 ${res.queued}건 추가 · 파기 완료 ${res.executed}건 · 실패 ${res.failed}건` })
                } catch (e) {
                  await onDone({ tone: 'red', text: (e as Error).message })
                }
              }}
            >
              지금 확인·실행
            </Button>
          )
        }
      />
      <div className="space-y-4">
        {overdue > 0 && (
          <Alert tone="red">
            파기 예정일이 지났는데 승인하지 않은 개인정보가 <strong>{overdue}건</strong> 있습니다. 보유 기간을 넘겨 보관하면 안 되므로 오늘 승인하거나, 보관이
            필요하면 사유를 적어 보류해 주세요.
          </Alert>
        )}
        {!isAdmin && <Alert tone="blue">승인·보류는 관리자만 할 수 있습니다.</Alert>}
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <Tabs
          tabs={[
            { value: 'waiting', label: `파기 예정 (${waiting.length})` },
            { value: 'done', label: `파기 기록 (${done.length})` },
          ]}
          value={tab}
          onChange={setTab}
        />
        {!rows ? (
          <Spinner />
        ) : tab === 'waiting' ? (
          waiting.length === 0 ? (
            <EmptyState>파기를 기다리는 개인정보가 없습니다.</EmptyState>
          ) : (
            groupRows(waiting).map((g) => <GroupCard key={g.key} g={g} isAdmin={isAdmin} onDone={onDone} />)
          )
        ) : done.length === 0 ? (
          <EmptyState>파기 기록이 없습니다.</EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2">파기 일시</th>
                  <th className="px-4 py-2">대상</th>
                  <th className="px-4 py-2">승인</th>
                  <th className="px-4 py-2">파기한 항목</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {done.map((r) => {
                  const items = (r.destroyed_items ?? {}) as Record<string, unknown>
                  const parts = [
                    items.registration && '등록 개인정보',
                    items.passport_files ? `여권 파일 ${items.passport_files}개` : null,
                    items.health && '건강 정보',
                    items.notes ? `메모 ${items.notes}건` : null,
                    items.lead && '상담 신청 개인정보',
                  ].filter(Boolean)
                  return (
                    <tr key={r.id}>
                      <td className="px-4 py-2 whitespace-nowrap">{formatKst(r.executed_at)}</td>
                      <td className="px-4 py-2">{r.registration_id ? `${r.program_name ?? ''} 등록생` : '상담 신청'}</td>
                      <td className="px-4 py-2">
                        {r.approved_by_name ?? '-'} · {formatKst(r.approved_at)}
                      </td>
                      <td className="px-4 py-2">{parts.join(', ')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-slate-500">
          남기는 정보: 프로그램·학원·상태·금액·날짜(통계·정산), 동의 기록(문구·버전·동의 여부), 파기 기록, 여권 접근 기록. 관계 법령상 보관이 필요한 거래 기록의
          분리 보관은 법률 검토 후 사용합니다.
        </p>
      </div>
    </>
  )
}
