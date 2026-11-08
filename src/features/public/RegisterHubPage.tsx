import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Alert, Badge, Spinner } from '../../components/ui'
import { useLang } from '../../i18n/context'
import { formatDateLong, formatMoney } from '../../i18n/text'
import { PublicLayout } from './PublicLayout'
import { listOpenPrograms, type OpenProgram } from './publicApi'

// 통합 캠프 신청 링크(/register): 모집 중인 캠프를 고르면 그 캠프 신청서로 이동한다.
// 학원 링크 값(?ref=, ?c=)과 상담 기록 링크(?t=)는 그대로 넘긴다.
export function RegisterHubPage() {
  const [params] = useSearchParams()
  const [programs, setPrograms] = useState<OpenProgram[] | null>(null)
  const [error, setError] = useState(false)
  const { lang, tr } = useLang()
  const won = (n: number) => formatMoney(n, lang)
  const day = (d: string) => formatDateLong(d, lang)

  useEffect(() => {
    listOpenPrograms()
      .then(setPrograms)
      .catch(() => setError(true))
  }, [])

  const query = params.toString()

  return (
    <PublicLayout>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">{tr('인투유학 캠프 신청', 'INTOEDU Camp Registration')}</h1>
        <p className="mt-1 text-sm text-slate-600">{tr('신청하실 캠프를 골라 주세요.', 'Please choose a camp.')}</p>
      </div>
      {error && <Alert>{tr('캠프 목록을 불러오지 못했습니다. 잠시 후 다시 접속해 주세요.', 'We could not load the camp list. Please try again in a moment.')}</Alert>}
      {!error && programs === null && <Spinner />}
      {programs && programs.length === 0 && (
        <div className="rounded-2xl bg-white p-6 text-center text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">
          {tr('지금 모집 중인 캠프가 없습니다. 새 캠프가 열리면 안내드리겠습니다.', 'There are no camps open right now. We will let you know when a new camp opens.')}
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
                    <Badge tone={closed ? 'gray' : 'amber'}>{closed ? tr('마감', 'Closed') : tr('대기 접수', 'Waitlist')}</Badge>
                  ) : (
                    <Badge tone="green">{tr('모집 중', 'Open')}</Badge>
                  )}
                  {p.early_bird && <Badge tone="blue">
                      {tr('얼리버드', 'Early bird')} −{won(p.early_bird.amount)}
                    </Badge>}
                </div>
                <dl className="mt-2 space-y-0.5 text-sm text-slate-600">
                  {p.country && <div>{p.country}</div>}
                  {p.start_date && p.end_date && (
                    <div>
                      {day(p.start_date)} ~ {day(p.end_date)}
                    </div>
                  )}
                  {!!p.total_price && <div className="font-medium text-slate-800">
                      {tr('참가비', 'Program fee')} {won(p.total_price)}
                    </div>}
                  {p.early_bird && <div className="text-xs text-brand-700">
                      {tr(`${day(p.early_bird.until)}까지 신청하면 얼리버드 할인`, `Early-bird discount if you register by ${day(p.early_bird.until)}`)}
                    </div>}
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
                    <span className="mt-3 inline-block text-sm font-semibold text-brand-600">{tr('이 캠프 신청하기 →', 'Register for this camp →')}</span>
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
