import { Link, useLocation } from 'react-router'
import { formatDateLongKo } from '../../domain/dates'
import { PublicLayout } from './PublicLayout'
import type { RegisterDoneState } from './RegisterPage'
import { KakaoButton } from './RegisterPage'
import { BankAccountBox, DestructionNotice, ScheduleList } from './RegistrationParts'

export function RegisterDonePage() {
  const state = useLocation().state as RegisterDoneState | null
  const s = state?.summary

  return (
    <PublicLayout>
      <div className="space-y-4">
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700" aria-hidden>
            ✓
          </div>
          <h1 className="text-xl font-bold text-slate-900">{state?.waitlisted ? '대기 접수되었습니다' : '등록 신청이 접수되었습니다'}</h1>
          {state && (
            <dl className="mt-5 space-y-2 rounded-xl bg-slate-50 p-4 text-left text-sm">
              <div className="flex justify-between gap-4">
                <dt className="shrink-0 text-slate-500">학생 이름</dt>
                <dd className="font-medium text-slate-900">{state.studentName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="shrink-0 text-slate-500">프로그램</dt>
                <dd className="text-right font-medium text-slate-900">{state.programName}</dd>
              </div>
              {s && (
                <div className="flex justify-between gap-4">
                  <dt className="shrink-0 text-slate-500">일정</dt>
                  <dd className="text-right text-slate-900">
                    {formatDateLongKo(s.program.start_date)} ~ {formatDateLongKo(s.program.end_date)}
                  </dd>
                </div>
              )}
            </dl>
          )}
          <p className="mt-5 text-sm leading-relaxed text-slate-600">
            {state?.waitlisted
              ? '자리가 생기면 순서대로 연락드리겠습니다. 대기 단계에서는 납부하실 금액이 없습니다.'
              : '담당자가 신청 내용을 확인한 뒤 연락드립니다. 아래 일정에 맞춰 납부해 주세요.'}
          </p>
          {!state && (
            <Link to="/" className="mt-6 inline-block text-sm text-brand-600 hover:underline">
              처음으로
            </Link>
          )}
        </div>

        {s && !state?.waitlisted && (
          <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-base font-bold text-slate-900">납부 안내</h2>
            <ScheduleList lines={s.schedule} />
            <BankAccountBox account={s.bank_account} />
          </section>
        )}

        {s?.passport_status === 'pending' && (
          <section className="rounded-2xl bg-white p-5 text-sm leading-relaxed text-slate-600 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-1 text-base font-bold text-slate-900">여권 사진 제출</h2>
            담당자가 여권 사진 제출 전용 링크를 보내 드립니다. 여권 정보가 잘 보이도록 빛 반사 없이 촬영해 두시면 좋습니다.
          </section>
        )}

        {s?.destroy_date && <DestructionNotice destroyDate={s.destroy_date} endDate={s.program.end_date} days={s.program.end_plus_days} />}

        {state?.myToken && (
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-base font-bold text-slate-900">신청 내용 확인</h2>
            <p className="mt-1 text-sm text-slate-600">신청 내용과 납부 현황은 아래 페이지에서 언제든 다시 보실 수 있습니다. 다른 사람과 공유하지 마세요.</p>
            <Link
              to={`/my/${state.myToken}`}
              className="mt-3 flex w-full items-center justify-center rounded-xl bg-white px-4 py-3 text-base font-semibold text-brand-700 ring-1 ring-brand-600"
            >
              신청 내용 확인 페이지 열기
            </Link>
          </section>
        )}

        {state?.kakaoUrl && <KakaoButton url={state.kakaoUrl} />}
      </div>
    </PublicLayout>
  )
}
