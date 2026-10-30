// 한글 → 로마자(국어의 로마자 표기법 기본 대응, 음운 변화 미반영) — 링크 코드 추천용
const INITIALS = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h']
const MEDIALS = [
  'a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo',
  'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i',
]
const FINALS = [
  '', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l',
  'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't',
]

const HANGUL_START = 0xac00
const HANGUL_END = 0xd7a3

export function romanize(text: string): string {
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0)!
    if (code < HANGUL_START || code > HANGUL_END) {
      out += ch
      continue
    }
    const offset = code - HANGUL_START
    const initial = Math.floor(offset / 588)
    const medial = Math.floor((offset % 588) / 28)
    const final = offset % 28
    out += INITIALS[initial] + MEDIALS[medial] + FINALS[final]
  }
  return out
}

// 링크용 코드: 영문 소문자·숫자·하이픈
export function slugify(text: string, maxLength = 40): string {
  return romanize(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '')
}

const ACADEMY_SUFFIXES = /(영어학원|어학원|학원|교습소|공부방)$/

// 학원 코드 추천: "지역-학원명" (예: 대전 + 인투학원 → daejeon-intu)
export function suggestPartnerCode(region: string, name: string): string {
  const base = name.trim().replace(/\s+/g, '').replace(ACADEMY_SUFFIXES, '') || name
  return slugify([region.trim().split(/\s+/)[0] ?? '', base].filter(Boolean).join(' '))
}

// 담당자 코드 추천: 이름 로마자 (예: 김상담 → gimsangdam)
export function suggestContactCode(name: string): string {
  return slugify(name.replace(/\s+/g, ''), 30) || 'contact'
}
