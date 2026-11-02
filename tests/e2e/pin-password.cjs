// 비밀번호 최소 4자(숫자만 가능): 임시 비밀번호로 첫 로그인 → 4자리 숫자로 변경 → 그 4자리로 다시 로그인, 3자리는 거부
const { chromium } = require('playwright')
const { execFileSync } = require('child_process')
const BASE = 'http://localhost:5173'
const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const sql = (q) => execFileSync('psql', ['-qAt', DB, '-c', q], { encoding: 'utf8' }).trim()
const results = []
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`)
const visible = async (locator, timeout = 10000) => {
  try { await locator.first().waitFor({ state: 'visible', timeout }); return true } catch { return false }
}
async function login(page, id, pw) {
  await page.goto(`${BASE}/login`)
  await page.getByLabel('아이디 또는 이메일').fill(id)
  await page.getByLabel('비밀번호').fill(pw)
  await page.getByRole('button', { name: '로그인' }).click()
}
;(async () => {
  sql(`delete from public.staff_profiles where email = 'pin.test@staff.intoedu.invalid'; delete from auth.users where email = 'pin.test@staff.intoedu.invalid';`)
  sql(`do $$ declare v uuid := gen_random_uuid(); begin
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', v, 'authenticated', 'authenticated', 'pin.test@staff.intoedu.invalid', extensions.crypt('TempPass2026x', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
    values (gen_random_uuid(), v, v::text, jsonb_build_object('sub', v::text, 'email', 'pin.test@staff.intoedu.invalid', 'email_verified', true), 'email', now(), now());
    insert into public.staff_profiles (id, name, email, role, must_change_password) values (v, '핀', 'pin.test@staff.intoedu.invalid', 'staff', true);
  end $$;`)
  const browser = await chromium.launch()
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await login(page, 'pin.test', 'TempPass2026x')
  await page.waitForURL('**/auth/set-password', { timeout: 15000 }).catch(() => {})
  check('임시 비밀번호로 첫 로그인 → 변경 화면', page.url().endsWith('/auth/set-password'))
  check('안내: 4자 이상 (숫자만도 가능)', await visible(page.getByText('4자 이상 (숫자만도 가능)')))
  check('아이디만 표시(내부 주소 숨김)', await visible(page.getByText('pin.test 계정의 비밀번호를 설정합니다.')))
  await page.getByLabel('새 비밀번호', { exact: true }).fill('123')
  await page.getByLabel('새 비밀번호 확인').fill('123')
  await page.getByRole('button', { name: '비밀번호 저장' }).click()
  check('3자리는 거부', await visible(page.getByText('비밀번호는 4자 이상이어야 합니다.')))
  await page.getByLabel('새 비밀번호', { exact: true }).fill('4826')
  await page.getByLabel('새 비밀번호 확인').fill('4826')
  await page.getByRole('button', { name: '비밀번호 저장' }).click()
  await page.waitForURL('**/admin', { timeout: 15000 }).catch(() => {})
  check('4자리 숫자 저장 → 관리 화면', page.url().endsWith('/admin'), page.url())
  await ctx.close()
  const p2 = await (await browser.newContext()).newPage()
  await login(p2, 'pin.test', '4826')
  await p2.waitForURL('**/admin', { timeout: 15000 }).catch(() => {})
  check('4자리로 다시 로그인', p2.url().endsWith('/admin'), p2.url())
  const p3 = await (await browser.newContext()).newPage()
  await login(p3, 'pin.test', '4827')
  check('틀린 4자리는 거부', await visible(p3.getByText('아이디(이메일) 또는 비밀번호가 올바르지 않습니다.')))
  const p4 = await (await browser.newContext()).newPage()
  await login(p4, 'pin.test', 'TempPass2026x')
  check('예전 임시 비밀번호 거부', await visible(p4.getByText('아이디(이메일) 또는 비밀번호가 올바르지 않습니다.')))
  await browser.close()
  console.log(results.join('\n'))
  const failed = results.filter((x) => x.startsWith('FAIL')).length
  console.log(`\n${results.length - failed}/${results.length} PASS`)
  process.exit(failed ? 1 : 0)
})().catch((e) => { console.log(results.join('\n')); console.error('E2E 중단:', e.message.split('\n')[0]); process.exit(1) })
