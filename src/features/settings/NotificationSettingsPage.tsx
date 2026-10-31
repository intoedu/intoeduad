import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Field, Input, PageHeader, Spinner } from '../../components/ui'
import { isValidPhone, normalizePhone } from '../../domain/phone'
import { ALIMTALK_TEMPLATES, type TemplateCode } from '../../domain/messages'
import { invokeFunction, supabase } from '../../lib/supabase'
import { SettingsTabs } from './SettingsTabs'

type Solapi = { enabled: boolean; sender_number: string; pf_id: string; sms_fallback: boolean; templates: Record<string, string> }
type StaffNotify = { enabled: boolean; events: string[] }
type Email = { enabled: boolean; from: string }
type StaffRow = { id: string; name: string; role: string; phone: string | null; notify_channels: string[]; active: boolean }
type Msg = { tone: 'green' | 'red'; text: string } | null

const EVENTS: Array<{ key: string; label: string }> = [
  { key: 'new_lead', label: '신규 상담 신청' },
  { key: 'new_registration', label: '신규 캠프 등록 신청' },
  { key: 'passport_uploaded', label: '여권 사진 업로드' },
  { key: 'destruction_overdue', label: '파기 미승인 기한 초과(관리자, 매일)' },
  { key: 'commission_overdue', label: '커미션 지급 지연(관리자, 매일)' },
]

