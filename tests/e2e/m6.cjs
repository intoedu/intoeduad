// M6 브라우저 E2E: 캠프 준비사항 — 자동 생성·마감 경고·요청서·버전·교차 검수·배포·변경 시 재확인·모집 시작 경고·기본 목록
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

const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// 준비물 펼침 버튼: 이름은 "제목 — 상태, 마감 …"
const toggle = (page, title) => page.getByRole('button', { name: new RegExp(`^${esc(title)} — `) })
const item = (page, title) => page.locator('li', { has: toggle(page, title) })

;(async () => {
  // 모집 시작 5일 뒤 → 포스터(모집 7일 전) 마감 지남, 프로모션 영상(모집 시작일) 임박
  const recruit = sql(`select (public.kst_today() + 5)::text`)
  const start = sql(`select (public.kst_today() + 120)::text`)
  const pid = sql(`insert into programs (type, name, season, country, start_date, end_date, capacity, total_price, slug, recruit_start_date)
    values ('camp', '여름 영어 캠프', '2027 여름', '필리핀', '${start}', '${start}'::date + 21, 15, 4500000, 'summer-english-m6', '${recruit}') returning id`).split('\n')[0]
  sql(`insert into program_payment_rules (program_id, kind, label, amount, due_rule_type, due_offset_days)
    values ('${pid}', 'deposit', '예약금', 1000000, 'after_registration', 7), ('${pid}', 'balance', '잔금', 3500000, 'before_start', 30)`)

  const browser = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } })
  const errors = []
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('dialog', (d) => d.accept())
  await login(page, 'staff@dev.local')

  // 1) 자동 생성 + 준비율 + 마감 경고 + 기준 정보
  await page.goto(`${BASE}/admin/programs/${pid}?step=prep`)
  check('준비사항 단계: 필수 0/9', await visible(page.getByText('필수 준비물 0/9 완료')))
  check('기본 준비물 10개 자동 생성', sql(`select count(*) from program_prep_items where program_id = '${pid}'`) === '10')
  check('마감 지남 표시(포스터·브로셔 등)', await visible(page.getByText('마감 지남', { exact: false })))
  check('임박 표시(모집 시작일 마감)', await visible(page.getByText('D-5')))
  check('기준 정보: 금액·납부 규칙', await visible(page.getByText('1,000,000원 · 신청 후 7일', { exact: false })))
  check('기준 정보: 신청 링크', await visible(page.getByText(`${BASE}/register/summer-english-m6`)))
  await page.screenshot({ path: `${OUT}/m6-prep.png`, fullPage: true })

  // 2) 포스터: 담당자·요청서 → 제작 시작 → 결과물 v1 → 교차 검수
  await toggle(page, '포스터').click()
  const poster = item(page, '포스터')
  await poster.getByLabel('제작·담당자').selectOption({ label: '행정직원(개발)' })
  await poster.getByLabel('목적').fill('학원 게시용 모집 안내')
  await poster.getByLabel('규격').fill('A2 세로')
  await poster.getByLabel('금액·일정 포함').check()
  await poster.getByRole('button', { name: '내용 저장' }).click()
  check('요청서 저장', await visible(page.getByText('"포스터" 내용을 저장했습니다.')))
  check('DB: 요청서 저장', sql(`select request->>'spec' from program_prep_items where program_id = '${pid}' and template_key = 'poster'`) === 'A2 세로')
  await poster.getByRole('button', { name: '제작 시작' }).click()
  check('제작 중', await visible(poster.getByText('제작 중')))
  await poster.getByLabel('결과물 링크(드라이브 등)').fill('https://drive.google.com/poster-v1')
  await poster.getByRole('button', { name: '결과물 등록' }).click()
  check('v1 등록 → 교차 검수', await visible(page.getByText('새 버전을 등록했습니다', { exact: false })))
  check('확인 완료 버튼은 검수 전 비활성', await poster.getByRole('button', { name: '확인 완료 (대표·행정팀)' }).isDisabled())
  const boxes = ['회사명 "인투유학" 표기 통일', '금액·날짜·요일이 기준 정보와 일치', '포함/미포함 내역 일치', '신청 링크·QR이 실제로 열림',
    '보장·최상급 표현 없음', '진학 실적에 단서', '사용한 사진·영상의 촬영 동의 확인', '학교·기관 로고 사용 허락 확인', '파일명에 버전 표기']
  for (const b of boxes) {
    await poster.getByLabel(b, { exact: false }).check()
    await page.waitForTimeout(300)
  }
  await poster.getByRole('button', { name: '확인 완료 (대표·행정팀)' }).click()
  check('제작자 본인 확인 완료 불가(교차 검수)', await visible(page.getByText('제작 담당자가 아닌 사람이 확인해야 합니다', { exact: false })))

  // 3) 다른 직원이 확인 완료 → 배포
  const p2 = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  p2.on('pageerror', (e) => errors.push(e.message))
  await login(p2, 'staff2@dev.local')
  await p2.goto(`${BASE}/admin/programs/${pid}?step=prep`)
  await toggle(p2, '포스터').click()
  await item(p2, '포스터').getByRole('button', { name: '확인 완료 (대표·행정팀)' }).click()
  check('다른 직원: 확인 완료', await visible(p2.getByText('"포스터" 확인 완료했습니다.')))
  await item(p2, '포스터').getByLabel('배포 채널').fill('파트너 학원 드라이브')
  await item(p2, '포스터').getByRole('button', { name: '배포 완료' }).click()
  check('배포 완료 기록', await visible(p2.getByText('"포스터" 배포 완료로 기록했습니다.')))
  check('DB: 확인자·배포일', sql(`select (approved_by = '33333333-3333-3333-3333-333333333333')::text || '|' || (distributed_on is not null)::text from program_prep_items where program_id = '${pid}' and template_key = 'poster'`) === 'true|true')
  await p2.close()

  // 4) 캠프 금액 변경 → 재확인 필요 + 변경 통보 할 일
  await page.goto(`${BASE}/admin/programs/${pid}?step=basic`)
  await page.getByLabel('총 참가비(원)').fill('4700000')
  await page.getByRole('button', { name: '기본 정보 저장' }).click()
  await visible(page.getByText('기본 정보를 저장했습니다.'))
  await page.getByRole('tab', { name: '6. 준비사항' }).click()
  check('금액 변경 → 재확인 필요 표시', await visible(page.getByText('재확인 필요').first()))
  check('파트너 학원 변경 통보(MOU-12) 할 일 생성', await visible(toggle(page, '파트너 학원 변경 통보(MOU-12)')))
  await toggle(page, '포스터').click()
  check('재확인 사유 안내', await visible(page.getByText('변경: 금액', { exact: false })))
  check('기준 정보 최신 금액', await visible(page.getByText('4,700,000원', { exact: true })))

  // 5) 할 일 완료 · 커미션 고지 자동 완료 · 학원 맞춤 포스터 추가
  await toggle(page, '파트너 학원 변경 통보(MOU-12)').click()
  await item(page, '파트너 학원 변경 통보(MOU-12)').getByRole('button', { name: '완료', exact: true }).click()
  check('할 일 완료', await visible(page.getByText('"파트너 학원 변경 통보(MOU-12)" 완료했습니다.')))
  await toggle(page, '커미션 사전 고지(MOU-15)').click()
  check('커미션 고지: 납부 규칙에서 기록 안내', await visible(page.getByText('[2. 납부 규칙]에서 커미션 고지일을 기록하면', { exact: false })))
  await page.getByRole('button', { name: '+ 학원 맞춤 포스터(MAT-01)' }).click()
  await page.getByLabel('요청 학원(선택)').selectOption({ label: '대전 인투학원' })
  await page.getByRole('button', { name: '추가', exact: true }).click()
  check('학원 맞춤 포스터 추가', await visible(page.getByText('"학원 맞춤 포스터(MAT-01)"을(를) 추가했습니다.')))

  // 6) 모집 시작 경고: 직원은 막힘
  await page.getByRole('tab', { name: '7. 공개' }).click()
  await page.getByLabel('모집 상태').selectOption('open')
  check('직원: 모집 전 준비물 남으면 경고', await visible(page.getByText('모집 전에 끝내야 할 준비물', { exact: false })))
  check('직원: 사유 입력란 없음', (await page.getByLabel('그래도 모집을 시작하는 사유(관리자)').count()) === 0)
  check('DB: 모집 전 유지', sql(`select status from programs where id = '${pid}'`) === 'before')

  // 7) 모아보기
  await page.getByRole('link', { name: '캠프 준비사항' }).click()
  check('모아보기: 캠프명과 함께 표시', await visible(page.getByText('여름 영어 캠프 · 2027 여름').first()))
  await page.getByRole('button', { name: /^재확인 필요/ }).click()
  check('모아보기: 재확인 필요 필터', await visible(page.getByRole('link', { name: /포스터.*여름 영어 캠프/ })))
  await page.getByRole('tab', { name: '기본 목록' }).click()
  check('직원: 기본 목록은 읽기 전용', await visible(page.getByText('기본 목록은 관리자만 바꿀 수 있습니다.')))

  // 8) 캠프 목록 준비율 배지
  await page.getByRole('link', { name: '캠프·프로그램' }).click()
  check('목록: 준비율 배지', await visible(page.getByText(/준비 1\/1[01]/)))
  check('목록: 준비물 마감 지남 배지', await visible(page.getByText('준비물 마감 지남', { exact: false })))
  await page.screenshot({ path: `${OUT}/m6-list.png`, fullPage: true })
  await ctx.close()

  // 9) 관리자: 사유 기록 후 모집 시작, 기본 목록 수정
  const a = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  a.on('pageerror', (e) => errors.push(e.message))
  await login(a, 'admin@dev.local')
  await a.goto(`${BASE}/admin/programs/${pid}?step=publish`)
  await a.getByLabel('모집 상태').selectOption('open')
  await a.getByLabel('그래도 모집을 시작하는 사유(관리자)').fill('설명회 일정상 먼저 시작, 영상은 다음 주 배포')
  await a.getByRole('button', { name: '사유 기록 후 모집 시작' }).click()
  check('관리자: 사유 기록 후 모집 시작', await visible(a.getByText('사유를 기록하고 모집을 시작했습니다.')))
  check('DB: 모집 중 + 사유 기록', sql(`select status || '|' || (prep_override_reason is not null) from programs where id = '${pid}'`) === 'open|true')

  await a.goto(`${BASE}/admin/prep?tab=templates`)
  const row = a.locator('li', { has: a.getByRole('textbox', { name: '준비물' }).and(a.locator('[value="포스터"]')) })
  await row.getByLabel('며칠(전은 음수)').fill('-10')
  check('마감 설명 미리보기', await visible(row.getByText('모집 시작 10일 전')))
  await row.getByRole('button', { name: '저장' }).click()
  check('관리자: 기본 목록 수정', await visible(a.getByText('"포스터" 기본값을 저장했습니다.')))
  check('DB: 기본값 반영', sql(`select due_offset_days from prep_item_templates where key = 'poster'`) === '-10')
  check('커미션 고지 기준은 고정(입력 비활성)', await a.locator('li', { has: a.locator('[value="커미션 사전 고지(MOU-15)"]') }).getByLabel('며칠(전은 음수)').isDisabled())
  await a.close()

  // 10) 모바일 375px
  const m = await browser.newPage({ viewport: { width: 375, height: 812 } })
  m.on('pageerror', (e) => errors.push(e.message))
  await login(m, 'staff@dev.local')
  for (const url of [`/admin/programs/${pid}?step=prep`, '/admin/prep', '/admin/prep?tab=templates']) {
    await m.goto(`${BASE}${url}`)
    await m.waitForTimeout(900)
    const w = await m.evaluate(() => document.documentElement.scrollWidth)
    check(`375px 가로 스크롤 없음: ${url}`, w <= 375, `scrollWidth=${w}`)
  }
  await m.goto(`${BASE}/admin/programs/${pid}?step=prep`)
  await toggle(m, '포스터').click()
  await m.waitForTimeout(500)
  const w2 = await m.evaluate(() => document.documentElement.scrollWidth)
  check('375px: 준비물 상세 펼쳐도 가로 스크롤 없음', w2 <= 375, `scrollWidth=${w2}`)
  await m.screenshot({ path: `${OUT}/m6-prep-mobile.png`, fullPage: true })
  await m.close()

  check('브라우저 스크립트 오류 없음', errors.length === 0, errors.join(' | '))
  await browser.close()
  console.log(results.join('\n'))
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0)
})().catch((e) => {
  console.log(results.join('\n'))
  console.error('E2E 중단:', e.message.split('\n')[0])
  process.exit(1)
})
