// 직원 아이디 로그인
// Supabase Auth는 이메일(또는 전화번호)로만 로그인하므로, 아이디로 만든 계정은 내부적으로
// "아이디@staff.intoedu.invalid" 형태의 주소를 쓴다. .invalid는 실제로 존재할 수 없는 도메인(RFC 2606)이라
// 이 주소로는 메일이 어디에도 가지 않는다 → 비밀번호 분실 시 관리자가 임시 비밀번호를 다시 발급한다.
// 같은 규칙이 supabase/functions/admin-staff/index.ts 에도 있다(수정 시 함께).
export const LOGIN_ID_DOMAIN = 'staff.intoedu.invalid'
export const LOGIN_ID_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/

// 로그인 칸 입력값 → 로그인 주소 ("@"가 없으면 아이디로 본다)
export function toLoginEmail(input: string): string {
  const v = input.trim().toLowerCase()
  return v.includes('@') ? v : `${v}@${LOGIN_ID_DOMAIN}`
}

// 아이디로 만든 계정인지
export function isLoginIdAccount(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${LOGIN_ID_DOMAIN}`)
}

// 화면 표시용: 아이디 계정은 아이디만, 이메일 계정은 이메일 그대로
export function displayLogin(email: string | null | undefined): string {
  if (!email) return ''
  return isLoginIdAccount(email) ? email.slice(0, -(LOGIN_ID_DOMAIN.length + 1)) : email
}
