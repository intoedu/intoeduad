import { Link, useLocation } from 'react-router'
import { formatKst } from '../../lib/datetime'
import type { ApplyDoneState } from './ApplyPage'
import { PublicLayout } from './PublicLayout'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function formatSchedule(iso: string): string {
  const day = WEEKDAYS[Number(formatKst(iso, 'i')) % 7]
  return `${formatKst(iso, 'yyyy년 M월 d일')}(${day}) ${formatKst(iso, 'HH:mm')}`
}

export function ApplyDonePage() {
  const state = useLocation().state as ApplyDoneState | null

  return (
    <PublicLayout>
      <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700" aria-hidden>
          ✓
        </div>
        <h1 className="text-xl font-bold text-slate-900">상담 신청이 접수되었습니다</h1>
        {state ? (
          <dl className="mt-5 space-y-2 rounded-xl bg-slate-50 p-4 text-left text-sm">
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-slate-500">자녀 이름</dt>
              <dd className="font-medium text-slate-900">{state.studentName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-slate-500">상담 희망 일시</dt>
              <dd className="text-right font-medium text-slate-900">{state.scheduledAt ? formatSchedule(state.scheduledAt) : '담당자가 연락드려 정합니다'}</dd>
            </div>
          </dl>
        ) : null}
        <p className="mt-5 text-sm leading-relaxed text-slate-600">
          담당자가 신청 내용을 확인한 뒤 연락드립니다.
          <br />
          상담 방식(전화 또는 화상)은 문의 내용에 맞춰 담당자가 안내드립니다.
        </p>
        {state?.kakaoUrl && (
          <a
            href={state.kakaoUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-6 flex w-full items-center justify-center rounded-xl bg-[#FEE500] px-4 py-3 text-base font-semibold text-[#191919]"
          >
            인투유학 카카오톡 문의 바로가기
          </a>
        )}
        {!state && (
          <Link to="/apply" className="mt-6 inline-block text-sm text-brand-600 hover:underline">
            신청서로 돌아가기
          </Link>
        )}
      </div>
    </PublicLayout>
  )
}
