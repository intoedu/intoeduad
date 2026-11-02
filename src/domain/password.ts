// 직원 비밀번호 규칙 (2026-11-02 결정: 최소 4자, 숫자만으로도 가능)
// Supabase Auth의 서버 규칙(최소 길이 6자 이상만 설정 가능 — 운영은 6자, 로컬은 영문+숫자 10자)보다 짧은 비밀번호를 쓰기 위해,
// 서버 규칙을 만족하지 못하는 비밀번호는 고정 꼬리표를 붙여 보낸다. 로그인·비밀번호 설정에서 같은 함수를 쓰므로 항상 같은 값이 된다.
// 이미 서버 규칙을 만족하는 비밀번호(관리자가 발급한 12자 임시 비밀번호: 소문자·대문자·숫자 포함)는 그대로 보낸다 → 기존 비밀번호와 호환.
// 로그인 화면은 꼬리표 버전이 틀리면 원래 값으로 한 번 더 시도한다(규칙 변경 전에 정한 비밀번호 호환).
// 주의: 꼬리표는 화면 코드에 공개되므로 보안 강도는 사용자가 입력한 비밀번호 그대로다.
export const PASSWORD_MIN_LENGTH = 4
const SERVER_MIN_LENGTH = 10
const SUFFIX = '#IntoEdu-pw1' // 대·소문자·숫자·기호 포함 → 서버 규칙을 어떻게 바꿔도 통과

export function isAcceptablePassword(pw: string): boolean {
  return pw.length >= PASSWORD_MIN_LENGTH
}

function meetsServerPolicy(pw: string): boolean {
  return pw.length >= SERVER_MIN_LENGTH && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /[0-9]/.test(pw)
}

// Supabase Auth로 보낼 비밀번호
export function toAuthPassword(pw: string): string {
  return meetsServerPolicy(pw) ? pw : pw + SUFFIX
}
