import { Badge } from '../ui'
import { answerText, savedAnswers } from '../../domain/formSettings'
import { formatPhone } from '../../domain/phone'

// 카카오톡 미사용 표시 — 안내를 다른 방법으로 보내야 하는 고객
export function KakaoBadge({ use }: { use: boolean | null | undefined }) {
  if (use === false) return <Badge tone="red">카카오톡 미사용</Badge>
  return null
}

// 신청서에서 받은 유입 경로 · 카카오톡 사용 여부 · 추가 질문 답변 (상담 기록·등록생 상세 공용)
export function IntakeInfo({
  row,
}: {
  row: {
    inflow_label: string | null
    inflow_detail: string | null
    kakao_use: boolean | null
    kakao_alt_phone: string | null
    alt_contact: string | null
    answers: unknown
  }
}) {
  const answers = savedAnswers(row.answers)
  return (
    <div className="space-y-3">
      {row.kakao_use === false && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">
          <p className="font-semibold">카카오톡을 사용하지 않는 고객입니다 — 안내를 아래 방법으로 보내 주세요.</p>
          <ul className="mt-1 list-disc pl-5">
            {row.kakao_alt_phone && <li>대신 받을 카카오톡 번호: {formatPhone(row.kakao_alt_phone)} (알림톡은 이 번호로 발송)</li>}
            {row.alt_contact && <li>다른 연락 방법: {row.alt_contact}</li>}
            {!row.kakao_alt_phone && !row.alt_contact && <li>대신 받을 방법이 없습니다. 전화로 확인해 주세요.</li>}
          </ul>
        </div>
      )}
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-slate-500">유입 경로</dt>
          <dd className="mt-0.5 text-slate-800">
            {row.inflow_label ?? '-'}
            {row.inflow_detail ? ` · ${row.inflow_detail}` : ''}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">카카오톡</dt>
          <dd className="mt-0.5 text-slate-800">{row.kakao_use === true ? '사용' : row.kakao_use === false ? '미사용' : '-'}</dd>
        </div>
        {answers.map((a) => (
          <div key={a.id} className="sm:col-span-2">
            <dt className="text-xs text-slate-500">{a.label}</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-slate-800">{answerText(a.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
