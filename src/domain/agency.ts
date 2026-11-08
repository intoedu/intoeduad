// 항공권·ESTA·여행자보험 대행 (M17) — 대행료는 고른 개수로 정한다(설정 agency_fees). DB agency_fee_for와 같은 규칙.
export type AgencyService = 'flight' | 'esta' | 'insurance'
export type AgencyChoice = 'agency' | 'self'
export type AgencyFees = Record<string, number>

export const AGENCY_SERVICES: Array<{ value: AgencyService; label: string; hint: string; en: string; enHint: string }> = [
  { value: 'flight', label: '항공권', hint: '항공권 요금은 별도이며 확정되면 안내드립니다', en: 'Flights', enHint: 'Airfare is charged separately; we will let you know once it is confirmed' },
  { value: 'esta', label: 'ESTA (미국 전자여행허가)', hint: '미국 정부 신청 수수료는 별도입니다', en: 'ESTA (U.S. travel authorization)', enHint: 'The U.S. government application fee is charged separately' },
  { value: 'insurance', label: '여행자보험', hint: '보험료는 별도입니다', en: 'Travel insurance', enHint: 'The insurance premium is charged separately' },
]

export const DEFAULT_AGENCY_FEES: AgencyFees = { '1': 30000, '2': 50000, '3': 60000 }

export function agencyFee(count: number, fees: AgencyFees = DEFAULT_AGENCY_FEES): number {
  if (count <= 0) return 0
  const n = String(Math.min(count, 3))
  return Number(fees[n] ?? DEFAULT_AGENCY_FEES[n])
}

export function agencyServiceLabels(services: readonly string[], lang: 'ko' | 'en' = 'ko'): string {
  return AGENCY_SERVICES.filter((s) => services.includes(s.value))
    .map((s) => (lang === 'en' ? s.en : s.label).replace(/ \(.*\)$/, ''))
    .join(lang === 'en' ? ', ' : '·')
}

// 여권 영문 이름: 대문자, 공백 하나, 영문·공백·하이픈만
export function normalizePassportName(input: string): string {
  return input.trim().replace(/\s+/g, ' ').toUpperCase()
}
export function isValidPassportName(input: string): boolean {
  return /^[A-Z][A-Z \-]{0,59}$/.test(normalizePassportName(input))
}
export function normalizePassportNo(input: string): string {
  return input.replace(/\s/g, '').toUpperCase()
}
export function isValidPassportNo(input: string): boolean {
  return /^[A-Z0-9]{7,12}$/.test(normalizePassportNo(input))
}
