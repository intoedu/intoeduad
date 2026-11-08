// 항공권·ESTA·여행자보험 대행 선택 (학부모 신청서·직원 직접 입력 공통)
import { AGENCY_SERVICES, agencyFee, type AgencyChoice, type AgencyFees, type AgencyService } from '../../domain/agency'
import { useLang } from '../../i18n/context'
import { formatMoney } from '../../i18n/text'

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
  const { lang, en, tr } = useLang()
  const won = (n: number) => formatMoney(n, lang)
  return (
    <div id="field-agency" className="space-y-3">
      {en ? (
        <p className="text-sm text-slate-600">
          INTOEDU can arrange flights, ESTA (U.S. travel authorization) and travel insurance for you. Service fee: 1 item {won(agencyFee(1, fees))} · 2
          items {won(agencyFee(2, fees))} · all 3 {won(agencyFee(3, fees))} (airfare, insurance premium and ESTA fee are separate)
        </p>
      ) : (
        <p className="text-sm text-slate-600">
          항공권, ESTA(미국 전자여행허가), 여행자보험을 인투유학이 대신 준비해 드릴 수 있습니다. 대행료: 1개 {won(agencyFee(1, fees))} · 2개{' '}
          {won(agencyFee(2, fees))} · 3개 모두 {won(agencyFee(3, fees))} (항공권 요금·보험료·ESTA 수수료는 별도)
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={tr('대행 여부', 'Arrangement')}>
        {(
          [
            { value: 'agency', label: tr('대행을 원합니다', 'Please arrange it for me') },
            { value: 'self', label: tr('직접 준비하겠습니다', 'I will arrange it myself') },
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
          <legend className="sr-only">{tr('대행할 항목', 'Items to arrange')}</legend>
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
                {en ? s.en : s.label}
                <span className="block text-xs text-slate-500">{en ? s.enHint : s.hint}</span>
              </span>
            </label>
          ))}
          <p className="pt-1 text-sm font-semibold text-slate-900">
            {tr('대행료', 'Service fee')} {won(fee)}
            {services.length > 0 && (
              <span className="font-normal text-slate-500">
                {en
                  ? ` (${services.length} selected · included in your payment schedule)`
                  : ` (${services.length}개 선택 · 납부 안내에 함께 표시됩니다)`}
              </span>
            )}
          </p>
          <p className="text-xs text-slate-500">
            {tr(
              '신청 후 "신청 내용 확인" 화면에서 출국 서류 정보(여권과 같은 영문 이름, ESTA 신청 항목)를 입력해 주세요.',
              'After registering, please enter the travel document details (name as in passport, ESTA items) on your registration page.',
            )}
          </p>
        </fieldset>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
