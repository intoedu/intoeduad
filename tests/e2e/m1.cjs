// M1 브라우저 E2E: 로그인 → 직원 초대 → 초대 메일 링크 → 비밀번호 설정 → 권한별 메뉴
const { chromium } = require('playwright')
const OUT = process.env.E2E_OUT || 'test-results'
require('fs').mkdirSync(OUT, { recursive: true })
const BASE = 'http://localhost:5173'
const results = []
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`)
const visible = async (locator) => {
  try { await locator.first().waitFor({ state: 'visible', timeout: 10000 }); return true } catch { return false }
}
const hidden = async (locator) => {
  try { await locator.first().waitFor({ state: 'hidden', timeout: 3000 }); return true } catch { return false }
}

async function login(page, email, password = 'devpass1234') {
  await page.goto(`${BASE}/login`)
  await page.getByLabel('이메일').fill(email)
  await page.getByLabel('비밀번호').fill(password)
  await page.getByRole('button', { name: '로그인' }).click()
}

;(async () => {
  const browser = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } })
  const errors = []
  const track = (page) => page.on('pageerror', (e) => errors.push(e.message))

  // 1) 비로그인 → /admin 접근 시 로그인 화면
  {
    const page = await browser.newPage()
    track(page)
    await page.goto(`${BASE}/admin`)
    await page.waitForURL('**/login')
    check('비로그인 /admin → /login 이동', page.url().endsWith('/login'))
    await login(page, 'admin@dev.local', 'wrong-password1')
    check('잘못된 비밀번호 안내', await visible(page.getByText('이메일 또는 비밀번호가 올바르지 않습니다.')))
    await page.close()
  }

  // 2) 관리자 로그인 → 대시보드 → 직원 초대
  const invitedEmail = `e2e.${Date.now()}@dev.local`
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    track(page)
    await login(page, 'admin@dev.local')
    await page.waitForURL('**/admin')
    check('관리자 로그인 → 대시보드', await visible(page.getByRole('heading', { name: '대시보드' })))
    check('관리자 메뉴: 여권 접근 기록 보임', await visible(page.getByRole('link', { name: /여권 접근 기록/ })))
    await page.screenshot({ path: `${OUT}/m1-admin-dashboard.png` })

    await page.getByRole('link', { name: /설정·직원 관리/ }).click()
    await page.waitForURL('**/admin/settings/staff')
    await page.getByRole('button', { name: '+ 직원 초대' }).click()
    await page.getByLabel('이름').fill('E2E 신규직원')
    await page.getByLabel('이메일').fill(invitedEmail)
    await page.getByRole('button', { name: '초대 메일 보내기' }).click()
    check('직원 초대 성공 안내', await visible(page.getByText(`${invitedEmail}로 초대 메일을 보냈습니다.`)))
    check('초대한 직원 목록에 표시', await visible(page.getByText(invitedEmail, { exact: true })))

    // 같은 이메일 재초대 → 거절, 기존 직원 유지
    await page.getByRole('button', { name: '+ 직원 초대' }).click()
    await page.getByLabel('이름').fill('중복')
    await page.getByLabel('이메일').fill(invitedEmail)
    await page.getByRole('button', { name: '초대 메일 보내기' }).click()
    check('중복 초대 거절', await visible(page.getByText('이미 등록된 이메일입니다.', { exact: false })))
    check('중복 초대 후에도 기존 직원 유지', await visible(page.getByText(invitedEmail, { exact: true })))
    await page.screenshot({ path: `${OUT}/m1-staff-page.png`, fullPage: true })
    await page.close()
  }

  // 3) 메일함에서 초대 링크 확인 → 비밀번호 설정
  {
    const { messages } = await (await fetch('http://127.0.0.1:54324/api/v1/messages')).json()
    const msg = messages.find((m) => m.To[0].Address === invitedEmail)
    check('초대 메일 수신(한국어 제목)', !!msg && msg.Subject.includes('인투유학'), msg?.Subject)
    const detail = await (await fetch(`http://127.0.0.1:54324/api/v1/message/${msg.ID}`)).json()
    const link = detail.HTML.match(/href="([^"]+)"/)[1].replace(/&amp;/g, '&')

    const page = await browser.newPage()
    track(page)
    await page.goto(link)
    await page.waitForURL(/\/auth\/set-password/, { timeout: 15000 })
    check('초대 링크 → 비밀번호 설정 화면', page.url().includes('/auth/set-password'))
    await page.getByLabel('새 비밀번호', { exact: true }).fill('short1')
    await page.getByLabel('새 비밀번호 확인').fill('short1')
    await page.getByRole('button', { name: '비밀번호 저장' }).click()
    check('약한 비밀번호 거절', await visible(page.getByText(/10자 이상이어야/)))
    await page.getByLabel('새 비밀번호', { exact: true }).fill('newpass12345')
    await page.getByLabel('새 비밀번호 확인').fill('newpass12345')
    await page.getByRole('button', { name: '비밀번호 저장' }).click()
    await page.waitForURL('**/admin', { timeout: 15000 })
    check('비밀번호 설정 후 대시보드 진입', await visible(page.getByRole('heading', { name: '대시보드' })))
    check('직원에게 설정 메뉴 숨김', await hidden(page.getByRole('link', { name: /설정·직원 관리/ })))
    await page.goto(`${BASE}/admin/settings/staff`)
    check('직원이 직원 관리 주소 직접 접근 → 권한 없음', await visible(page.getByText('접근 권한이 없습니다')))
    await page.close()

    const page2 = await browser.newPage()
    track(page2)
    await login(page2, invitedEmail, 'newpass12345')
    await page2.waitForURL('**/admin')
    check('새 비밀번호로 재로그인', await visible(page2.getByRole('heading', { name: '대시보드' })))
    await page2.close()
  }

  // 4) 현지 팀 메뉴 + 모바일 화면(375px)
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
    track(page)
    await login(page, 'viewer@dev.local')
    await page.waitForURL('**/admin')
    await page.getByRole('button', { name: '메뉴 열기' }).click()
    check('현지 팀: 등록생 메뉴 보임', await visible(page.getByRole('link', { name: /등록생/ })))
    check('현지 팀: 상담 신청 메뉴 숨김', await hidden(page.getByRole('link', { name: /상담 신청/ })))
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth)
    check('375px 가로 스크롤 없음(관리자 화면)', scrollW <= 375, `scrollWidth=${scrollW}`)
    await page.screenshot({ path: `${OUT}/m1-viewer-mobile.png` })
    await page.close()
  }

  // 5) 로그인 화면 모바일
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
    track(page)
    await page.goto(`${BASE}/login`)
    await visible(page.getByRole('button', { name: '로그인' }))
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth)
    check('375px 가로 스크롤 없음(로그인 화면)', scrollW <= 375, `scrollWidth=${scrollW}`)
    await page.screenshot({ path: `${OUT}/m1-login-mobile.png` })
    await page.close()
  }

  check('브라우저 스크립트 오류 없음', errors.length === 0, errors.join(' | '))
  await browser.close()
  console.log(results.join('\n'))
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0)
})().catch((e) => {
  console.log(results.join('\n'))
  console.error('E2E 중단:', e.message)
  process.exit(1)
})
