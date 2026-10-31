import { useState, type FormEvent } from 'react'
import { Alert, Button, Field, Input, Select, Textarea } from '../../components/ui'
import { formatDateKo } from '../../domain/dates'
import { destroyDate } from '../../domain/paymentRules'
import { slugify } from '../../domain/romanize'
import { PROGRAM_STATUS, PROGRAM_TYPE } from '../../lib/labels'
import type { TablesUpdate } from '../../lib/supabase'
import type { Program } from './api'

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/

export type BasicValues = Pick<
  TablesUpdate<'programs'>,
  | 'type'
  | 'name'
  | 'season'
  | 'country'
  | 'start_date'
  | 'end_date'
  | 'recruit_start_date'
  | 'capacity'
  | 'waitlist_enabled'
  | 'total_price'
  | 'status'
  | 'description'
  | 'slug'
  | 'destroy_after_days'
>

export function StepBasic({
  program,
  canEditLockedSlug,
  submitLabel,
  onSubmit,
}: {
  program?: Program
  canEditLockedSlug: boolean
  submitLabel: string
  onSubmit: (values: BasicValues) => Promise<string | null>
}) {
  const [v, setV] = useState({
    type: program?.type ?? 'camp',
    name: program?.name ?? '',
    season: program?.season ?? '',
    country: program?.country ?? '',
    start_date: program?.start_date ?? '',
    end_date: program?.end_date ?? '',
    recruit_start_date: program?.recruit_start_date ?? '',
    capacity: program?.capacity?.toString() ?? '',
    waitlist_enabled: program?.waitlist_enabled ?? true,
    total_price: program?.total_price?.toString() ?? '',
    status: program?.status ?? 'before',
    description: program?.description ?? '',
    slug: program?.slug ?? '',
    destroy_after_days: program?.destroy_after_days?.toString() ?? '5',
  })
  const [slugTouched, setSlugTouched] = useState(Boolean(program))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const slugLocked = Boolean(program?.slug_locked) && !canEditLockedSlug

  function set<K extends keyof typeof v>(key: K, value: (typeof v)[K]) {
    setV((prev) => {
      const next = { ...prev, [key]: value }
      if (!slugTouched && (key === 'name' || key === 'season')) next.slug = slugify(`${next.name} ${next.season}`, 60)
      return next
    })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const price = Number(v.total_price.replace(/[^0-9]/g, ''))
    if (!v.name.trim()) return setError('프로그램 이름을 입력해 주세요.')
    if (!v.start_date || !v.end_date) return setError('출국일(시작일)과 귀국일(종료일)을 입력해 주세요.')
    if (v.end_date < v.start_date) return setError('귀국일이 출국일보다 빠릅니다.')
    if (v.recruit_start_date && v.recruit_start_date > v.start_date) return setError('모집 시작일이 출국일보다 늦습니다.')
    if (!SLUG_RE.test(v.slug)) return setError('신청서 링크 주소는 영문 소문자·숫자·하이픈 3~60자입니다.')
    setSaving(true)
    const err = await onSubmit({
      type: v.type,
      name: v.name.trim(),
      season: v.season.trim() || null,
      country: v.country.trim() || null,
      start_date: v.start_date,
      end_date: v.end_date,
      recruit_start_date: v.recruit_start_date || null,
      capacity: v.capacity ? Number(v.capacity) : null,
      waitlist_enabled: v.waitlist_enabled,
      total_price: price,
      status: v.status,
      description: v.description.trim() || null,
      slug: v.slug,
      destroy_after_days: Number(v.destroy_after_days) || 0,
    })
    setSaving(false)
    if (err) setError(err)
  }

  const days = Number(v.destroy_after_days) || 0

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="유형">
          <Select value={v.type} onChange={(e) => set('type', e.target.value)}>
            {Object.entries(PROGRAM_TYPE).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="프로그램 이름 (필수)" hint="예: 미국 스쿨링 캠프">
          <Input value={v.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="기수·시즌" hint="예: 2027 겨울 1차">
          <Input value={v.season} onChange={(e) => set('season', e.target.value)} />
        </Field>
        <Field label="국가">
          <Input value={v.country} onChange={(e) => set('country', e.target.value)} />
        </Field>
        <Field label="출국일(시작일)" hint={v.start_date ? formatDateKo(v.start_date) : undefined}>
          <Input type="date" value={v.start_date} onChange={(e) => set('start_date', e.target.value)} />
        </Field>
        <Field label="귀국일(종료일)" hint={v.end_date ? formatDateKo(v.end_date) : undefined}>
          <Input type="date" value={v.end_date} onChange={(e) => set('end_date', e.target.value)} />
        </Field>
        <Field label="모집 시작일" hint="캠프 준비물(포스터·영상 등) 마감 계산에 쓰입니다">
          <Input type="date" value={v.recruit_start_date} onChange={(e) => set('recruit_start_date', e.target.value)} />
        </Field>
        <Field label="정원">
          <Input type="number" min={1} value={v.capacity} onChange={(e) => set('capacity', e.target.value)} />
        </Field>
        <Field label="총 참가비(원)" hint="학비·서비스비를 나누지 않고 하나의 금액">
          <Input inputMode="numeric" value={v.total_price} onChange={(e) => set('total_price', e.target.value)} />
        </Field>
        <Field label="모집 상태">
          <Select value={v.status} onChange={(e) => set('status', e.target.value)}>
            {Object.entries(PROGRAM_STATUS).map(([value, s]) => (
              <option key={value} value={value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="신청서 링크 주소" hint={slugLocked ? '배포된 링크라 바꿀 수 없습니다(관리자만 변경)' : `/register/${v.slug || '...'}`}>
          <Input
            value={v.slug}
            disabled={slugLocked}
            onChange={(e) => {
              setSlugTouched(true)
              setV((prev) => ({ ...prev, slug: e.target.value.toLowerCase() }))
            }}
          />
        </Field>
        <Field
          label="개인정보 파기: 종료 후 N일"
          hint={v.end_date ? `파기 예정일 ${formatDateKo(destroyDate(v.end_date, days))} (관리자 승인 후 파기)` : '기본 5일'}
        >
          <Input type="number" min={0} max={365} value={v.destroy_after_days} onChange={(e) => set('destroy_after_days', e.target.value)} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" className="size-4" checked={v.waitlist_enabled} onChange={(e) => set('waitlist_enabled', e.target.checked)} />
        정원이 차면 대기자로 접수받기
      </label>
      <Field label="설명">
        <Textarea rows={4} value={v.description} onChange={(e) => set('description', e.target.value)} />
      </Field>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" disabled={saving}>
        {saving ? '저장 중…' : submitLabel}
      </Button>
    </form>
  )
}
