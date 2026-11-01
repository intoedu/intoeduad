import { describe, expect, it } from 'vitest'
import { displayLogin, isLoginIdAccount, LOGIN_ID_RE, toLoginEmail } from './loginId'

describe('직원 아이디 로그인', () => {
  it('"@"가 없으면 아이디로 보고 내부 주소로 바꾼다', () => {
    expect(toLoginEmail(' HaYoungKwang ')).toBe('hayoungkwang@staff.intoedu.invalid')
  })
  it('이메일은 그대로(소문자·공백 제거)', () => {
    expect(toLoginEmail(' Intoedu0309@Gmail.com ')).toBe('intoedu0309@gmail.com')
  })
  it('표시할 때는 아이디만', () => {
    expect(displayLogin('juliet@staff.intoedu.invalid')).toBe('juliet')
    expect(displayLogin('intoedu0309@gmail.com')).toBe('intoedu0309@gmail.com')
    expect(isLoginIdAccount('juliet@staff.intoedu.invalid')).toBe(true)
    expect(isLoginIdAccount('juliet@gmail.com')).toBe(false)
  })
  it('아이디 형식: 영문 소문자·숫자로 시작, 3~30자, . _ - 허용', () => {
    expect(LOGIN_ID_RE.test('juliet')).toBe(true)
    expect(LOGIN_ID_RE.test('camp.leader-1')).toBe(true)
    expect(LOGIN_ID_RE.test('ab')).toBe(false)
    expect(LOGIN_ID_RE.test('한글')).toBe(false)
    expect(LOGIN_ID_RE.test('_x12')).toBe(false)
  })
})
