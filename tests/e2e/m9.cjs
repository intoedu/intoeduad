// M9 브라우저 E2E: 등록생·납부·환불 — 목록·필터·CSV → 접수 확인 → 납부 기록(자동 상태) → 소개 경로 확인 → 등록 확정
//                → 무효 처리 → 금액 변경(사유·정정 안내) → 취소(환불 예상액)·환불 완료 → 대기 승격 → 납부·환불 화면 → 현지 팀 화면
const { chromium } = require('playwright')
const { execFileSync } = require('child_process')
const fs = require('fs')
const OUT = process.env.E2E_OUT || 'test-results'
fs.mkdirSync(OUT, { recursive: true })
const BASE = 'http://localhost:5173'
const API = 'http://127.0.0.1:54321'
const KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'
const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const sql = (q) => execFileSync('psql', ['-qAt', DB, '-c', q], { encoding: 'utf8' }).trim()
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
async function apply(name, phone) {
  const r = await fetch(`${API}/functions/v1/public-register`, {
    method: 'POST',
    headers: { apikey: KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'submit', slug: 'pay-e2e', partner_code: 'daejeon-into', student_name_ko: name, student_name_en: 'TEST STUDENT', birth_date: '2015-01-01',
      gender: 'female', grade: '초6', parent_name: `${name}엄마`, parent_phone: phone, parent_email: 'p@example.com', emergency_name: '아빠',
      emergency_phone: '01099998888', health_notes: '', agree: { reg_privacy: true, reg_third_party: true, reg_guardian: true, refund: true, destruction_notice: true },
    }),
  })
  return (await r.json()).status
}
const schedule = (page, label) => page.getByRole('listitem', { name: `납부 일정 ${label}` })
async function pay(page, label, amount) {
  await schedule(page, label).getByRole('button', { name: '납부 기록' }).click()
  await schedule(page, label).getByLabel('납부 금액').fill(String(amount))
  await schedule(page, label).getByRole('button', { name: '기록', exact: true }).click()
  await page.getByText('납부를 기록했습니다', { exact: false }).first().waitFor({ timeout: 8000 })
}
const badge = (page) => page.locator('h1').locator('xpath=../..').getByText(/신청 접수|예약금 대기|예약금 완료|잔금 대기|등록 확정|대기|취소|환불/).first()