// 알림 설정: 솔라피(알림톡·문자) / 직원 알림 / 이메일. API 키는 화면에 두지 않고 Edge Function 시크릿으로만 관리한다.
export function NotificationSettingsPage() {
  const [solapi, setSolapi] = useState<Solapi | null>(null)
  const [notify, setNotify] = useState<StaffNotify>({ enabled: false, events: [] })
  const [email, setEmail] = useState<Email>({ enabled: false, from: '' })
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [message, setMessage] = useState<Msg>(null)

  const load = useCallback(async () => {
    const [s, st] = await Promise.all([
      supabase.from('settings').select('key, value').in('key', ['solapi', 'staff_notifications', 'email']),
      supabase.from('staff_profiles').select('id, name, role, phone, notify_channels, active').neq('role', 'viewer').order('name'),
    ])
    const map = Object.fromEntries((s.data ?? []).map((r) => [r.key, r.value]))
    const so = (map.solapi ?? {}) as Partial<Solapi>
    setSolapi({ enabled: !!so.enabled, sender_number: so.sender_number ?? '', pf_id: so.pf_id ?? '', sms_fallback: so.sms_fallback !== false, templates: so.templates ?? {} })
    const n = (map.staff_notifications ?? {}) as Partial<StaffNotify>
    setNotify({ enabled: !!n.enabled, events: n.events ?? [] })
    const e = (map.email ?? {}) as Partial<Email>
    setEmail({ enabled: !!e.enabled, from: e.from ?? '' })
    setStaff((st.data ?? []) as StaffRow[])
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    if (!solapi) return
    if (solapi.sender_number && !isValidPhone(normalizePhone(solapi.sender_number))) return setMessage({ tone: 'red', text: '발신번호를 확인해 주세요(솔라피에 등록한 번호).' })
    if (email.enabled && !/^[^@\s]+@[^@\s]+\.[^@\s]+$|^.+<[^@\s]+@[^@\s]+\.[^@\s]+>$/.test(email.from.trim())) {
      return setMessage({ tone: 'red', text: '보내는 사람 이메일을 확인해 주세요. 예: 인투유학 <noreply@도메인>' })
    }
    const { error } = await supabase.from('settings').upsert([
      { key: 'solapi', value: { ...solapi, sender_number: normalizePhone(solapi.sender_number) } },
      { key: 'staff_notifications', value: notify },
      { key: 'email', value: { enabled: email.enabled, from: email.from.trim() } },
    ])
    setMessage(error ? { tone: 'red', text: '저장하지 못했습니다.' } : { tone: 'green', text: '알림 설정을 저장했습니다.' })
  }

  async function saveStaff(row: StaffRow, patch: Partial<StaffRow>) {
    const next = { ...row, ...patch }
    if (next.phone && !isValidPhone(normalizePhone(next.phone))) return setMessage({ tone: 'red', text: `${row.name}님 휴대폰 번호를 확인해 주세요.` })
    const { error } = await supabase
      .from('staff_profiles')
      .update({ phone: next.phone ? normalizePhone(next.phone) : null, notify_channels: next.notify_channels })
      .eq('id', row.id)
    setMessage(error ? { tone: 'red', text: '저장하지 못했습니다.' } : { tone: 'green', text: `${row.name}님 알림 받기를 저장했습니다.` })
    await load()
  }

  async function test(channel: 'sms' | 'email') {
    const { error } = await supabase.rpc('send_test_message', { p_channel: channel })
    if (error) return setMessage({ tone: 'red', text: '테스트 발송을 요청하지 못했습니다.' })
    try {
      const r = await invokeFunction<{ sent: number; skipped: number; failed: number }>('message-sender', {})
      setMessage({ tone: 'green', text: `테스트 발송 결과: 보냄 ${r.sent} · 보내지 않음 ${r.skipped} · 실패 ${r.failed} (자세한 이유는 발송 기록에서 확인)` })
    } catch (e) {
      setMessage({ tone: 'red', text: (e as Error).message })
    }
  }

  if (!solapi) return <Spinner />
  return (
    <>
      <SettingsTabs />
      <PageHeader title="알림 설정" description="학부모 알림톡은 고객이 신청한 건에 대한 1회성 안내만 보냅니다. 꺼 두어도 시스템은 그대로 동작하고, 발송 기록에 '보내지 않음'으로 남습니다." />
      <div className="max-w-3xl space-y-4">
        <Alert tone="blue">
          솔라피 API 키·시크릿과 이메일(Resend) API 키는 이 화면에 넣지 않습니다. Supabase Edge Function 시크릿(SOLAPI_API_KEY, SOLAPI_API_SECRET, RESEND_API_KEY)으로만
          등록합니다.
        </Alert>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <Card>
          <p className="mb-3 font-semibold text-slate-900">솔라피 알림톡·문자</p>
          <label className="mb-3 flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={solapi.enabled} onChange={(e) => setSolapi({ ...solapi, enabled: e.target.checked })} />
            알림톡·문자 사용
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="발신번호(솔라피 등록 번호)">
              <Input value={solapi.sender_number} onChange={(e) => setSolapi({ ...solapi, sender_number: e.target.value })} />
            </Field>
            <Field label="카카오 채널 pfId">
              <Input value={solapi.pf_id} onChange={(e) => setSolapi({ ...solapi, pf_id: e.target.value })} />
            </Field>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={solapi.sms_fallback} onChange={(e) => setSolapi({ ...solapi, sms_fallback: e.target.checked })} />
            알림톡 실패 시 문자로 대체 발송(대체 문구는 솔라피 템플릿 등록 때 설정)
          </label>
          <p className="mt-4 mb-2 text-sm font-medium text-slate-700">승인된 템플릿 ID (문안: docs/alimtalk-templates.md)</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(Object.keys(ALIMTALK_TEMPLATES) as TemplateCode[]).map((code) => (
              <Field key={code} label={ALIMTALK_TEMPLATES[code].name} hint={ALIMTALK_TEMPLATES[code].trigger}>
                <Input value={solapi.templates[code] ?? ''} onChange={(e) => setSolapi({ ...solapi, templates: { ...solapi.templates, [code]: e.target.value.trim() } })} />
              </Field>
            ))}
          </div>
        </Card>

        <Card>
          <p className="mb-3 font-semibold text-slate-900">직원 알림</p>
          <label className="mb-3 flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={notify.enabled} onChange={(e) => setNotify({ ...notify, enabled: e.target.checked })} />
            직원 알림 사용 (학부모 개인정보 없이 "신규 신청 1건 — 관리자 화면 확인" 형태)
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            {EVENTS.map((ev) => (
              <label key={ev.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={notify.events.includes(ev.key)}
                  onChange={(e) => setNotify({ ...notify, events: e.target.checked ? [...notify.events, ev.key] : notify.events.filter((x) => x !== ev.key) })}
                />
                {ev.label}
              </label>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-[auto_1fr] sm:items-end">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" checked={email.enabled} onChange={(e) => setEmail({ ...email, enabled: e.target.checked })} />
              이메일 알림 사용
            </label>
            <Field label="보내는 사람(도메인 인증한 주소)">
              <Input value={email.from} placeholder="인투유학 <noreply@example.com>" onChange={(e) => setEmail({ ...email, from: e.target.value })} />
            </Field>
          </div>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void save()}>알림 설정 저장</Button>
          <Button variant="secondary" onClick={() => void test('sms')}>
            나에게 문자 테스트
          </Button>
          <Button variant="secondary" onClick={() => void test('email')}>
            나에게 이메일 테스트
          </Button>
        </div>

        <Card>
          <p className="mb-1 font-semibold text-slate-900">알림 받을 직원</p>
          <p className="mb-3 text-xs text-slate-500">문자는 휴대폰 번호가 있어야 받습니다. 관리자 전용 알림(파기·커미션)은 관리자에게만 갑니다.</p>
          <ul className="divide-y divide-slate-100">
            {staff.map((s) => (
              <StaffNotifyRow key={`${s.id}-${s.phone}-${s.notify_channels.join()}`} row={s} onSave={saveStaff} />
            ))}
          </ul>
        </Card>
      </div>
    </>
  )
}

function StaffNotifyRow({ row, onSave }: { row: StaffRow; onSave: (row: StaffRow, patch: Partial<StaffRow>) => Promise<void> }) {
  const [phone, setPhone] = useState(row.phone ?? '')
  const [channels, setChannels] = useState(row.notify_channels)
  const dirty = phone !== (row.phone ?? '') || channels.join() !== row.notify_channels.join()
  return (
    <li className="grid gap-2 py-2 sm:grid-cols-[1fr_180px_auto_auto_auto] sm:items-center" aria-label={`알림 받을 직원 ${row.name}`}>
      <span className="text-sm">
        {row.name} <span className="text-xs text-slate-500">{row.role === 'admin' ? '관리자' : '직원'}</span>
        {!row.active && <span className="text-xs text-slate-400"> · 비활성</span>}
      </span>
      <Input aria-label={`${row.name} 휴대폰`} value={phone} placeholder="010-0000-0000" onChange={(e) => setPhone(e.target.value)} />
      {(['sms', 'email'] as const).map((c) => (
        <label key={c} className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={channels.includes(c)}
            onChange={(e) => setChannels(e.target.checked ? [...channels, c] : channels.filter((x) => x !== c))}
          />
          {c === 'sms' ? '문자' : '이메일'}
        </label>
      ))}
      <Button variant="secondary" disabled={!dirty} onClick={() => void onSave(row, { phone: phone || null, notify_channels: channels })}>
        저장
      </Button>
    </li>
  )
}
