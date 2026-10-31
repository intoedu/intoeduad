import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader, Spinner, Tabs } from '../../components/ui'
import { addDays, formatDateKo } from '../../domain/dates'
import { commissionNoticeDeadline } from '../../domain/paymentRules'
import { todayKst } from '../../lib/datetime'
import { PROGRAM_STATUS, PROGRAM_TYPE } from '../../lib/labels'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { getProgram, won, type Program } from './api'
import { StepBasic } from './StepBasic'
import { StepForm } from './StepForm'
import { StepMilestones } from './StepMilestones'
import { StepPayments } from './StepPayments'
import { StepPolicies } from './StepPolicies'
import { StepPublish } from './StepPublish'
import { StepPrep } from '../prep/StepPrep'
import { isPrepIncomplete } from '../prep/api'

function errorText(error: { code?: string; message?: string }): string {
  if (error.code === '23505') return '이미 쓰고 있는 신청서 링크 주소입니다. 다른 주소를 입력해 주세요.'
  if (isPrepIncomplete(error) && error.message?.endsWith(':new'))
    return '새 캠프는 "모집 전"으로 만든 뒤, 준비사항을 확인하고 [7. 공개]에서 모집을 시작해 주세요.'
  if (isPrepIncomplete(error)) return '모집 전에 끝내야 할 준비물이 남아 있어 "모집 중"으로 바꿀 수 없습니다. [6. 준비사항]을 확인하거나 [7. 공개] 단계에서 바꿔 주세요.'
  if (error.message && /[가-힣]/.test(error.message)) return error.message
  return '저장하지 못했습니다.'
}

function daysUntil(date: string): number {
  return Math.round((Date.parse(date) - Date.parse(todayKst())) / 86_400_000)
}

// ---------------------------------------------------------------------------
// 목록
// ---------------------------------------------------------------------------
type Prep = { required_total: number; required_done: number; overdue: number; due_soon: number; needs_recheck: number }
type ListItem = Program & { enrolled: number; waitlisted: number; prep?: Prep }

