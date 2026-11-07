import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { QuestionsEditor } from '../../components/admin/QuestionsEditor'
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Select, Spinner, Tabs, Textarea } from '../../components/ui'
import {
  INFLOW_KIND_LABELS,
  LEAD_FIELDS,
  REGISTRATION_TEXT_FIELDS,
  type FieldMode,
  type FieldSetting,
  type InflowKind,
} from '../../domain/formSettings'
import { supabase, type Tables } from '../../lib/supabase'
import type { Json } from '../../types/database'
import { FORM_FIELDS } from '../programs/api'
import { SettingsTabs } from './SettingsTabs'

type FormSettings = {
  lead: { title?: string; intro?: string; fields: Record<string, FieldSetting> }
  registration: { intro?: string; fields: Record<string, FieldSetting> }
  inflow_label?: string
  consulted_label?: string
}

const MODE_LABELS: Record<FieldMode, string> = { required: '필수', optional: '선택', hidden: '숨김' }
type Tab = 'lead' | 'registration' | 'inflow'

function normalize(value: unknown): FormSettings {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<FormSettings>
  return {
    lead: { title: v.lead?.title ?? '', intro: v.lead?.intro ?? '', fields: { ...(v.lead?.fields ?? {}) } },
    registration: { intro: v.registration?.intro ?? '', fields: { ...(v.registration?.fields ?? {}) } },
    inflow_label: v.inflow_label ?? '어디서 알게 되셨나요?',
    consulted_label: v.consulted_label ?? '인투유학 상담을 신청하신 적이 있나요?',
  }
}

// 빈 문구는 저장하지 않는다(기본 문구 사용)
function compact(fields: Record<string, FieldSetting>) {
  const out: Record<string, FieldSetting> = {}
  for (const [k, f] of Object.entries(fields)) {
    const item: FieldSetting = {}
    if (f.label?.trim()) item.label = f.label.trim()
    if (f.help?.trim()) item.help = f.help.trim()
    if (f.mode) item.mode = f.mode
    if (Object.keys(item).length) out[k] = item
  }
  return out
}

