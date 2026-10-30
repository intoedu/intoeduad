import { useEffect, useState, type FormEvent } from 'react'
import { Alert, Button, Field, Input, Select, Textarea } from '../../components/ui'
import { isValidPhone, normalizePhone } from '../../domain/phone'
import { suggestPartnerCode } from '../../domain/romanize'
import { supabase } from '../../lib/supabase'
import { findExclusiveConflicts, isPartnerCodeTaken, type Partner } from './api'

export type PartnerFormValues = {
  name: string
  region: string
  director_name: string
  phone: string
  email: string
  address: string
  business_registration_no: string
  code: string
  referred_by_partner_id: string
  memo: string
}

const CODE_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/

function toValues(p?: Partner): PartnerFormValues {
  return {
    name: p?.name ?? '',
    region: p?.region ?? '',
    director_name: p?.director_name ?? '',
    phone: p?.phone ?? '',
    email: p?.email ?? '',
    address: p?.address ?? '',
    business_registration_no: p?.business_registration_no ?? '',
    code: p?.code ?? '',
    referred_by_partner_id: p?.referred_by_partner_id ?? '',
    memo: p?.memo ?? '',
  }
}

export function PartnerForm({
  partner,
  canEditLockedCode,
  submitLabel,
  onSubmit,
}: {
  partner?: Partner
  canEditLockedCode: boolean
  submitLabel: string
  onSubmit: (values: Omit<Partner, 'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'active' | 'code_locked'>) => Promise<string | null>
}) {
  const [values, setValues] = useState<PartnerFormValues>(() => toValues(partner))
  const [codeTouched, setCodeTouched] = useState(Boolean(partner))
  const [others, setOthers] = useState<Array<{ id: string; name: string }>>([])
  const [conflicts, setConflicts] = useState<Array<{ partnerName: string; region: string }>>([])
  const [errors, setErrors] = useState<Partial<Record<keyof PartnerFormValues, string>>>({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const codeLocked = Boolean(partner?.code_locked) && !canEditLockedCode

  useEffect(() => {
    supabase
      .from('partners')
      .select('id, name')
      .is('deleted_at', null)
      .order('name')
      .then(({ data }) => setOthers((data ?? []).filter((p) => p.id !== partner?.id)))
  }, [partner?.id])

  // 독점 지역 충돌 확인 (내부 경고용)
  useEffect(() => {
    const t = setTimeout(() => {
      void findExclusiveConflicts(values.region, partner?.id).then(setConflicts)
    }, 400)
    return () => clearTimeout(t)
  }, [values.region, partner?.id])

  function set<K extends keyof PartnerFormValues>(key: K, value: string) {
    setValues((prev) => {
      const next = { ...prev, [key]: value }
      if (!codeTouched && (key === 'name' || key === 'region')) {
        next.code = suggestPartnerCode(next.region, next.name)
      }
      return next
    })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError('')
    const phone = normalizePhone(values.phone)
    const bizNo = normalizePhone(values.business_registration_no)
    const nextErrors: typeof errors = {}
    if (!values.name.trim()) nextErrors.name = '학원명을 입력해 주세요.'
    if (phone && !isValidPhone(phone)) nextErrors.phone = '전화번호 형식을 확인해 주세요.'
    if (bizNo && bizNo.length !== 10) nextErrors.business_registration_no = '사업자등록번호는 숫자 10자리입니다.'
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) nextErrors.email = '이메일 형식을 확인해 주세요.'
    if (!CODE_RE.test(values.code)) nextErrors.code = '영문 소문자·숫자·하이픈 3~40자 (처음과 끝은 영문·숫자)'
    else if (values.code !== partner?.code && (await isPartnerCodeTaken(values.code, partner?.id))) {
      nextErrors.code = '이미 사용 중인 코드입니다.'
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    const err = await onSubmit({
      name: values.name.trim(),
      region: values.region.trim() || null,
      director_name: values.director_name.trim() || null,
      phone: phone || null,
      email: values.email.trim() || null,
      address: values.address.trim() || null,
      business_registration_no: bizNo || null,
      code: values.code,
      referred_by_partner_id: values.referred_by_partner_id || null,
      memo: values.memo.trim() || null,
    })
    setSubmitting(false)
    if (err) setFormError(err)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="학원명 (필수)" error={errors.name}>
          <Input value={values.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="지역" hint="예: 대전 서구, 수원 영통">
          <Input value={values.region} onChange={(e) => set('region', e.target.value)} />
        </Field>
        <Field label="원장님 성함">
          <Input value={values.director_name} onChange={(e) => set('director_name', e.target.value)} />
        </Field>
        <Field label="연락처" error={errors.phone}>
          <Input inputMode="tel" value={values.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="이메일" hint="커미션 고지·변경 통보를 서면(이메일)으로 보낼 주소" error={errors.email}>
          <Input type="email" value={values.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="사업자등록번호" error={errors.business_registration_no}>
          <Input inputMode="numeric" value={values.business_registration_no} onChange={(e) => set('business_registration_no', e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="주소">
            <Input value={values.address} onChange={(e) => set('address', e.target.value)} />
          </Field>
        </div>
        <Field
          label="링크 코드"
          hint={codeLocked ? '배포된 링크라 바꿀 수 없습니다 (관리자만 변경 가능)' : '신청 링크 주소에 쓰입니다. 학원명·지역으로 자동 추천됩니다.'}
          error={errors.code}
        >
          <Input
            value={values.code}
            disabled={codeLocked}
            onChange={(e) => {
              setCodeTouched(true)
              setValues((prev) => ({ ...prev, code: e.target.value.toLowerCase() }))
            }}
          />
        </Field>
        <Field label="이 학원을 소개한 학원 (학원 간 소개 수수료)" hint="1단계까지만 적용됩니다">
          <Select value={values.referred_by_partner_id} onChange={(e) => set('referred_by_partner_id', e.target.value)}>
            <option value="">없음</option>
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="메모">
            <Textarea value={values.memo} onChange={(e) => set('memo', e.target.value)} />
          </Field>
        </div>
      </div>

      {conflicts.length > 0 && (
        <Alert tone="amber">
          <strong>독점 지역 확인 필요</strong> — 같은 지역에 독점권 협약이 있습니다:{' '}
          {conflicts.map((c) => `${c.partnerName}(${c.region})`).join(', ')}. 신규 협약 전 대표님께 확인해 주세요. (학원에는 독점권
          사실이나 상대 학원명을 먼저 말하지 않습니다)
        </Alert>
      )}
      {formError && <Alert>{formError}</Alert>}
      <Button type="submit" disabled={submitting}>
        {submitting ? '저장 중…' : submitLabel}
      </Button>
    </form>
  )
}
