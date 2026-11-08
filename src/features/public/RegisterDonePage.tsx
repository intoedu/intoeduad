import { Link, useLocation } from 'react-router'
import { useLang } from '../../i18n/context'
import { formatDateLong } from '../../i18n/text'
import { PublicLayout } from './PublicLayout'
import type { RegisterDoneState } from './RegisterPage'
import { KakaoButton } from './RegisterPage'
import { AgencyBox, BankAccountBox, DestructionNotice, DiscountList, ScheduleList } from './RegistrationParts'

export function RegisterDonePage() {
  const state = useLocation().state as RegisterDoneState | null
  const s = state?.summary
  const { lang, tr } = useLang()

  return (
    <PublicLayout>
      <div className="space-y-4">
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700" aria-hidden>
            ✓
          </div>
          <h1 className="text-xl font-bold text-slate-900">{state?.waitlisted ? tr('대기 접수되었습니다', 'You have been added to the waitlist') : tr('등록 신청이 접수되었습니다', 'Your registration has been received')}</h1>
          {state && (
            <dl className="mt-5 space-y-2 rounded-xl bg-slate-50 p-4 text-left text-sm">
              <div className="flex justify-between gap-4">
                <dt className="shrink-0 text-slate-500">{tr('학생 이름', 'Student')}</dt>
                <dd className="font-medium text-slate-900">{state.studentName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="shrink-0 text-slate-500">{tr('프로그램', 'Program')}</dt>
                <dd className="text-right font-medium text-slate-900">{state.programName}</dd>
              </div>
              {s && (
                <div className="flex justify-between gap-4">
                  <dt className="shrink-0 text-slate-500">{tr('일정', 'Dates')}</dt>
                  <dd className="text-right text-slate-900">
                    {formatDateLong(s.program.start_date, lang)} ~ {formatDateLong(s.program.end_date, lang)}
                  </dd>
                </div>
              )}
            </dl>
          )}
          <p className="mt-5 text-sm leading-relaxed text-slate-600">
            {state?.waitlisted
              ? tr(
                  '자리가 생기면 순서대로 연락드리겠습니다. 대기 단계에서는 납부하실 금액이 없습니다.',
                  'We will contact you in order when a place opens up. No payment is needed while you are on the waitlist.',
                )
              : tr(
                  '담당자가 신청 내용을 확인한 뒤 연락드립니다. 아래 일정에 맞춰 납부해 주세요.',
                  'An advisor will review your registration and contact you. Please pay according to the schedule below.',
                )}
          </p>
          {!state && (
            <Link to="/" className="mt-6 inline-block text-sm text-brand-600 hover:underline">
              {tr('처음으로', 'Home')}
            </Link>
          )}
        </div>

        {s && !state?.waitlisted && (
          <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-base font-bold text-slate-900">{tr('납부 안내', 'Payment information')}</h2>
            <DiscountList discounts={s.discounts} />
            <ScheduleList lines={s.schedule} />
            <AgencyBox agency={s.agency} token={state?.myToken} />
            <BankAccountBox account={s.bank_account} />
          </section>
        )}

        {state && state.passport !== 'none' && !state.waitlisted && (
          <section className="rounded-2xl bg-white p-5 text-sm leading-relaxed text-slate-600 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-1 text-base font-bold text-slate-900">{tr('여권 사진', 'Passport photo')}</h2>
            {state.passport === 'uploaded' && <p className="text-green-700">{tr('여권 사진이 안전하게 제출되었습니다.', 'Your passport photo has been submitted securely.')}</p>}
            {state.passport === 'failed' && (
              <p className="text-red-600">
                {tr(
                  `여권 사진을 올리지 못했습니다(${state.passportError}). 아래 [여권 사진 올리기]에서 다시 올려 주세요.`,
                  'We could not upload your passport photo. Please try again with [Upload passport photo] below.',
                )}
              </p>
            )}
            {state.passport === 'later' && <p>
                {tr(
                  '여권 사진은 아래 [여권 사진 올리기]나 담당자가 보내 드리는 링크로 제출해 주세요.',
                  'Please submit the passport photo with [Upload passport photo] below or the link your advisor sends you.',
                )}
              </p>}
            {state.passport !== 'uploaded' && state.myToken && (
              <Link
                to={`/passport/${state.myToken}`}
                className="mt-3 flex w-full items-center justify-center rounded-xl bg-white px-4 py-3 text-base font-semibold text-brand-700 ring-1 ring-brand-600"
              >
                {tr('여권 사진 올리기', 'Upload passport photo')}
              </Link>
            )}
          </section>
        )}

        {s?.destroy_date && <DestructionNotice destroyDate={s.destroy_date} endDate={s.program.end_date} days={s.program.end_plus_days} />}

        {state?.myToken && (
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-base font-bold text-slate-900">{tr('신청 내용 확인', 'Your registration page')}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {tr(
                '신청 내용과 납부 현황은 아래 페이지에서 언제든 다시 보실 수 있습니다. 다른 사람과 공유하지 마세요.',
                'You can check your registration and payment status on this page at any time. The page is in Korean. Please do not share the link.',
              )}
            </p>
            <Link
              to={`/my/${state.myToken}`}
              className="mt-3 flex w-full items-center justify-center rounded-xl bg-white px-4 py-3 text-base font-semibold text-brand-700 ring-1 ring-brand-600"
            >
              {tr('신청 내용 확인 페이지 열기', 'Open my registration page')}
            </Link>
          </section>
        )}

        {state?.kakaoUrl && <KakaoButton url={state.kakaoUrl} />}
      </div>
    </PublicLayout>
  )
}
