// 임시 비밀번호 계정: 첫 로그인 시 비밀번호 변경 강제 → 이후 정상 이용, 관리자의 직원 이름 수정
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

;(async () => {
  // 운영에서 첫 관리자를 만드는 것과 같은 방식(SQL)으로 임시 비밀번호 계정 생성
  sql(`do $$
  declare v uuid := gen_random_uuid();
  begin
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', v, 'authenticated', 'authenticated', 'first@dev.local',
      extensions.crypt('TempPass2026x', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v, v::text, jsonb_build_object('sub', v::text, 'email', 'first@dev.local', 'email_verified', true), 'email', now(), now(), now());
    insert into public.staff_profiles (id, name, email, role, must_change_password) values (v, '관리자', 'first@dev.local', 'admin', true);
  end $$;`)

  const browser = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } })
  const errors = []
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto(`${BASE}/login`)
  await page.getByLabel('이메일').fill('first@dev.local')
  await page.getByLabel('비밀번호').fill('TempPass2026x')
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL(/\/auth\/set-password/, { timeout: 15000 })
  check('첫 로그인 → 비밀번호 변경 화면으로 이동', true)
  check('임시 비밀번호 변경 안내', await visible(page.getByText('처음 로그인하셨습니다', { exact: false })))

  // 바꾸기 전에는 관리자 화면으로 갈 수 없음
  await page.goto(`${BASE}/admin/partners`)
  await page.waitForURL(/\/auth\/set-password/, { timeout: 15000 })
  check('비밀번호 변경 전 관리자 화면 접근 차단', true)

  await page.getByLabel('새 비밀번호', { exact: true }).fill('MyNewPass2026')
  await page.getByLabel('새 비밀번호 확인').fill('MyNewPass2026')
  await page.getByRole('button', { name: '비밀번호 저장' }).click()
  await page.waitForURL('**/admin', { timeout: 15000 })
  check('변경 후 대시보드 진입', await visible(page.getByRole('heading', { name: '대시보드' })))
  check('DB: 변경 필요 표시 해제', sql(`select must_change_password from staff_profiles where email = 'first@dev.local'`) === 'f')
  await page.reload()
  check('새로고침해도 대시보드 유지', await visible(page.getByRole('heading', { name: '대시보드' })))

  // 관리자: 본인 이름 수정
  await page.goto(`${BASE}/admin/settings/staff`)
  const nameInput = page.getByLabel('이름').first()
  await visible(nameInput)
  const rows = page.locator('div.rounded-xl', { hasText: 'first@dev.local' })
  await rows.getByLabel('이름').fill('홍대표')
  await rows.getByLabel('이름').blur()
  check('직원 이름 수정', await visible(page.getByText('홍대표님의 정보를 변경했습니다.', { exact: false })))
  check('DB: 이름 반영', sql(`select name from staff_profiles where email = 'first@dev.local'`) === '홍대표')

  // 새 비밀번호로 재로그인 (임시 비밀번호는 더 이상 안 됨)
  await page.getByRole('button', { name: '로그아웃' }).click()
  await page.goto(`${BASE}/login`)
  await page.getByLabel('이메일').fill('first@dev.local')
  await page.getByLabel('비밀번호').fill('TempPass2026x')
  await page.getByRole('button', { name: '로그인' }).click()
  check('임시 비밀번호는 더 이상 사용 불가', await visible(page.getByText('이메일 또는 비밀번호가 올바르지 않습니다.')))
  await page.getByLabel('비밀번호').fill('MyNewPass2026')
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL('**/admin')
  check('새 비밀번호로 로그인', await visible(page.getByRole('heading', { name: '대시보드' })))

  check('브라우저 스크립트 오류 없음', errors.length === 0, errors.join(' | '))
  await browser.close()
  console.log(results.join('\n'))
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0)
})().catch((e) => {
  console.log(results.join('\n'))
  console.error('E2E 중단:', e.message.split('\n')[0])
  process.exit(1)
})
