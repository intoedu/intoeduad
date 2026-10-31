import { useCallback, useEffect, useState } from 'react'
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Select, Spinner, Textarea } from '../../components/ui'
import { publicSiteUrl } from '../../domain/links'
import { formatDateKo } from '../../domain/dates'
import { describeRule, type PaymentRule } from '../../domain/paymentRules'
import {
  describeAnchor,
  isPrepComplete,
  prepDueDate,
  prepDueState,
  prepProgress,
  reviewMissing,
  PREP_REVIEW_KEYS,
  type DueAnchor,
  type PrepStatus,
} from '../../domain/prep'
import { todayKst } from '../../lib/datetime'
import { PREP_KIND, PREP_REQUEST_FIELDS, PREP_REVIEW_ITEMS, PREP_STATUS } from '../../lib/labels'
import { supabase, type TablesUpdate } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import type { Program } from '../programs/api'
import { registerLink } from '../programs/StepPublish'
import { getPrepItems, prepErrorText, type PrepItem, type PrepVersion } from './api'

type Person = { id: string; name: string }

function DueBadge({ item, today }: { item: PrepItem; today: string }) {
  const complete = isPrepComplete(item.status as PrepStatus, item.needs_recheck) || item.status === 'not_applicable'
  const state = prepDueState(item.due_date, today, complete)
  if (!item.due_date) return <span className="text-xs text-slate-400">마감 없음</span>
  const days = Math.round((Date.parse(item.due_date) - Date.parse(today)) / 86_400_000)
  return (
    <span className="flex items-center gap-1 text-xs text-slate-600">
      {formatDateKo(item.due_date)}
      {state === 'overdue' && <Badge tone="red">{-days}일 지남</Badge>}
      {state === 'soon' && <Badge tone="amber">{days === 0 ? '오늘 마감' : `D-${days}`}</Badge>}
    </span>
  )
}

// ---------------------------------------------------------------------------
// 기준 정보 패널: 자료와 대조할 시스템의 최신 값
// ---------------------------------------------------------------------------
function ReferencePanel({ program, rules }: { program: Program; rules: Array<PaymentRule & { id: string }> }) {
  const link = registerLink(publicSiteUrl(), program.slug)
  const rows: Array<[string, string]> = [
    ['캠프명', `${program.name}${program.season ? ` · ${program.season}` : ''}`],
    ['국가', program.country ?? '-'],
    ['출국 ~ 귀국', `${formatDateKo(program.start_date)} ~ ${formatDateKo(program.end_date)}`],
    ['모집 시작', program.recruit_start_date ? formatDateKo(program.recruit_start_date) : '미정'],
    ['정원', program.capacity ? `${program.capacity}명` : '제한 없음'],
    ['참가비(총액)', `${program.total_price.toLocaleString('ko-KR')}원`],
    ...rules.map((r): [string, string] => [
      r.label,
      `${r.amount.toLocaleString('ko-KR')}원 · ${r.due_rule_type === 'fixed' && r.due_fixed_date ? `${formatDateKo(r.due_fixed_date)}까지` : describeRule(r)}`,
    ]),
    ['신청 링크', link],
  ]
  return (
    <details className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200" open>
      <summary className="cursor-pointer text-sm font-semibold text-slate-900">기준 정보 — 자료의 금액·날짜·요일을 여기와 대조하세요</summary>
      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[140px_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-slate-500">{k}</dt>
            <dd className="break-all text-slate-900">{v}</dd>
          </div>
        ))}
      </dl>
      {program.description && (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <p className="mb-1 text-xs text-slate-500">소개·포함/미포함 내역</p>
          <p className="text-sm whitespace-pre-wrap text-slate-800">{program.description}</p>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">QR 이미지는 [7. 공개] 단계에서 내려받을 수 있습니다.</p>
    </details>
  )
}

