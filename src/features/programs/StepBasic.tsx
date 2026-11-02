import { useEffect, useState, type FormEvent } from 'react'
import { Alert, Button, Field, Input, Select, Textarea } from '../../components/ui'
import { formatDateKo } from '../../domain/dates'
import { destroyDate } from '../../domain/paymentRules'
import { programSlug } from '../../domain/programSlug'
import { PROGRAM_STATUS, PROGRAM_TYPE } from '../../lib/labels'
import type { TablesUpdate } from '../../lib/supabase'
import type { Program } from './api'

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/

// 새 캠프 작성 중 내용 보관(새로고침·실수로 닫아도 유지). 이 브라우저에만 저장, 저장 완료 시 삭제.
const DRAFT_KEY = 'intoedu:program-draft:new'
type Draft = { v: Record<string, unknown>; slugTouched: boolean; savedAt: string }
function readDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    return null
  }
}
export function clearProgramDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    // 저장소를 쓸 수 없는 브라우저(사생활 보호 모드 등)는 무시
  }
}
const digits = (s: string) => s.replace(/[^0-9]/g, '')

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
  | 'early_bird_discount'
  | 'early_bird_until'
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
  const initial = {
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
    early_bird_discount: program?.early_bird_discount?.toString() ?? '',
    early_bird_until: program?.early_bird_until ?? '',
    status: program?.status ?? 'before',
    description: program?.description ?? '',
    slug: program?.slug ?? '',
    destroy_after_days: program?.destroy_after_days?.toString() ?? '5',
  }
  // 새로 만들기: 작성 중이던 내용이 있으면 이어서
  const [draft] = useState(() => (program ? null : readDraft()))
  const [v, setV] = useState<typeof initial>(() => (draft ? { ...initial, ...(draft.v as Partial<typeof initial>) } : initial))
  const [slugTouched, setSlugTouched] = useState(Boolean(program) || Boolean(draft?.slugTouched))
  const [draftNotice, setDraftNotice] = useState(Boolean(draft))

  useEffect(() => {
    if (program) return
    const empty = JSON.stringify(v) === JSON.stringify(initial)
    try {
      if (empty) localStorage.removeItem(DRAFT_KEY)
      else localStorage.setItem(DRAFT_KEY, JSON.stringify({ v, slugTouched, savedAt: new Date().toISOString() }))
    } catch {
      // 저장소를 쓸 수 없으면 보관하지 않음
    }
    // initial은 렌더마다 새로 만들어지지만 값은 같으므로 의존성에서 뺀다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, v, slugTouched])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const slugLocked = Boolean(program?.slug_locked) && !canEditLockedSlug

  function set<K extends keyof typeof v>(key: K, value: (typeof v)[K]) {
    setV((prev) => {
      const next = { ...prev, [key]: value }
      if (!slugTouched && (key === 'name' || key === 'season')) next.slug = programSlug(`${next.name} ${next.season}`, 60)
      return next
    })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const price = Number(digits(v.total_price))
    const ebAmount = digits(v.early_bird_discount) ? Number(digits(v.early_bird_discount)) : null
    if (!v.name.trim()) return setError('프로그램 이름을 입력해 주세요.')
    if (!v.start_date || !v.end_date) return setError('출국일(시작일)과 귀국일(종료일)을 입력해 주세요.')
    if (v.end_date < v.start_date) return setError('귀국일이 출국일보다 빠릅니다.')
    if (v.recruit_start_date && v.recruit_start_date > v.start_date) return setError('모집 시작일이 출국일보다 늦습니다.')
    if ((ebAmount === null) !== !v.early_bird_until) return setError('얼리버드는 할인 금액과 적용 마감일을 함께 입력해 주세요(쓰지 않으면 둘 다 비워 두세요).')
    if (ebAmount !== null && price > 0 && ebAmount >= price) return setError('얼리버드 할인 금액은 총 참가비보다 작아야 합니다.')
    if (ebAmount !== null && v.start_date && v.early_bird_until > v.start_date) return setError('얼리버드 마감일이 출국일보다 늦습니다.')
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
      early_bird_discount: ebAmount,
      early_bird_until: ebAmount === null ? null : v.early_bird_until,
      status: v.status,
      description: v.description.trim() || null,
      slug: v.slug,
      destroy_after_days: Number(v.destroy_after_days) || 0,
    })
    setSaving(false)
    if (err) setError(err)
    else if (!program) clearProgramDraft()
  }

  const days = Number(v.destroy_after_days) || 0

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {draftNotice && (
        <Alert tone="blue">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>작성 중이던 내용을 불러왔습니다{draft?.savedAt ? ` (${new Date(draft.savedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} 저장)` : ''}.</span>
            <Button
              variant="ghost"
              onClick={() => {
                clearProgramDraft()
                setV(initial)
                setSlugTouched(false)
                setDraftNotice(false)
              }}
            >
              지우고 새로 쓰기
            </Button>
          </div>
        </Alert>
      )}
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
        <Field label="총 참가비(원)" hint={digits(v.total_price) ? `${Number(digits(v.total_price)).toLocaleString('ko-KR')}원 · 학비·서비스비를 나누지 않고 하나의 금액` : '학비·서비스비를 나누지 않고 하나의 금액'}>
          <Input inputMode="numeric" value={v.total_price} onChange={(e) => set('total_price', e.target.value)} />
        </Field>
        <Field
          label="얼리버드 할인(원)"
          hint={
            digits(v.early_bird_discount) && digits(v.total_price)
              ? `할인 후 ${(Number(digits(v.total_price)) - Number(digits(v.early_bird_discount))).toLocaleString('ko-KR')}원 · 없으면 비워 두세요`
              : '없으면 비워 두세요'
          }
        >
          <Input inputMode="numeric" placeholder="예: 300000" value={v.early_bird_discount} onChange={(e) => set('early_bird_discount', e.target.value)} />
        </Field>
        <Field label="얼리버드 적용 마감일" hint={v.early_bird_until ? `${formatDateKo(v.early_bird_until)}까지 신청하면 적용(당일 포함)` : '이 날짜까지 신청한 학생에게 적용'}>
          <Input type="date" value={v.early_bird_until} onChange={(e) => set('early_bird_until', e.target.value)} />
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
