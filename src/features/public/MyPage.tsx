import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { Alert, Badge, Spinner } from '../../components/ui'
import { formatDateLongKo } from '../../domain/dates'
import { PASSPORT_STATUS, REGISTRATION_STATUS } from '../../lib/labels'
import { PublicLayout } from './PublicLayout'
import { getMySummary, type RegistrationSummary } from './registerApi'
import { KakaoButton } from './RegisterPage'
import { BankAccountBox, DestructionNotice, ScheduleList } from './RegistrationParts'

// 고객용 신청 내용 확인 (읽기 전용, 여권 이미지·주소 없음)
export function MyPage() {
  const { token = '' } = useParams()
  const [summary, setSummary] = useState<RegistrationSummary | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getMySummary(token)
      .then(setSummary)
      .catch((e: Error) => setError(e.message))
  }, [token])

  if (error) {
    return (
      <PublicLayout>
        <Alert>{error}</Alert>
      </PublicLayout>
    )
  }
  if (!summary) {
    return (
      <PublicLayout>
        <Spinner />
      </PublicLayout>
    )
  }
  if (summary.destroyed) {
    return (
      <PublicLayout>
        <Alert tone="blue">안내드린 대로 개인정보가 파기되어 더 이상 표시할 신청 내용이 없습니다.</Alert>
      </PublicLayout>
    )
  }

  const st = REGISTRATION_STATUS[summary.status]
  const p = summary.program
  const showPayments = summary.status !== 'waitlisted' && summary.schedule.length > 0

  return (
    <PublicLayout>
      <div className="space-y-4">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-lg font-bold text-slate-900">
              {p.name}
              {p.season ? ` (${p.season})` : ''}
            </h1>
            {st && <Badge tone={st.tone}>{st.label}</Badge>}
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">학생</dt>
              <dd className="text-slate-900">{summary.student_name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-slate-500">일정</dt>
              <dd className="text-right text-slate-900">
                {formatDateLongKo(p.start_date)} ~ {formatDateLongKo(p.end_date)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">신청일</dt>
              <dd className="text-slate-900">{formatDateLongKo(summary.registered_on)}</dd>
            </div>
            {summary.passport_status !== 'not_required' && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">여권 사진</dt>
                <dd className="text-slate-900">{PASSPORT_STATUS[summary.passport_status] ?? summary.passport_status}</dd>
              </div>
            )}
          </dl>
          {summary.status === 'waitlisted' && (
            <p className="mt-4 text-sm text-slate-600">대기 접수 중입니다. 자리가 생기면 순서대로 연락드리겠습니다.</p>
          )}
        </div>

        {showPayments && (
          <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-base font-bold text-slate-900">납부 현황</h2>
            <ScheduleList lines={summary.schedule} />
            <BankAccountBox account={summary.bank_account} />
          </section>
        )}

        {summary.destroy_date && <DestructionNotice destroyDate={summary.destroy_date} endDate={p.end_date} days={p.end_plus_days} />}

        <p className="px-1 text-xs text-slate-500">신청 내용 변경·취소는 카카오톡으로 문의해 주세요.</p>
        {summary.kakao_channel_url && <KakaoButton url={summary.kakao_channel_url} />}
      </div>
    </PublicLayout>
  )
}
