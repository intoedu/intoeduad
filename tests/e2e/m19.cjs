// M19 브라우저 E2E: 상담 신청서 회원 안내 창 → 이메일 회원가입(로컬은 메일 인증 없음) → 회원 정보 입력(동의)
//                 → 상담 신청서 자동 채움·신청 → 캠프 신청서 자동 채움·신청 → 내 정보(자녀 추가·저장) → 직원 계정 구분 → 탈퇴
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
const poll = async (fn, want, tries = 25) => {
  let v
  for (let i = 0; i < tries; i++) { v = fn(); if (v === want) return v; await new Promise((r) => setTimeout(r, 300)) }
  return v
}
const agreeTo = (page, title) => page.getByRole('checkbox', { name: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) })
const EMAIL = `m19-parent-${Date.now()}@example.com`

;(async () => {
  sql(`delete from programs where slug = 'member-e2e'`)
  const start = sql(`select (public.kst_today() + 70)::text`)
  const pid = sql(`insert into programs (type, name, season, start_date, end_date, capacity, total_price, slug, status)
    values ('camp', '회원 캠프', '2027 겨울', '${start}', '${start}'::date + 20, 10, 3000000, 'member-e2e', 'open') returning id`).split('\n')[0]
  sql(`insert into program_payment_rules (program_id, kind, label, amount, due_rule_type, due_offset_days) values ('${pid}', 'balance', '원금', 3000000, 'before_start', 30)`)

  const browser = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } })
  const errors = []
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('dialog', (d) => d.accept())

  // 1) 상담 링크 → 회원 안내 창
  await page.goto(`${BASE}/apply`)
  check('회원 안내 창', await visible(page.getByRole('dialog', { name: '회원으로 신청하시겠어요?' })))
  check('카카오·구글 버튼은 켜진 경우에만(로컬은 꺼짐)', (await page.getByRole('button', { name: '카카오로 시작하기' }).count()) === 0)
  await page.screenshot({ path: `${OUT}/m19-gate.png` })
  await page.getByRole('link', { name: '이메일로 회원가입·로그인' }).click()
  await page.waitForURL('**/account/login**')

  // 2) 이메일 회원가입 → 회원 정보 입력
  await page.getByRole('button', { name: '이메일로 회원가입' }).click()
  await page.getByLabel('이메일').fill(EMAIL)
  await page.getByLabel('비밀번호', { exact: true }).fill('abcd1234')
  await page.getByLabel('비밀번호 확인').fill('abcd1234')
  await page.getByRole('button', { name: '회원가입' }).click()
  await page.waitForURL('**/account/setup**', { timeout: 15000 }).catch(() => {})
  check('가입 → 회원 정보 입력 화면', page.url().includes('/account/setup'), page.url())
  await page.waitForTimeout(800)
  check('가입 이메일이 미리 채워짐', (await page.getByLabel('이메일 (선택)').inputValue()) === EMAIL)
  await page.getByLabel('학부모 이름').fill('회원부모')
  await page.getByLabel('휴대폰 번호').fill('010-1919-0001')
  await page.getByText('아니요, 사용하지 않아요', { exact: true }).click()
  await page.getByLabel('대신 받을 카카오톡 계정의 전화번호').fill('010-1919-9999')
  await page.getByLabel('자녀와의 관계 (선택)').selectOption('어머니')
  await page.getByLabel('비상 연락처 이름 (선택)').fill('회원아빠')
  await page.getByLabel('비상 연락처 번호 (선택)').fill('010-1919-0002')
  await page.getByLabel('자녀 이름(한글)').fill('회원자녀')
  await page.getByLabel('영문 이름(여권과 동일, 선택)').fill('hoewon kid')
  await page.getByLabel('생년월일 (선택)').fill('2015-03-02')
  await page.getByLabel('성별 (선택)').selectOption('female')
  await page.getByLabel('학년 (선택)').selectOption('초6')
  await page.getByRole('button', { name: '저장하고 계속하기' }).click()
  check('동의 없으면 저장 안 됨', await visible(page.getByText('회원 개인정보 수집·이용에 동의해 주세요.')))
  await page.getByRole('checkbox', { name: /회원 개인정보 수집·이용 동의/ }).check()
  await page.getByRole('button', { name: '저장하고 계속하기' }).click()
  await page.waitForURL('**/apply', { timeout: 15000 }).catch(() => {})
  check('저장 → 처음 열었던 상담 신청서로 돌아감', page.url().endsWith('/apply'), page.url())
  const uid = sql(`select id from auth.users where email = '${EMAIL}'`)
  check('DB: 회원 정보·자녀·동의 버전', sql(`select parent_phone || '|' || kakao_use || '|' || kakao_alt_phone || '|' || privacy_version || '|' || (select name_en from customer_students where customer_id = c.id)
    from customer_profiles c where id = '${uid}'`) === '01019190001|false|01019199999|1|HOEWON KID')

  // 3) 상담 신청서: 자동 채움
  await page.goto(`${BASE}/apply`)
  check('회원은 안내 창 없음', !(await visible(page.getByRole('dialog'), 2000)))
  check('자동 채움 안내', await visible(page.getByText('회원 정보로 채웠습니다', { exact: false })))
  check('자동 채움: 학부모·번호·자녀', (await page.getByLabel('학부모 이름').inputValue()) === '회원부모'
    && (await page.getByLabel('휴대폰 번호').inputValue()) === '010-1919-0001' && (await page.getByLabel('자녀 이름').inputValue()) === '회원자녀')
  check('자동 채움: 카카오톡 미사용·대신 받을 번호', (await page.getByLabel('대신 받을 카카오톡 계정의 전화번호').inputValue()) === '010-1919-9999')
  await page.getByLabel('어디서 알게 되셨나요?').selectOption({ label: '인스타그램' })
  await page.getByLabel(/\[필수\] 위 내용을 확인하였으며/).check()
  await page.getByLabel(/\[필수\] 자녀가 만 14세 미만인 경우/).check()
  await page.getByRole('button', { name: '상담 신청하기' }).click()
  await page.waitForURL('**/apply/done', { timeout: 15000 }).catch(() => {})
  check('회원 상담 신청 완료', page.url().endsWith('/apply/done'))
  check('DB: 상담 신청 저장', (await poll(() => sql(`select student_grade || '|' || relation || '|' || kakao_use from leads where student_name = '회원자녀'`), '초6|어머니|false')) === '초6|어머니|false')

  // 4) 캠프 신청서: 자동 채움 → 신청 → 상담 기록 자동 연결
  await page.goto(`${BASE}/register/member-e2e`)
  await page.getByRole('heading', { name: /회원 캠프.*등록 신청/ }).waitFor()
  check('캠프 신청서 자동 채움: 학생', (await page.getByLabel('학생 이름(한글)').inputValue()) === '회원자녀'
    && (await page.getByLabel(/영문 이름/).inputValue()) === 'HOEWON KID' && (await page.getByLabel(/생년월일/).inputValue()) === '2015-03-02')
  check('캠프 신청서 자동 채움: 비상 연락처', (await page.getByLabel('이름', { exact: true }).inputValue()) === '회원아빠')
  await page.getByLabel('어디서 알게 되셨나요?').selectOption({ label: '인스타그램' })
  await page.getByText('예, 상담했어요', { exact: true }).click()
  await page.getByLabel(/^이메일/).fill('')
  await page.getByLabel(/^이메일/).fill('member@example.com')
  await page.getByLabel('관계').selectOption('아버지')
  for (const t of ['[필수] 1. 개인정보', '[필수] 3. 개인정보 제3자', '[필수] 5. 법정대리인', '[필수] 환불 규정 확인']) await agreeTo(page, t).check()
  await page.getByLabel('[필수] 개인정보 파기 안내를 확인했습니다.').check()
  await page.getByRole('button', { name: '등록 신청하기' }).click()
  check('회원 캠프 신청 완료', await visible(page.getByRole('heading', { name: '등록 신청이 접수되었습니다' }), 15000))
  check('DB: 캠프 신청 → 상담 기록 자동 연결', (await poll(() => sql(`select lead_link_method from registrations where student_name_ko = '회원자녀'`), 'auto')) === 'auto')
  check('DB: 회원 정보에 빈 칸 채움(이메일은 가입 이메일 유지)', (await poll(() => sql(`select parent_email from customer_profiles where id = '${uid}'`), EMAIL)) === EMAIL)

  // 5) 내 정보: 자녀 추가
  await page.goto(`${BASE}/account`)
  await page.getByRole('button', { name: '+ 자녀 추가' }).click()
  await page.getByLabel('자녀 이름(한글)').fill('둘째')
  await page.getByRole('button', { name: '자녀 정보 저장' }).click()
  check('자녀 추가', await visible(page.getByText('자녀 정보를 저장했습니다.')))
  await page.goto(`${BASE}/apply`)
  check('자녀가 둘이면 고르기 표시', await visible(page.getByRole('button', { name: '둘째' })))
  await page.getByRole('button', { name: '둘째' }).click()
  check('자녀 고르면 이름 채움', (await page.getByLabel('자녀 이름').inputValue()) === '둘째')
  await page.screenshot({ path: `${OUT}/m19-apply-member.png`, fullPage: true })

  // 6) 직원 계정은 회원 기능과 구분
  const staff = await browser.newPage()
  await staff.goto(`${BASE}/login`)
  await staff.getByLabel('아이디 또는 이메일').fill('staff@dev.local')
  await staff.getByLabel('비밀번호').fill('devpass1234')
  await staff.getByRole('button', { name: '로그인' }).click()
  await staff.waitForURL('**/admin')
  await staff.goto(`${BASE}/account`)
  check('직원 계정: 회원 화면 대신 안내', await visible(staff.getByText('직원 계정으로 로그인되어 있습니다.')))
  await staff.goto(`${BASE}/apply`)
  check('직원 계정: 회원 안내 창 없음', !(await visible(staff.getByRole('dialog'), 2000)))

  // 7) 탈퇴
  await page.goto(`${BASE}/account`)
  await page.getByRole('button', { name: '탈퇴하기' }).click()
  await page.waitForURL('**/apply', { timeout: 15000 }).catch(() => {})
  check('탈퇴 → 신청서로', page.url().endsWith('/apply'))
  check('DB: 계정·회원 정보 삭제', (await poll(() => sql(`select (select count(*) from auth.users where email = '${EMAIL}') + (select count(*) from customer_profiles where id = '${uid}')`), '0')) === '0')
  check('DB: 이미 낸 신청은 유지', sql(`select count(*) from registrations where student_name_ko = '회원자녀'`) === '1')

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
