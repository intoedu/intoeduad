import { describe, expect, it } from 'vitest'
import { isAcceptablePassword, toAuthPassword } from './password'

describe('직원 비밀번호', () => {
  it('최소 4자, 숫자만으로도 가능', () => {
    expect(isAcceptablePassword('1234')).toBe(true)
    expect(isAcceptablePassword('123')).toBe(false)
  })
  it('짧은 비밀번호는 서버 규칙(영문+숫자 10자)을 만족하도록 꼬리표를 붙인다', () => {
    const v = toAuthPassword('1234')
    expect(v.length).toBeGreaterThanOrEqual(10)
    expect(/[a-zA-Z]/.test(v) && /[0-9]/.test(v)).toBe(true)
    expect(v.startsWith('1234')).toBe(true)
  })
  it('같은 입력은 항상 같은 값(로그인·설정 일치), 다른 입력은 다른 값', () => {
    expect(toAuthPassword('0000')).toBe(toAuthPassword('0000'))
    expect(toAuthPassword('0000')).not.toBe(toAuthPassword('0001'))
  })
  it('이미 규칙을 만족하는 비밀번호(임시 비밀번호 등)는 그대로', () => {
    expect(toAuthPassword('9HDk7PN6UFnE')).toBe('9HDk7PN6UFnE')
    expect(toAuthPassword('NewPass1234')).toBe('NewPass1234')
    expect(toAuthPassword('newpass1234')).toBe('newpass1234#IntoEdu-pw1')
  })
})
