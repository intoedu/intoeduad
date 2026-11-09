import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Spinner, Tabs, Textarea } from '../../components/ui'
import { ALIMTALK_TEMPLATES, renderTemplate } from '../../domain/messages'
import { formatOt, isoToZonedLocal, OT_NOTICE_LABEL, OT_ZONES, zonedLocalToIso, zoneLabel } from '../../domain/orientation'
import { invokeFunction, supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'

// 오리엔테이션 안내: 캠프별 최종 OT 일괄 안내 + 등록생별 1:1 OT 일정 안내 (현지 팀은 담당 캠프만)
type Program = { id: string; name: string; season: string | null }
type Row = {
  registration_id: string
  status: string
  student_name_ko: string | null
  student_name_en: string | null
  parent_name: string | null
  kakao_use: boolean | null
  ot_starts_at: string | null
  ot_method: string | null
  ot_host: string | null
  ot_memo: string | null
  ot_notice_purpose: string | null
  ot_notice_status: string | null
  ot_notice_at: string | null
  ot_notice_current: boolean | null
  final_notice_purpose: string | null
  final_notice_status: string | null
  final_notice_at: string | null
  final_notice_current: boolean | null
}
type Final = { program_id: string; starts_at: string; place: string; note: string | null }

const ZONE_KEY = 'intoedu:ot-zone'
const programLabel = (p: Program) => (p.season ? `${p.name} (${p.season})` : p.name)
const kstText = (iso: string) => `${formatOt(iso)} (한국 시간)`

function savedZone(): string {
  try {
    const z = localStorage.getItem(ZONE_KEY)
    if (z && OT_ZONES.some((x) => x.id === z)) return z
  } catch {
    // 저장소를 못 쓰면 한국 시간
  }
  return 'Asia/Seoul'
}

// 안내 상태 배지
function NoticeBadge({ purpose, status, current }: { purpose: string | null; status: string | null; current: boolean | null }) {
  if (!status) return <Badge>안내 전</Badge>
  const kind = OT_NOTICE_LABEL[purpose ?? ''] ?? '안내'
  if (status === 'queued') return <Badge tone="blue">{kind} 발송 대기</Badge>
  if (status === 'sent') return current ? <Badge tone="green">{kind} 보냄</Badge> : <Badge tone="amber">바뀐 일정 아직 안내 안 함</Badge>
  if (status === 'failed') return <Badge tone="red">{kind} 발송 실패</Badge>
  return <Badge>{kind} 보내지 않음(알림 설정 꺼짐)</Badge>
}

async function rpcError(p: PromiseLike<{ error: { message: string } | null }>, fallback: string) {
  const { error } = await p
  if (error) throw new Error(/[가-힣]/.test(error.message) ? error.message : fallback)
}

// 저장 직후 발송 함수를 깨운다(실패해도 1분마다 예약 작업이 다시 보냄)
async function kickSender() {
  try {
    await invokeFunction('message-sender', {})
  } catch {
    // 예약 작업이 처리
  }
}

export function OrientationPage() {
  const { profile } = useAuth()
  const [programs, setPrograms] = useState<Program[] | null>(null)
  const [programId, setProgramId] = useState('')
  const [zone, setZoneState] = useState(savedZone)
  const [tab, setTab] = useState<'final' | 'one'>('final')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [final, setFinal] = useState<Final | null | undefined>(undefined)
  const [notice, setNotice] = useState('')

  const setZone = (z: string) => {
    setZoneState(z)
    try {
      localStorage.setItem(ZONE_KEY, z)
    } catch {
      // 기억하지 못해도 이번 화면은 바뀐다
    }
  }

  useEffect(() => {
    supabase
      .from('programs')
      .select('id, name, season')
      .is('deleted_at', null)
      .order('start_date', { ascending: false })
      .then(({ data }) => {
        setPrograms(data ?? [])
        if (data?.[0]) setProgramId(data[0].id)
      })
  }, [])

  const reload = useCallback(async () => {
    if (!programId) return
    const [b, f] = await Promise.all([
      supabase.rpc('program_orientation_board', { p_program_id: programId }),
      supabase.from('program_final_orientations').select('program_id, starts_at, place, note').eq('program_id', programId).maybeSingle(),
    ])
    setRows((b.data ?? []) as Row[])
    setFinal((f.data as Final | null) ?? null)
  }, [programId])

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => {
      if (cancelled) return
      setRows(null)
      setFinal(undefined)
      return reload()
    })
    return () => {
      cancelled = true
    }
  }, [reload])

  if (!programs) return <Spinner />
  const program = programs.find((p) => p.id === programId)

  return (
    <>
      <PageHeader
        title="오리엔테이션 안내"
        description="캠프 최종 오리엔테이션을 등록생 학부모에게 한 번에 안내하고, 학생별 1:1 오리엔테이션 일정을 정해 알림톡으로 보냅니다. 학부모에게는 한국 시간으로 안내됩니다."
      />
      {programs.length === 0 ? (
        <EmptyState>캠프가 없습니다. 현지 팀은 본사 관리자에게 담당 캠프 배정을 요청해 주세요.</EmptyState>
      ) : (
        <>
          <div className="mb-4 grid max-w-2xl gap-3 sm:grid-cols-2">
            <Field label="캠프">
              <Select value={programId} onChange={(e) => setProgramId(e.target.value)}>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {programLabel(p)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="입력하는 시간 기준" hint="미국에서 넣으실 때는 현지 시간을 고르세요. 이 기기에 기억됩니다.">
              <Select value={zone} onChange={(e) => setZone(e.target.value)}>
                {OT_ZONES.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {notice && (
            <div className="mb-4">
              <Alert tone="green">{notice}</Alert>
            </div>
          )}
          <Tabs
            tabs={[
              { value: 'final', label: '최종 오리엔테이션 (일괄 안내)' },
              { value: 'one', label: '1:1 오리엔테이션' },
            ]}
            value={tab}
            onChange={setTab}
          />
          {!rows || final === undefined || !program ? (
            <Spinner />
          ) : tab === 'final' ? (
            <FinalTab key={programId} program={program} final={final} rows={rows} zone={zone} onChanged={reload} onNotice={setNotice} />
          ) : (
            <OneOnOneTab rows={rows} zone={zone} defaultHost={profile?.name ? `${profile.name} 선생님` : ''} onChanged={reload} onNotice={setNotice} />
          )}
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// 최종 오리엔테이션
// ---------------------------------------------------------------------------
function FinalTab({
  program,
  final,
  rows,
  zone,
  onChanged,
  onNotice,
}: {
  program: Program
  final: Final | null
  rows: Row[]
  zone: string
  onChanged: () => Promise<void>
  onNotice: (s: string) => void
}) {
  const [when, setWhen] = useState(final ? isoToZonedLocal(final.starts_at, zone) : '')
  const [place, setPlace] = useState(final?.place ?? '')
  const [note, setNote] = useState(final?.note ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // 처음에는 아직 최신 일정을 받지 않은 학부모만 고른다
  const [picked, setPicked] = useState<Set<string>>(() => new Set(rows.filter((r) => !r.final_notice_current).map((r) => r.registration_id)))
  const [zoneShown, setZoneShown] = useState(zone)
  if (zoneShown !== zone) {
    // 시간 기준을 바꾸면 입력칸도 그 기준으로 다시 보여 준다
    setZoneShown(zone)
    const iso = zonedLocalToIso(when, zoneShown)
    if (iso) setWhen(isoToZonedLocal(iso, zone))
  }

  const iso = zonedLocalToIso(when, zone)
  const dirty = !final || iso !== new Date(final.starts_at).toISOString() || place.trim() !== final.place || (note.trim() || null) !== (final.note ?? null)
  const preview = useMemo(() => {
    if (!final) return ''
    return renderTemplate(ALIMTALK_TEMPLATES.final_orientation_notice, {
      학부모명: '(학부모 이름)',
      학생명: '(학생 이름)',
      프로그램명: programLabel(program),
      일시: kstText(final.starts_at),
      장소: final.place,
      참고사항: final.note || '자세한 내용은 담당자가 안내드립니다',
    }).text
  }, [final, program])

  async function save(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!iso) return setError('날짜와 시간을 입력해 주세요.')
    setBusy(true)
    try {
      await rpcError(
        supabase.rpc('save_final_orientation', { p_program_id: program.id, p_starts_at: iso, p_place: place, p_note: note.trim() || undefined }),
        '저장하지 못했습니다.',
      )
      onNotice(`최종 오리엔테이션 일정을 저장했습니다(${kstText(iso)}). 캠프 일정·캘린더에도 표시됩니다.`)
      await onChanged()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm('최종 오리엔테이션 일정을 지울까요? 이미 보낸 안내는 취소되지 않습니다.')) return
    await rpcError(supabase.rpc('delete_final_orientation', { p_program_id: program.id }), '지우지 못했습니다.').catch((e: Error) => setError(e.message))
    setWhen('')
    setPlace('')
    setNote('')
    await onChanged()
  }

  async function send() {
    setError('')
    const ids = [...picked]
    if (ids.length === 0) return setError('안내를 받을 학부모를 골라 주세요.')
    if (!window.confirm(`선택한 ${ids.length}명의 학부모에게 최종 오리엔테이션 알림톡을 보냅니다. 이미 같은 내용을 받은 분은 건너뜁니다.`)) return
    setBusy(true)
    try {
      const { data, error } = await supabase.rpc('send_final_orientation', { p_program_id: program.id, p_registration_ids: ids })
      if (error) throw new Error(/[가-힣]/.test(error.message) ? error.message : '보내지 못했습니다.')
      const r = data as { queued: number; already: number; pending: number; skipped: number }
      await kickSender()
      onNotice(
        `${r.queued}명에게 발송을 요청했습니다.` +
          (r.already ? ` ${r.already}명은 이미 같은 내용을 받아 건너뛰었습니다.` : '') +
          (r.pending ? ` ${r.pending}명은 발송 대기 중이라 건너뛰었습니다.` : '') +
          ' 결과는 아래 목록과 [발송 기록]에서 확인하세요.',
      )
      await onChanged()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const allIds = rows.map((r) => r.registration_id)
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="space-y-4">
      <Card>
        <form onSubmit={save} className="space-y-3">
          <p className="font-semibold text-slate-900">1. 최종 오리엔테이션 일정</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={`일시 (${zoneLabel(zone)})`} hint={iso ? `학부모 안내: ${kstText(iso)}` : undefined}>
              <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </Field>
            <Field label="장소·방식" hint="예: 인투유학 대전 센터 3층 / Zoom 화상 · 회의 ID … · 암호 …">
              <Input maxLength={100} value={place} onChange={(e) => setPlace(e.target.value)} />
            </Field>
          </div>
          <Field label="참고 사항 (선택, 60자)" hint="예: 학생과 학부모님이 함께 참석해 주세요">
            <Input maxLength={60} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || !dirty}>
              {final ? '일정 바꾸기' : '일정 저장'}
            </Button>
            {final && (
              <Button variant="secondary" onClick={() => void remove()} disabled={busy}>
                일정 지우기
              </Button>
            )}
          </div>
          {final && dirty && <p className="text-xs text-amber-700">바뀐 내용을 먼저 저장해야 안내에 반영됩니다.</p>}
        </form>
      </Card>

      {final && (
        <Card>
          <p className="font-semibold text-slate-900">2. 안내 받을 학부모 고르기</p>
          <p className="mt-1 text-sm text-slate-500">
            이 캠프 등록생(취소·환불·대기 제외)의 학부모입니다. 이미 같은 일정을 받은 분은 보내도 건너뛰고, 일정이 바뀐 뒤에는 "변경 안내"로 나갑니다.
          </p>
          {rows.length === 0 ? (
            <div className="mt-3">
              <EmptyState>안내할 등록생이 없습니다.</EmptyState>
            </div>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <Button variant="secondary" onClick={() => setPicked(new Set(allIds))}>
                  모두 선택
                </Button>
                <Button variant="secondary" onClick={() => setPicked(new Set(rows.filter((r) => !r.final_notice_current).map((r) => r.registration_id)))}>
                  아직 안 받은 분만
                </Button>
                <Button variant="secondary" onClick={() => setPicked(new Set())}>
                  선택 해제
                </Button>
              </div>
              <ul className="mt-3 divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
                {rows.map((r) => (
                  <li key={r.registration_id}>
                    <label className="flex cursor-pointer flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={picked.has(r.registration_id)}
                        onChange={() => toggle(r.registration_id)}
                        aria-label={`${r.student_name_ko ?? ''} 학부모에게 보내기`}
                      />
                      <span className="min-w-28 font-medium text-slate-900">{r.student_name_ko}</span>
                      <span className="text-slate-500">학부모 {r.parent_name}</span>
                      {r.kakao_use === false && <Badge tone="amber">카톡 미사용 → 대신 받을 번호로</Badge>}
                      <span className="ml-auto">
                        <NoticeBadge purpose={r.final_notice_purpose} status={r.final_notice_status} current={r.final_notice_current} />
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="mt-4 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
                <p className="mb-1 text-xs font-semibold text-slate-600">보낼 알림톡 미리 보기 (이름은 학부모마다 바뀝니다)</p>
                <pre className="text-xs leading-relaxed whitespace-pre-wrap text-slate-700">{preview}</pre>
              </div>
              <Button className="mt-4" onClick={() => void send()} disabled={busy || dirty || picked.size === 0}>
                선택한 {picked.size}명에게 안내 보내기
              </Button>
            </>
          )}
        </Card>
      )}
      {error && <Alert>{error}</Alert>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 1:1 오리엔테이션
// ---------------------------------------------------------------------------
function OneOnOneTab({
  rows,
  zone,
  defaultHost,
  onChanged,
  onNotice,
}: {
  rows: Row[]
  zone: string
  defaultHost: string
  onChanged: () => Promise<void>
  onNotice: (s: string) => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const done = rows.filter((r) => r.ot_starts_at).length

  if (rows.length === 0) return <EmptyState>이 캠프에 등록생이 없습니다(취소·환불·대기 제외).</EmptyState>
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        일정을 정한 학생 {done}명 / 전체 {rows.length}명 · 정한 일시순으로 보입니다. 이미 안내한 일정을 바꾸고 보내면 "변경 안내"로 나갑니다.
      </p>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.registration_id} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-900">{r.student_name_ko}</span>
              {r.student_name_en && <span className="text-sm text-slate-500">{r.student_name_en}</span>}
              <span className="text-sm text-slate-500">· 학부모 {r.parent_name}</span>
              {r.kakao_use === false && <Badge tone="amber">카톡 미사용</Badge>}
              <span className="ml-auto">
                {r.ot_starts_at ? (
                  <NoticeBadge purpose={r.ot_notice_purpose} status={r.ot_notice_status} current={r.ot_notice_current} />
                ) : (
                  <Badge>일정 미정</Badge>
                )}
              </span>
            </div>
            {r.ot_starts_at && editing !== r.registration_id && (
              <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                <div>
                  <dt className="inline text-slate-500">일시 </dt>
                  <dd className="inline text-slate-900">
                    {kstText(r.ot_starts_at)}
                    {zone !== 'Asia/Seoul' && <span className="text-slate-500"> · {zoneLabel(zone)} {formatOt(r.ot_starts_at, zone)}</span>}
                  </dd>
                </div>
                <div>
                  <dt className="inline text-slate-500">진행 방식 </dt>
                  <dd className="inline text-slate-900">{r.ot_method}</dd>
                </div>
                <div>
                  <dt className="inline text-slate-500">담당 </dt>
                  <dd className="inline text-slate-900">{r.ot_host}</dd>
                </div>
                {r.ot_memo && (
                  <div className="sm:col-span-2">
                    <dt className="inline text-slate-500">메모(내부) </dt>
                    <dd className="inline whitespace-pre-line text-slate-700">{r.ot_memo}</dd>
                  </div>
                )}
              </dl>
            )}
            {editing === r.registration_id ? (
              <OneOnOneEditor
                row={r}
                zone={zone}
                defaultHost={defaultHost}
                onCancel={() => setEditing(null)}
                onSaved={async (msg) => {
                  setEditing(null)
                  onNotice(msg)
                  await onChanged()
                }}
              />
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setEditing(r.registration_id)}>
                  {r.ot_starts_at ? '일정 고치기' : '일정 정하기'}
                </Button>
                {r.ot_starts_at && !r.ot_notice_current && r.ot_notice_status !== 'queued' && (
                  <SendOneButton row={r} onDone={async (msg) => (onNotice(msg), await onChanged())} />
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function SendOneButton({ row, onDone }: { row: Row; onDone: (msg: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function send() {
    if (!window.confirm(`${row.student_name_ko} 학부모에게 1:1 오리엔테이션 알림톡을 보낼까요?`)) return
    setBusy(true)
    setError('')
    const { data, error } = await supabase.rpc('send_registration_orientation', { p_registration_id: row.registration_id })
    setBusy(false)
    if (error) return setError(/[가-힣]/.test(error.message) ? error.message : '보내지 못했습니다.')
    await kickSender()
    await onDone(`${row.student_name_ko} 학부모에게 ${OT_NOTICE_LABEL[String(data)] ?? '안내'} 발송을 요청했습니다.`)
  }
  return (
    <>
      <Button onClick={() => void send()} disabled={busy}>
        안내 보내기
      </Button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </>
  )
}

function OneOnOneEditor({
  row,
  zone,
  defaultHost,
  onCancel,
  onSaved,
}: {
  row: Row
  zone: string
  defaultHost: string
  onCancel: () => void
  onSaved: (msg: string) => Promise<void>
}) {
  const [when, setWhen] = useState(row.ot_starts_at ? isoToZonedLocal(row.ot_starts_at, zone) : '')
  const [method, setMethod] = useState(row.ot_method ?? '')
  const [host, setHost] = useState(row.ot_host ?? defaultHost)
  const [memo, setMemo] = useState(row.ot_memo ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const iso = zonedLocalToIso(when, zone)

  async function save(notify: boolean) {
    setError('')
    if (!iso) return setError('날짜와 시간을 입력해 주세요.')
    if (notify && !window.confirm(`${row.student_name_ko} 학부모에게 ${kstText(iso)} 1:1 오리엔테이션 알림톡을 보냅니다.`)) return
    setBusy(true)
    const { data, error } = await supabase.rpc('save_registration_orientation', {
      p_registration_id: row.registration_id,
      p_starts_at: iso,
      p_method: method,
      p_host: host,
      p_memo: memo.trim() || undefined,
      p_notify: notify,
    })
    setBusy(false)
    if (error) return setError(/[가-힣]/.test(error.message) ? error.message : '저장하지 못했습니다.')
    const queued = (data as { queued: string | null } | null)?.queued
    if (queued) await kickSender()
    await onSaved(
      queued
        ? `${row.student_name_ko} 일정을 저장하고 ${OT_NOTICE_LABEL[queued]} 발송을 요청했습니다.`
        : `${row.student_name_ko} 일정을 저장했습니다(안내는 아직 보내지 않음).`,
    )
  }

  async function remove() {
    if (!window.confirm('이 학생의 1:1 오리엔테이션 일정을 지울까요? 이미 보낸 안내는 취소되지 않습니다.')) return
    setBusy(true)
    const { error } = await supabase.rpc('delete_registration_orientation', { p_registration_id: row.registration_id })
    setBusy(false)
    if (error) return setError('지우지 못했습니다.')
    await onSaved(`${row.student_name_ko} 일정을 지웠습니다.`)
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={`일시 (${zoneLabel(zone)})`} hint={iso ? `학부모 안내: ${kstText(iso)}` : undefined}>
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        <Field label="담당" hint="예: 줄리엣 선생님 (미국 센터)">
          <Input maxLength={40} value={host} onChange={(e) => setHost(e.target.value)} />
        </Field>
      </div>
      <Field label="진행 방식" hint="예: Zoom 화상 · 회의 ID 812 3456 7890 · 암호 1234 (학부모에게 그대로 보입니다)">
        <Input maxLength={100} value={method} onChange={(e) => setMethod(e.target.value)} />
      </Field>
      <Field label="메모 (내부용, 학부모에게 보이지 않음)">
        <Textarea rows={2} maxLength={500} value={memo} onChange={(e) => setMemo(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void save(true)} disabled={busy}>
          저장하고 안내 보내기
        </Button>
        <Button variant="secondary" onClick={() => void save(false)} disabled={busy}>
          저장만
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          취소
        </Button>
        {row.ot_starts_at && (
          <Button variant="ghost" onClick={() => void remove()} disabled={busy} className="ml-auto text-red-600">
            일정 지우기
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
