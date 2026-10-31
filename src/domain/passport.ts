// 여권 사진 제출 전 처리 기준 (브라우저) — 서버(passport-upload)는 형식·크기를 다시 확인한다
export const PASSPORT_MAX_BYTES = 10 * 1024 * 1024
// 긴 변 기준 이 크기보다 크면 줄인다(여권 글자가 읽히는 해상도는 유지)
export const PASSPORT_MAX_EDGE = 2400

export type PassportKind = 'jpeg' | 'png' | 'heic' | 'pdf' | null

export function passportKind(name: string, type: string): PassportKind {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (type === 'image/heic' || type === 'image/heif' || ext === 'heic' || ext === 'heif') return 'heic'
  if (type === 'image/png' || ext === 'png') return 'png'
  if (type === 'image/jpeg' || ext === 'jpg' || ext === 'jpeg') return 'jpeg'
  return null
}

// 긴 변을 maxEdge 이하로 맞춘 크기 (이미 작으면 그대로)
export function fitWithin(width: number, height: number, maxEdge = PASSPORT_MAX_EDGE): { width: number; height: number; scaled: boolean } {
  const edge = Math.max(width, height)
  if (edge <= maxEdge) return { width, height, scaled: false }
  const r = maxEdge / edge
  return { width: Math.round(width * r), height: Math.round(height * r), scaled: true }
}

// 열람 화면 워터마크 문구
export function watermarkText(viewer: string, atKst: string): string {
  return `인투유학 내부용 · ${viewer} · ${atKst}`
}
