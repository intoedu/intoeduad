// M3 브라우저 E2E: 상담 시간 생성·휴무 → 학부모 신청(실장 링크·직접 선택) → 완료 화면 → 마감 경합 → 모바일
const { chromium } = require('playwright')
const { execFileSync } = require('child_process')
const OUT = process.env.E2E_OUT || 'test-results'
require('fs').mkdirSync(OUT, { recursive: true })
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

async function pickFirstSlot(page) {
  await page.getByLabel('원하는 상담 날짜·시간을 고를게요').check()
  const day = page.locator('td.rdp-day:not(.rdp-disabled) button.rdp-day_button').first()
  await day.waitFor({ timeout: 10000 })
  await day.click()
  const time = page.getByRole('button', { pressed: false }).filter({ hasText: /^\d\d:\d\d$/ }).first()
  const label = (await time.textContent()).trim()
  await time.click()
  return label
}

async function fillRequired(page, { student, parent, phone }) {
  await page.getByLabel('자녀 이름').fill(student)
  await page.getByLabel('학년').selectOption('중1')
  await page.getByLabel('학부모 이름').fill(parent)
  await page.getByLabel('휴대폰 번호').fill(phone)
  await page.getByLabel('자녀와의 관계').selectOption('어머니')
  await page.getByLabel(/\[필수\] 위 내용을 확인하였으며/).check()
  await page.getByLabel(/\[필수\] 자녀가 만 14세 미만인 경우/).check()
}

