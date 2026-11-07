// 학부모용 공개 링크
export function publicSiteUrl(): string {
  const configured = import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined
  return (configured || window.location.origin).replace(/\/+$/, '')
}

export function applyLink(base: string, partnerCode: string, contactCode?: string | null): string {
  const url = `${base}/apply/${encodeURIComponent(partnerCode)}`
  return contactCode ? `${url}?c=${encodeURIComponent(contactCode)}` : url
}

// 통합 캠프 신청 링크(/register) — 학원·선생님 코드를 붙이면 소개 경로가 자동 기록된다
export function registerHubLink(base: string, partnerCode?: string | null, contactCode?: string | null): string {
  const q = new URLSearchParams()
  if (partnerCode) q.set('ref', partnerCode)
  if (partnerCode && contactCode) q.set('c', contactCode)
  const qs = q.toString()
  return `${base}/register${qs ? `?${qs}` : ''}`
}
