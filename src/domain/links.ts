// 학부모용 공개 링크
export function publicSiteUrl(): string {
  const configured = import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined
  return (configured || window.location.origin).replace(/\/+$/, '')
}

export function applyLink(base: string, partnerCode: string, contactCode?: string | null): string {
  const url = `${base}/apply/${encodeURIComponent(partnerCode)}`
  return contactCode ? `${url}?c=${encodeURIComponent(contactCode)}` : url
}
