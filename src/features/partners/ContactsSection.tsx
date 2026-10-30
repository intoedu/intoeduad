import { useState, type FormEvent } from 'react'
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Select, Textarea } from '../../components/ui'
import { formatPhone, isValidPhone, normalizePhone } from '../../domain/phone'
import { suggestContactCode } from '../../domain/romanize'
import { CONTACT_ROLE_LABELS } from '../../lib/labels'
import { supabase } from '../../lib/supabase'
import { errorMessage, type PartnerContact } from './api'

const CODE_RE = /^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$/

type Draft = { name: string; role: string; phone: string; email: string; code: string; memo: string }

const emptyDraft: Draft = { name: '', role: 'counselor', phone: '', email: '', code: '', memo: '' }

export function ContactsSection({
  partnerId,
  contacts,
  isAdmin,
  onChanged,
}: {
  partnerId: string
  contacts: PartnerContact[]
  isAdmin: boolean
  onChanged: () => Promise<void>
}) {
  const [editingId, setEditingId] = useState<string | 'new' | null>(contacts.length === 0 ? 'new' : null)
  const [message, setMessage] = useState('')

  return (
    <div className="space-y-3">
      <Alert tone="blue">
        상담실장마다 전용 신청 링크·QR이 만들어집니다. 학부모가 그 링크로 신청하면 <strong>어느 학원의 누가 소개했는지</strong> 자동으로
        기록되어 커미션 대상이 정확해집니다.
      </Alert>
      {message && <Alert tone="green">{message}</Alert>}

      {contacts.length === 0 && editingId !== 'new' && <EmptyState>등록된 담당자가 없습니다.</EmptyState>}

      {contacts.map((c) =>
        editingId === c.id ? (
          <ContactForm
            key={c.id}
            partnerId={partnerId}
            contact={c}
            isAdmin={isAdmin}
            existingCodes={contacts.filter((x) => x.id !== c.id).map((x) => x.code)}
            onCancel={() => setEditingId(null)}
            onSaved={async () => {
              setEditingId(null)
              setMessage(`${c.name}님 정보를 저장했습니다.`)
              await onChanged()
            }}
          />
        ) : (
          <Card key={c.id} className={c.active ? '' : 'opacity-60'}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-900">{c.name}</p>
                  <Badge tone="blue">{CONTACT_ROLE_LABELS[c.role] ?? c.role}</Badge>
                  {!c.active && <Badge tone="red">비활성</Badge>}
                  {c.code_locked && <Badge tone="green">링크 배포됨</Badge>}
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {[formatPhone(c.phone), c.email, `코드 ${c.code}`].filter(Boolean).join(' · ')}
                </p>
                {c.memo && <p className="mt-1 text-sm text-slate-600">{c.memo}</p>}
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setEditingId(c.id)}>
                  수정
                </Button>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    await supabase.from('partner_contacts').update({ active: !c.active }).eq('id', c.id)
                    setMessage(`${c.name}님을 ${c.active ? '비활성화' : '다시 활성화'}했습니다.`)
                    await onChanged()
                  }}
                >
                  {c.active ? '비활성화' : '다시 활성화'}
                </Button>
              </div>
            </div>
          </Card>
        ),
      )}

      {editingId === 'new' ? (
        <ContactForm
          partnerId={partnerId}
          isAdmin={isAdmin}
          existingCodes={contacts.map((x) => x.code)}
          onCancel={() => setEditingId(null)}
          onSaved={async (name) => {
            setEditingId(null)
            setMessage(`${name}님을 담당자로 추가했습니다. [링크·QR] 탭에서 전용 QR을 받을 수 있습니다.`)
            await onChanged()
          }}
        />
      ) : (
        <Button onClick={() => setEditingId('new')}>+ 담당자(상담실장) 추가</Button>
      )}
    </div>
  )
}

function ContactForm({
  partnerId,
  contact,
  isAdmin,
  existingCodes,
  onCancel,
  onSaved,
}: {
  partnerId: string
  contact?: PartnerContact
  isAdmin: boolean
  existingCodes: string[]
  onCancel: () => void
  onSaved: (name: string) => Promise<void>
}) {
  const [draft, setDraft] = useState<Draft>(
    contact
      ? {
          name: contact.name,
          role: contact.role,
          phone: contact.phone ?? '',
          email: contact.email ?? '',
          code: contact.code,
          memo: contact.memo ?? '',
        }
      : emptyDraft,
  )
  const [codeTouched, setCodeTouched] = useState(Boolean(contact))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const codeLocked = Boolean(contact?.code_locked) && !isAdmin

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const phone = normalizePhone(draft.phone)
    if (!draft.name.trim()) return setError('이름을 입력해 주세요.')
    if (phone && !isValidPhone(phone)) return setError('전화번호 형식을 확인해 주세요.')
    if (!CODE_RE.test(draft.code)) return setError('링크 코드는 영문 소문자·숫자·하이픈 2~30자입니다.')
    if (existingCodes.includes(draft.code)) return setError('이 학원에서 이미 쓰는 코드입니다.')

    setSaving(true)
    const row = {
      partner_id: partnerId,
      name: draft.name.trim(),
      role: draft.role,
      phone: phone || null,
      email: draft.email.trim() || null,
      code: draft.code,
      memo: draft.memo.trim() || null,
    }
    const { error } = contact
      ? await supabase.from('partner_contacts').update(row).eq('id', contact.id)
      : await supabase.from('partner_contacts').insert(row)
    setSaving(false)
    if (error) return setError(errorMessage(error, '저장하지 못했습니다.'))
    await onSaved(row.name)
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <p className="font-semibold text-slate-900">{contact ? '담당자 수정' : '담당자 추가'}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="이름 (필수)">
            <Input
              value={draft.name}
              onChange={(e) => {
                const name = e.target.value
                setDraft((d) => ({ ...d, name, code: codeTouched ? d.code : suggestContactCode(name) }))
              }}
            />
          </Field>
          <Field label="역할">
            <Select value={draft.role} onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}>
              {Object.entries(CONTACT_ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="연락처">
            <Input inputMode="tel" value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} />
          </Field>
          <Field label="이메일">
            <Input type="email" value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} />
          </Field>
          <Field label="링크 코드" hint={codeLocked ? '배포된 링크라 바꿀 수 없습니다' : '전용 링크 끝에 붙는 코드 (예: ?c=kim)'}>
            <Input
              value={draft.code}
              disabled={codeLocked}
              onChange={(e) => {
                setCodeTouched(true)
                setDraft((d) => ({ ...d, code: e.target.value.toLowerCase() }))
              }}
            />
          </Field>
          <Field label="메모">
            <Textarea rows={1} value={draft.memo} onChange={(e) => setDraft((d) => ({ ...d, memo: e.target.value }))} />
          </Field>
        </div>
        {error && <Alert>{error}</Alert>}
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? '저장 중…' : '저장'}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            취소
          </Button>
        </div>
      </form>
    </Card>
  )
}
