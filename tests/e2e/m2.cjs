// M2 브라우저 E2E: 학원 등록 → 상담실장 → 링크·QR(잠금) → 협약 → 지급 계좌 → 권한
const { chromium } = require('playwright')
const OUT = process.env.E2E_OUT || 'test-results'
require('fs').mkdirSync(OUT, { recursive: true })
const BASE = 'http://localhost:5173'
const results = []
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`)
const visible = async (locator, timeout = 10000) => {
  try { await locator.first().waitFor({ state: 'visible', timeout }); return true } catch { return false }
}

async function login(page, email) {
  await page.goto(`${BASE}/login`)
  await page.getByLabel('이메일').fill(email)
  await page.getByLabel('비밀번호').fill('devpass1234')
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL('**/admin')
}

;(async () => {
  const browser = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } })
  const errors = []
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('dialog', (d) => d.accept())

  // 1) 목록
  await login(page, 'admin@dev.local')
  await page.getByRole('link', { name: 'MOU 학원' }).click()
  await page.waitForURL('**/admin/partners')
  check('학원 목록: 시드 학원 표시', await visible(page.getByText('대전 인투학원')))
  check('학원 목록: 독점권형 배지', await visible(page.getByText('독점권형')))

  // 2) 신규 등록 + 코드 자동 추천 + 독점 지역 경고
  await page.getByRole('link', { name: '+ 학원 등록' }).click()
  await page.getByLabel('학원명 (필수)').fill('해피 영어학원')
  await page.getByLabel('지역').fill('대전 유성구')
  check('코드 자동 추천', (await page.getByLabel('링크 코드').inputValue()) === 'daejeon-haepi', await page.getByLabel('링크 코드').inputValue())
  check('독점 지역 충돌 경고', await visible(page.getByText('독점 지역 확인 필요')))
  await page.getByLabel('원장님 성함').fill('최원장')
  await page.getByLabel('연락처').fill('042-123-4567')
  await page.getByLabel('이메일').fill('happy@example.com')
  await page.getByRole('button', { name: '학원 등록' }).click()
  await page.waitForURL(/\/admin\/partners\/[0-9a-f-]+\?tab=contacts/)
  check('등록 후 담당자 탭으로 이동', true)

  // 3) 상담실장 추가
  await page.getByLabel('이름 (필수)').fill('이실장')
  check('담당자 코드 자동 추천', (await page.getByLabel('링크 코드').inputValue()) === 'isiljang')
  await page.getByLabel('연락처').fill('01055556666')
  await page.getByRole('button', { name: '저장' }).click()
  check('상담실장 추가', await visible(page.getByText('이실장님을 담당자로 추가했습니다', { exact: false })))

  // 4) 링크·QR: 복사하면 코드 잠금
  await page.getByRole('tab', { name: '링크·QR' }).click()
  check('학원 링크 표시', await visible(page.getByText(`${BASE}/apply/daejeon-haepi`, { exact: true })))
  check('실장 전용 링크 표시', await visible(page.getByText(`${BASE}/apply/daejeon-haepi?c=isiljang`, { exact: true })))
  check('QR 이미지 표시', await visible(page.getByRole('img', { name: '이실장 전용 링크 QR 코드' })))
  const panels = page.locator('div.ring-slate-200', { hasText: '이실장 전용 링크' })
  await panels.getByRole('button', { name: '링크 복사' }).click()
  check('링크 복사 안내', await visible(page.getByText('링크를 복사했습니다.')))
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  check('클립보드에 실장 링크', clip === `${BASE}/apply/daejeon-haepi?c=isiljang`, clip)
  check('복사 후 코드 잠금 배지', await visible(page.getByText('배포됨 · 코드 잠금')))
  const dl = page.waitForEvent('download')
  await page.locator('div.ring-slate-200', { hasText: '학원 상담 신청 링크' }).getByRole('button', { name: 'QR PNG' }).click()
  const download = await dl
  check('QR PNG 다운로드', download.suggestedFilename() === '인투유학_상담신청_해피 영어학원.png', download.suggestedFilename())
  const dl2 = page.waitForEvent('download')
  await page.locator('div.ring-slate-200', { hasText: '학원 상담 신청 링크' }).getByRole('button', { name: 'QR SVG' }).click()
  check('QR SVG 다운로드', (await dl2).suggestedFilename().endsWith('.svg'))
  await page.screenshot({ path: `${OUT}/m2-links.png`, fullPage: true })

  // 5) 협약 추가
  await page.getByRole('tab', { name: '협약' }).click()
  await page.getByRole('button', { name: '+ 협약 추가' }).click()
  await page.getByLabel('계약 시작일').fill('2026-10-01')
  check('종료일 자동(1년)', (await page.getByLabel('계약 종료일').inputValue()) === '2027-09-30')
  await page.getByRole('button', { name: '저장' }).click()
  check('협약 저장', await visible(page.getByText('협약 정보를 저장했습니다.')))
  check('협약 상태 "협약 중"', await visible(page.getByText('협약 중')))

  // 6) 지급 계좌
  await page.getByRole('tab', { name: '커미션 지급 계좌' }).click()
  await page.getByLabel('은행').fill('국민은행')
  await page.getByLabel('계좌번호').fill('123-45-678901')
  await page.getByLabel('예금주').fill('해피영어학원')
  await page.getByRole('button', { name: '계좌 등록' }).click()
  check('지급 계좌 저장', await visible(page.getByText('지급 계좌를 저장했습니다.')))
  const partnerUrl = page.url().split('?')[0]
  await page.close()

  // 7) 직원: 잠긴 코드 수정 불가
  const staffCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const staff = await staffCtx.newPage()
  staff.on('pageerror', (e) => errors.push(e.message))
  await login(staff, 'staff@dev.local')
  await staff.goto(`${partnerUrl}?tab=info`)
  await visible(staff.getByLabel('링크 코드'))
  check('직원: 배포된 코드 입력칸 잠김', await staff.getByLabel('링크 코드').isDisabled())
  check('직원: 코드 잠금 해제 버튼 없음', !(await staff.getByRole('button', { name: /코드 잠금 해제/ }).count()))
  await staffCtx.close()

  // 8) 현지 팀: 접근 불가
  const viewerCtx = await browser.newContext({ viewport: { width: 375, height: 812 } })
  const viewer = await viewerCtx.newPage()
  await login(viewer, 'viewer@dev.local')
  await viewer.goto(`${BASE}/admin/partners`)
  check('현지 팀: 학원 화면 접근 불가', await visible(viewer.getByText('접근 권한이 없습니다')))
  await viewerCtx.close()

  // 9) 모바일 375px
  const mCtx = await browser.newContext({ viewport: { width: 375, height: 812 } })
  const m = await mCtx.newPage()
  m.on('pageerror', (e) => errors.push(e.message))
  await login(m, 'admin@dev.local')
  await m.goto(`${BASE}/admin/partners`)
  await visible(m.getByText('해피 영어학원'))
  let w = await m.evaluate(() => document.documentElement.scrollWidth)
  check('375px 목록 가로 스크롤 없음', w <= 375, `scrollWidth=${w}`)
  await m.screenshot({ path: `${OUT}/m2-list-mobile.png`, fullPage: true })
  await m.goto(`${partnerUrl}?tab=links`)
  await visible(m.getByText('학원 상담 신청 링크'))
  w = await m.evaluate(() => document.documentElement.scrollWidth)
  check('375px 링크·QR 가로 스크롤 없음', w <= 375, `scrollWidth=${w}`)
  await m.screenshot({ path: `${OUT}/m2-links-mobile.png`, fullPage: true })
  await mCtx.close()

  check('브라우저 스크립트 오류 없음', errors.length === 0, errors.join(' | '))
  await browser.close()
  console.log(results.join('\n'))
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0)
})().catch((e) => {
  console.log(results.join('\n'))
  console.error('E2E 중단:', e.message.split('\n')[0])
  process.exit(1)
})
