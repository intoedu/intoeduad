import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Alert, Badge, Spinner } from '../../components/ui'
import { formatDateLongKo } from '../../domain/dates'
import { formatWon } from '../../domain/registration'
import { PublicLayout } from './PublicLayout'
import { listOpenPrograms, type OpenProgram } from './publicApi'

// 통합 캠프 신청 링크(/register): 모집 중인 캠프를 고르면 그 캠프 신청서로 이동한다.
// 학원 링크 값(?ref=, ?c=)과 상담 기록 링크(?t=)는 그대로 넘긴다.
export function RegisterHubPage() {
  const [params] = useSearchParams()
  const [programs, setPrograms] = useState<OpenProgram[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    listOpenPrograms()
      .then(setPrograms)
      .catch(() => setError(true))
  }, [])

  const query = params.toString()

  return (
    <PublicLayout>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">인투유학 캠프 신청</h1>
        <p className="mt-1 text-sm text-slate-600">신청하실 캠프를 골라 주세요.</p>
      </div>
      {error && <Alert>캠프 목록을 불러오지 못했습니다. 잠시 후 다시 접속해 주세요.</Alert>}
      {!error && programs === null && <Spinner />}
      {programs && programs.length === 0 && (
        <div className="rounded-2xl bg-white p-6 text-center text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">
          지금 모집 중인 캠프가 없습니다. 새 캠프가 열리면 안내드리겠습니다.
        </div>
      )}
      {programs && programs.length > 0 && (
        <ul className="space-y-3">
          {programs.map((p) => {
            const closed = p.is_full && !p.waitlist_enabled
            const body = (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-semibold text-slate-900">
                    {p.name}
                    {p.season ? ` (${p.season})` : ''}
                  </p>
                  {p.is_full ? (
                    <Badge tone={closed ? 'gray' : 'amber'}>{closed ? '마감' : '대기 접수'}</Badge>
                  ) : (
                    <Badge tone="green">모집 중</Badge>
                  )}
                  {p.early_bird && <Badge tone="blue">얼리버드 −{formatWon(p.early_bird.amount)}</Badge>}
                </div>
                <dl className="mt-2 space-y-0.5 text-sm text-slate-600">
                  {p.country && <div>{p.country}</div>}
                  {p.start_date && p.end_date && (
                    <div>
                      {formatDateLongKo(p.start_date)} ~ {formatDateLongKo(p.end_date)}
                    </div>
                  )}
                  {!!p.total_price && <div className="font-medium text-slate-800">참가비 {formatWon(p.total_price)}</div>}
                  {p.early_bird && <div className="text-xs text-brand-700">{formatDateLongKo(p.early_bird.until)}까지 신청하면 얼리버드 할인</div>}
                </dl>
              </>
            )
            return (
              <li key={p.slug}>
                {closed ? (
                  <div className="rounded-2xl bg-white p-4 opacity-60 ring-1 ring-slate-200">{body}</div>
                ) : (
                  <Link
                    to={`/register/${p.slug}${query ? `?${query}` : ''}`}
                    className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:ring-brand-600"
                  >
                    {body}
                    <span className="mt-3 inline-block text-sm font-semibold text-brand-600">이 캠프 신청하기 →</span>
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </PublicLayout>
  )
}