export function ProgramsListPage() {
  const [items, setItems] = useState<ListItem[] | null>(null)
  const [showClosed, setShowClosed] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('programs').select('*').is('deleted_at', null).order('start_date'),
      supabase.rpc('program_enrollment_counts'),
      supabase.rpc('program_prep_progress'),
    ]).then(([p, c, prep]) => {
      const counts = new Map((c.data ?? []).map((x) => [x.program_id, x]))
      const preps = new Map(
        (prep.data ?? []).map((x) => [
          x.program_id,
          {
            required_total: Number(x.required_total),
            required_done: Number(x.required_done),
            overdue: Number(x.overdue),
            due_soon: Number(x.due_soon),
            needs_recheck: Number(x.needs_recheck),
          },
        ]),
      )
      setItems(
        (p.data ?? []).map((x) => ({
          ...x,
          enrolled: Number(counts.get(x.id)?.enrolled ?? 0),
          waitlisted: Number(counts.get(x.id)?.waitlisted ?? 0),
          prep: preps.get(x.id),
        })),
      )
    })
  }, [])

  const today = todayKst()
  const visible = (items ?? []).filter((p) => showClosed || p.end_date >= today)

  return (
    <>
      <PageHeader
        title="캠프·프로그램"
        description="캠프를 만들면 그 캠프의 등록 신청서·납부 규칙·주요 일정이 함께 만들어집니다."
        actions={
          <Link to="/admin/programs/new" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            + 캠프 만들기
          </Link>
        }
      />
      <label className="mb-4 flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" className="size-4" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
        끝난 프로그램도 보기
      </label>
      {!items && <Spinner />}
      {items && visible.length === 0 && <EmptyState>프로그램이 없습니다. 첫 캠프를 만들어 보세요.</EmptyState>}
      <div className="space-y-3">
        {visible.map((p) => {
          const st = PROGRAM_STATUS[p.status]
          const dDay = daysUntil(p.start_date)
          const noticeDue = commissionNoticeDeadline(p.start_date)
          const noticeLeft = daysUntil(noticeDue)
          const noticeAlert = !p.commission_notice_sent_on && p.end_date >= today && noticeLeft <= 14
          return (
            <Link key={p.id} to={`/admin/programs/${p.id}`} className="block">
              <Card className="transition hover:ring-brand-600/40">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="blue">{PROGRAM_TYPE[p.type]}</Badge>
                      {st && <Badge tone={st.tone}>{st.label}</Badge>}
                      <p className="font-semibold text-slate-900">
                        {p.name}
                        {p.season && <span className="font-normal text-slate-500"> · {p.season}</span>}
                      </p>
                      {noticeAlert && (
                        <Badge tone="red">
                          커미션 고지 {noticeLeft >= 0 ? `D-${noticeLeft}` : `${-noticeLeft}일 지남`}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {formatDateKo(p.start_date)} ~ {formatDateKo(p.end_date)}
                      {dDay > 0 ? ` · 출국 D-${dDay}` : dDay === 0 ? ' · 오늘 출국' : p.end_date >= today ? ' · 진행 중' : ' · 종료'}
                      {' · '}
                      {won(p.total_price)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-3 text-sm">
                    <span className="text-slate-700">
                      등록 <strong>{p.enrolled}</strong>
                      {p.capacity ? ` / ${p.capacity}명` : '명'}
                      {p.waitlisted > 0 && ` · 대기 ${p.waitlisted}`}
                    </span>
                    {p.capacity && (
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                        <div className="h-full bg-brand-600" style={{ width: `${Math.min(100, (p.enrolled / p.capacity) * 100)}%` }} />
                      </div>
                    )}
                    {p.prep && p.prep.required_total > 0 && (
                      <span className="flex items-center gap-1">
                        <Badge tone={p.prep.required_done === p.prep.required_total ? 'green' : 'gray'}>
                          준비 {p.prep.required_done}/{p.prep.required_total}
                        </Badge>
                        {p.prep.overdue > 0 && <Badge tone="red">준비물 마감 지남 {p.prep.overdue}</Badge>}
                        {p.prep.needs_recheck > 0 && <Badge tone="amber">자료 재확인 {p.prep.needs_recheck}</Badge>}
                      </span>
                    )}
                    <span className="text-xs text-amber-800">커미션 {p.commission_amount === null ? '미정' : won(p.commission_amount)}</span>
                  </div>
                </div>
              </Card>
            </Link>
          )
        })}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// 새로 만들기 (1단계: 기본 정보 → 저장 후 나머지 단계로)
// ---------------------------------------------------------------------------
export function ProgramNewPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  return (
    <>
      <PageHeader title="캠프 만들기" description="1단계 기본 정보를 저장하면 납부 규칙 → 신청서 항목 → 동의·환불 규정 → 주요 일정 → 준비사항 → 공개 순서로 이어집니다. 포스터·브로셔·영상 등 준비물은 저장과 함께 자동으로 만들어집니다." />
      <Card>
        <StepBasic
          canEditLockedSlug={profile?.role === 'admin'}
          submitLabel="저장하고 다음 (납부 규칙)"
          onSubmit={async (values) => {
            const { data, error } = await supabase
              .from('programs')
              .insert({ ...values, type: values.type!, name: values.name!, start_date: values.start_date!, end_date: values.end_date!, slug: values.slug!, created_by: profile?.id })
              .select('id')
              .single()
            if (error) return errorText(error)
            navigate(`/admin/programs/${data.id}?step=payments`, { replace: true })
            return null
          }}
        />
      </Card>
    </>
  )
}

// ---------------------------------------------------------------------------
// 상세(단계별 수정) + 복제
// ---------------------------------------------------------------------------
type Step = 'basic' | 'payments' | 'form' | 'policies' | 'milestones' | 'prep' | 'publish'

const STEPS: Array<{ value: Step; label: string }> = [
  { value: 'basic', label: '1. 기본 정보' },
  { value: 'payments', label: '2. 납부 규칙' },
  { value: 'form', label: '3. 신청서 항목' },
  { value: 'policies', label: '4. 동의·환불 규정' },
  { value: 'milestones', label: '5. 주요 일정' },
  { value: 'prep', label: '6. 준비사항' },
  { value: 'publish', label: '7. 공개' },
]

export function ProgramDetailPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const step = (STEPS.some((s) => s.value === params.get('step')) ? params.get('step') : 'basic') as Step
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState<Awaited<ReturnType<typeof getProgram>> | null>(null)
  const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string } | null>(null)
  const [dup, setDup] = useState<{ start: string; season: string } | null>(null)

  const load = useCallback(async () => setData(await getProgram(id)), [id])
  useEffect(() => {
    void load()
  }, [load])

  if (!data) return <Spinner />
  const { program, rules, milestones } = data
  if (!program) {
    return (
      <Card>
        <p className="text-sm text-slate-600">프로그램을 찾을 수 없습니다.</p>
      </Card>
    )
  }

  const saved = async (text: string) => {
    setMessage({ tone: 'green', text })
    await load()
  }
  const stepIndex = STEPS.findIndex((s) => s.value === step)
  const next = STEPS[stepIndex + 1]

  return (
    <>
      <PageHeader
        title={`${program.name}${program.season ? ` · ${program.season}` : ''}`}
        description={`${PROGRAM_TYPE[program.type]} · ${formatDateKo(program.start_date)} ~ ${formatDateKo(program.end_date)}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setDup({ start: addDays(program.start_date, 28), season: '' })}>
              다음 기수로 복제
            </Button>
            <Link to="/admin/programs" className="self-center text-sm text-slate-500 hover:text-slate-800">
              목록으로
            </Link>
          </>
        }
      />

      {dup && (
        <Card className="mb-4">
          <p className="mb-3 font-semibold text-slate-900">다음 기수로 복제</p>
          <p className="mb-3 text-sm text-slate-500">
            출국일만 정하면 귀국일·고정 납부 기한·주요 일정이 같은 간격으로 함께 옮겨집니다. 커미션 고지 기록과 링크 잠금은 새로 시작합니다.
          </p>
          <div className="grid gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
            <Field label="새 출국일">
              <Input type="date" value={dup.start} onChange={(e) => setDup({ ...dup, start: e.target.value })} />
            </Field>
            <Field label="새 기수·시즌" hint={`비우면 "${program.season ?? ''}" 그대로`}>
              <Input value={dup.season} onChange={(e) => setDup({ ...dup, season: e.target.value })} />
            </Field>
            <div className="flex gap-2">
              <Button
                disabled={!dup.start}
                onClick={async () => {
                  const { data: newId, error } = await supabase.rpc('duplicate_program', {
                    p_program_id: program.id,
                    p_new_start: dup.start,
                    p_new_season: dup.season || undefined,
                  })
                  if (error || !newId) {
                    setMessage({ tone: 'red', text: '복제하지 못했습니다.' })
                    return
                  }
                  setDup(null)
                  navigate(`/admin/programs/${newId}?step=basic`)
                  setMessage({ tone: 'green', text: '복제했습니다. 내용을 확인해 주세요.' })
                }}
              >
                복제하기
              </Button>
              <Button variant="ghost" onClick={() => setDup(null)}>
                취소
              </Button>
            </div>
          </div>
        </Card>
      )}

      {program.copied_from && step === 'basic' && (
        <div className="mb-4">
          <Alert tone="blue">다른 기수에서 복제한 프로그램입니다. 날짜와 금액을 확인해 주세요.</Alert>
        </div>
      )}
      {message && (
        <div className="mb-4">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}

      <Tabs
        tabs={STEPS}
        value={step}
        onChange={(s) => {
          setMessage(null)
          setParams({ step: s }, { replace: true })
        }}
      />

      {step === 'basic' && (
        <Card>
          <StepBasic
            key={program.updated_at}
            program={program}
            canEditLockedSlug={profile?.role === 'admin'}
            submitLabel="기본 정보 저장"
            onSubmit={async (values) => {
              const { error } = await supabase.from('programs').update(values).eq('id', program.id)
              if (error) return errorText(error)
              await saved('기본 정보를 저장했습니다.')
              return null
            }}
          />
        </Card>
      )}
      {step === 'payments' && <StepPayments key={program.updated_at} program={program} rules={rules} onSaved={saved} />}
      {step === 'form' && <StepForm key={program.updated_at} program={program} onSaved={saved} />}
      {step === 'policies' && <StepPolicies key={program.updated_at} program={program} onSaved={saved} />}
      {step === 'milestones' && <StepMilestones program={program} milestones={milestones} onSaved={saved} />}
      {step === 'prep' && <StepPrep program={program} rules={rules} />}
      {step === 'publish' && <StepPublish program={program} onSaved={saved} onOpenPrep={() => setParams({ step: 'prep' }, { replace: true })} />}

      {next && (
        <div className="mt-6 flex justify-end">
          <Button variant="ghost" onClick={() => setParams({ step: next.value }, { replace: true })}>
            다음 단계: {next.label} →
          </Button>
        </div>
      )}
    </>
  )
}
