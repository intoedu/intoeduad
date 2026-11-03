import { useEffect, useState } from 'react'
import { Alert, Button, Card, Field, Input, PageHeader, Spinner } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { SettingsTabs } from './SettingsTabs'

type Bank = { bank: string; number: string; holder: string }

// 기본 설정: 카카오톡 채널 채팅 URL, 입금 계좌 (학부모 화면·납부 안내에 그대로 노출)
export function GeneralSettingsPage() {
  const [kakao, setKakao] = useState<string | null>(null)
  const [site, setSite] = useState('')
  const [bank, setBank] = useState<Bank>({ bank: '', number: '', holder: '' })
  const [fees, setFees] = useState({ '1': '30000', '2': '50000', '3': '60000' })
  const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase
      .from('settings')
      .select('key, value')
      .in('key', ['kakao_channel_url', 'bank_account', 'public_site_url', 'agency_fees'])
      .then(({ data }) => {
        const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))
        setKakao(typeof map.kakao_channel_url === 'string' ? map.kakao_channel_url : '')
        setSite(typeof map.public_site_url === 'string' ? map.public_site_url : '')
        const b = (map.bank_account ?? {}) as Partial<Bank>
        setBank({ bank: b.bank ?? '', number: b.number ?? '', holder: b.holder ?? '' })
        const f = (map.agency_fees ?? {}) as Record<string, number>
        setFees({ '1': String(f['1'] ?? 30000), '2': String(f['2'] ?? 50000), '3': String(f['3'] ?? 60000) })
      })
  }, [])

  async function save() {
    setMessage(null)
    const url = (kakao ?? '').trim()
    if (url && !/^https:\/\/pf\.kakao\.com\//.test(url)) {
      return setMessage({ tone: 'red', text: '카카오톡 채널 주소는 https://pf.kakao.com/ 으로 시작해야 합니다.' })
    }
    const siteUrl = site.trim().replace(/\/+$/, '')
    if (siteUrl && !/^https:\/\/[^\s/]+$/.test(siteUrl)) return setMessage({ tone: 'red', text: '사이트 주소는 https://로 시작하는 도메인만 입력해 주세요(경로 없이).' })
    const filled = [bank.bank, bank.number, bank.holder].filter((x) => x.trim()).length
    if (filled > 0 && filled < 3) return setMessage({ tone: 'red', text: '입금 계좌는 은행·계좌번호·예금주를 모두 입력해 주세요.' })
    if (bank.number.trim() && !/^[0-9-]{6,30}$/.test(bank.number.trim())) {
      return setMessage({ tone: 'red', text: '계좌번호는 숫자와 하이픈(-)만 입력해 주세요.' })
    }
    const feeNums = (['1', '2', '3'] as const).map((k) => Number(fees[k].replace(/[^0-9]/g, '')))
    if (feeNums.some((n) => !n)) return setMessage({ tone: 'red', text: '대행료 3칸을 모두 입력해 주세요.' })
    setSaving(true)
    const { error } = await supabase.from('settings').upsert([
      { key: 'agency_fees', value: { '1': feeNums[0], '2': feeNums[1], '3': feeNums[2] } },
      { key: 'kakao_channel_url', value: url },
      { key: 'public_site_url', value: siteUrl },
      { key: 'bank_account', value: { bank: bank.bank.trim(), number: bank.number.trim(), holder: bank.holder.trim() } },
    ])
    setSaving(false)
    setMessage(error ? { tone: 'red', text: '저장하지 못했습니다.' } : { tone: 'green', text: '기본 설정을 저장했습니다.' })
  }

  if (kakao === null) return <Spinner />
  return (
    <>
      <SettingsTabs />
      <PageHeader title="기본 설정" description="학부모 화면(신청 완료·신청 내용 확인)과 납부 안내 메시지에 그대로 표시됩니다." />
      <div className="max-w-2xl space-y-4">
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <Card>
          <p className="mb-3 font-semibold text-slate-900">카카오톡 채널</p>
          <Field label="채널 채팅 주소" hint="예: https://pf.kakao.com/_AkclX/chat — 신청 완료 화면의 [카카오톡 문의] 버튼에 연결됩니다.">
            <Input value={kakao} onChange={(e) => setKakao(e.target.value)} placeholder="https://pf.kakao.com/..." />
          </Field>
        </Card>
        <Card>
          <p className="mb-3 font-semibold text-slate-900">학부모용 사이트 주소</p>
          <Field label="사이트 주소" hint="알림톡의 [신청 내용 확인] 버튼 링크에 쓰입니다. 예: https://intoedu.example">
            <Input value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://" />
          </Field>
        </Card>
        <Card>
          <p className="mb-1 font-semibold text-slate-900">입금 계좌</p>
          <p className="mb-3 text-xs text-slate-500">비워 두면 학부모에게 "입금 계좌는 담당자가 따로 안내드립니다"로 표시됩니다.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="은행">
              <Input value={bank.bank} onChange={(e) => setBank({ ...bank, bank: e.target.value })} />
            </Field>
            <Field label="계좌번호">
              <Input inputMode="numeric" value={bank.number} onChange={(e) => setBank({ ...bank, number: e.target.value })} />
            </Field>
            <Field label="예금주">
              <Input value={bank.holder} onChange={(e) => setBank({ ...bank, holder: e.target.value })} />
            </Field>
          </div>
        </Card>
        <Card>
          <p className="mb-1 font-semibold text-slate-900">항공권·ESTA·여행자보험 대행료</p>
          <p className="mb-3 text-sm text-slate-500">학부모가 고른 대행 항목 개수에 따른 금액입니다(항공권 요금·보험료·ESTA 수수료는 별도). 바꾸면 이후 신청부터 적용됩니다.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            {(['1', '2', '3'] as const).map((k) => (
              <Field key={k} label={k === '3' ? '3개 모두 선택(원)' : `${k}개 선택(원)`}>
                <Input inputMode="numeric" value={fees[k]} onChange={(e) => setFees((f) => ({ ...f, [k]: e.target.value }))} />
              </Field>
            ))}
          </div>
        </Card>
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? '저장 중…' : '기본 설정 저장'}
        </Button>
      </div>
    </>
  )
}
