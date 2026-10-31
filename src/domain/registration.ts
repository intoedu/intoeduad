// 캠프 등록 신청서 입력 검증 (DB submit_registration 의 형식 검사와 같은 기준)

// 영문 이름: 여권 표기와 같게 대문자, 여러 칸 공백은 한 칸
export function normalizeEnglishName(input: string): string {
  return input.trim().replace(/\s+/g, ' ').toUpperCase()
}

export function isValidEnglishName(input: string): boolean {
  return /^[A-Z][A-Z -]{0,59}$/.test(normalizeEnglishName(input))
}

export function isValidEmail(input: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.trim())
}

// 생년월일: 실제 있는 날짜이고 1950-01-01 ~ 오늘
export function isValidBirthDate(date: string, today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const d = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) return false
  return date >= '1950-01-01' && date <= today
}

export function formatWon(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`
}

// 학원 안내용 이름 가림: 홍길동 → 홍*동, 김하 → 김*
export function maskName(name: string): string {
  const chars = [...name.trim()]
  if (chars.length <= 1) return chars.join('')
  if (chars.length === 2) return `${chars[0]}*`
  return `${chars[0]}${'*'.repeat(chars.length - 2)}${chars[chars.length - 1]}`
}
