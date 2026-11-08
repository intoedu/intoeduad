// M20 브라우저 E2E: 상담·캠프 신청서 한국어/영어 전환 — 주소는 그대로, 영어로 내도 저장 값(학년·관계 등)은 한국어 그대로
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
  try {
    await locator.first().waitFor({ state: 'visible', timeout })
    return true
  } catch {
    return false
  }
}
const agreeTo = (page, title) => page.getByRole('checkbox', { name: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) })

;(async () => {
  // 다시 돌릴 때는 npx supabase db reset 후 실행(다른 E2E와 같음)
  sql(`delete from submission_throttle`)
  const start = sql(`select (public.kst_today() + 70)::text`)
  const pid = sql(`insert into programs (type, name, season, start_date, end_date, capacity, total_price, slug, status)
    values ('camp', '영어 캠프', '2027 여름', '${start}', '${start}'::date + 20, 10, 3000000, 'bilingual-e2e', 'open') returning id`).split('\n')[0]
  sql(`insert into program_payment_rules (program_id, kind, label, amount, due_rule_type, due_offset_days) values ('${pid}', 'balance', '잔금', 3000000, 'before_start', 30)`)

  const browser = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } })
  const errors = []
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(() => sessionStorage.setItem('intoedu:member-gate-dismissed', '1'))

  // 1) 기본은 한국어, 머리글에 전환 버튼
  await page.goto(`${BASE}/apply`)
  check('기본 한국어', await visible(page.getByRole('heading', { name: '유학·캠프 상담 신청' })))
  check('전환 버튼', await visible(page.getByRole('button', { name: 'English' })))
  await page.getByRole('button', { name: 'English' }).click()
  check('영어로 전환', await visible(page.getByRole('heading', { name: 'Study Abroad & Camp Consultation' })))
  check('주소 그대로', new URL(page.url()).pathname === '/apply' && !page.url().includes('lang='), page.url())
  check('html lang=en', (await page.evaluate(() => document.documentElement.lang)) === 'en')
  await page.screenshot({ path: `${OUT}/m20-apply-en.png`, fullPage: true })

  // 2) 영어 검사 문구
  await page.getByRole('button', { name: 'Request a consultation' }).click()
  check('영어 오류: 이름', await visible(page.getByText("Please enter your child's name.")))
  check('영어 오류: 카카오톡', await visible(page.getByText('Please tell us whether you use KakaoTalk.')))
  check('영어 오류: 유입 경로', await visible(page.getByText('Please tell us how you heard about us.')))

  // 3) 영어로 상담 신청 → 저장 값은 한국어
  await page.getByLabel('How did you hear about us?').selectOption({ label: 'Instagram' })
  await page.getByLabel("Child's name").fill('영어 학생')
  await page.getByLabel(/^Grade \(in Korea\)/).selectOption({ label: 'Grade 8 (Middle school)' })
  await page.getByLabel("Parent's name").fill('Jane Kim')
  await page.getByLabel('Mobile number').fill('010-2020-0001')
  await page.getByText('Yes, I do', { exact: true }).click()
  await page.getByLabel(/^Relationship to the child/).selectOption({ label: 'Mother' })
  check('동의서 한국어 원문 안내', await visible(page.getByText('The consent text below is provided in Korean', { exact: false })))
  await page.getByLabel(/\[Required\] I have read the above/).check()
  await page.getByLabel(/\[Required\] 자녀가 만 14세 미만인 경우/).check()
  await page.getByRole('button', { name: 'Request a consultation' }).click()
  check('영어 완료 화면', await visible(page.getByRole('heading', { name: 'Your consultation request has been received' }), 15000))
  const lead = sql(`select student_grade || '|' || coalesce(relation, '') || '|' || inflow_label || '|' || kakao_use::text from leads where parent_phone = '01020200001' order by created_at desc limit 1`)
  check('저장 값 한국어(학년·관계·경로)', lead === '중2|어머니|인스타그램|true', lead)

  // 4) 다시 열어도 영어(이 기기에 기억), 한국어로 되돌리기
  await page.goto(`${BASE}/apply`)
  check('고른 언어 기억', await visible(page.getByRole('heading', { name: 'Study Abroad & Camp Consultation' })))
  await page.getByRole('button', { name: '한국어' }).click()
  check('한국어로 되돌리기', await visible(page.getByRole('heading', { name: '유학·캠프 상담 신청' })))

  // 4-1) 처음 여는 사람: 회원가입 안내 창이 머리글을 덮어도 창 안에서 영어로 바꿀 수 있다
  const ctx0 = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const p0 = await ctx0.newPage()
  p0.on('pageerror', (e) => errors.push(e.message))
  await p0.goto(`${BASE}/apply`)
  check('안내 창 한국어', await visible(p0.getByRole('heading', { name: '회원으로 신청하시겠어요?' })))
  await p0.getByRole('dialog').getByRole('button', { name: 'English' }).click()
  check('안내 창 안에서 영어로', await visible(p0.getByRole('heading', { name: 'Would you like to sign up first?' })))
  await p0.getByRole('button', { name: 'Continue without signing up' }).click()
  check('창 닫은 뒤 신청서 영어', await visible(p0.getByRole('heading', { name: 'Study Abroad & Camp Consultation' })))

  // 5) ?lang=en 으로 바로 영어(새 기기), 직원 화면은 한국어 그대로
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const p2 = await ctx2.newPage()
  p2.on('pageerror', (e) => errors.push(e.message))
  await p2.addInitScript(() => sessionStorage.setItem('intoedu:member-gate-dismissed', '1'))
  await p2.goto(`${BASE}/register?lang=en`)
  check('캠프 목록 영어', await visible(p2.getByRole('heading', { name: 'INTOEDU Camp Registration' })))
  await p2.getByRole('link', { name: /영어 캠프 \(2027 여름\)/ }).click()
  await p2.waitForURL('**/register/bilingual-e2e**')
  check('캠프 주소 그대로', new URL(p2.url()).pathname === '/register/bilingual-e2e', p2.url())
  check('캠프 신청서 영어', await visible(p2.getByRole('heading', { name: /영어 캠프.*Registration/ })))
  check('납부 일정 영어', await visible(p2.getByText(/^Due by /)))
  await p2.getByLabel('How did you hear about us?').selectOption({ label: 'Friend or family' })
  await p2.getByLabel('Who referred you? (optional)').fill('Neighbor')
  await p2.getByText('No, this is my first time', { exact: true }).click()
  await p2.getByLabel('Student name', { exact: true }).fill('영어학생')
  await p2.getByLabel(/Name in English/).fill('ENGLISH KID')
  await p2.getByLabel(/Date of birth/).fill('2014-05-05')
  await p2.getByText('Female', { exact: true }).click()
  await p2.getByLabel(/^Grade \(in Korea\)/).selectOption({ label: 'Grade 6 (Elementary)' })
  await p2.getByLabel("Parent's name").fill('John Lee')
  await p2.getByLabel('Mobile number').fill('010-2020-0002')
  await p2.getByText("No, I don't", { exact: true }).click()
  await p2.getByLabel('Other messenger ID or contact').fill('WhatsApp +1 555 0100')
  await p2.getByLabel(/^Email/).fill('john@example.com')
  await p2.getByLabel('Name', { exact: true }).fill('Grace Lee')
  await p2.getByLabel('Relationship', { exact: true }).selectOption({ label: 'Relative' })
  await p2.getByLabel('Phone number', { exact: true }).fill('010-3030-4040')
  await p2.getByRole('button', { name: 'Register', exact: true }).click()
  check('영어 오류: 동의', await visible(p2.getByText('Please agree to all required items.')))
  for (const t of ['[필수] 1. 개인정보', '[필수] 3. 개인정보 제3자', '[필수] 5. 법정대리인', '[Required] Refund policy']) await agreeTo(p2, t).check()
  await p2.getByLabel('[Required] I have read the personal data deletion notice.').check()
  await p2.screenshot({ path: `${OUT}/m20-register-en.png`, fullPage: true })
  await p2.getByRole('button', { name: 'Register', exact: true }).click()
  check('영어 캠프 완료 화면', await visible(p2.getByRole('heading', { name: 'Your registration has been received' }), 15000))
  check('완료 화면 납부 안내 영어', await visible(p2.getByRole('heading', { name: 'Payment information' })))
  await p2.screenshot({ path: `${OUT}/m20-register-done-en.png`, fullPage: true })
  const reg = sql(`select r.grade || '|' || r.gender || '|' || r.emergency_relation || '|' || r.inflow_label || '|' || r.consulted_before || '|' || r.kakao_use::text
    from registrations r where r.program_id = '${pid}' order by r.created_at desc limit 1`)
  check('캠프 저장 값 한국어', reg === '초6|female|친척|지인 소개|no|false', reg)

  // 6) 신청 내용 확인(/my)·직원 화면은 전환 없음(한국어)
  await p2.getByRole('link', { name: 'Open my registration page' }).click()
  await p2.waitForURL('**/my/**')
  check('/my 화면 열림', await visible(p2.getByRole('heading', { name: '납부 현황' }), 15000))
  check('/my 는 한국어(전환 버튼 없음)', (await p2.getByRole('button', { name: 'English' }).count()) === 0)
  check('/my 에서 html lang 원래대로', (await p2.evaluate(() => document.documentElement.lang)) === 'ko')
  await p2.goto(`${BASE}/login`)
  check('직원 로그인 한국어', await visible(p2.getByLabel('아이디 또는 이메일')))

  check('화면 오류 없음', errors.length === 0, errors.join(' / '))
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
