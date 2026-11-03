// 항공권·ESTA·여행자보험 대행 선택 (학부모 신청서·직원 직접 입력 공통)
import { AGENCY_SERVICES, agencyFee, type AgencyChoice, type AgencyFees, type AgencyService } from '../../domain/agency'

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`

export function AgencyChooser({
  fees,
  choice,
  services,
  onChange,
  error,
}: {
  fees: AgencyFees
  choice: AgencyChoice | ''
  services: AgencyService[]
  onChange: (v: { choice: AgencyChoice | ''; services: AgencyService[] }) => void
  error?: string
}) {
  const fee = choice === 'agency' ? agencyFee(services.length, fees) : 0
  return (
    <div id="field-agency" className="space-y-3">
      <p className="text-sm text-slate-600">
        항공권, ESTA(미국 전자여행허가), 여행자보험을 인투유학이 대신 준비해 드릴 수 있습니다. 대행료: 1개 {won(agencyFee(1, fees))} · 2개{' '}
        {won(agencyFee(2, fees))} · 3개 모두 {won(agencyFee(3, fees))} (항공권 요금·보험료·ESTA 수수료는 별도)
      </p>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="대행 여부">
        {(
          [
            { value: 'agency', label: '대행을 원합니다' },
            { value: 'self', label: '직접 준비하겠습니다' },
          ] as const
        ).map((o) => (
          <label
            key={o.value}
            className={`flex cursor-pointer items-center gap-2 rounded-xl px-4 py-3 text-sm ring-1 ${
              choice === o.value ? 'bg-brand-50 font-semibold text-brand-700 ring-brand-600' : 'bg-white text-slate-800 ring-slate-300'
            }`}
          >
            <input
              type="radio"
              name="agency_choice"
              className="size-4"
              checked={choice === o.value}
              onChange={() => onChange({ choice: o.value, services: o.value === 'self' ? [] : services })}
            />
            {o.label}
          </label>
        ))}
      </div>
      {choice === 'agency' && (
        <fieldset className="space-y-2 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <legend className="sr-only">대행할 항목</legend>
          {AGENCY_SERVICES.map((s) => (
            <label key={s.value} className="flex items-start gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                className="mt-0.5 size-4"
                checked={services.includes(s.value)}
                onChange={() =>
                  onChange({
                    choice,
                    services: services.includes(s.value) ? services.filter((x) => x !== s.value) : [...services, s.value],
                  })
                }
              />
              <span>
                {s.label}
                <span className="block text-xs text-slate-500">{s.hint}</span>
              </span>
            </label>
          ))}
          <p className="pt-1 text-sm font-semibold text-slate-900">
            대행료 {won(fee)}
            {services.length > 0 && <span className="font-normal text-slate-500"> ({services.length}개 선택 · 납부 안내에 함께 표시됩니다)</span>}
          </p>
          <p className="text-xs text-slate-500">신청 후 "신청 내용 확인" 화면에서 출국 서류 정보(여권과 같은 영문 이름, ESTA 신청 항목)를 입력해 주세요.</p>
        </fieldset>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
