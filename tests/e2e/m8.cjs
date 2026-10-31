// M8 브라우저 E2E: 여권 사진 — 신청서에서 함께 제출(암호화 저장 확인) → 나중에 제출 링크 → 형식 거부
//                → 직원 열람(워터마크)·관리자 다운로드·권한 없는 직원 차단 → 삭제(실제 파일 삭제) → 접근 기록
const { chromium } = require('playwright')
const { execFileSync } = require('child_process')
const path = require('path')
const OUT = process.env.E2E_OUT || 'test-results'
require('fs').mkdirSync(OUT, { recursive: true })
const BASE = 'http://localhost:5173'
const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const sql = (q) => execFileSync('psql', ['-qAt', DB, '-c', q], { encoding: 'utf8' }).trim()
const storage = (cmd) => execFileSync('docker', ['exec', 'supabase_storage_intoedu-crm', 'sh', '-c', cmd], { encoding: 'utf8' }).trim()
const results = []
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`)
const visible = async (locator, timeout = 10000) => {
  try { await locator.first().waitFor({ state: 'visible', timeout }); return true } catch { return false }
}
const JPG = path.resolve(__dirname, '../fixtures/passport-sample.jpg')
const PNG = path.resolve(__dirname, '../fixtures/passport-sample.png')

async function login(page, email) {
  await page.goto(`${BASE}/login`)
  await page.getByLabel('이메일').fill(email)
  await page.getByLabel('비밀번호').fill('devpass1234')
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL('**/admin')
}
const agreeTo = (page, title) => page.getByRole('checkbox', { name: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) })

async function fillAndAgree(page, ko, phone) {
  await page.getByLabel('어디서 알게 되셨나요?').selectOption({ label: '해당 없음' })
  await page.getByLabel('학생 이름(한글)').fill(ko)
  await page.getByLabel(/영문 이름/).fill('HONG GILDONG')
  await page.getByLabel(/생년월일/).fill('2015-03-02')
  await page.getByText('남', { exact: true }).click()
  await page.getByLabel(/^학년/).selectOption('초6')
  await page.getByLabel('학부모 이름').fill('홍엄마')
  await page.getByLabel('휴대폰 번호').fill(phone)
  await page.getByLabel(/^이메일/).fill('mom@example.com')
  await page.getByLabel('이름', { exact: true }).fill('홍아빠')
  await page.getByLabel('연락처', { exact: true }).fill('010-3333-4444')
  await agreeTo(page, '[필수] 1. 개인정보').check()
  await agreeTo(page, '[필수] 2. 고유식별정보').check()
  await agreeTo(page, '[필수] 3. 개인정보 제3자').check()
  await agreeTo(page, '[필수] 5. 법정대리인').check()
  await agreeTo(page, '[필수] 환불 규정 확인').check()
  await page.getByLabel('[필수] 개인정보 파기 안내를 확인했습니다.').check()
}

;(async () => {
  const start = sql(`select (public.kst_today() + 60)::text`)
  const pid = sql(`insert into programs (type, name, season, country, start_date, end_date, capacity, total_price, slug, passport_upload_enabled)
    values ('camp', '미국 스쿨링 캠프', '2027 겨울', '미국', '${start}', '${start}'::date + 25, 10, 5000000, 'pp-e2e', true) returning id`).split('\n')[0]
  sql(`insert into program_payment_rules (program_id, kind, label, amount, due_rule_type, due_offset_days)
    values ('${pid}', 'balance', '참가비', 5000000, 'after_registration', 7)`)
  sql(`update programs set status = 'open' where id = '${pid}'`)

  const browser = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } })
  const errors = []
  const parent = await browser.newPage({ viewport: { width: 375, height: 812 } })
  parent.on('pageerror', (e) => errors.push(e.message))

  // 1) 신청서에서 함께 제출
  await parent.goto(`${BASE}/register/pp-e2e`)
  await fillAndAgree(parent, '홍길동', '010-1111-2222')
  await parent.getByRole('button', { name: '등록 신청하기' }).click()
  check('여권 제출 방법 선택 요구', await visible(parent.getByText('여권 사진을 지금 올리실지, 나중에 제출하실지 골라 주세요.')))
  await parent.getByText('지금 올리기', { exact: true }).click()
  check('카메라 촬영 버튼', await visible(parent.getByRole('button', { name: '카메라로 촬영' })))
  check('카메라 입력은 후면 카메라 바로 촬영', (await parent.locator('input[capture="environment"]').count()) === 1)
  await parent.getByLabel('여권 사진 파일').setInputFiles(JPG)
  check('선택한 사진 미리보기', await visible(parent.getByRole('img', { name: '선택한 여권 사진 미리보기' })))
  let w = await parent.evaluate(() => document.documentElement.scrollWidth)
  check('375px 가로 스크롤 없음', w <= 375, `scrollWidth=${w}`)
  await parent.getByRole('button', { name: '등록 신청하기' }).click()
  check('완료: 여권 제출됨', await visible(parent.getByText('여권 사진이 안전하게 제출되었습니다.'), 20000))
  const reg1 = sql(`select id from registrations where student_name_ko = '홍길동'`)
  check('DB: 여권 제출 상태', sql(`select passport_status from registrations where id = '${reg1}'`) === 'submitted')
  const objPath = sql(`select storage_path from passport_files where registration_id = '${reg1}' and deleted_at is null`)
  const head = storage(`f=$(find /mnt/stub/stub/passports/${objPath} -type f | head -1); head -c 3 "$f" | od -An -tx1`).replace(/\s/g, '')
  check('저장소: 암호문만 저장(JPEG 머리 없음)', head.length === 6 && head !== 'ffd8ff', head)
  check('저장소: 원본 글자 없음', storage(`grep -rc "PASSPORT SAMPLE" /mnt/stub/stub/passports/${objPath} || true`).split('\n').every((l) => l.endsWith(':0') || l === '0' || l === ''))

  // 2) 나중에 제출 → 여권 제출 페이지
  await parent.goto(`${BASE}/register/pp-e2e`)
  await fillAndAgree(parent, '김나중', '010-5555-6666')
  await parent.getByText('나중에 제출', { exact: true }).click()
  await parent.getByRole('button', { name: '등록 신청하기' }).click()
  check('완료: 나중에 제출 안내', await visible(parent.getByRole('link', { name: '여권 사진 올리기' }), 20000))
  await parent.getByRole('link', { name: '여권 사진 올리기' }).click()
  check('여권 제출 페이지: 동의 문구', await visible(parent.getByText('[필수] 2. 고유식별정보(여권) 수집·이용 동의')))
  await parent.getByRole('button', { name: '여권 사진 제출하기' }).click()
  check('동의·파일 없이 제출 불가', await visible(parent.getByText('동의해 주셔야 여권 사진을 올릴 수 있습니다.')))
  await parent.getByLabel('[필수] 위 내용을 확인하였으며 고유식별정보(여권) 수집·이용에 동의합니다.').check()
  await parent.getByLabel('여권 사진 파일').setInputFiles({ name: 'passport.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not really a pdf') })
  await parent.getByRole('button', { name: '여권 사진 제출하기' }).click()
  check('형식 위장 파일 거부(서버 확인)', await visible(parent.getByText('JPG·PNG·HEIC·PDF 파일만 올릴 수 있습니다.'), 15000))
  await parent.getByLabel('여권 사진 파일').setInputFiles(PNG)
  await parent.getByRole('button', { name: '여권 사진 제출하기' }).click()
  check('여권 제출 완료 화면', await visible(parent.getByRole('heading', { name: '여권 사진이 제출되었습니다' }), 20000))
  const reg2 = sql(`select id from registrations where student_name_ko = '김나중'`)
  check('DB: 나중 제출 → 제출 완료', sql(`select passport_status from registrations where id = '${reg2}'`) === 'submitted')
  check('DB: 업로드 화면 동의 기록', sql(`select count(*) from consent_records where registration_id = '${reg2}' and kind = 'reg_passport' and agreed`) === '2')

  // 3) 권한 없는 직원: 열람 불가
  const staff2 = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  await login(staff2, 'staff2@dev.local')
  await staff2.goto(`${BASE}/admin/registrations/${reg1}`)
  check('열람 권한 없는 직원: 안내만', await visible(staff2.getByText('여권 사진은 관리자가 열람 권한을 준 직원만 볼 수 있습니다.')))
  check('열람 권한 없는 직원: 열람 버튼 없음', (await staff2.getByRole('button', { name: '열람' }).count()) === 0)

  // 4) 권한 있는 직원: 열람(워터마크) — 다운로드 버튼 없음
  const staff = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  staff.on('pageerror', (e) => errors.push(e.message))
  await login(staff, 'staff@dev.local')
  await staff.goto(`${BASE}/admin/registrations/${reg1}`)
  check('직원: 다운로드 버튼 없음(관리자만)', await visible(staff.getByRole('button', { name: '열람' })) && (await staff.getByRole('button', { name: '다운로드(관리자)' }).count()) === 0)
  await staff.getByRole('button', { name: '열람' }).click()
  check('열람 화면 + 워터마크', await visible(staff.getByRole('dialog', { name: '여권 사진 열람' }).getByText('인투유학 내부용 · 행정직원(개발)', { exact: false })))
  await staff.waitForTimeout(800)
  const drawn = await staff.evaluate(() => {
    const c = document.querySelector('canvas[aria-label="워터마크가 들어간 여권 사진"]')
    return c ? c.width : 0
  })
  check('워터마크 이미지 그려짐', drawn === 900, `width=${drawn}`)
  await staff.screenshot({ path: `${OUT}/m8-view.png` })
  await staff.getByRole('button', { name: '닫기' }).click()
  await staff.getByRole('button', { name: '제출 링크 만들기' }).click()
  check('여권 제출 링크 생성(14일)', await visible(staff.getByText('14일 유효', { exact: false })))

  // 5) 관리자: 다운로드 + 삭제
  const admin = await browser.newPage({ viewport: { width: 1366, height: 900 }, acceptDownloads: true })
  admin.on('pageerror', (e) => errors.push(e.message))
  admin.on('dialog', (d) => d.accept())
  await login(admin, 'admin@dev.local')
  await admin.goto(`${BASE}/admin/registrations/${reg1}`)
  const [download] = await Promise.all([admin.waitForEvent('download'), admin.getByRole('button', { name: '다운로드(관리자)' }).click()])
  check('관리자 다운로드(워터마크 JPEG)', download.suggestedFilename().endsWith('.jpg'), download.suggestedFilename())
  await admin.getByLabel('삭제 사유').selectOption('consent_withdrawn')
  await admin.getByRole('button', { name: '여권 사진 삭제' }).click()
  check('삭제 완료', await visible(admin.getByText('여권 사진을 삭제했습니다.')))
  check('DB: 삭제 사유·상태', sql(`select deleted_reason || '|' || (select passport_status from registrations where id = '${reg1}') from passport_files where storage_path = '${objPath}'`) === 'consent_withdrawn|deleted')
  check('저장소: 파일 실제 삭제', storage(`find /mnt/stub/stub/passports/${objPath} -type f 2>/dev/null | wc -l`) === '0')

  // 6) 접근 기록
  await admin.goto(`${BASE}/admin/logs`)
  check('접근 기록: 열람', await visible(admin.getByRole('cell', { name: '행정직원(개발)' })))
  for (const a of ['업로드', '열람', '다운로드', '삭제']) check(`접근 기록: ${a}`, (await admin.getByText(a, { exact: true }).count()) > 0)
  check('DB: 동작별 기록', sql(`select string_agg(action, ',' order by id) from passport_access_logs where registration_id = '${reg1}'`) === 'upload,view,download,delete')
  check('DB: IP 기록', sql(`select count(*) from passport_access_logs where action = 'view' and ip is not null`) === '1')
  await admin.screenshot({ path: `${OUT}/m8-logs.png`, fullPage: true })
  await staff.goto(`${BASE}/admin/logs`)
  await staff.waitForTimeout(800)
  check('직원: 접근 기록 화면 차단', (await staff.getByText('여권 사진의 업로드·열람').count()) === 0)

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
