import { formatDateLongKo } from '../../domain/dates'
import { formatWon } from '../../domain/registration'
import { PAYMENT_STATUS } from '../../lib/labels'
import type { BankAccount, ScheduleLine } from './registerApi'

const KIND_LABEL: Record<string, string> = { deposit: '예약금', balance: '잔금', extra: '추가 납부' }

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
                {l.label !== KIND_LABEL[l.kind] && l.kind !== 'extra' ? ` (${KIND_LABEL[l.kind]})` : ''}
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
