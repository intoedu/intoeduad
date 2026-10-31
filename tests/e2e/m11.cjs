// M11 브라우저 E2E: 개인정보 파기 — 대기 생성·[중요] 일정·예정일 지남 경고 → 프로그램명 확인 승인 → 즉시 파기(여권 파일 실제 삭제)
//                 → 보류(사유) → 예정일 전 승인 → 파기 기록 → 고객 확인 링크 → 예약 작업 경로(Vault·pg_net·러너 토큰)
const { chromium } = require('playwright')
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const OUT = process.env.E2E_OUT || 'test-results'
fs.mkdirSync(OUT, { recursive: true })
const BASE = 'http://localhost:5173'
const API = 'http://127.0.0.1:54321'
const KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'
const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const sql = (q) => execFileSync('psql', ['-qAt', DB, '-c', q], { encoding: 'utf8' }).trim()
const storage = (cmd) => execFileSync('docker', ['exec', 'supabase_storage_intoedu-crm', 'sh', '-c', cmd], { encoding: 'utf8' }).trim()
const env = Object.fromEntries(fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/.env'), 'utf8').split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)))
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
  // 7일 전 끝난 캠프(예정일 2일 전) — 여권 사진 있음 / 어제 끝난 캠프(예정일 4일 뒤) / 1년 지난 상담
  const oldP = sql(`insert into programs (type, name, season, start_date, end_date, total_price, slug, passport_upload_enabled)
    values ('camp', '가을 캠프', '2026', public.kst_today() - 30, public.kst_today() - 7, 0, 'autumn-e2e', true) returning id`).split('\n')[0]
  const newP = sql(`insert into programs (type, name, start_date, end_date, total_price, slug)
    values ('camp', '겨울 캠프', public.kst_today() - 20, public.kst_today() - 1, 0, 'winter-e2e') returning id`).split('\n')[0]
  const reg = sql(`insert into registrations (program_id, student_name_ko, parent_name, parent_phone, parent_email, status, passport_status, destroy_due_date)
    values ('${oldP}', '파기학생', '파기부모', '01090000001', 'p@x.com', 'confirmed', 'pending', public.kst_today() + 30) returning id`).split('\n')[0]
  sql(`insert into registrations (program_id, student_name_ko, parent_name, parent_phone, status, destroy_due_date)
    values ('${newP}', '대기학생', '대기부모', '01090000002', 'confirmed', public.kst_today() + 4)`)
  sql(`insert into leads (student_name, parent_name, parent_phone, status, destroy_due_date) values ('오래된상담', '상담부모', '01090000003', 'closed', public.kst_today() - 1)`)
  sql(`insert into registration_health_notes select '${reg}', '갑각류 알레르기'`)
  sql(`insert into access_tokens (token_hash, purpose, registration_id, expires_at) values (encode(extensions.digest('m11-my-token-abcdefghijk', 'sha256'), 'hex'), 'my_view', '${reg}', now() + interval '30 days')`)
  // 여권 업로드(파기 예정일 전) → 예정일을 지난 날짜로
  const form = new FormData()
  form.append('token', 'm11-my-token-abcdefghijk')
  form.append('consent', 'true')
  form.append('file', new Blob([fs.readFileSync(path.resolve(__dirname, '../fixtures/passport-sample.jpg'))], { type: 'image/jpeg' }), 'p.jpg')
  const up = await fetch(`${API}/functions/v1/passport-upload`, { method: 'POST', headers: { apikey: KEY }, body: form })
  check('준비: 여권 업로드', up.status === 200)
  const objPath = sql(`select storage_path from passport_files where registration_id = '${reg}'`)
  sql(`update registrations set destroy_due_date = public.kst_today() - 2 where id = '${reg}'`)

  const browser = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } })
  const errors = []
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  page.on('pageerror', (e) => errors.push(e.message))
  let answer = '분쟁 대응 중'
  page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? answer : undefined))
  await login(page, 'admin@dev.local')

  // 1) 대기 생성 + 경고
  await page.goto(`${BASE}/admin/destruction`)
  await page.getByRole('button', { name: '지금 확인·실행' }).click()
  check('대기 목록 생성(3건)', await visible(page.getByText('대기 목록 갱신 3건 추가', { exact: false })))
  check('예정일 지남 경고', await visible(page.getByText('승인하지 않은 개인정보가', { exact: false })))
  check('[중요] 파기 승인 일정 생성', sql(`select count(*) from important_events where category = 'privacy_destruction' and priority = 'critical'`) === '3')
  await page.screenshot({ path: `${OUT}/m11-waiting.png`, fullPage: true })

  // 2) 가을 캠프: 확인 문구 → 승인 → 예정일 지남이라 즉시 파기
  const autumn = page.getByRole('region', { name: '파기 그룹 가을 캠프 (2026)' })
  await autumn.getByRole('button', { name: '파기 승인' }).click()
  await autumn.getByLabel('확인 문구').fill('가을')
  check('확인 문구가 다르면 승인 불가', await autumn.getByRole('button', { name: '승인', exact: true }).isDisabled())
  await autumn.getByLabel('확인 문구').fill('가을 캠프')
  await autumn.getByRole('button', { name: '승인', exact: true }).click()
  check('승인 → 즉시 파기', await visible(page.getByText('바로 파기했습니다(완료 1, 실패 0)', { exact: false }), 20000))
  check('DB: 등록 개인정보 파기', sql(`select coalesce(student_name_ko,'') || coalesce(parent_phone,'') || '|' || (destroyed_at is not null) from registrations where id = '${reg}'`) === '|true')
  check('DB: 건강 정보 삭제', sql(`select count(*) from registration_health_notes where registration_id = '${reg}'`) === '0')
  check('DB: 여권 파일 파기 기록 + 자동 파기 접근 기록', sql(`select deleted_reason from passport_files where storage_path = '${objPath}'`) === 'destruction' &&
    sql(`select count(*) from passport_access_logs where registration_id = '${reg}' and action = 'auto_delete'`) === '1')
  check('저장소: 여권 파일 실제 삭제', storage(`find /mnt/stub/stub/passports/${objPath} -type f 2>/dev/null | wc -l`) === '0')
  check('DB: [중요] 일정 완료 처리', sql(`select done_at is not null from important_events where program_id = '${oldP}' and category = 'privacy_destruction'`) === 't')

  // 3) 상담 신청: 보류(사유)
  const lead = page.getByRole('listitem', { name: '파기 대상 오래된상담' })
  await lead.getByRole('button', { name: '보류' }).click()
  check('보류(사유)', await visible(page.getByText('보류: 분쟁 대응 중')))

  // 4) 겨울 캠프: 예정일 전 승인 → 예정일에 파기
  const winter = page.getByRole('region', { name: '파기 그룹 겨울 캠프' })
  await winter.getByRole('button', { name: '파기 승인' }).click()
  await winter.getByLabel('확인 문구').fill('겨울 캠프')
  await winter.getByRole('button', { name: '승인', exact: true }).click()
  check('예정일 전 승인 → 자동 파기 예약', await visible(page.getByText('에 자동으로 파기됩니다.', { exact: false })))
  check('DB: 아직 파기 안 됨', sql(`select destroyed_at is null from registrations where student_name_ko = '대기학생'`) === 't')

  // 5) 파기 기록
  await page.getByRole('tab', { name: /파기 기록/ }).click()
  check('파기 기록: 항목', await visible(page.getByText('등록 개인정보, 여권 파일 1개, 건강 정보')))
  await page.screenshot({ path: `${OUT}/m11-done.png`, fullPage: true })

  // 6) 고객 확인 링크는 파기와 함께 삭제
  const parent = await browser.newPage({ viewport: { width: 375, height: 812 } })
  await parent.goto(`${BASE}/my/m11-my-token-abcdefghijk`)
  check('고객 확인 링크 무효', await visible(parent.getByText('링크가 올바르지 않거나 만료되었습니다.')))

  // 7) 직원: 열람만
  const staff = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  await login(staff, 'staff@dev.local')
  await staff.goto(`${BASE}/admin/destruction`)
  check('직원: 승인 버튼 없음', await visible(staff.getByText('승인·보류는 관리자만 할 수 있습니다.')) && (await staff.getByRole('button', { name: '파기 승인' }).count()) === 0)

  // 8) 예약 작업 경로: 러너 토큰 확인 → Vault에 주소·키·토큰 저장 후 DB에서 호출
  const bad = await fetch(`${API}/functions/v1/destruction-run`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'x-runner-token': 'wrong' } })
  check('러너: 잘못된 토큰 거부', bad.status === 403)
  const good = await fetch(`${API}/functions/v1/destruction-run`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'x-runner-token': env.DESTRUCTION_RUNNER_TOKEN } })
  check('러너: 토큰으로 실행', good.status === 200)
  check('예약 작업 등록(매일 KST 00:20)', sql(`select schedule from cron.job where jobname = 'privacy-destruction-daily'`) === '20 15 * * *')
  check('Vault 미설정이면 호출 안 함', sql(`select public.invoke_destruction_runner() is null`) === 't')
  sql(`select vault.create_secret('http://api.supabase.internal:8000', 'project_url'); select vault.create_secret('${KEY}', 'publishable_key'); select vault.create_secret('${env.DESTRUCTION_RUNNER_TOKEN}', 'destruction_runner_token')`)
  const reqId = sql(`select public.invoke_destruction_runner()`)
  let status = ''
  for (let i = 0; i < 20 && !status; i++) {
    await new Promise((r) => setTimeout(r, 500))
    status = sql(`select coalesce(status_code::text, '') from net._http_response where id = ${reqId}`)
  }
  check('DB → 러너 호출(pg_net) 200', status === '200', status)

  check('페이지 오류 없음', errors.length === 0, errors.join(' | '))
  await browser.close()
  console.log(results.join('\n'))
  const failed = results.filter((r) => r.startsWith('FAIL')).length
  console.log(`\n${results.length - failed}/${results.length} PASS`)
  process.exit(failed ? 1 : 0)
})().catch((e) => {
  console.error(e)
  console.log(results.join('\n'))
  process.exit(1)
})
