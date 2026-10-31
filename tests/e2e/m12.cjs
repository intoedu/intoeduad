// M12 브라우저 E2E: 대시보드(경고·숫자·D-Day·상담·여권 미제출·모집 현황·유입 TOP) → 통합 캘린더(월/주/일·필터·이동) → 중요 일정(추가·완료·자동 일정 보호) → 현지 팀
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
async function login(page, email) {
  await page.goto(`${BASE}/login`)
  await page.getByLabel('이메일').fill(email)
  await page.getByLabel('비밀번호').fill('devpass1234')
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL('**/admin')
}

;(async () => {
  const today = sql(`select public.kst_today()::text`)
  const pid = 'aaaaaaaa-0000-0000-0000-000000000001' // 시드: 미국 스쿨링 캠프(현지 팀 담당)
  sql(`insert into program_milestones (program_id, title, date, category) values ('${pid}', '항공권 발권 마감', public.kst_today() + 5, 'flight_ticketing')`)
  const lead = sql(`insert into leads (student_name, parent_name, parent_phone, partner_id) select '상담예약학생', '부모', '01077770001', id from partners where code = 'daejeon-into' returning id`).split('\n')[0]
  sql(`insert into consultation_slots (id, starts_at, ends_at) values ('dd100000-0000-0000-0000-000000000001', (public.kst_today() + 1 + time '10:00') at time zone 'Asia/Seoul', (public.kst_today() + 1 + time '10:30') at time zone 'Asia/Seoul')`)
  sql(`insert into consultations (lead_id, slot_id) values ('${lead}', 'dd100000-0000-0000-0000-000000000001')`)
  const reg = sql(`insert into registrations (program_id, student_name_ko, parent_name, parent_phone, status, passport_status, destroy_due_date)
    values ('${pid}', '여권미제출', '부모', '01077770002', 'deposit_pending', 'pending', '2027-02-07') returning id`).split('\n')[0]
  sql(`insert into payment_schedules (registration_id, kind, label, amount_due, due_date) values ('${reg}', 'deposit', '예약금', 1000000, public.kst_today() - 1)`)
  sql(`update program_prep_items set due_date = public.kst_today() - 1, due_manual = true where program_id = '${pid}' and template_key = 'brochure'`)
  sql(`insert into important_events (title, date, category, priority, is_system) values ('[중요] 개인정보 파기 승인 — 시스템', public.kst_today() + 2, 'privacy_destruction', 'critical', true)`)

  const browser = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } })
  const errors = []
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('dialog', (d) => d.accept())
  await login(page, 'staff@dev.local')

  // 1) 대시보드
  check('경고: 기한 지난 납부', await visible(page.getByText('납부 기한이 지난 건 1건')))
  check('숫자: 신규 상담 신청', await visible(page.getByRole('link', { name: /신규 상담 신청\(미처리\)\s*1/ })))
  check('숫자: 상담 방식 미정', await visible(page.getByRole('link', { name: /상담 방식 미정\s*1/ })))
  check('D-Day: 발권 마감 D-5', await visible(page.getByRole('list', { name: 'D-Day' }).getByText('D-5')))
  check('D-Day: 파기 승인(자동 일정)', await visible(page.getByText('[중요] 개인정보 파기 승인 — 시스템')))
  check('D-Day: 준비물 마감(시드 캠프)', await visible(page.getByRole('list', { name: 'D-Day' }).getByText(/준비물 마감 ·/)))
  check('이번 주 상담 + 방식 미정', await visible(page.getByText('상담예약학생')) && await visible(page.getByText('방식 미정', { exact: true })))
  check('여권 미제출: 발권 일정 기준', await visible(page.getByRole('link', { name: '미국 스쿨링 캠프 (2027 겨울)' }).first()))
  check('모집 현황 막대', await visible(page.getByRole('progressbar', { name: /미국 스쿨링 캠프/ })))
  check('이번 달 학원 유입 TOP', await visible(page.getByText('1. 대전 인투학원')))
  await page.screenshot({ path: `${OUT}/m12-dashboard.png`, fullPage: true })

  // 2) 통합 캘린더
  await page.goto(`${BASE}/admin/calendar`)
  check('월 보기: 일정 표시', await visible(page.getByRole('link', { name: /예약금 기한/ })) || (await page.getByText(/예약금 기한/).count()) > 0)
    await page.getByRole('button', { name: '납부 기한', exact: true }).click()
  check('종류 필터: 납부 기한 끄기', (await page.getByText(/예약금 기한/).count()) === 0)
  await page.getByRole('button', { name: '납부 기한', exact: true }).click()
  await page.getByRole('tab', { name: '주' }).click()
  check('주 보기: 오늘 표시', await visible(page.getByText('· 오늘')))
  await page.goto(`${BASE}/admin/calendar?view=week&date=${sql(`select (public.kst_today() + 1)::text`)}`)
  check('주 보기: 상담 시간', await visible(page.getByText(/10:00 상담 · 상담예약학생/)))
  await page.getByRole('link', { name: /상담 · 상담예약학생/ }).click()
  check('일정 클릭 → 고객 카드', await page.waitForURL(`**/admin/leads/${lead}`).then(() => true).catch(() => false))
  await page.goto(`${BASE}/admin/calendar?view=month&date=2027-01-01`)
  check('월 이동: 2027년 1월 출국', await visible(page.getByRole('link', { name: /출국 · 미국 스쿨링 캠프/ })))
  await page.getByRole('button', { name: '다음' }).click()
  check('다음 달 이동', await visible(page.getByRole('heading', { name: '2027년 2월' })))
  await page.screenshot({ path: `${OUT}/m12-calendar.png`, fullPage: true })

  // 3) 중요 일정
  await page.goto(`${BASE}/admin/events`)
  await page.getByRole('button', { name: '+ 일정 추가' }).click()
  await page.getByLabel('제목').fill('학원 설명회')
  await page.getByLabel('날짜').fill(sql(`select (public.kst_today() + 3)::text`))
  await page.getByLabel('분류').selectOption('meeting')
  await page.getByRole('button', { name: '저장' }).click()
  check('일정 추가 + D-3', await visible(page.getByRole('listitem', { name: '중요 일정 학원 설명회' }).getByText('D-3')))
  const sys = page.getByRole('listitem', { name: '중요 일정 [중요] 개인정보 파기 승인 — 시스템' })
  check('자동 일정: 수정·삭제 버튼 없음', (await sys.getByRole('button', { name: '삭제' }).count()) === 0 && (await sys.getByRole('button', { name: '수정' }).count()) === 0)
  await sys.getByRole('button', { name: '완료' }).click()
  check('자동 일정 완료 처리', await visible(page.getByText('완료로 표시했습니다.')))
  await page.getByRole('listitem', { name: '중요 일정 학원 설명회' }).getByRole('button', { name: '삭제' }).click()
  check('직접 만든 일정 삭제', await visible(page.getByText('일정을 지웠습니다.')))
  check('DB: 소프트 삭제', sql(`select deleted_at is not null from important_events where title = '학원 설명회'`) === 't')
  await page.goto(`${BASE}/admin`)
  check('완료한 자동 일정은 D-Day에서 정리', (await page.getByText('[중요] 개인정보 파기 승인 — 시스템').count()) === 0)

  // 4) 현지 팀
  const viewer = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  viewer.on('pageerror', (e) => errors.push(e.message))
  await login(viewer, 'viewer@dev.local')
  check('현지 팀 대시보드: 담당 프로그램 일정', await visible(viewer.getByText(/항공권 발권 마감/)))
  check('현지 팀 대시보드: 납부·상담 숫자 없음', (await viewer.getByText('기한 지난 납부').count()) === 0)
  await viewer.goto(`${BASE}/admin/calendar`)
  await viewer.waitForTimeout(800)
  check('현지 팀: 통합 캘린더 접근 불가(직원 전용)', (await viewer.getByRole('heading', { name: '통합 캘린더' }).count()) === 0)

  check('페이지 오류 없음', errors.length === 0, errors.join(' | '))
  void today
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