// 설정 → 신청서 질문: 기본 질문 문구·필수 여부, 추가 질문, 유입 경로 목록
export function FormsSettingsPage() {
  const [tab, setTab] = useState<Tab>('lead')
  const [settings, setSettings] = useState<FormSettings | null>(null)
  const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase
      .from('settings')
      .select('value')
      .eq('key', 'form_settings')
      .maybeSingle()
      .then(({ data }) => setSettings(normalize(data?.value)))
  }, [])

  async function save() {
    if (!settings) return
    setSaving(true)
    const value = {
      lead: { title: settings.lead.title?.trim() || '', intro: settings.lead.intro ?? '', fields: compact(settings.lead.fields) },
      registration: { intro: settings.registration.intro ?? '', fields: compact(settings.registration.fields) },
      inflow_label: settings.inflow_label?.trim() || '어디서 알게 되셨나요?',
      consulted_label: settings.consulted_label?.trim() || '인투유학 상담을 신청하신 적이 있나요?',
    }
    const { error } = await supabase.from('settings').upsert({ key: 'form_settings', value: value as unknown as NonNullable<Json> })
    setSaving(false)
    setMessage(error ? { tone: 'red', text: '저장하지 못했습니다.' } : { tone: 'green', text: '신청서 문구를 저장했습니다. 학부모 신청서에 바로 반영됩니다.' })
  }

  function setField(form: 'lead' | 'registration', key: string, patch: FieldSetting) {
    setSettings((prev) =>
      prev ? { ...prev, [form]: { ...prev[form], fields: { ...prev[form].fields, [key]: { ...prev[form].fields[key], ...patch } } } } : prev,
    )
  }

  if (!settings) return <Spinner />

  const saveBar = (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={() => void save()} disabled={saving}>
        {saving ? '저장 중…' : '문구·필수 여부 저장'}
      </Button>
      <span className="text-xs text-slate-500">추가 질문과 유입 경로 목록은 고칠 때마다 바로 저장됩니다.</span>
    </div>
  )

  return (
    <>
      <PageHeader title="설정·직원 관리" />
      <SettingsTabs />
      <div className="mt-4 space-y-4">
        <Tabs
          tabs={[
            { value: 'lead', label: '상담 신청서' },
            { value: 'registration', label: '캠프 신청서' },
            { value: 'inflow', label: '유입 경로' },
          ]}
          value={tab}
          onChange={(v) => setTab(v as Tab)}
        />
        {message && <Alert tone={message.tone}>{message.text}</Alert>}

        {tab === 'lead' && (
          <>
            <Card>
              <p className="mb-3 font-semibold text-slate-900">제목·소개 문구</p>
              <div className="space-y-3">
                <Field label="신청서 제목">
                  <Input
                    maxLength={60}
                    value={settings.lead.title ?? ''}
                    placeholder="유학·캠프 상담 신청"
                    onChange={(e) => setSettings({ ...settings, lead: { ...settings.lead, title: e.target.value } })}
                  />
                </Field>
                <Field label="소개 문구">
                  <Textarea rows={2} maxLength={500} value={settings.lead.intro ?? ''} onChange={(e) => setSettings({ ...settings, lead: { ...settings.lead, intro: e.target.value } })} />
                </Field>
              </div>
            </Card>
            <Card>
              <p className="mb-1 font-semibold text-slate-900">기본 질문</p>
              <p className="mb-3 text-sm text-slate-500">자녀 이름·학부모 이름·휴대폰 번호, 유입 경로, 카카오톡 사용 여부, 개인정보 동의는 항상 필수입니다.</p>
              <ul className="divide-y divide-slate-100">
                {LEAD_FIELDS.map((f) => (
                  <FieldRow
                    key={f.key}
                    name={f.label}
                    value={settings.lead.fields[f.key] ?? {}}
                    modes={f.modes}
                    defaultMode={f.default}
                    onChange={(patch) => setField('lead', f.key, patch)}
                  />
                ))}
              </ul>
            </Card>
            {saveBar}
            <Card>
              <p className="mb-1 font-semibold text-slate-900">추가 질문</p>
              <p className="mb-3 text-sm text-slate-500">기본 질문 아래 "추가 질문"으로 보입니다.</p>
              <QuestionsEditor form="lead" programId={null} />
            </Card>
            <p className="text-sm">
              <a href="/apply" target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                상담 신청서 미리 보기 ↗
              </a>
            </p>
          </>
        )}

        {tab === 'registration' && (
          <>
            <Card>
              <p className="mb-3 font-semibold text-slate-900">안내 문구·상담 이력 질문</p>
              <div className="space-y-3">
                <Field label="모든 캠프 신청서 위에 보일 안내 (선택)">
                  <Textarea
                    rows={2}
                    maxLength={500}
                    value={settings.registration.intro ?? ''}
                    onChange={(e) => setSettings({ ...settings, registration: { ...settings.registration, intro: e.target.value } })}
                  />
                </Field>
                <Field label="상담 이력 질문" hint="답: 예 / 아니요 / 잘 모르겠어요. 상담 기록 링크로 들어온 경우에는 묻지 않습니다.">
                  <Input maxLength={100} value={settings.consulted_label ?? ''} onChange={(e) => setSettings({ ...settings, consulted_label: e.target.value })} />
                </Field>
              </div>
            </Card>
            <Card>
              <p className="mb-1 font-semibold text-slate-900">기본 질문</p>
              <p className="mb-3 text-sm text-slate-500">
                문구는 모든 캠프에 적용됩니다. 필수/선택/숨김은 <strong>새 캠프의 기본값</strong>이며, 캠프마다 "신청서 항목" 단계에서 바꿀 수 있습니다.
              </p>
              <ul className="divide-y divide-slate-100">
                {REGISTRATION_TEXT_FIELDS.map((f) => {
                  const mf = FORM_FIELDS.find((x) => x.key === f.key)
                  return (
                    <FieldRow
                      key={f.key}
                      name={f.label}
                      value={settings.registration.fields[f.key] ?? {}}
                      modes={mf ? ['required', 'optional', 'hidden'] : ['required']}
                      defaultMode={mf?.default ?? 'required'}
                      defaultHelp={f.help}
                      onChange={(patch) => setField('registration', f.key, patch)}
                    />
                  )
                })}
              </ul>
            </Card>
            {saveBar}
            <Card>
              <p className="mb-1 font-semibold text-slate-900">모든 캠프 공통 추가 질문</p>
              <p className="mb-3 text-sm text-slate-500">
                캠프 하나에만 묻고 싶은 질문은{' '}
                <Link to="/admin/programs" className="text-brand-600 hover:underline">
                  캠프 편집
                </Link>
                의 "신청서 항목" 단계에서 추가합니다.
              </p>
              <QuestionsEditor form="registration" programId={null} />
            </Card>
          </>
        )}

        {tab === 'inflow' && (
          <>
            <Card>
              <Field label="질문 문구" hint="상담 신청서·캠프 신청서 모두 필수로 묻습니다. 학원 링크로 들어오면 묻지 않습니다.">
                <Input maxLength={60} value={settings.inflow_label ?? ''} onChange={(e) => setSettings({ ...settings, inflow_label: e.target.value })} />
              </Field>
              <div className="mt-3">{saveBar}</div>
            </Card>
            <Card>
              <p className="mb-1 font-semibold text-slate-900">답 목록</p>
              <p className="mb-3 text-sm text-slate-500">
                "학원 소개"를 고르면 학원·선생님을 고르게 하고(커미션 소개 경로), 목록에 없으면 학원 이름을 적게 합니다. 지난 기록의 경로 이름을 지키기 위해 지우지
                않고 "사용 안 함"으로 둡니다.
              </p>
              <InflowChannelsEditor onMessage={setMessage} />
            </Card>
          </>
        )}
      </div>
    </>
  )
}

