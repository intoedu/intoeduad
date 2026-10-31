import { describe, expect, it } from 'vitest'
import { toCsv } from './csv'

describe('CSV', () => {
  it('BOM·따옴표·쉼표·줄바꿈 처리', () => {
    const csv = toCsv([{ a: '홍길동', b: 'A, "B"\n2' }], [
      { header: '이름', value: (r) => r.a },
      { header: '메모', value: (r) => r.b },
    ])
    expect(csv).toBe('﻿이름,메모\r\n홍길동,"A, ""B""\n2"')
  })

  it('수식 주입 방지: =,+,-,@로 시작하는 글자는 앞에 \'', () => {
    const csv = toCsv([{ v: '=HYPERLINK("x")' }, { v: '-1+1' }, { v: '@SUM' }], [{ header: 'v', value: (r) => r.v }])
    expect(csv.split('\r\n').slice(1)).toEqual([`"'=HYPERLINK(""x"")"`, "'-1+1", "'@SUM"])
  })

  it('숫자(음수 포함)는 그대로', () => {
    expect(toCsv([{ n: -500 }], [{ header: 'n', value: (r) => r.n }]).split('\r\n')[1]).toBe('-500')
  })
})
