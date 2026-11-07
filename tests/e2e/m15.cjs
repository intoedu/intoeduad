// M15 브라우저 E2E: 캠프 만들기 작성 중 새로고침 유지 → 링크 영어 추천 → 얼리버드 입력·저장 → 학원별 할인 등록·미리보기
//                 → 캠프 목록 할인 표시 → 학원 링크 신청서에 할인 반영 → 신청 후 완료·확인 화면·직원 상세에 할인 내역
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
const agreeTo = (page, title) => page.getByRole('checkbox', { name: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) })

;(async () => {
  sql(`delete from programs where slug like 'usa-schooling-camp%'`)
  const start = sql(`select (public.kst_today() + 70)::text`)
  const end = sql(`select (public.kst_today() + 95)::text`)
  const ebUntil = sql(`select (public.kst_today() + 10)::text`)

  const browser = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } })
  const errors = []
  const admin = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  admin.on('pageerror', (e) => errors.push(e.message))
  admin.on('dialog', (d) => d.accept())
  await admin.goto(`${BASE}/login`)
  await admin.getByLabel('아이디 또는 이메일').fill('admin@dev.local')
  await admin.getByLabel('비밀번호').fill('devpass1234')
  await admin.getByRole('button', { name: '로그인' }).click()
  await admin.waitForURL('**/admin')

  // 1) 작성 중 새로고침해도 유지
  await admin.goto(`${BASE}/admin/programs/new`)
  await admin.getByLabel('프로그램 이름 (필수)').fill('겨울 미국 스쿨링캠프')
  await admin.getByLabel('기수·시즌').fill('2027 겨울 1차')
  await admin.getByLabel('국가').fill('미국')
  const slug = await admin.getByLabel('신청서 링크 주소').inputValue()
  check('링크 주소: 영어 추천·중복 단어 한 번만', slug === 'winter-usa-schooling-camp-2027-1', slug)
  await admin.reload()
  check('새로고침 후 작성 중 내용 안내', await visible(admin.getByText('작성 중이던 내용을 불러왔습니다', { exact: false })))
  check('새로고침 후 이름·시즌·국가 유지',
    (await admin.getByLabel('프로그램 이름 (필수)').inputValue()) === '겨울 미국 스쿨링캠프' &&
    (await admin.getByLabel('기수·시즌').inputValue()) === '2027 겨울 1차' && (await admin.getByLabel('국가').inputValue()) === '미국')
  check('새로고침 후 링크 주소 유지', (await admin.getByLabel('신청서 링크 주소').inputValue()) === 'winter-usa-schooling-camp-2027-1')

  // "지우고 새로 쓰기"
  await admin.getByRole('button', { name: '지우고 새로 쓰기' }).click()
  check('지우고 새로 쓰기 → 빈 양식', (await admin.getByLabel('프로그램 이름 (필수)').inputValue()) === '')
  await admin.reload()
  check('지운 뒤 새로고침해도 빈 양식', (await admin.getByLabel('프로그램 이름 (필수)').inputValue()) === '' &&
    (await admin.getByText('작성 중이던 내용을 불러왔습니다', { exact: false }).count()) === 0)

  // 2) 얼리버드 포함 저장
  await admin.getByLabel('프로그램 이름 (필수)').fill('미국스쿨링캠프')
  await admin.getByLabel('기수·시즌').fill('2027 겨울 1차')
  await admin.getByLabel('출국일(시작일)').fill(start)
  await admin.getByLabel('귀국일(종료일)').fill(end)
  await admin.getByLabel('정원', { exact: true }).fill('10')
  await admin.getByLabel('총 참가비(원)').fill('5000000')
  check('얼리버드 칸이 총 참가비 옆에', await visible(admin.getByLabel('얼리버드 할인(원)')) && await visible(admin.getByLabel('얼리버드 적용 마감일')))
  await admin.getByLabel('얼리버드 할인(원)').fill('300000')
  check('얼리버드 할인 후 금액 안내', await visible(admin.getByText('할인 후 4,700,000원', { exact: false })))
  await admin.getByRole('button', { name: '저장하고 다음 (납부 규칙)' }).click()
  check('마감일 없이 저장 → 안내', await visible(admin.getByText('얼리버드는 할인 금액과 적용 마감일을 함께 입력해 주세요', { exact: false })))
  await admin.getByLabel('얼리버드 적용 마감일').fill(ebUntil)
  await admin.getByRole('button', { name: '저장하고 다음 (납부 규칙)' }).click()
  await admin.waitForURL('**step=payments', { timeout: 15000 }).catch(() => {})
  const pid = sql(`select id from programs where slug = 'usa-schooling-camp-2027-winter-1'`)
  check('저장: 얼리버드 DB 기록', sql(`select early_bird_discount || '|' || (early_bird_until - public.kst_today()) from programs where id = '${pid}'`) === '300000|10')
  check('저장 후 작성 중 보관 삭제', (await admin.evaluate(() => localStorage.getItem('intoedu:program-draft:new'))) === null)

  // 3) 납부 규칙 + 학원별 할인
  await admin.getByLabel('금액(원)').first().fill('1000000')
  await admin.getByRole('button', { name: '납부 규칙 저장' }).click()
  await admin.waitForTimeout(800)
  check('미리보기: 얼리버드 적용 표시', await visible(admin.getByText('얼리버드 −300,000원', { exact: false })))
  check('미리보기: 잔금 3,700,000원', await visible(admin.getByText('3,700,000원', { exact: false })))
  await admin.getByLabel('학원', { exact: true }).selectOption({ label: '대전 인투학원 (대전)' })
  await admin.getByLabel('할인 금액(원)').fill('200000')
  await admin.getByLabel('메모 (선택)').fill('MOU 특별 할인')
  await admin.getByRole('button', { name: '+ 할인 추가' }).click()
  check('학원별 할인 목록에 표시', await visible(admin.getByRole('list', { name: '학원별 할인 목록' }).getByText('대전 인투학원')))
  check('학원별 할인 금액 표시', await visible(admin.getByText('−200,000원')))
  await admin.getByLabel('소개 학원').selectOption({ label: '대전 인투학원' })
  check('미리보기: 학원 선택 시 잔금 3,500,000원', await visible(admin.getByText('3,500,000원', { exact: false })))
  await admin.screenshot({ path: `${OUT}/m15-payments.png`, fullPage: true })

  // 4) 캠프 목록에 할인 표시
  await admin.goto(`${BASE}/admin/programs`)
  check('목록: 얼리버드 배지', await visible(admin.getByText(/얼리버드 −300,000원/)))
  check('목록: 학원 할인 배지', await visible(admin.getByText('학원 할인 1곳: 대전 인투학원 −200,000원')))

  // 5) 학부모: 학원 링크 신청서에 할인 반영 → 신청
  sql(`update programs set status = 'open' where id = '${pid}'`)
  const parent = await browser.newPage({ viewport: { width: 375, height: 812 } })
  parent.on('pageerror', (e) => errors.push(e.message))
  await parent.goto(`${BASE}/register/usa-schooling-camp-2027-winter-1`)
  check('일반 링크: 얼리버드만', await visible(parent.getByRole('list', { name: '적용된 할인' }).getByText('얼리버드 할인', { exact: false })) &&
    (await parent.getByText('학원 연계 할인').count()) === 0)
  check('일반 링크: 잔금 3,700,000원', await visible(parent.getByText('3,700,000원')))
  await parent.goto(`${BASE}/register/usa-schooling-camp-2027-winter-1?ref=daejeon-into`)
  check('학원 링크: 학원 연계 할인 표시', await visible(parent.getByText('학원 연계 할인')))
  check('학원 링크: 잔금 3,500,000원', await visible(parent.getByText('3,500,000원')))
  check('잔금 표기 "(할인 반영)" 한 번만', (await parent.getByText('잔금 (할인 반영) (잔금)').count()) === 0 && await visible(parent.getByText('잔금 (할인 반영)')))
  const w = await parent.evaluate(() => document.documentElement.scrollWidth)
  check('375px 가로 스크롤 없음', w <= 375, `scrollWidth=${w}`)

  await parent.getByLabel('학생 이름(한글)').fill('할인학생')
  await parent.getByLabel(/영문 이름/).fill('DC KID')
  await parent.getByLabel(/생년월일/).fill('2015-03-02')
  await parent.getByText('남', { exact: true }).click()
  await parent.getByLabel(/^학년/).selectOption('초6')
  await parent.getByLabel('학부모 이름').fill('할인부모')
  await parent.getByLabel('휴대폰 번호').fill('010-1515-1515')
  await parent.getByText('네, 사용해요', { exact: true }).click()
  { const nc = parent.getByText('아니요, 처음이에요', { exact: true }); if (await nc.count()) await nc.click() }
  await parent.getByLabel(/^이메일/).fill('dc@example.com')
  await parent.getByLabel('이름', { exact: true }).fill('보호자')
  await parent.getByLabel('관계').selectOption('아버지')
  await parent.getByLabel('연락처', { exact: true }).fill('010-1515-0000')
  await agreeTo(parent, '[필수] 1. 개인정보').check()
  await agreeTo(parent, '[필수] 3. 개인정보 제3자').check()
  await agreeTo(parent, '[필수] 5. 법정대리인').check()
  await agreeTo(parent, '[필수] 환불 규정 확인').check()
  await parent.getByLabel('[필수] 개인정보 파기 안내를 확인했습니다.').check()
  await parent.screenshot({ path: `${OUT}/m15-register.png`, fullPage: true })
  await parent.getByRole('button', { name: '등록 신청하기' }).click()
  await parent.waitForURL('**/register/done', { timeout: 15000 }).catch(() => {})
  check('완료 화면: 할인 내역', await visible(parent.getByRole('list', { name: '적용된 할인' })))
  check('완료 화면: 잔금 3,500,000원', await visible(parent.getByText('3,500,000원')))
  const rid = sql(`select id from registrations where program_id = '${pid}' and student_name_ko = '할인학생'`)
  check('DB: 납부 일정 할인 반영', sql(`select string_agg(amount_due::text, ',' order by sort) from payment_schedules where registration_id = '${rid}'`) === '1000000,3500000')
  check('DB: 할인 합계 기록', sql(`select discount_amount from registrations where id = '${rid}'`) === '500000')
  await parent.getByRole('link', { name: '신청 내용 확인 페이지 열기' }).click()
  check('신청 내용 확인: 할인 내역', await visible(parent.getByRole('list', { name: '적용된 할인' }).getByText('학원 연계 할인')))

  // 6) 직원 상세에 할인 내역
  await admin.goto(`${BASE}/admin/registrations/${rid}`)
  check('직원 상세: 할인 적용 안내', await visible(admin.getByText('캠프비 할인 적용 −500,000원', { exact: false })))
  check('직원 상세: 학원명 함께 표시', await visible(admin.getByText('학원 연계 할인 (대전 인투학원) −200,000원')))
  await admin.screenshot({ path: `${OUT}/m15-registration.png`, fullPage: true })

  // 7) 직원(staff)도 학원별 할인 관리 화면을 봄
  const staff = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await staff.goto(`${BASE}/login`)
  await staff.getByLabel('아이디 또는 이메일').fill('staff@dev.local')
  await staff.getByLabel('비밀번호').fill('devpass1234')
  await staff.getByRole('button', { name: '로그인' }).click()
  await staff.waitForURL('**/admin')
  await staff.goto(`${BASE}/admin/programs/${pid}?step=payments`)
  check('직원: 학원별 할인 보임', await visible(staff.getByRole('list', { name: '학원별 할인 목록' }).getByText('대전 인투학원')))

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