;(async () => {
  const pid = sql(`insert into programs (type, name, season, country, start_date, end_date, capacity, total_price, slug, waitlist_enabled, refund_rules)
    values ('camp', '여름 영어 캠프', '2027 여름', '필리핀', public.kst_today() + 20, public.kst_today() + 40, 2, 5000000, 'pay-e2e', true,
    '[{"min_days":30,"max_days":null,"rate":0},{"min_days":20,"max_days":29,"rate":0.1},{"min_days":10,"max_days":19,"rate":0.15},{"min_days":null,"max_days":9,"rate":0.3}]') returning id`).split('\n')[0]
  sql(`insert into program_payment_rules (program_id, kind, label, amount, due_rule_type, due_offset_days)
    values ('${pid}', 'deposit', '예약금', 1000000, 'after_registration', 3), ('${pid}', 'balance', '잔금', 4000000, 'before_start', 10)`)
  sql(`update programs set status = 'open' where id = '${pid}'`)
  check('신청 3건(정원 2 + 대기 1)', [await apply('가나다', '01020000001'), await apply('라마바', '01020000002'), await apply('사아자', '01020000003')].join(',') === 'received,received,waitlisted')
  const [a, b, c] = ['가나다', '라마바', '사아자'].map((n) => sql(`select id from registrations where student_name_ko = '${n}'`))
  // 현지 팀 담당 프로그램(시드 us-schooling) 등록생
  sql(`insert into registrations (program_id, student_name_ko, student_name_en, parent_name, parent_phone, special_notes, destroy_due_date, status)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '현지학생', 'LOCAL KID', '현지부모', '01033334444', '채식', '2027-02-07', 'confirmed') returning id`)
  sql(`insert into registration_health_notes select id, '갑각류 알레르기' from registrations where student_name_ko = '현지학생'`)

  const browser = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } })
  const errors = []
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, acceptDownloads: true })
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('dialog', (d) => d.accept())
  await login(page, 'staff@dev.local')

  // 1) 목록·필터·CSV
  await page.goto(`${BASE}/admin/registrations?program=${pid}`)
  check('목록: 3명', await visible(page.getByText('3명')))
  check('목록: 소개 학원 표시', (await page.getByRole('cell', { name: '대전 인투학원' }).count()) === 3)
  await page.getByLabel('상태').selectOption('waitlisted')
  check('상태 필터: 대기 1명', await visible(page.getByText('1명')))
  await page.getByLabel('상태').selectOption('active')
  await page.getByLabel('검색(이름·번호)').fill('0002')
  check('번호 검색', await visible(page.getByRole('link', { name: '라마바' })) && (await page.getByRole('link', { name: '가나다' }).count()) === 0)
  await page.getByLabel('검색(이름·번호)').fill('')
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '명단 CSV (여권·건강 정보 제외)' }).click()])
  const csv = fs.readFileSync(await dl.path(), 'utf8')
  check('CSV: BOM·헤더', csv.charCodeAt(0) === 0xfeff && csv.includes('학생(한글),영문 이름'))
  check('CSV: 여권 이미지·건강 정보·커미션 없음', !/건강|커미션|passport_files/.test(csv.split('\r\n')[0]) && csv.includes('가나다'))

  // 2) 가나다: 접수 확인 → 예약금 → 잔금 대기(D-14) → 완납 → 소개 경로 확인 → 확정
  await page.goto(`${BASE}/admin/registrations/${a}`)
  check('상세: 신청 접수', await visible(page.getByText('신청 접수').first()))
  await page.getByRole('button', { name: '접수 확인' }).click()
  check('접수 확인 → 예약금 대기', await visible(page.getByText('예약금 대기').first()))
  await pay(page, '예약금', 400000)
  check('일부 납부 표시', await visible(schedule(page, '예약금').getByText('일부 납부')))
  await pay(page, '예약금', 600000)
  check('예약금 완납 + 잔금 기한 14일 이내 → 잔금 대기', sql(`select status from registrations where id = '${a}'`) === 'balance_pending')
  await pay(page, '잔금', 4000000)
  check('완납·소개 경로 확인 안내', await visible(page.getByText('아래 소개 경로를 확인 처리하면 "등록 확정"이 됩니다.', { exact: false })))
  check('DB: 확인 전에는 확정 아님', sql(`select status from registrations where id = '${a}'`) === 'balance_pending')
  await page.getByRole('button', { name: '소개 경로 확인 처리' }).click()
  check('소개 경로 확인 → 등록 확정', await visible(page.getByText('등록 확정').first()) && sql(`select status from registrations where id = '${a}'`) === 'confirmed')
  await page.screenshot({ path: `${OUT}/m9-detail.png`, fullPage: true })

  // 3) 무효 처리 → 상태 재계산
  await schedule(page, '잔금').getByRole('button', { name: '무효 처리' }).click()
  check('무효 처리', await visible(page.getByText('납부 기록을 무효 처리했습니다.')))
  check('무효 → 잔금 대기로 되돌림', sql(`select status from registrations where id = '${a}'`) === 'balance_pending')
  check('무효 기록 남음(취소선)', await visible(schedule(page, '잔금').getByText('(무효 · 행정직원(개발))')))

  // 4) 금액 변경: 사유 필수 → 정정 안내 필요
  await schedule(page, '잔금').getByRole('button', { name: '금액·기한 변경' }).click()
  await schedule(page, '잔금').getByLabel('금액', { exact: true }).fill('3800000')
  check('사유 없으면 저장 불가', await schedule(page, '잔금').getByRole('button', { name: '변경 저장' }).isDisabled())
  await schedule(page, '잔금').getByLabel('바꾸는 이유(필수, 기록됨)').fill('숙소 변경 감액')
  await schedule(page, '잔금').getByRole('button', { name: '변경 저장' }).click()
  check('정정 안내 필요 표시', await visible(page.getByText('학부모에게 정정 안내를 1회 보내 주세요.', { exact: false })))
  check('변경 사유 표시', await visible(page.getByText('변경 사유: 숙소 변경 감액', { exact: false })))
  await page.getByRole('button', { name: '+ 추가 납부 항목' }).click()
  await page.getByLabel('추가 납부 항목').fill('항공권')
  await page.getByLabel('금액', { exact: true }).last().fill('1500000')
  await page.getByRole('button', { name: '추가', exact: true }).click()
  check('추가 납부 항목', await visible(page.getByRole('listitem', { name: '납부 일정 항공권' })))

  // 5) 라마바: 예약금 납부 후 취소(출국 20일 전, 10% 공제) → 환불 완료
  await page.goto(`${BASE}/admin/registrations/${b}`)
  await page.getByRole('button', { name: '접수 확인' }).click()
  await page.getByText('예약금 대기').first().waitFor()
  await pay(page, '예약금', 1000000)
  await page.getByRole('button', { name: '취소 처리' }).click()
  check('환불 예상액 미리보기(100만 - 500만×10%)', await visible(page.getByLabel('환불 예상액').getByText('환불 예상액 500,000원')))
  await page.getByRole('button', { name: '취소 확정' }).click()
  check('취소 완료', await visible(page.getByText('취소했습니다.', { exact: false })))
  check('환불 대기 표시', await visible(page.getByText('환불 대기')))
  await page.getByRole('button', { name: '환불 완료 처리' }).click()
  check('환불 완료 → 환불 상태', await visible(page.getByText('환불 완료로 처리했습니다.')) && sql(`select status from registrations where id = '${b}'`) === 'refunded')

  // 6) 사아자: 대기 승격(자리 생김) → 납부 일정 생성
  await page.goto(`${BASE}/admin/registrations/${c}`)
  check('대기: 납부 일정 없음', await visible(page.getByText('납부 일정이 없습니다', { exact: false })))
  await page.getByRole('button', { name: '대기 승격' }).click()
  check('대기 승격', await visible(page.getByText('대기에서 등록으로 승격했습니다', { exact: false })))
  check('승격 후 납부 일정', await visible(page.getByRole('listitem', { name: '납부 일정 예약금' })))

  // 7) 납부·환불 화면
  sql(`update payment_schedules set due_date = public.kst_today() - 2 where registration_id = '${c}' and kind = 'deposit'`)
  await page.goto(`${BASE}/admin/payments`)
  check('기한 지남 목록', await visible(page.getByRole('link', { name: '사아자' })))
  await page.getByRole('button', { name: '미납 전체' }).click()
  check('미납 전체', await visible(page.getByRole('link', { name: '가나다' })))
  await page.getByRole('tab', { name: '월별 납부 합계' }).click()
  check('월별 합계(무효 제외 200만)', await visible(page.getByText('2,000,000원').first()))
  await page.getByRole('tab', { name: '환불' }).click()
  check('환불 목록', await visible(page.getByText('확정 500,000원')))
  await page.screenshot({ path: `${OUT}/m9-payments.png`, fullPage: true })

  // 8) 현지 팀
  const viewer = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  viewer.on('pageerror', (e) => errors.push(e.message))
  await login(viewer, 'viewer@dev.local')
  await viewer.goto(`${BASE}/admin/registrations`)
  check('현지 팀: 담당 프로그램 등록생', await visible(viewer.getByText('현지학생')))
  check('현지 팀: 건강 특이사항 보임', await visible(viewer.getByText('갑각류 알레르기')))
  check('현지 팀: 다른 프로그램·납부 정보 없음', (await viewer.getByText('가나다').count()) === 0 && (await viewer.getByText(/[0-9,]+원/).count()) === 0)
  await viewer.getByRole('button', { name: '메모' }).click()
  check('현지 팀: 메모 작성 칸', await visible(viewer.getByRole('textbox')))
  await viewer.goto(`${BASE}/admin/registrations/${a}`)
  await viewer.waitForTimeout(800)
  check('현지 팀: 등록생 상세(납부) 접근 불가', (await viewer.getByText('납부 기록').count()) === 0)
  await viewer.screenshot({ path: `${OUT}/m9-viewer.png`, fullPage: true })

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