;(async () => {
  sql(`update settings set value = '"https://pf.kakao.com/_test/chat"'::jsonb where key = 'kakao_channel_url'`)
  const browser = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } })
  const errors = []

  // 1) 관리자: 상담 시간 만들기 + 휴무
  const admin = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  admin.on('pageerror', (e) => errors.push(e.message))
  admin.on('dialog', (d) => d.accept())
  await login(admin, 'staff@dev.local')
  await admin.getByRole('link', { name: '상담 시간 관리' }).click()
  await admin.getByRole('button', { name: '상담 시간 만들기' }).click()
  check('상담 시간 일괄 생성', await visible(admin.getByText(/상담 시간 \d+개를 만들었습니다/)))
  const created = Number(sql(`select count(*) from consultation_slots`))
  check('평일 10~18시, 점심 제외 30분 간격 생성', created > 0 && created % 14 === 0, `생성 ${created}개(하루 14개 기준)`)
  await admin.getByRole('button', { name: '다음 주' }).click()
  await admin.getByRole('button', { name: '이 날 휴무' }).first().click()
  await admin.waitForTimeout(800)
  const closed = Number(sql(`select count(*) from consultation_slots where not is_open`))
  check('하루 휴무 처리(14개 닫힘)', closed === 14, `닫힌 ${closed}개`)

  // 2) 학부모: 상담실장 링크로 신청 (빈 제출 검증 → 정상 제출)
  const parent = await browser.newPage({ viewport: { width: 375, height: 812 } })
  parent.on('pageerror', (e) => errors.push(e.message))
  await parent.goto(`${BASE}/apply/daejeon-into?c=kim`)
  check('실장 링크: 소개 경로 자동 표시', await visible(parent.getByText('대전 인투학원 김상담 선생님 소개로 신청합니다.', { exact: false })))
  check('학원 선택 칸 숨김', (await parent.getByLabel('어디서 알게 되셨나요?').count()) === 0)
  check('상담 방식 안내 문구', await visible(parent.getByText('상담 방식(전화 또는 화상)은 문의 내용에 맞춰 담당자가 안내드립니다.').first()))
  await parent.getByRole('button', { name: '상담 신청하기' }).click()
  check('빈 제출 시 오류 안내', await visible(parent.getByText('자녀 이름을 입력해 주세요.')))
  await fillRequired(parent, { student: '김민준', parent: '김부모', phone: '010-3000-0001' })
  check('입력하면 오류 문구가 바로 사라짐', (await parent.getByText('자녀 이름을 입력해 주세요.').count()) === 0)
  await parent.getByText('캠프', { exact: true }).first().click()
  await parent.getByLabel('자세한 내용 (선택)').fill('겨울 캠프 일정이 궁금합니다.')
  const pickedTime = await pickFirstSlot(parent)
  let w = await parent.evaluate(() => document.documentElement.scrollWidth)
  check('375px 신청서 가로 스크롤 없음', w <= 375, `scrollWidth=${w}`)
  await parent.screenshot({ path: `${OUT}/m3-apply-mobile.png`, fullPage: true })
  await parent.getByRole('button', { name: '상담 신청하기' }).click()
  await parent.waitForURL('**/apply/done')
  check('완료 화면 이동', true)
  check('완료 화면: 자녀 이름', await visible(parent.getByText('김민준')))
  check('완료 화면: 예약 시각 표시', await visible(parent.getByText(new RegExp(pickedTime))), pickedTime)
  check('완료 화면: 카카오톡 버튼', await visible(parent.getByRole('link', { name: '인투유학 카카오톡 문의 바로가기' })))
  w = await parent.evaluate(() => document.documentElement.scrollWidth)
  check('375px 완료 화면 가로 스크롤 없음', w <= 375, `scrollWidth=${w}`)
  await parent.screenshot({ path: `${OUT}/m3-done-mobile.png`, fullPage: true })
  const lead = sql(`select l.attribution_source || '|' || c.name || '|' || l.status || '|' || (select count(*) from consultations where lead_id = l.id)
    from leads l join partner_contacts c on c.id = l.partner_contact_id where l.student_name = '김민준'`)
  check('DB: 소개 경로(link)·실장·예약 저장', lead === 'link|김상담|new|1', lead)

  // 3) 코드 없이 접속 → 학원 직접 선택 → 담당자 선택 칸
  await parent.goto(`${BASE}/apply`)
  await parent.getByLabel('어디서 알게 되셨나요?').selectOption({ label: '대전 인투학원 (대전)' })
  check('학원 선택 후 선생님 선택 칸 표시', await visible(parent.getByLabel('소개해 주신 선생님 (선택)')))
  await parent.getByLabel('소개해 주신 선생님 (선택)').selectOption({ label: '김상담 상담실장' })
  await fillRequired(parent, { student: '이서연', parent: '이부모', phone: '010-3000-0002' })
  await parent.getByRole('button', { name: '상담 신청하기' }).click()
  await parent.waitForURL('**/apply/done')
  const lead2 = sql(`select l.attribution_source || '|' || coalesce(c.name, '-') from leads l left join partner_contacts c on c.id = l.partner_contact_id where l.student_name = '이서연'`)
  check('직접 선택: 소개 경로(form)·실장 저장', lead2 === 'form|김상담', lead2)

  // 4) 마감 경합: 시간을 고른 사이 다른 사람이 먼저 예약
  await parent.goto(`${BASE}/apply/daejeon-into`)
  await fillRequired(parent, { student: '박도윤', parent: '박부모', phone: '010-3000-0003' })
  const racedTime = await pickFirstSlot(parent)
  const takenSlot = sql(`select id from consultation_slots where is_open and booked_count < capacity and starts_at > now() order by starts_at limit 1`)
  await fetch(`${API}/functions/v1/public-lead-submit`, {
    method: 'POST',
    headers: { apikey: KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ student_name: '선점', parent_name: '선점', parent_phone: '01030009999', agree_privacy: true, agree_guardian: true, slot_id: takenSlot }),
  })
  await parent.getByRole('button', { name: '상담 신청하기' }).click()
  check('마감 경합: 안내 문구', await visible(parent.getByText('선택하신 상담 시간이 방금 마감되었습니다', { exact: false })))
  check('마감 경합: 신청 저장 안 됨', sql(`select count(*) from leads where student_name = '박도윤'`) === '0')
  await parent.waitForTimeout(1000)
  check('마감 경합: 선택 해제', (await parent.getByRole('button', { pressed: true }).count()) === 0)
  check('마감 경합: 마감된 시간은 목록에서 사라짐', (await parent.getByRole('button', { name: racedTime, exact: true }).count()) === 0, racedTime)

  // 5) 관리자 화면: 예약 수 반영
  await admin.reload()
  // 예약된 첫 슬롯이 있는 주로 이동
  const bookedDay = sql(`select to_char(starts_at at time zone 'Asia/Seoul', 'YYYY-MM-DD') from consultation_slots where booked_count > 0 order by starts_at limit 1`)
  for (let i = 0; i < 6 && !(await admin.getByText('1/1').count()); i++) {
    await admin.getByRole('button', { name: '다음 주' }).click()
    await admin.waitForTimeout(400)
  }
  check('관리자: 예약 1/1 표시', await visible(admin.getByText('1/1')), bookedDay)
  await admin.screenshot({ path: `${OUT}/m3-slots.png`, fullPage: true })

  check('브라우저 스크립트 오류 없음', errors.length === 0, errors.join(' | '))
  await browser.close()
  console.log(results.join('\n'))
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0)
})().catch((e) => {
  console.log(results.join('\n'))
  console.error('E2E 중단:', e.message.split('\n')[0])
  process.exit(1)
})
