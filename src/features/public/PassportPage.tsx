import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import { Alert, Button, Spinner } from '../../components/ui'
import { PassportPicker } from './PassportPicker'
import { getPassportInfo, uploadPassport, type PassportInfo } from './passportUpload'
import { PublicLayout, Section } from './PublicLayout'

// 여권 사진 제출·재제출 (/passport/:token) — 고유식별정보 별도 동의 후 업로드
export function PassportPage() {
  const { token = '' } = useParams()
  const [info, setInfo] = useState<PassportInfo | null>(null)
  const [loadError, setLoadError] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [consent, setConsent] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    getPassportInfo(token)
      .then(setInfo)
      .catch((e: Error) => setLoadError(e.message))
  }, [token])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setAttempted(true)
    setError('')
    if (!consent || !file) return
    setBusy(true)
    try {
      await uploadPassport(token, file, consent)
      setDone(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (loadError) {
    return (
      <PublicLayout>
        <Alert>{loadError}</Alert>
      </PublicLayout>
    )
  }
  if (!info) {
    return (
      <PublicLayout>
        <Spinner />
      </PublicLayout>
    )
  }
  if (done) {
    return (
      <PublicLayout>
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700" aria-hidden>
            ✓
          </div>
          <h1 className="text-xl font-bold text-slate-900">여권 사진이 제출되었습니다</h1>
          <p className="mt-3 text-sm text-slate-600">암호화하여 보관하며, 지정된 담당자만 열람합니다. 다시 올리시면 이전 사진은 바로 삭제됩니다.</p>
        </div>
      </PublicLayout>
    )
  }
  if (!info.allowed) {
    return (
      <PublicLayout>
        <Alert tone="amber">이 신청은 지금 여권 사진을 받지 않습니다. 카카오톡으로 문의해 주세요.</Alert>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout>
      <h1 className="mb-1 text-xl font-bold text-slate-900">여권 사진 제출</h1>
      <p className="mb-5 text-sm text-slate-600">
        {info.program_name} · {info.student_name} 학생
        {info.passport_status === 'submitted' && ' (이미 제출됨 — 다시 올리면 새 사진으로 바뀝니다)'}
      </p>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {info.consent && (
          <Section title={info.consent.title}>
            <div className="max-h-60 overflow-y-auto rounded-lg bg-slate-50 p-3 text-xs leading-relaxed whitespace-pre-wrap text-slate-600 ring-1 ring-slate-200">
              {info.consent.body}
            </div>
            <label className="flex items-start gap-2 text-sm text-slate-800">
              <input type="checkbox" className="mt-0.5 size-5 shrink-0" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              [필수] 위 내용을 확인하였으며 고유식별정보(여권) 수집·이용에 동의합니다.
            </label>
            {attempted && !consent && <p className="text-xs text-red-600">동의해 주셔야 여권 사진을 올릴 수 있습니다.</p>}
          </Section>
        )}
        <Section title="여권 사진면">
          <PassportPicker file={file} onChange={setFile} error={attempted && !file ? '여권 사진을 선택해 주세요.' : undefined} />
        </Section>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" className="w-full py-3 text-base" disabled={busy}>
          {busy ? '안전하게 올리는 중…' : '여권 사진 제출하기'}
        </Button>
      </form>
    </PublicLayout>
  )
}
