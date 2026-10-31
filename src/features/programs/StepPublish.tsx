import { useEffect, useState } from 'react'
import { Alert, Button, Card, Field, Select, Textarea } from '../../components/ui'
import { QrPanel } from '../../components/shared/QrPanel'
import { publicSiteUrl } from '../../domain/links'
import { PROGRAM_STATUS } from '../../lib/labels'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { isPrepIncomplete } from '../prep/api'
import type { Program, ThirdParties } from './api'

export function registerLink(base: string, slug: string, partnerCode?: string): string {
  return `${base}/register/${encodeURIComponent(slug)}${partnerCode ? `?ref=${encodeURIComponent(partnerCode)}` : ''}`
}

// 공개: 신청서 링크·QR + 학원별 링크(?ref=학원코드) 일괄 생성
export function StepPublish({
  program,
  onSaved,
  onOpenPrep,
}: {
  program: Program
  onSaved: (message: string) => Promise<void>
  onOpenPrep: () => void
}) {
  const { profile } = useAuth()
  const [partners, setPartners] = useState<Array<{ id: string; name: string; code: string }>>([])
  const [copied, setCopied] = useState('')
  // 모집 전 필수 준비물이 남아 "모집 중" 전환이 막혔을 때
  const [blocked, setBlocked] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const base = publicSiteUrl()
  // 동의 문구(제3자 제공·국외 이전)에 들어갈 대상이 비어 있으면 "확정 후 안내"로 표시된다
  const tp = (program.third_party_recipients ?? {}) as ThirdParties
  const missingRecipients = [
    !tp.ticketing?.trim() && '항공권 발권처',
    !tp.school?.name?.trim() && '현지 학교·기관',
    !tp.lodging?.name?.trim() && '숙소 기관',
  ].filter(Boolean) as string[]

  useEffect(() => {
    supabase
      .from('partners')
      .select('id, name, code')
      .eq('active', true)
      .is('deleted_at', null)
      .order('name')
      .then(({ data }) => setPartners(data ?? []))
  }, [])

  async function lockSlug(): Promise<boolean> {
    const { error } = await supabase.from('programs').update({ slug_locked: true }).eq('id', program.id)
    if (error) return false
    await onSaved('신청서 링크를 배포 상태로 잠갔습니다.')
    return true
  }

  async function copyAll() {
    if (!program.slug_locked && !(await lockSlug())) return
    const text = partners.map((p) => `${p.name}\t${registerLink(base, program.slug, p.code)}`).join('\n')
    await navigator.clipboard.writeText(text)
    setCopied(`학원 ${partners.length}곳의 링크를 복사했습니다. (학원명 + 탭 + 링크, 시트에 붙여 넣기 가능)`)
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <Field label="모집 상태">
            <Select
              value={program.status}
              onChange={async (e) => {
                // 제어 컴포넌트라 await 뒤에는 e.target.value가 이전 값으로 돌아가므로 먼저 읽어 둔다
                const status = e.target.value
                setBlocked(null)
                const { error } = await supabase.from('programs').update({ status }).eq('id', program.id)
                if (isPrepIncomplete(error)) {
                  setBlocked(Number(error?.message.split(':')[1]) || 0)
                  return
                }
                await onSaved(error ? '모집 상태를 바꾸지 못했습니다.' : `모집 상태를 "${PROGRAM_STATUS[status]?.label}"(으)로 바꿨습니다.`)
              }}
            >
              {Object.entries(PROGRAM_STATUS).map(([value, s]) => (
                <option key={value} value={value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-sm text-slate-500">"모집 중"일 때만 학부모가 신청서를 제출할 수 있습니다.</p>
        </div>
        {missingRecipients.length > 0 && (
          <div className="mt-4">
            <Alert tone="amber">
              [4. 동의·환불 규정]에 {missingRecipients.join('·')}이(가) 비어 있어, 신청서의 제3자 제공 동의 문구에 "확정 후 안내"로 표시됩니다. 가능하면 모집 전에
              입력해 주세요.
            </Alert>
          </div>
        )}
        {blocked !== null && (
          <div className="mt-4 space-y-3">
            <Alert tone="amber">
              모집 전에 끝내야 할 준비물(파트너용 영상·브로셔·포스터·드라이브 공유 등) {blocked > 0 ? `${blocked}개가` : '이'} 남아 있어 "모집 중"으로 바꾸지
              않았습니다.{' '}
              <button type="button" className="underline" onClick={onOpenPrep}>
                준비사항 보기
              </button>
            </Alert>
            {profile?.role === 'admin' ? (
              <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                <Field label="그래도 모집을 시작하는 사유(관리자)" hint="사유는 캠프 기록에 남습니다.">
                  <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                </Field>
                <Button
                  disabled={!reason.trim()}
                  onClick={async () => {
                    const { error } = await supabase
                      .from('programs')
                      .update({ status: 'open', prep_override_reason: reason.trim() })
                      .eq('id', program.id)
                    if (error) return
                    setBlocked(null)
                    await onSaved('사유를 기록하고 모집을 시작했습니다.')
                  }}
                >
                  사유 기록 후 모집 시작
                </Button>
              </div>
            ) : (
              <p className="text-sm text-slate-600">준비물을 마치거나, 관리자에게 사유를 적고 모집을 시작해 달라고 요청해 주세요.</p>
            )}
          </div>
        )}
      </Card>

      <QrPanel
        title="등록 신청서 링크"
        url={registerLink(base, program.slug)}
        fileBaseName={`인투유학_등록신청_${program.name}${program.season ? `_${program.season}` : ''}`}
        locked={program.slug_locked}
        onLock={lockSlug}
      />

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-slate-900">학원별 링크</p>
          {partners.length > 0 && (
            <Button variant="secondary" onClick={() => void copyAll()}>
              전체 복사
            </Button>
          )}
        </div>
        <p className="mb-3 text-sm text-slate-500">학원별 링크로 신청하면 소개 학원이 자동으로 기록됩니다.</p>
        {copied && (
          <div className="mb-3">
            <Alert tone="green">{copied}</Alert>
          </div>
        )}
        <ul className="divide-y divide-slate-100">
          {partners.map((p) => (
            <li key={p.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-slate-800">{p.name}</span>
              <span className="font-mono text-xs break-all text-slate-500">{registerLink(base, program.slug, p.code)}</span>
            </li>
          ))}
        </ul>
        {partners.length === 0 && <p className="text-sm text-slate-500">활성 MOU 학원이 없습니다.</p>}
      </Card>
    </div>
  )
}