// ---------------------------------------------------------------------------
// 준비물 상세
// ---------------------------------------------------------------------------
function ItemEditor({
  item,
  program,
  versions,
  people,
  partners,
  onChanged,
}: {
  item: PrepItem
  program: Program
  versions: PrepVersion[]
  people: Person[]
  partners: Person[]
  onChanged: (message: string) => Promise<void>
}) {
  const [request, setRequest] = useState<Record<string, unknown>>((item.request as Record<string, unknown>) ?? {})
  const [ownerId, setOwnerId] = useState(item.owner_id ?? '')
  const [reviewerId, setReviewerId] = useState(item.reviewer_id ?? '')
  const [dueDate, setDueDate] = useState(item.due_date ?? '')
  const [memo, setMemo] = useState(item.memo ?? '')
  const [newUrl, setNewUrl] = useState('')
  const [newNote, setNewNote] = useState('')
  const [channel, setChannel] = useState(item.distribution_channel ?? '')
  const [error, setError] = useState('')
  const isMaterial = item.kind === 'material'
  const isCommission = item.template_key === 'commission_notice'
  // 검수 체크는 화면에 바로 반영하고 저장한다
  const [checklist, setChecklist] = useState<Record<string, boolean>>((item.checklist as Record<string, boolean>) ?? {})
  const missing = reviewMissing(checklist)

  async function update(values: TablesUpdate<'program_prep_items'>, message: string) {
    setError('')
    const { error } = await supabase.from('program_prep_items').update(values).eq('id', item.id)
    if (error) return setError(prepErrorText(error))
    await onChanged(message)
  }

  async function saveDetails() {
    const values: TablesUpdate<'program_prep_items'> = {
      owner_id: ownerId || null,
      reviewer_id: reviewerId || null,
      memo: memo.trim() || null,
      request: request as TablesUpdate<'program_prep_items'>['request'],
    }
    if (!isCommission && (dueDate || null) !== item.due_date) {
      values.due_date = dueDate || null
      values.due_manual = true
    }
    await update(values, `"${item.title}" 내용을 저장했습니다.`)
  }

  async function addVersion() {
    setError('')
    const { error } = await supabase.rpc('add_prep_version', { p_item_id: item.id, p_url: newUrl.trim(), p_note: newNote.trim() || undefined })
    if (error) return setError(prepErrorText(error, '결과물을 등록하지 못했습니다.'))
    setNewUrl('')
    setNewNote('')
    await onChanged(`"${item.title}" 새 버전을 등록했습니다. 교차 검수를 진행해 주세요.`)
  }

  const versionForm = (label: string) => (
    <div className="grid gap-2 sm:grid-cols-[1fr_200px_auto] sm:items-end">
      <Field label="결과물 링크(드라이브 등)">
        <Input type="url" placeholder="https://" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} />
      </Field>
      <Field label="버전 메모">
        <Input value={newNote} placeholder="예: 금액 수정" onChange={(e) => setNewNote(e.target.value)} />
      </Field>
      <Button disabled={!newUrl.trim()} onClick={() => void addVersion()}>
        {label}
      </Button>
    </div>
  )

  return (
    <div className="space-y-4 border-t border-slate-100 pt-4">
      {item.needs_recheck && (
        <Alert tone="amber">
          캠프 정보가 바뀌어 다시 확인이 필요합니다(변경: {item.recheck_reason}). 수정한 새 버전을 등록하고 교차 검수를 다시 받아 주세요.
        </Alert>
      )}

      {/* 기본 정보 */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="제작·담당자">
          <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">미정</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        {isMaterial && (
          <Field label="검수자" hint="제작자와 다른 사람(교차 검수)">
            <Select value={reviewerId} onChange={(e) => setReviewerId(e.target.value)}>
              <option value="">미정</option>
              {people
                .filter((p) => p.id !== ownerId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Select>
          </Field>
        )}
        <Field
          label="마감일"
          hint={
            isCommission
              ? '협약서 제8조로 고정(출국 30일 전)'
              : item.due_manual
                ? '직접 정한 마감(캠프 날짜가 바뀌어도 유지)'
                : `자동: ${describeAnchor(item.due_anchor as DueAnchor, item.due_offset_days)}`
          }
        >
          <Input type="date" value={dueDate} disabled={isCommission} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </div>
      {item.due_manual && item.due_anchor !== 'none' && (
        <button
          type="button"
          className="text-xs text-brand-700 underline"
          onClick={() =>
            void update(
              {
                due_manual: false,
                due_date: prepDueDate(item.due_anchor as DueAnchor, item.due_offset_days, program.recruit_start_date, program.start_date),
              },
              '자동 마감으로 되돌렸습니다.',
            )
          }
        >
          자동 마감({describeAnchor(item.due_anchor as DueAnchor, item.due_offset_days)})으로 되돌리기
        </button>
      )}

      {/* 제작 요청서 */}
      {isMaterial && (
        <fieldset className="rounded-lg ring-1 ring-slate-200">
          <legend className="ml-3 px-1 text-sm font-semibold text-slate-900">제작 요청서</legend>
          <div className="grid gap-3 p-3 sm:grid-cols-2">
            {PREP_REQUEST_FIELDS.filter((f) => f.type !== 'check').map((f) => (
              <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                <Field label={f.label} hint={f.hint}>
                  {f.type === 'textarea' ? (
                    <Textarea rows={3} value={String(request[f.key] ?? '')} onChange={(e) => setRequest({ ...request, [f.key]: e.target.value })} />
                  ) : (
                    <Input value={String(request[f.key] ?? '')} onChange={(e) => setRequest({ ...request, [f.key]: e.target.value })} />
                  )}
                </Field>
              </div>
            ))}
            <div className="flex flex-wrap gap-4 sm:col-span-2">
              {PREP_REQUEST_FIELDS.filter((f) => f.type === 'check').map((f) => (
                <label key={f.key} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={request[f.key] === true}
                    onChange={(e) => setRequest({ ...request, [f.key]: e.target.checked })}
                  />
                  {f.label}
                </label>
              ))}
            </div>
          </div>
        </fieldset>
      )}

      <Field label="메모">
        <Textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void saveDetails()}>
          내용 저장
        </Button>
        {isMaterial && item.status === 'requested' && (
          <Button variant="secondary" onClick={() => void update({ status: 'producing' }, `"${item.title}" 제작을 시작했습니다.`)}>
            제작 시작
          </Button>
        )}
      </div>

      {/* 진행 단계 */}
      {isMaterial && item.status !== 'not_applicable' && (
        <div className="space-y-3 rounded-lg bg-slate-50 p-3">
          {(item.status === 'requested' || item.status === 'producing') && (
            <>
              <p className="text-sm font-semibold text-slate-900">결과물 등록 → 교차 검수</p>
              {versionForm('결과물 등록')}
            </>
          )}

          {item.status === 'reviewing' && (
            <>
              <p className="text-sm font-semibold text-slate-900">
                교차 검수 (v{item.version}){' '}
                {item.result_url && (
                  <a href={item.result_url} target="_blank" rel="noreferrer" className="font-normal text-brand-700 underline">
                    결과물 열기
                  </a>
                )}
              </p>
              <ul className="grid gap-1 sm:grid-cols-2">
                {PREP_REVIEW_KEYS.map((k) => (
                  <li key={k}>
                    <label className="flex items-start gap-2 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4"
                        checked={checklist[k] === true}
                        onChange={(e) => {
                          const next = { ...checklist, [k]: e.target.checked }
                          setChecklist(next)
                          void update({ checklist: next }, '검수 항목을 저장했습니다.')
                        }}
                      />
                      {PREP_REVIEW_ITEMS[k]}
                    </label>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-2">
                <Button disabled={missing.length > 0} onClick={() => void update({ status: 'approved' }, `"${item.title}" 확인 완료했습니다.`)}>
                  확인 완료 (대표·행정팀)
                </Button>
                {missing.length > 0 && <span className="text-xs text-slate-500">남은 검수 항목 {missing.length}개</span>}
              </div>
              <p className="text-xs text-slate-500">제작 담당자 본인은 확인 완료할 수 없습니다. 수정이 필요하면 아래에서 새 버전을 등록하세요.</p>
              {versionForm('수정본 등록')}
            </>
          )}

          {item.status === 'approved' && (
            <>
              <p className="text-sm font-semibold text-slate-900">배포 기록</p>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                <Field label="배포 채널" hint="예: 파트너 학원 드라이브, 카카오톡 공유, 설명회">
                  <Input value={channel} onChange={(e) => setChannel(e.target.value)} />
                </Field>
                <Button
                  onClick={() => void update({ status: 'distributed', distribution_channel: channel.trim() || null }, `"${item.title}" 배포 완료로 기록했습니다.`)}
                >
                  배포 완료
                </Button>
              </div>
            </>
          )}

          {(item.status === 'approved' || item.status === 'distributed') && (
            <>
              {item.status === 'distributed' && (
                <p className="text-sm text-slate-700">
                  {item.distributed_on && formatDateKo(item.distributed_on)} 배포
                  {item.distribution_channel && ` · ${item.distribution_channel}`}
                </p>
              )}
              <p className="text-sm font-semibold text-slate-900">새 버전 등록(수정 시)</p>
              {versionForm('새 버전 등록')}
            </>
          )}
        </div>
      )}

      {/* 할 일 */}
      {!isMaterial && item.status !== 'not_applicable' && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3">
          {isCommission ? (
            <p className="text-sm text-slate-700">
              {item.status === 'done'
                ? `${item.distributed_on ? formatDateKo(item.distributed_on) : ''} 고지 완료`
                : '[2. 납부 규칙]에서 커미션 고지일을 기록하면 자동으로 완료됩니다.'}
            </p>
          ) : item.status === 'todo' ? (
            <Button onClick={() => void update({ status: 'done' }, `"${item.title}" 완료했습니다.`)}>완료</Button>
          ) : (
            <>
              <span className="text-sm text-slate-700">{item.distributed_on && formatDateKo(item.distributed_on)} 완료</span>
              <Button variant="ghost" onClick={() => void update({ status: 'todo' }, '할 일로 되돌렸습니다.')}>
                되돌리기
              </Button>
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {item.status === 'not_applicable' ? (
          <Button
            variant="secondary"
            onClick={() => void update({ status: isMaterial ? 'requested' : 'todo' }, `"${item.title}"을(를) 다시 진행합니다.`)}
          >
            다시 진행
          </Button>
        ) : (
          <Button
            variant="ghost"
            onClick={() => {
              if (!window.confirm(`"${item.title}"을(를) 이번 캠프에서는 해당 없음으로 표시할까요?`)) return
              void update({ status: 'not_applicable' }, `"${item.title}"을(를) 해당 없음으로 표시했습니다.`)
            }}
          >
            이번 캠프는 해당 없음
          </Button>
        )}
        {!item.template_key && (
          <Button
            variant="ghost"
            onClick={() => {
              if (!window.confirm(`"${item.title}"을(를) 목록에서 지울까요?`)) return
              void update({ deleted_at: new Date().toISOString() }, `"${item.title}"을(를) 지웠습니다.`)
            }}
          >
            목록에서 지우기
          </Button>
        )}
      </div>

      {versions.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-semibold text-slate-900">버전 기록</p>
          <ul className="space-y-1 text-sm">
            {versions.map((v) => (
              <li key={v.id} className="flex flex-wrap gap-2">
                <Badge>v{v.version}</Badge>
                <a href={v.url} target="_blank" rel="noreferrer" className="break-all text-brand-700 underline">
                  {v.url}
                </a>
                {v.note && <span className="text-slate-500">· {v.note}</span>}
                <span className="text-slate-400">· {people.find((p) => p.id === v.created_by)?.name ?? ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {item.partner_id && <p className="text-xs text-slate-500">요청 학원: {partners.find((p) => p.id === item.partner_id)?.name}</p>}
      {error && <Alert>{error}</Alert>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 준비물 추가(학원별 맞춤 포스터 등)
// ---------------------------------------------------------------------------
function AddItemForm({ program, partners, onAdded }: { program: Program; partners: Person[]; onAdded: (m: string) => Promise<void> }) {
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<'material' | 'task'>('material')
  const [partnerId, setPartnerId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [audience, setAudience] = useState('')
  const [error, setError] = useState('')

  async function add() {
    setError('')
    if (!title.trim()) return setError('준비물 이름을 입력해 주세요.')
    const { error } = await supabase.from('program_prep_items').insert({
      program_id: program.id,
      title: title.trim(),
      kind,
      status: kind === 'task' ? 'todo' : 'requested',
      partner_id: partnerId || null,
      audience: audience.trim() || null,
      due_date: dueDate || null,
      due_manual: !!dueDate,
      sort: 200,
    })
    if (error) return setError(prepErrorText(error, '추가하지 못했습니다.'))
    setTitle('')
    setPartnerId('')
    setDueDate('')
    setAudience('')
    await onAdded(`"${title.trim()}"을(를) 추가했습니다.`)
  }

  return (
    <Card>
      <p className="mb-1 font-semibold text-slate-900">준비물 추가</p>
      <p className="mb-3 text-sm text-slate-500">학원명을 넣은 맞춤 포스터(MAT-01)처럼 학원별 요청도 여기에 추가합니다.</p>
      <div className="mb-3 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            setTitle('학원 맞춤 포스터(MAT-01)')
            setKind('material')
            setAudience('학원 홍보물')
          }}
        >
          + 학원 맞춤 포스터(MAT-01)
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_120px_180px_160px_auto] sm:items-end">
        <Field label="준비물 이름">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="종류">
          <Select value={kind} onChange={(e) => setKind(e.target.value as 'material' | 'task')}>
            <option value="material">제작물</option>
            <option value="task">할 일</option>
          </Select>
        </Field>
        <Field label="요청 학원(선택)">
          <Select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
            <option value="">없음</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="마감일">
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Button onClick={() => void add()}>추가</Button>
        <div className="sm:col-span-5">
          <Field label="보는 사람(선택)">
            <Input value={audience} onChange={(e) => setAudience(e.target.value)} />
          </Field>
        </div>
      </div>
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 캠프 위저드 "준비사항" 단계
// ---------------------------------------------------------------------------
export function StepPrep({ program, rules }: { program: Program; rules: Array<PaymentRule & { id: string }> }) {
  const { profile } = useAuth()
  const [data, setData] = useState<Awaited<ReturnType<typeof getPrepItems>> | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [partners, setPartners] = useState<Person[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const today = todayKst()

  const load = useCallback(async () => setData(await getPrepItems(program.id)), [program.id])
  useEffect(() => {
    void load()
    supabase
      .from('staff_profiles')
      .select('id, name')
      .eq('active', true)
      .neq('role', 'viewer')
      .order('name')
      .then(({ data }) => setPeople(data ?? []))
    supabase
      .from('partners')
      .select('id, name')
      .eq('active', true)
      .is('deleted_at', null)
      .order('name')
      .then(({ data }) => setPartners(data ?? []))
  }, [load])

  if (!data) return <Spinner />
  const items = data.items
  const progress = prepProgress(items.map((i) => ({ ...i, status: i.status as PrepStatus })))
  const recheck = items.filter((i) => i.needs_recheck).length
  const overdue = items.filter(
    (i) => prepDueState(i.due_date, today, isPrepComplete(i.status as PrepStatus, i.needs_recheck) || i.status === 'not_applicable') === 'overdue',
  ).length

  const changed = async (text: string) => {
    setMessage(text)
    await load()
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-900">
              필수 준비물 {progress.done}/{progress.total} 완료
            </p>
            <p className="text-sm text-slate-500">
              캠프를 만들면 기본 목록대로 자동 생성됩니다. 기본 목록은 [캠프 준비사항 → 기본 목록]에서 관리자가 바꿉니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {overdue > 0 && <Badge tone="red">마감 지남 {overdue}</Badge>}
            {recheck > 0 && <Badge tone="amber">재확인 필요 {recheck}</Badge>}
            {progress.gatePending > 0 && <Badge tone="blue">모집 전 남은 준비물 {progress.gatePending}</Badge>}
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
          <div className="h-full bg-brand-600" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
        </div>
        {!program.recruit_start_date && (
          <p className="mt-3 text-sm text-amber-800">모집 시작일을 [1. 기본 정보]에 넣으면 영상·브로셔·포스터 마감이 자동으로 계산됩니다.</p>
        )}
        {program.prep_override_reason && (
          <p className="mt-3 text-sm text-slate-600">준비 미완료 상태로 모집 시작한 사유: {program.prep_override_reason}</p>
        )}
      </Card>

      {message && <Alert tone="green">{message}</Alert>}

      <ReferencePanel program={program} rules={rules} />

      <Card>
        {items.length === 0 && <EmptyState>준비물이 없습니다.</EmptyState>}
        <ul className="divide-y divide-slate-100">
          {items.map((item) => {
            const st = PREP_STATUS[item.status]
            const open = openId === item.id
            return (
              <li key={item.id} className="py-3">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-label={`${item.title} — ${st?.label ?? item.status}${item.needs_recheck ? ', 재확인 필요' : ''}${item.due_date ? `, 마감 ${formatDateKo(item.due_date)}` : ''}`}
                  className="flex w-full flex-col gap-2 text-left sm:flex-row sm:items-center sm:justify-between"
                  onClick={() => setOpenId(open ? null : item.id)}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    {st && <Badge tone={st.tone}>{st.label}</Badge>}
                    {item.needs_recheck && <Badge tone="amber">재확인 필요</Badge>}
                    <span className={`text-sm font-medium ${item.status === 'not_applicable' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                      {item.title}
                    </span>
                    <span className="text-xs text-slate-500">
                      {PREP_KIND[item.kind]}
                      {item.audience && ` · ${item.audience}`}
                      {!item.required && ' · 선택'}
                      {item.gate_open && ' · 모집 전 필수'}
                      {item.version > 0 && ` · v${item.version}`}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    {item.owner_id && <span className="text-xs text-slate-500">{people.find((p) => p.id === item.owner_id)?.name}</span>}
                    <DueBadge item={item} today={today} />
                  </span>
                </button>
                {open && (
                  <div className="mt-3">
                    <ItemEditor
                      key={item.updated_at}
                      item={item}
                      program={program}
                      versions={data.versions.filter((v) => v.item_id === item.id)}
                      people={people}
                      partners={partners}
                      onChanged={changed}
                    />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </Card>

      <AddItemForm program={program} partners={partners} onAdded={changed} />
      {profile?.role !== 'admin' && <p className="text-xs text-slate-400">모집 전 필수 준비물이 남은 상태로 모집을 시작하려면 관리자가 사유를 기록해야 합니다.</p>}
    </div>
  )
}
