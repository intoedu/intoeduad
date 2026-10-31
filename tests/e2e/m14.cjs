// M14 브라우저 E2E: 학원별 통계(월별·기간·CSV) + 배포 형태 점검(빌드 결과 + _headers 보안 헤더·CSP 아래에서 신청서·여권·열람 동작, SPA 경로)
const { chromium } = require('playwright')
const { execFileSync, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const OUT = process.env.E2E_OUT || 'test-results'
fs.mkdirSync(OUT, { recursive: true })
const BASE = 'http://localhost:5173'
const PROD = 'http://127.0.0.1:4173'
const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const sql = (q) => execFileSync('psql', ['-qAt', DB, '-c', q], { encoding: 'utf8' }).trim()
const results = []
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`)
const visible = async (locator, timeout = 10000) => {
  try { await locator.first().waitFor({ state: 'visible', timeout }); return true } catch { return false }
}
async function login(page, base, email) {
  await page.goto(`${base}/login`)
  await page.getByLabel('이메일').fill(email)
  await page.getByLabel('비밀번호').fill('devpass1234')
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL('**/admin')
}
const agreeTo = (page, title) => page.getByRole('checkbox', { name: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) })

;(async () => {
  // 통계 데이터: 이번 달 대전 학원 상담 2(완료 1)·등록 1(확정)
  const month = sql(`select to_char(public.kst_today(), 'YYYY-MM')`)
  const partner = sql(`select id from partners where code = 'daejeon-into'`)
  sql(`insert into leads (partner_id, student_name, parent_name, parent_phone, status) values ('${partner}', '통계1', 'p', '01080000001', 'consulted'), ('${partner}', '통계2', 'p', '01080000002', 'new')`)
  sql(`insert into registrations (program_id, partner_id, student_name_ko, parent_name, parent_phone, status, destroy_due_date)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '${partner}', '통계1', 'p', '01080000001', 'confirmed', '2027-02-07')`)

  const browser = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } })
  const errors = []
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  await login(page, BASE, 'staff@dev.local')

  // 1) 학원별 통계
  await page.goto(`${BASE}/admin/partners`)
  await page.getByRole('link', { name: '학원별 통계' }).click()
  const row = page.getByRole('row', { name: '학원 통계 대전 인투학원' })
  check('이번 달 통계: 상담 2·완료 1·등록 1·확정 1', await visible(row) && (await row.innerText()).replace(/\s+/g, ' ').includes('2 1 1 1 0'), await row.innerText().catch(() => ''))
  check('등록 프로그램 표시', (await row.innerText()).includes('미국 스쿨링 캠프 (2027 겨울) 1명'))
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV' }).click()])
  const csv = fs.readFileSync(await dl.path(), 'utf8')
  check('통계 CSV(건수만, 개인정보 없음)', csv.includes('학원,지역,상담 신청,상담 완료,등록,등록 확정') && !csv.includes('통계1') && !csv.includes('010'))
  await page.getByRole('button', { name: '이전 달' }).click()
  check('이전 달로 이동하면 이번 달 건수 빠짐', await visible(page.getByText('이 기간에 신청·등록이 없습니다.')) || !(await page.getByRole('row', { name: '학원 통계 대전 인투학원' }).isVisible().catch(() => false)))
  await page.screenshot({ path: `${OUT}/m14-stats.png`, fullPage: true })
  void month

  // 2) 배포 형태: dist + _headers(CSP) 서버
  const server = spawn('node', [path.resolve(__dirname, '../support/pages-like-server.cjs'), path.resolve(__dirname, '../../dist')], { stdio: 'ignore' })
  await new Promise((r) => setTimeout(r, 800))
  try {
    const res = await fetch(`${PROD}/admin/anything/deep`)
    const html = await res.text()
    check('SPA: 없는 경로도 앱으로', res.status === 200 && html.includes('<div id="root">'))
    check('보안 헤더: X-Frame-Options·nosniff·CSP', res.headers.get('x-frame-options') === 'DENY' && res.headers.get('x-content-type-options') === 'nosniff' &&
      (res.headers.get('content-security-policy') ?? '').includes("frame-ancestors 'none'"))

    const pid = sql(`insert into programs (type, name, start_date, end_date, capacity, total_price, slug, passport_upload_enabled)
      values ('camp', 'CSP 캠프', public.kst_today() + 40, public.kst_today() + 60, 10, 1000000, 'csp-e2e', true) returning id`).split('\n')[0]
    sql(`insert into program_payment_rules (program_id, kind, label, amount, due_rule_type, due_offset_days) values ('${pid}', 'balance', '참가비', 1000000, 'after_registration', 7)`)
    sql(`update programs set status = 'open' where id = '${pid}'`)

    const csp = []
    const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } })
    mobile.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) csp.push(m.text()) })
    mobile.on('pageerror', (e) => errors.push(e.message))
    await mobile.goto(`${PROD}/register/csp-e2e`)
    check('CSP 아래 신청서 표시', await visible(mobile.getByRole('heading', { name: /CSP 캠프.*등록 신청/ })))
    await mobile.getByLabel('어디서 알게 되셨나요?').selectOption({ label: '해당 없음' })
    await mobile.getByLabel('학생 이름(한글)').fill('보안학생')
    await mobile.getByLabel(/영문 이름/).fill('SECURE KID')
    await mobile.getByLabel(/생년월일/).fill('2015-03-02')
    await mobile.getByText('남', { exact: true }).click()
    await mobile.getByLabel(/^학년/).selectOption('초6')
    await mobile.getByLabel('학부모 이름').fill('보안부모')
    await mobile.getByLabel('휴대폰 번호').fill('010-7777-1234')
    await mobile.getByLabel(/^이메일/).fill('p@example.com')
    await mobile.getByLabel('이름', { exact: true }).fill('아빠')
    await mobile.getByLabel('연락처', { exact: true }).fill('010-3333-4444')
    await mobile.getByText('지금 올리기', { exact: true }).click()
    // 확장자만 HEIC인 JPEG → 변환 도구(WebAssembly)를 불러 시도 → 실패하면 원본 그대로(서버가 형식 확인)
    await mobile.getByLabel('여권 사진 파일').setInputFiles({ name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: fs.readFileSync(path.resolve(__dirname, '../fixtures/passport-sample.jpg')) })
    for (const t of ['[필수] 1. 개인정보', '[필수] 2. 고유식별정보', '[필수] 3. 개인정보 제3자', '[필수] 5. 법정대리인', '[필수] 환불 규정 확인']) await agreeTo(mobile, t).check()
    await mobile.getByLabel('[필수] 개인정보 파기 안내를 확인했습니다.').check()
    await mobile.getByRole('button', { name: '등록 신청하기' }).click()
    check('CSP 아래 신청·여권 제출', await visible(mobile.getByText('여권 사진이 안전하게 제출되었습니다.'), 30000))
    const w = await mobile.evaluate(() => document.documentElement.scrollWidth)
    check('375px 가로 스크롤 없음(빌드 결과)', w <= 375, `scrollWidth=${w}`)

    const admin = await browser.newPage({ viewport: { width: 1366, height: 900 } })
    admin.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) csp.push(m.text()) })
    admin.on('pageerror', (e) => errors.push(e.message))
    await login(admin, PROD, 'admin@dev.local')
    const reg = sql(`select id from registrations where student_name_ko = '보안학생'`)
    await admin.goto(`${PROD}/admin/registrations/${reg}`)
    await admin.getByRole('button', { name: '열람' }).click()
    await admin.waitForTimeout(1500)
    const drawn = await admin.evaluate(() => document.querySelector('canvas[aria-label="워터마크가 들어간 여권 사진"]')?.width ?? 0)
    check('CSP 아래 여권 열람(blob·canvas)', drawn > 0, `width=${drawn}`)
    await admin.goto(`${PROD}/admin/calendar`)
    check('CSP 아래 관리자 화면(캘린더)', await visible(admin.getByRole('heading', { name: '통합 캘린더' })))
    check('CSP 위반 없음', csp.length === 0, csp.join(' | ').slice(0, 300))
  } finally {
    server.kill()
  }

  check('페이지 오류 없음', errors.length === 0, errors.join(' | '))
  await browser.close()
  console.log(results.join('\n'))
  const failed = results.filter((x) => x.startsWith('FAIL')).length
  console.log(`\n${results.length - failed}/${results.length} PASS`)
  process.exit(failed ? 1 : 0)
})().catch((e) => {
  console.error(e)
  console.log(results.join('\n'))
  process.exit(1)
})