function FieldRow({
  name,
  value,
  modes,
  defaultMode,
  defaultHelp,
  onChange,
}: {
  name: string
  value: FieldSetting
  modes: FieldMode[]
  defaultMode: FieldMode
  defaultHelp?: string
  onChange: (patch: FieldSetting) => void
}) {
  const mode = value.mode && modes.includes(value.mode) ? value.mode : defaultMode
  return (
    <li className="grid gap-2 py-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
      <Field label={`질문 문구 (기본: ${name})`}>
        <Input maxLength={200} placeholder={name} value={value.label ?? ''} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <Field label="안내 문구 (선택)">
        <Input maxLength={500} placeholder={defaultHelp ?? ''} value={value.help ?? ''} onChange={(e) => onChange({ help: e.target.value })} />
      </Field>
      {modes.length > 1 ? (
        <div className="flex gap-1" role="radiogroup" aria-label={`${name} 필수 여부`}>
          {modes.map((m) => (
            <label
              key={m}
              className={`cursor-pointer rounded-lg px-3 py-2 text-sm ring-1 ${mode === m ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-300'}`}
            >
              <input type="radio" className="sr-only" checked={mode === m} onChange={() => onChange({ mode: m })} />
              {MODE_LABELS[m]}
            </label>
          ))}
        </div>
      ) : (
        <Badge tone="amber">항상 필수</Badge>
      )}
    </li>
  )
}

type Channel = Tables<'inflow_channels'>

