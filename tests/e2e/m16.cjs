// M16 브라우저 E2E: 관리자·직원 직접 입력 — 상담 신청 직접 등록 → 고객 카드, 등록생 직접 추가(모집 전 캠프·학원 할인·필수 항목 안내) → 상세
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
async function login(page, id) {
  await page.goto(`${BASE}/login`)
  await page.getByLabel('아이디 또는 이메일').fill(id)
  await page.getByLabel('비밀번호').fill('devpass1234')
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL('**/admin')
}

;(async () => {
  sql(`delete from programs where slug = 'direct-e2e'`)
  const start = sql(`select (public.kst_today() + 60)::text`)
  const pid = sql(`insert into programs (type, name, season, start_date, end_date, capacity, total_price, slug, waitlist_enabled, health_field_enabled,
      early_bird_discount, early_bird_until, form_config)
    values ('camp', '직접입력 캠프', '2027 겨울', '${start}', '${start}'::date + 20, 10, 5000000, 'direct-e2e', true, true,
      300000, public.kst_today() + 5, '{"fields":{"school":"required"}}') returning id`).split('\n')[0]
  sql(`insert into program_payment_rules (program_id, kind, label, amount, due_rule_type, due_offset_days) values
    ('${pid}', 'deposit', '계약금', 1000000, 'after_registration', 7), ('${pid}', 'balance', '원금', 4000000, 'before_start', 30)`)
  const partner = sql(`select id from partners where code = 'daejeon-into'`)
  sql(`insert into program_partner_discounts (program_id, partner_id, amount) values ('${pid}', '${partner}', 200000)`)

  const browser = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } })
  const errors = []
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  page.on('pageerror', (e) => errors.push(e.message))
  await login(page, 'staff@dev.local')

  // 1) 상담 신청 직접 등록
  await page.goto(`${BASE}/admin/leads`)
  await page.getByRole('link', { name: '+ 상담 직접 등록' }).click()
  await page.waitForURL('**/admin/leads/new')
  await page.getByLabel('학생 이름 (필수)').fill('전화학생')
  await page.getByLabel('학년').selectOption('중1')
  await page.getByLabel('학부모 이름 (필수)').fill('전화부모')
  await page.getByLabel('학부모 휴대폰 (필수)').fill('010-1616-1616')
  await page.getByLabel('캠프', { exact: true }).check()
  await page.getByLabel(/직접입력 캠프/).check()
  await page.getByLabel('문의 내용·메모').fill('겨울 캠프 일정 문의')
  await page.getByLabel('소개 학원').selectOption({ label: '대전 인투학원 (대전)' })
  await page.getByRole('button', { name: '상담 신청 등록' }).click()
  check('동의 확인 없으면 안내', await visible(page.getByText('고객에게 개인정보 수집·이용 동의를 받았는지 확인해 주세요.')))
  await page.getByText('고객에게 개인정보 수집·이용(상담 목적', { exact: false }).click()
  await page.getByRole('button', { name: '상담 신청 등록' }).click()
  await page.waitForURL(/\/admin\/leads\/[0-9a-f-]{36}$/, { timeout: 15000 }).catch(() => {})
  check('저장 → 고객 카드로 이동', /\/admin\/leads\/[0-9a-f-]{36}$/.test(page.url()), page.url())
  check('고객 카드: 등록 안내 문구', await visible(page.getByText('상담 신청을 등록했습니다', { exact: false })))
  check('고객 카드: 학생 이름', await visible(page.getByText('전화학생').first()))
  const lead = sql(`select entry_method || '|' || attribution_source || '|' || (select name from staff_profiles where id = entered_by) from leads where student_name = '전화학생'`)
  check('DB: 입력 방법·소개 경로·입력 직원', lead === 'phone|staff|행정직원(개발)', lead)
  check('DB: 접수 안내 보내지 않음', sql(`select status from message_logs where purpose = 'lead_received' and related_id = (select id from leads where student_name = '전화학생')`) === 'skipped')

  // 2) 등록생 직접 추가 (모집 전 캠프)
  await page.goto(`${BASE}/admin/registrations`)
  await page.getByRole('link', { name: '+ 등록생 직접 추가' }).click()
  await page.waitForURL('**/admin/registrations/new**')
  await page.getByLabel('캠프 (필수)').selectOption({ label: '직접입력 캠프 · 2027 겨울 (모집 전)' })
  check('모집 전 캠프 안내', await visible(page.getByText('모집 중이 아닌 캠프', { exact: false })))
  check('캠프 설정대로 학교 필수 표시', await visible(page.getByLabel('학교 (필수)')))
  await page.getByLabel('학생 이름(한글) (필수)').fill('종이학생')
  await page.getByLabel(/영문 이름/).fill('JONGI KID')
  await page.getByLabel(/생년월일/).fill('2014-04-04')
  await page.getByLabel(/^성별/).selectOption('female')
  await page.getByLabel(/^학년/).selectOption('초6')
  await page.getByLabel('학부모 이름 (필수)').fill('종이부모')
  await page.getByLabel('학부모 휴대폰 (필수)').fill('010-1717-1717')
  await page.getByLabel(/학부모 이메일/).fill('paper@example.com')
  await page.getByLabel(/비상 연락처 이름/).fill('보호자')
  await page.getByLabel('비상 연락처 관계').selectOption('아버지')
  await page.getByLabel(/비상 연락처 번호/).fill('010-1717-0000')
  await page.getByLabel('소개 학원').selectOption({ label: '대전 인투학원 (대전)' })
  await page.getByText('학부모에게 개인정보 수집·이용', { exact: false }).click()
  await page.getByRole('button', { name: '등록생 추가' }).click()
  check('캠프 필수 항목(학교) 누락 안내', await visible(page.getByText('이 캠프의 필수 항목을 입력해 주세요: 학교')))
  await page.getByLabel('학교 (필수)').fill('대전초')
  await page.getByLabel('건강 특이사항 (선택)').fill('땅콩 알레르기')
  await page.getByRole('button', { name: '등록생 추가' }).click()
  check('건강 정보 입력 시 민감정보 동의 확인 요구', await visible(page.getByText('민감정보 동의를 받았는지 확인해 주세요', { exact: false })))
  await page.getByText('[선택] 건강 특이사항(민감정보)', { exact: false }).click()
  await page.getByRole('button', { name: '등록생 추가' }).click()
  check('완료 안내', await visible(page.getByText('종이학생 학생을 등록했습니다', { exact: false })))
  const myUrl = await page.getByLabel('신청 내용 확인 링크').inputValue().catch(() => '')
  check('학부모용 확인 링크 표시', /\/my\/[A-Za-z0-9_-]{20,}$/.test(myUrl), myUrl.replace(/\/my\/.*/, '/my/…'))
  await page.screenshot({ path: `${OUT}/m16-registration-done.png`, fullPage: true })
  const rid = sql(`select id from registrations where student_name_ko = '종이학생'`)
  check('DB: 할인 반영 납부 일정(원금 400만 − 30만 − 20만)', sql(`select string_agg(amount_due::text, ',' order by sort) from payment_schedules where registration_id = '${rid}'`) === '1000000,3500000')
  check('DB: 입력 방법·직원·소개 경로', sql(`select entry_method || '|' || attribution_source from registrations where id = '${rid}'`) === 'paper|staff')
  check('DB: 건강 정보 저장', sql(`select count(*) from registration_health_notes where registration_id = '${rid}'`) === '1')
  check('DB: 캠프는 여전히 모집 전', sql(`select status from programs where id = '${pid}'`) === 'before')

  await page.getByRole('link', { name: '등록생 상세 보기' }).click()
  check('상세: 할인 적용 표시', await visible(page.getByText('캠프비 할인 적용 −500,000원', { exact: false })))

  // 3) 신청 내용 확인 링크(학부모 화면)
  const parent = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await parent.goto(myUrl.replace(/^https?:\/\/[^/]+/, BASE))
  check('학부모 확인 화면 열림', await visible(parent.getByText('종이학생')))
  await parent.close()

  // 4) 현지 팀에는 버튼 없음
  const viewer = await browser.newPage()
  await login(viewer, 'viewer@dev.local')
  await viewer.goto(`${BASE}/admin/registrations`)
  await viewer.waitForTimeout(1500)
  check('현지 팀: 직접 추가 버튼 없음', (await viewer.getByRole('link', { name: '+ 등록생 직접 추가' }).count()) === 0)
  await viewer.goto(`${BASE}/admin/registrations/new`)
  await viewer.waitForTimeout(1500)
  check('현지 팀: 직접 추가 화면 접근 불가', (await viewer.getByRole('button', { name: '등록생 추가' }).count()) === 0)

  // 5) 모바일
  const m = await browser.newPage({ viewport: { width: 375, height: 812 } })
  await login(m, 'staff@dev.local')
  for (const path of ['/admin/leads/new', '/admin/registrations/new']) {
    await m.goto(`${BASE}${path}`)
    await m.waitForTimeout(800)
    const w = await m.evaluate(() => document.documentElement.scrollWidth)
    check(`375px 가로 스크롤 없음: ${path}`, w <= 375, `scrollWidth=${w}`)
  }

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
