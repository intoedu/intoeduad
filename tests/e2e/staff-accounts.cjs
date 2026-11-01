// 직원 계정: 아이디 + 임시 비밀번호로 만들기 → 첫 로그인 비밀번호 변경 강제 → 임시 비밀번호 재발급 → 아이디 계정 비밀번호 찾기 안내
const { chromium } = require('playwright')
const { execFileSync } = require('child_process')
const OUT = process.env.E2E_OUT || 'test-results'
require('fs').mkdirSync(OUT, { recursive: true })
const BASE = 'http://localhost:5173'
const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const sql = (q) => execFileSync('psql', ['-qAt', DB, '-c', q], { encoding: 'utf8' }).trim()
const results = []
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`)
const visible = async (locator, timeout = 10000) => {
  try { await locator.first().waitFor({ state: 'visible', timeout }); return true } catch { return false }
}

async function login(page, id, password) {
  await page.goto(`${BASE}/login`)
  await page.getByLabel('아이디 또는 이메일').fill(id)
  await page.getByLabel('비밀번호').fill(password)
  await page.getByRole('button', { name: '로그인' }).click()
}

async function readPassword(page) {
  const el = page.getByLabel('임시 비밀번호')
  await el.waitFor({ state: 'visible', timeout: 15000 })
  for (let i = 0; i < 30; i++) {
    const t = ((await el.textContent()) ?? '').trim()
    if (t) return t
    await page.waitForTimeout(200)
  }
  return ''
}

;(async () => {
  const browser = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } })
  const errors = []

  // 1) 관리자: 아이디로 계정 만들기
  const actx = await browser.newContext({ viewport: { width: 1366, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] })
  const admin = await actx.newPage()
  admin.on('pageerror', (e) => errors.push(e.message))
  admin.on('dialog', (d) => d.accept())
  await login(admin, 'admin@dev.local', 'devpass1234')
  await admin.waitForURL('**/admin')
  check('기존 이메일 로그인 그대로 동작', true)
  await admin.goto(`${BASE}/admin/settings/staff`)
  await admin.getByRole('button', { name: '+ 직원 계정 추가' }).click()
  const form = admin.locator('form', { hasText: '직원 계정 추가' })
  await form.getByLabel('이름').fill('인솔 선생님')
  await form.getByLabel('아이디', { exact: true }).fill('Bad Id!')
  check('잘못된 아이디 형식 안내', await visible(form.getByText('아이디 형식을 확인해 주세요.')))
  await form.getByLabel('아이디', { exact: true }).fill('e2e.leader')
  await form.getByLabel('역할').selectOption('viewer')
  await form.getByLabel('소속 팀 (선택)').fill('캠프 인솔')
  await form.getByRole('button', { name: '계정 만들기' }).click()
  const temp1 = await readPassword(admin)
  check('임시 비밀번호 12자 표시(소문자·대문자·숫자 포함)', /^[A-Za-z0-9]{12}$/.test(temp1) && /[a-z]/.test(temp1) && /[A-Z]/.test(temp1) && /[0-9]/.test(temp1), `length=${temp1.length} ${JSON.stringify(temp1.replace(/[A-Za-z0-9]/g, '*'))}`)
  check('안내 카드에 아이디 표시', await visible(admin.getByText('e2e.leader', { exact: true })))
  await admin.getByRole('button', { name: '안내 문구 복사' }).click()
  const clip = await admin.evaluate(() => navigator.clipboard.readText())
  check('안내 문구 복사(주소·아이디·비밀번호)', clip.includes('/login') && clip.includes('아이디: e2e.leader') && clip.includes(temp1))
  const row = sql(`select role || '|' || coalesce(team,'') || '|' || must_change_password || '|' || can_view_passport from staff_profiles where email = 'e2e.leader@staff.intoedu.invalid'`)
  check('직원 정보 저장(현지 팀·캠프 인솔·첫 로그인 변경 필요)', row === 'viewer|캠프 인솔|true|false', row)
  check('목록에 "아이디:"로 표시', await visible(admin.getByText('아이디: e2e.leader')))
  await admin.screenshot({ path: `${OUT}/staff-accounts-created.png`, fullPage: true })

  // 같은 아이디 다시 만들기 → 거부
  await admin.getByRole('button', { name: '닫기' }).click()
  await admin.getByRole('button', { name: '+ 직원 계정 추가' }).click()
  const form2 = admin.locator('form', { hasText: '직원 계정 추가' })
  await form2.getByLabel('이름').fill('중복')
  await form2.getByLabel('아이디', { exact: true }).fill('e2e.leader')
  await form2.getByRole('button', { name: '계정 만들기' }).click()
  check('중복 아이디 거부', await visible(admin.getByText('이미 사용 중인 아이디입니다.')))

  // 2) 새 직원: 아이디로 첫 로그인 → 비밀번호 변경 강제
  const uctx = await browser.newContext({ viewport: { width: 375, height: 812 } })
  const user = await uctx.newPage()
  user.on('pageerror', (e) => errors.push(e.message))
  await login(user, 'E2E.Leader', temp1)
  await user.waitForURL('**/auth/set-password', { timeout: 15000 }).catch(() => {})
  check('아이디(대문자 섞여도)로 로그인 → 비밀번호 변경 화면', user.url().endsWith('/auth/set-password'), user.url())
  await user.getByLabel('새 비밀번호', { exact: true }).fill('newpass1234')
  await user.getByLabel('새 비밀번호 확인').fill('newpass1234')
  await user.getByRole('button', { name: '비밀번호 저장' }).click()
  await user.waitForURL('**/admin', { timeout: 15000 }).catch(() => {})
  check('새 비밀번호 저장 후 관리 화면', user.url().endsWith('/admin'), user.url())
  check('변경 필요 표시 해제', sql(`select must_change_password from staff_profiles where email = 'e2e.leader@staff.intoedu.invalid'`) === 'f')
  const w = await user.evaluate(() => document.documentElement.scrollWidth)
  check('375px 가로 스크롤 없음', w <= 375, `scrollWidth=${w}`)
  await uctx.close()

  // 3) 관리자: 임시 비밀번호 재발급
  await admin.goto(`${BASE}/admin/settings/staff`)
  const card = admin.locator('div', { has: admin.getByText('아이디: e2e.leader') }).filter({ has: admin.getByRole('button', { name: '임시 비밀번호 재발급' }) }).last()
  await card.getByRole('button', { name: '임시 비밀번호 재발급' }).click()
  const temp2 = await readPassword(admin).catch(async (e) => {
    await admin.screenshot({ path: `${OUT}/staff-accounts-reissue-fail.png`, fullPage: true })
    console.log('page alerts:', await admin.locator('[role=alert], .text-red-700').allInnerTexts())
    throw e
  })
  check('재발급 비밀번호는 이전과 다름', temp2 !== temp1 && /^[A-Za-z0-9]{12}$/.test(temp2))
  check('재발급 후 다시 변경 필요', sql(`select must_change_password from staff_profiles where email = 'e2e.leader@staff.intoedu.invalid'`) === 't')

  const u2 = await browser.newContext()
  const p2 = await u2.newPage()
  await login(p2, 'e2e.leader', 'newpass1234')
  check('예전 비밀번호는 거부', await visible(p2.getByText('아이디(이메일) 또는 비밀번호가 올바르지 않습니다.')))
  await login(p2, 'e2e.leader', temp2)
  await p2.waitForURL('**/auth/set-password', { timeout: 15000 }).catch(() => {})
  check('재발급 비밀번호로 로그인 → 변경 화면', p2.url().endsWith('/auth/set-password'))
  await u2.close()

  // 4) 아이디 계정 비밀번호 찾기 → 관리자 문의 안내(메일 발송 시도 없음)
  const u3 = await browser.newContext()
  const p3 = await u3.newPage()
  await p3.goto(`${BASE}/login`)
  await p3.getByRole('button', { name: '비밀번호를 잊으셨나요?' }).click()
  await p3.getByLabel('아이디 또는 이메일').fill('e2e.leader')
  await p3.getByRole('button', { name: '재설정 메일 받기' }).click()
  check('아이디 계정 비밀번호 찾기 → 관리자 문의 안내', await visible(p3.getByText('관리자(행정실)에게 임시 비밀번호 재발급을 요청해 주세요.', { exact: false })))
  await u3.close()

  // 5) 관리자가 아닌 직원은 함수 호출 불가(계정 만들기)
  const sctx = await browser.newContext()
  const staff = await sctx.newPage()
  await login(staff, 'staff@dev.local', 'devpass1234')
  await staff.waitForURL('**/admin')
  const status = await staff.evaluate(async () => {
    const key = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'))
    const token = key ? JSON.parse(localStorage.getItem(key)).access_token : ''
    const r = await fetch('http://127.0.0.1:54321/functions/v1/admin-staff', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'create_account', login_id: 'hacker', name: 'x', role: 'admin' }),
    })
    return r.status
  })
  check('일반 직원은 계정 만들기 불가(403)', status === 403, String(status))
  check('거부된 계정은 만들어지지 않음', sql(`select count(*) from auth.users where email = 'hacker@staff.intoedu.invalid'`) === '0')
  await sctx.close()

  await actx.close()
  check('브라우저 스크립트 오류 없음', errors.length === 0, errors.join(' | '))
  await browser.close()
  console.log(results.join('\n'))
  const failed = results.filter((x) => x.startsWith('FAIL')).length
  console.log(`\n${results.length - failed}/${results.length} PASS`)
  process.exit(failed ? 1 : 0)
})().catch((e) => {
  console.log(results.join('\n'))
  console.error('E2E 중단:', e.message.split('\n')[0])
  process.exit(1)
})