function InflowChannelsEditor({ onMessage }: { onMessage: (m: { tone: 'green' | 'red'; text: string } | null) => void }) {
  const [rows, setRows] = useState<Channel[] | null>(null)
  const [edits, setEdits] = useState<Record<string, Partial<Channel>>>({})
  const [newLabel, setNewLabel] = useState('')
  const [newKind, setNewKind] = useState<InflowKind>('plain')

  const load = useCallback(async () => {
    const { data } = await supabase.from('inflow_channels').select('*').order('sort').order('created_at')
    setRows(data ?? [])
    setEdits({})
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function update(id: string, body: Partial<Channel>, text: string) {
    const { error } = await supabase.from('inflow_channels').update(body).eq('id', id)
    onMessage(error ? { tone: 'red', text: /[가-힣]/.test(error.message) ? error.message : '저장하지 못했습니다.' } : { tone: 'green', text })
    await load()
  }

  async function add() {
    if (!newLabel.trim() || !rows) return
    const { error } = await supabase.from('inflow_channels').insert({
      label: newLabel.trim(),
      kind: newKind,
      detail_label: newKind === 'detail' ? '내용' : null,
      sort: (rows.filter((r) => r.system_key !== 'other').at(-1)?.sort ?? 0) + 5,
    })
    onMessage(error ? { tone: 'red', text: /[가-힣]/.test(error.message) ? error.message : '추가하지 못했습니다.' } : { tone: 'green', text: '경로를 추가했습니다.' })
    setNewLabel('')
    await load()
  }

  async function move(index: number, dir: -1 | 1) {
    if (!rows || !rows[index + dir]) return
    const order = rows.map((r) => r.id)
    ;[order[index], order[index + dir]] = [order[index + dir], order[index]]
    await Promise.all(order.map((id, i) => supabase.from('inflow_channels').update({ sort: (i + 1) * 10 }).eq('id', id)))
    await load()
  }

  if (!rows) return <p className="text-sm text-slate-500">불러오는 중…</p>

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
        {rows.map((c, i) => {
          const e = { ...c, ...edits[c.id] }
          const dirty = !!edits[c.id]
          return (
            <li key={c.id} className="space-y-2 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  className="max-w-xs"
                  aria-label="경로 이름"
                  maxLength={40}
                  value={e.label}
                  onChange={(ev) => setEdits({ ...edits, [c.id]: { ...edits[c.id], label: ev.target.value } })}
                />
                {c.system_key ? (
                  <Badge>{INFLOW_KIND_LABELS[c.kind as InflowKind]} · 기본 항목</Badge>
                ) : (
                  <Select
                    className="max-w-[12rem]"
                    aria-label="경로 종류"
                    value={e.kind}
                    onChange={(ev) => setEdits({ ...edits, [c.id]: { ...edits[c.id], kind: ev.target.value } })}
                  >
                    <option value="plain">{INFLOW_KIND_LABELS.plain}</option>
                    <option value="detail">{INFLOW_KIND_LABELS.detail}</option>
                  </Select>
                )}
                {!c.active && <Badge tone="gray">사용 안 함</Badge>}
              </div>
              {e.kind === 'detail' && (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="max-w-xs"
                    aria-label="입력칸 이름"
                    maxLength={60}
                    placeholder="입력칸 이름 (예: 소개해 주신 분)"
                    value={e.detail_label ?? ''}
                    onChange={(ev) => setEdits({ ...edits, [c.id]: { ...edits[c.id], detail_label: ev.target.value } })}
                  />
                  <label className="flex items-center gap-1 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={e.detail_required}
                      onChange={(ev) => setEdits({ ...edits, [c.id]: { ...edits[c.id], detail_required: ev.target.checked } })}
                    />
                    입력 필수
                  </label>
                </div>
              )}
              <div className="flex flex-wrap gap-1">
                {dirty && (
                  <Button
                    onClick={() =>
                      void update(
                        c.id,
                        {
                          label: e.label.trim(),
                          ...(c.system_key ? {} : { kind: e.kind }),
                          detail_label: e.kind === 'detail' ? e.detail_label?.trim() || '내용' : null,
                          detail_required: e.kind === 'detail' ? e.detail_required : false,
                        },
                        '저장했습니다.',
                      )
                    }
                  >
                    저장
                  </Button>
                )}
                <Button variant="ghost" aria-label="위로" disabled={i === 0} onClick={() => void move(i, -1)}>
                  ↑
                </Button>
                <Button variant="ghost" aria-label="아래로" disabled={i === rows.length - 1} onClick={() => void move(i, 1)}>
                  ↓
                </Button>
                <Button variant="ghost" onClick={() => void update(c.id, { active: !c.active }, c.active ? '목록에서 숨겼습니다.' : '다시 보이게 했습니다.')}>
                  {c.active ? '사용 안 함' : '다시 쓰기'}
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="새 경로">
          <Input maxLength={40} placeholder="예: 카카오톡 채널" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
        </Field>
        <Select className="max-w-[12rem]" aria-label="새 경로 종류" value={newKind} onChange={(e) => setNewKind(e.target.value as InflowKind)}>
          <option value="plain">{INFLOW_KIND_LABELS.plain}</option>
          <option value="detail">{INFLOW_KIND_LABELS.detail}</option>
        </Select>
        <Button variant="secondary" onClick={() => void add()} disabled={!newLabel.trim()}>
          + 추가
        </Button>
      </div>
    </div>
  )
}
