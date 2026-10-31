import { useCallback, useEffect, useState } from 'react'
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Spinner, Textarea } from '../../components/ui'
import { formatKst } from '../../lib/datetime'
import { CONSENT_KIND_LABELS } from '../../lib/labels'
import { supabase, type Tables } from '../../lib/supabase'
import { SettingsTabs } from './SettingsTabs'

type Doc = Tables<'consent_documents'>

// 문구 안에서 쓸 수 있는 자동 치환 키
const PLACEHOLDERS: Record<string, string[]> = {
  lead_privacy: ['lead_retention'],
  reg_privacy: ['program_name', 'destroy_after_days'],
  reg_passport: ['destroy_after_days'],
  reg_third_party: ['ticketing_agent', 'school_name', 'school_country', 'lodging_name', 'lodging_country'],
  reg_health: ['destroy_after_days'],
  reg_partner_share: ['partner_name'],
  destruction_notice: ['program_name', 'program_end_date', 'destroy_after_days', 'destroy_date'],
  refund_default: ['program_name'],
}

const KIND_ORDER = Object.keys(CONSENT_KIND_LABELS)

function DocEditor({ kind, versions, onSaved }: { kind: string; versions: Doc[]; onSaved: (text: string, ok: boolean) => Promise<void> }) {
  const latest = versions[0]
  const [title, setTitle] = useState(latest?.title ?? '')
  const [body, setBody] = useState(latest?.body ?? '')
  const [open, setOpen] = useState(false)
  const dirty = title !== (latest?.title ?? '') || body !== (latest?.body ?? '')

  async function save() {
    if (
      !window.confirm(
        `새 버전(v${(latest?.version ?? 0) + 1})으로 저장할까요?\n저장 후 들어오는 신청부터 적용되고, 이미 받은 동의 기록은 그때 문구 그대로 남습니다.`,
      )
    )
      return
    const { data, error } = await supabase.rpc('add_consent_version', { p_kind: kind, p_title: title, p_body: body })
    await onSaved(
      error ? (/[가-힣]/.test(error.message) ? error.message : '저장하지 못했습니다.') : `${CONSENT_KIND_LABELS[kind]} 문구를 v${data}로 저장했습니다.`,
      !error,
    )
  }

  return (
    <section aria-label={CONSENT_KIND_LABELS[kind] ?? kind}>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-slate-900">{CONSENT_KIND_LABELS[kind] ?? kind}</p>
            {latest && <Badge tone="blue">v{latest.version}</Badge>}
          </div>
          <Button variant="ghost" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? '접기' : '보기·수정'}
          </Button>
        </div>
        {latest && <p className="mt-1 text-xs text-slate-500">현재 버전 저장: {formatKst(latest.created_at)}</p>}
        {open && (
          <div className="mt-4 space-y-3">
            <Field label="제목">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="본문" hint={PLACEHOLDERS[kind] ? `자동으로 바뀌는 칸: ${PLACEHOLDERS[kind].map((k) => `{{${k}}}`).join(', ')}` : undefined}>
              <Textarea rows={14} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-xs" />
            </Field>
            <Button disabled={!dirty || !title.trim() || !body.trim()} onClick={() => void save()}>
              새 버전으로 저장
            </Button>
            {versions.length > 1 && (
              <details>
                <summary className="cursor-pointer text-sm text-brand-600">이전 버전 {versions.length - 1}개</summary>
                <ul className="mt-2 space-y-2">
                  {versions.slice(1).map((d) => (
                    <li key={d.id} className="rounded-lg bg-slate-50 p-3 text-xs ring-1 ring-slate-200">
                      <p className="font-medium text-slate-700">
                        v{d.version} · {formatKst(d.created_at)} · {d.title}
                      </p>
                      <pre className="mt-1 whitespace-pre-wrap text-slate-600">{d.body}</pre>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </Card>
    </section>
  )
}

// 동의·안내 문구 (부록 A·B) — 수정하면 새 버전으로 쌓이고, 신청 시점 버전이 동의 기록에 남는다
export function ConsentsPage() {
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string } | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('consent_documents').select('*').order('version', { ascending: false })
    setDocs(data ?? [])
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  if (!docs) return <Spinner />
  const kinds = KIND_ORDER.filter((k) => docs.some((d) => d.kind === k))
  return (
    <>
      <SettingsTabs />
      <PageHeader
        title="동의·안내 문구"
        description="상담·등록 신청서의 동의 문구와 개인정보 파기 안내, 환불 규정 기본안입니다. 수정하면 버전이 올라가고, 신청 시점의 문구가 신청 건마다 그대로 보관됩니다."
      />
      <div className="space-y-3">
        <Alert tone="amber">기본 문구는 초안입니다. 운영 전 개인정보처리방침과 함께 법률 검토 후 확정해 주세요.</Alert>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        {kinds.map((k) => (
          <DocEditor
            key={`${k}-${docs.find((d) => d.kind === k)?.version}`}
            kind={k}
            versions={docs.filter((d) => d.kind === k)}
            onSaved={async (text, ok) => {
              setMessage({ tone: ok ? 'green' : 'red', text })
              if (ok) await load()
            }}
          />
        ))}
      </div>
    </>
  )
}
