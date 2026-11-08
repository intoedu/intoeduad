import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { applyLink, registerHubLink } from './links'
import { PUBLIC_PATHS } from './publicPaths'

// "링크 지킴이": 학부모·학원에 이미 나간 링크와 QR이 깨지지 않도록 주소 모양을 고정한다.
// 이 시험이 실패하면 배포하지 말 것 — 주소를 바꿔야 한다면 옛 주소 넘겨주기를 먼저 만들고 대표 승인을 받는다.
describe('공개 링크 주소 고정', () => {
  it('주소 모양이 바뀌지 않았다', () => {
    expect(PUBLIC_PATHS).toEqual({
      apply: '/apply',
      applyPartner: '/apply/:partnerCode',
      register: '/register',
      registerCamp: '/register/:slug',
      my: '/my/:token',
      myTravel: '/my/:token/travel',
      passport: '/passport/:token',
    })
  })

  it('화면 주소 목록이 이 값을 그대로 쓴다', () => {
    const routes = readFileSync(new URL('../routes.tsx', import.meta.url), 'utf8')
    for (const key of Object.keys(PUBLIC_PATHS)) expect(routes).toContain(`path: PUBLIC_PATHS.${key},`)
  })

  it('학원·상담실장 링크 모양', () => {
    const base = 'https://app.intoabroad.com'
    expect(applyLink(base, 'daejeon-into')).toBe(`${base}/apply/daejeon-into`)
    expect(applyLink(base, 'daejeon-into', 'kim')).toBe(`${base}/apply/daejeon-into?c=kim`)
    expect(registerHubLink(base)).toBe(`${base}/register`)
    expect(registerHubLink(base, 'daejeon-into')).toBe(`${base}/register?ref=daejeon-into`)
    expect(registerHubLink(base, 'daejeon-into', 'kim')).toBe(`${base}/register?ref=daejeon-into&c=kim`)
  })
})
