import { Link, useLocation } from 'react-router'
import { formatKst } from '../../lib/datetime'
import type { ApplyDoneState } from './ApplyPage'
import { PublicLayout } from './PublicLayout'
import { useLang } from '../../i18n/context'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function formatSchedule(iso: string, en: boolean): string {
  if (en) return `${formatKst(iso, 'EEE, MMM d, yyyy HH:mm')} (Korea time)`
  const day = WEEKDAYS[Number(formatKst(iso, 'i')) % 7]
  return `${formatKst(iso, 'yyyy년 M월 d일')}(${day}) ${formatKst(iso, 'HH:mm')}`
}

export function ApplyDonePage() {
  const state = useLocation().state as ApplyDoneState | null
  const { en, tr } = useLang()

  return (
    <PublicLayout>
      <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700" aria-hidden>
          ✓
        </div>
        <h1 className="text-xl font-bold text-slate-900">{tr('상담 신청이 접수되었습니다', 'Your consultation request has been received')}</h1>
        {state ? (
          <dl className="mt-5 space-y-2 rounded-xl bg-slate-50 p-4 text-left text-sm">
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-slate-500">{tr('자녀 이름', "Child's name")}</dt>
              <dd className="font-medium text-slate-900">{state.studentName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-slate-500">{tr('상담 희망 일시', 'Preferred time')}</dt>
              <dd className="text-right font-medium text-slate-900">{state.scheduledAt ? formatSchedule(state.scheduledAt, en) : tr('담당자가 연락드려 정합니다', 'Your advisor will contact you to arrange a time')}</dd>
            </div>
          </dl>
        ) : null}
        <p className="mt-5 text-sm leading-relaxed text-slate-600">
          {tr('담당자가 신청 내용을 확인한 뒤 연락드립니다.', 'An advisor will review your request and contact you.')}
          <br />
          {tr(
            '상담 방식(전화 또는 화상)은 문의 내용에 맞춰 담당자가 안내드립니다.',
            'Your advisor will let you know whether the consultation will be by phone or video call.',
          )}
        </p>
        {state?.kakaoUrl && (
          <a
            href={state.kakaoUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-6 flex w-full items-center justify-center rounded-xl bg-[#FEE500] px-4 py-3 text-base font-semibold text-[#191919]"
          >
            {tr('인투유학 카카오톡 문의 바로가기', 'Contact INTOEDU on KakaoTalk')}
          </a>
        )}
        {!state && (
          <Link to="/apply" className="mt-6 inline-block text-sm text-brand-600 hover:underline">
            {tr('신청서로 돌아가기', 'Back to the form')}
          </Link>
        )}
      </div>
    </PublicLayout>
  )
}
