import { useEffect, useState } from 'react'
import { Alert, Button, Card, Field, Select } from '../../components/ui'
import { QrPanel } from '../../components/shared/QrPanel'
import { publicSiteUrl } from '../../domain/links'
import { PROGRAM_STATUS } from '../../lib/labels'
import { supabase } from '../../lib/supabase'
import type { Program } from './api'

export function registerLink(base: string, slug: string, partnerCode?: string): string {
  return `${base}/register/${encodeURIComponent(slug)}${partnerCode ? `?ref=${encodeURIComponent(partnerCode)}` : ''}`
}

// 공개: 신청서 링크·QR + 학원별 링크(?ref=학원코드) 일괄 생성
export function StepPublish({ program, onSaved }: { program: Program; onSaved: (message: string) => Promise<void> }) {
  const [partners, setPartners] = useState<Array<{ id: string; name: string; code: string }>>([])
  const [copied, setCopied] = useState('')
  const base = publicSiteUrl()

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
                const { error } = await supabase.from('programs').update({ status }).eq('id', program.id)
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
      <p className="text-xs text-slate-400">등록 신청서 화면은 다음 단계(M7)에서 열립니다.</p>
    </div>
  )
}
