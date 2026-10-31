import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Spinner, Tabs } from '../../components/ui'
import { formatDateKo } from '../../domain/dates'
import { describeAnchor, isPrepComplete, prepDueState, type DueAnchor, type DueState, type PrepStatus } from '../../domain/prep'
import { todayKst } from '../../lib/datetime'
import { DUE_ANCHOR_LABELS, PREP_KIND, PREP_STATUS } from '../../lib/labels'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { prepErrorText, type PrepItem, type PrepTemplate } from './api'

type Row = PrepItem & { programs: { name: string; season: string | null; start_date: string; end_date: string } | null }

const FILTERS: Array<{ value: 'open' | 'overdue' | 'soon' | 'recheck' | 'all'; label: string }> = [
  { value: 'open', label: '남은 일' },
  { value: 'overdue', label: '마감 지남' },
  { value: 'soon', label: '7일 이내' },
  { value: 'recheck', label: '재확인 필요' },
  { value: 'all', label: '전체' },
]

const DUE_TONE: Partial<Record<DueState, 'red' | 'amber'>> = { overdue: 'red', soon: 'amber' }

// ---------------------------------------------------------------------------
// 모든 캠프의 준비물 모아보기 (마감순)
// ---------------------------------------------------------------------------
function Overview() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['value']>('open')
  const today = todayKst()

  useEffect(() => {
    supabase
      .from('program_prep_items')
      .select('*, programs!inner(name, season, start_date, end_date, deleted_at)')
      .is('deleted_at', null)
      .is('programs.deleted_at', null)
      .gte('programs.end_date', today)
      .order('due_date', { nullsFirst: false })
      .then(({ data }) => setRows((data ?? []) as Row[]))
  }, [today])

  if (!rows) return <Spinner />
  const withState = rows.map((r) => {
    const complete = isPrepComplete(r.status as PrepStatus, r.needs_recheck) || r.status === 'not_applicable'
    return { ...r, complete, state: prepDueState(r.due_date, today, complete) }
  })
  const visible = withState.filter((r) => {
    if (filter === 'all') return true
    if (filter === 'recheck') return r.needs_recheck
    if (filter === 'overdue') return r.state === 'overdue'
    if (filter === 'soon') return r.state === 'soon'
    return !r.complete
  })
  const count = (f: (typeof FILTERS)[number]['value']) =>
    f === 'overdue' ? withState.filter((r) => r.state === 'overdue').length : f === 'recheck' ? withState.filter((r) => r.needs_recheck).length : null

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="보기">
        {FILTERS.map((f) => {
          const n = count(f.value)
          return (
            <Button key={f.value} variant={filter === f.value ? 'primary' : 'secondary'} aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
              {f.label}
              {n ? ` ${n}` : ''}
            </Button>
          )
        })}
      </div>
      {visible.length === 0 && <EmptyState>해당하는 준비물이 없습니다.</EmptyState>}
      <Card className={visible.length === 0 ? 'hidden' : ''}>
        <ul className="divide-y divide-slate-100">
          {visible.map((r) => {
            const st = PREP_STATUS[r.status]
            const tone = DUE_TONE[r.state]
            return (
              <li key={r.id}>
                <Link
                  to={`/admin/programs/${r.program_id}?step=prep`}
                  className="flex flex-col gap-1 py-3 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    {st && <Badge tone={st.tone}>{st.label}</Badge>}
                    {r.needs_recheck && <Badge tone="amber">재확인 필요</Badge>}
                    <span className="text-sm font-medium text-slate-900">{r.title}</span>
                    <span className="text-xs text-slate-500">
                      {r.programs?.name}
                      {r.programs?.season && ` · ${r.programs.season}`}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-xs text-slate-600">
                    {r.due_date ? formatDateKo(r.due_date) : '마감 없음'}
                    {tone && <Badge tone={tone}>{r.state === 'overdue' ? '지남' : '임박'}</Badge>}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </Card>
    </>
  )
}

// ---------------------------------------------------------------------------
// 기본 목록(새 캠프에 자동 생성되는 준비물) — 관리자만 수정
// ---------------------------------------------------------------------------
function TemplateRow({ t, editable, onSaved }: { t: PrepTemplate; editable: boolean; onSaved: (m: string, ok: boolean) => Promise<void> }) {
  const [v, setV] = useState(t)
  const fixed = t.key === 'commission_notice'
  const dirty = JSON.stringify(v) !== JSON.stringify(t)

  async function save() {
    const { error } = await supabase
      .from('prep_item_templates')
      .update({
        title: v.title.trim(),
        audience: v.audience?.trim() || null,
        due_anchor: v.due_anchor,
        due_offset_days: v.due_offset_days,
        required: v.required,
        gate_open: v.gate_open,
        active: v.active,
        sort: v.sort,
      })
      .eq('key', t.key)
    await onSaved(error ? prepErrorText(error) : `"${v.title}" 기본값을 저장했습니다.`, !error)
  }

  const disabled = !editable || fixed
  return (
    <li className="py-3">
      <div className="grid gap-2 lg:grid-cols-[1fr_140px_150px_110px_auto] lg:items-end">
        <Field label="준비물" hint={`${PREP_KIND[t.kind]}${t.description ? ` · ${t.description}` : ''}`}>
          <Input value={v.title} disabled={!editable} onChange={(e) => setV({ ...v, title: e.target.value })} />
        </Field>
        <Field label="보는 사람">
          <Input value={v.audience ?? ''} disabled={!editable} onChange={(e) => setV({ ...v, audience: e.target.value })} />
        </Field>
        <Field label="마감 기준">
          <Select value={v.due_anchor} disabled={disabled} onChange={(e) => setV({ ...v, due_anchor: e.target.value })}>
            {Object.entries(DUE_ANCHOR_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="며칠(전은 음수)" hint={describeAnchor(v.due_anchor as DueAnchor, v.due_offset_days)}>
          <Input
            type="number"
            value={v.due_offset_days}
            disabled={disabled || v.due_anchor === 'none'}
            onChange={(e) => setV({ ...v, due_offset_days: Number(e.target.value) || 0 })}
          />
        </Field>
        {editable && (
          <Button variant="secondary" disabled={!dirty || !v.title.trim()} onClick={() => void save()}>
            저장
          </Button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-700">
        {(
          [
            ['required', '필수(준비율에 포함)'],
            ['gate_open', '모집 시작 전 필수'],
            ['active', '새 캠프에 자동 생성'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4"
              checked={v[key]}
              disabled={!editable || (fixed && key === 'active')}
              onChange={(e) => setV({ ...v, [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
        {fixed && <span className="text-xs text-slate-500">마감은 협약서 제8조로 고정(출국 30일 전)</span>}
      </div>
    </li>
  )
}

function Templates() {
  const { profile } = useAuth()
  const editable = profile?.role === 'admin'
  const [rows, setRows] = useState<PrepTemplate[] | null>(null)
  const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string } | null>(null)
  const [draft, setDraft] = useState({ title: '', kind: 'material' as 'material' | 'task' })

  const load = useCallback(async () => {
    const { data } = await supabase.from('prep_item_templates').select('*').order('sort')
    setRows(data ?? [])
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const saved = async (text: string, ok: boolean) => {
    setMessage({ tone: ok ? 'green' : 'red', text })
    if (ok) await load()
  }

  if (!rows) return <Spinner />
  return (
    <div className="space-y-4">
      <Alert tone="blue">
        새 캠프를 만들 때 이 목록대로 준비물이 자동으로 만들어집니다. 바꾼 기본값은 앞으로 만드는 캠프부터 적용됩니다(이미 만든 캠프는 캠프 화면에서 수정). 기본
        마감은 제안값이며, 실제 제작 기간에 맞춰 조정해 주세요.
      </Alert>
      {!editable && <Alert tone="amber">기본 목록은 관리자만 바꿀 수 있습니다.</Alert>}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Card>
        <ul className="divide-y divide-slate-100">
          {rows.map((t) => (
            <TemplateRow key={t.updated_at + t.key} t={t} editable={editable} onSaved={saved} />
          ))}
        </ul>
      </Card>
      {editable && (
        <Card>
          <p className="mb-3 font-semibold text-slate-900">기본 목록에 추가</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto] sm:items-end">
            <Field label="준비물 이름">
              <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </Field>
            <Field label="종류">
              <Select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as 'material' | 'task' })}>
                <option value="material">제작물</option>
                <option value="task">할 일</option>
              </Select>
            </Field>
            <Button
              disabled={!draft.title.trim()}
              onClick={async () => {
                const { error } = await supabase.from('prep_item_templates').insert({
                  key: `custom_${Date.now().toString(36)}`,
                  title: draft.title.trim(),
                  kind: draft.kind,
                  sort: Math.max(0, ...rows.map((r) => r.sort)) + 10,
                })
                if (!error) setDraft({ title: '', kind: 'material' })
                await saved(error ? prepErrorText(error, '추가하지 못했습니다.') : `"${draft.title.trim()}"을(를) 기본 목록에 추가했습니다.`, !error)
              }}
            >
              추가
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}

export function PrepPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'templates' ? 'templates' : 'overview'
  return (
    <>
      <PageHeader
        title="캠프 준비사항"
        description="포스터·브로셔·홍보 영상·부모용 안내문 등 모든 캠프의 준비물을 마감순으로 봅니다. 항목을 누르면 해당 캠프의 준비사항으로 이동합니다."
      />
      <Tabs
        tabs={[
          { value: 'overview', label: '준비물 모아보기' },
          { value: 'templates', label: '기본 목록' },
        ]}
        value={tab}
        onChange={(t) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true })}
      />
      {tab === 'overview' ? <Overview /> : <Templates />}
    </>
  )
}
