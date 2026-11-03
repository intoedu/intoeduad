import { formatDateLongKo } from '../../domain/dates'
import { formatWon } from '../../domain/registration'
import { PAYMENT_STATUS } from '../../lib/labels'
import { Link } from 'react-router'
import { agencyServiceLabels } from '../../domain/agency'
import type { AgencyInfo, BankAccount, DiscountLine, ScheduleLine } from './registerApi'

const KIND_LABEL: Record<string, string> = { deposit: '예약금', balance: '잔금', extra: '추가 납부' }

// 항공권·ESTA·보험 대행 선택과 출국 서류 정보 제출 안내 (완료 화면·신청 내용 확인 화면)
export function AgencyBox({ agency, token }: { agency?: AgencyInfo | null; token?: string | null }) {
  if (!agency) return null
  if (agency.choice === 'self') {
    return (
      <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200">
        항공권·ESTA·여행자보험: <strong>직접 준비</strong>
        <p className="mt-1 text-xs text-slate-500">ESTA 승인과 항공권 예약을 마치시면 카카오톡으로 알려 주세요. 대행으로 바꾸고 싶으시면 문의해 주세요.</p>
      </div>
    )
  }
  return (
    <div className="space-y-2 rounded-xl bg-brand-50 px-4 py-3 text-sm ring-1 ring-brand-100">
      <p className="text-slate-800">
        <strong>대행 신청:</strong> {agencyServiceLabels(agency.services)} · 대행료 {formatWon(agency.fee)}
      </p>
      {agency.travel_allowed && (
        <>
          <p className="text-xs text-slate-600">
            {agency.travel_submitted_at
              ? '출국 서류 정보를 받았습니다. 바뀐 내용이 있으면 다시 열어 고쳐 주세요.'
              : '대행을 위해 출국하는 분의 여권 정보와 ESTA 신청 항목을 입력해 주세요.'}
          </p>
          {token && (
            <Link
              to={`/my/${token}/travel`}
              className="inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              {agency.travel_submitted_at ? '출국 서류 정보 확인·수정' : '출국 서류 정보 입력하기'}
            </Link>
          )}
        </>
      )}
    </div>
  )
}

// 적용된 캠프비 할인 (신청서 미리보기·완료 화면·신청 내용 확인 화면 공통)
export function DiscountList({ discounts }: { discounts?: DiscountLine[] | null }) {
  if (!discounts || discounts.length === 0) return null
  return (
    <ul className="space-y-1 rounded-xl bg-emerald-50 px-4 py-3 text-sm ring-1 ring-emerald-200" aria-label="적용된 할인">
      {discounts.map((d, i) => (
        <li key={i} className="flex justify-between gap-3">
          <span className="text-emerald-900">{d.label}</span>
          <span className="font-semibold text-emerald-800">−{formatWon(d.amount)}</span>
        </li>
      ))}
      <li className="pt-1 text-xs text-emerald-800">할인 금액은 잔금(필요하면 예약금)에 반영되어 있습니다.</li>
    </ul>
  )
}

// 납부 일정 표 (신청서 미리보기·완료 화면·신청 내용 확인 화면 공통)
export function ScheduleList({ lines }: { lines: Array<ScheduleLine & { paid?: number; status?: string }> }) {
  if (lines.length === 0) return <p className="text-sm text-slate-500">납부 일정은 담당자가 따로 안내드립니다.</p>
  return (
    <ul className="divide-y divide-slate-100 rounded-xl bg-slate-50 px-4 ring-1 ring-slate-200">
      {lines.map((l, i) => {
        const st = l.status ? PAYMENT_STATUS[l.status] : undefined
        return (
          <li key={i} className="flex items-start justify-between gap-3 py-3 text-sm">
            <div>
              <p className="font-medium text-slate-900">
                {l.label}
                {!l.label.startsWith(KIND_LABEL[l.kind]) && l.kind !== 'extra' ? ` (${KIND_LABEL[l.kind]})` : ''}
              </p>
              <p className="text-slate-600">{formatDateLongKo(l.due_date)}까지</p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-slate-900">{formatWon(l.amount)}</p>
              {st && (
                <p className={`text-xs ${l.status === 'overdue' ? 'text-red-600' : l.status === 'paid' ? 'text-green-700' : 'text-slate-500'}`}>
                  {st.label}
                  {l.status === 'partial' && l.paid ? ` (${formatWon(l.paid)})` : ''}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export function BankAccountBox({ account }: { account: BankAccount | null | undefined }) {
  const ready = account && account.bank && account.number
  return (
    <div className="rounded-xl bg-white p-4 text-sm ring-1 ring-slate-200">
      <p className="mb-1 font-semibold text-slate-900">입금 계좌</p>
      {ready ? (
        <p className="text-slate-700">
          {account.bank} {account.number}
          {account.holder ? ` (예금주 ${account.holder})` : ''}
        </p>
      ) : (
        <p className="text-slate-600">입금 계좌는 담당자가 따로 안내드립니다.</p>
      )}
      <p className="mt-1 text-xs text-slate-500">입금하실 때 학생 이름으로 보내 주시면 확인이 빠릅니다.</p>
    </div>
  )
}

// 개인정보 파기 안내 상자 (PLAN 기능 B: 신청서 제출 버튼 위·완료 화면·/my 페이지)
// body: 신청서에서는 동의 기록에 저장되는 버전 문구를 그대로 보여 준다
export function DestructionNotice({ destroyDate, endDate, days, body }: { destroyDate: string; endDate?: string; days?: number; body?: string }) {
  if (body) {
    return (
      <div className="rounded-xl bg-amber-50 p-4 text-sm leading-relaxed whitespace-pre-line text-amber-900 ring-1 ring-amber-200" role="note" aria-label="개인정보 파기 안내">
        <p className="font-semibold">개인정보 파기 안내</p>
        <p className="mt-1">{body}</p>
      </div>
    )
  }
  return (
    <div className="rounded-xl bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 ring-1 ring-amber-200" role="note" aria-label="개인정보 파기 안내">
      <p className="font-semibold">개인정보 파기 안내</p>
      <p className="mt-1">
        제출하신 개인정보(여권·건강 정보 포함)는{' '}
        {endDate && days !== undefined ? `프로그램 종료일(${formatDateLongKo(endDate)})로부터 ${days}일이 지난 ` : ''}
        <strong>{formatDateLongKo(destroyDate)}</strong>에 파기됩니다.
      </p>
      <p className="mt-1 text-xs text-amber-800">관계 법령에 따라 보관 의무가 있는 거래 기록은 해당 기간 동안 분리하여 보관합니다.</p>
    </div>
  )
}
