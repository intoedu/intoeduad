// 전화번호: 저장은 숫자만, 표시는 하이픈
export function normalizePhone(input: string): string {
  return input.replace(/\D/g, '')
}

export function isValidPhone(digits: string): boolean {
  return /^[0-9]{9,11}$/.test(digits)
}

export function isValidMobile(digits: string): boolean {
  return /^01[0-9]{8,9}$/.test(digits)
}

export function formatPhone(digits: string | null | undefined): string {
  if (!digits) return ''
  if (digits.startsWith('02')) {
    if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`
    if (digits.length === 10) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  return digits
}

export function formatBusinessNo(digits: string | null | undefined): string {
  if (!digits || digits.length !== 10) return digits ?? ''
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
}
