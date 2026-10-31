// M5 브라우저 E2E: 캠프 만들기 단계(기본·납부 규칙·신청서 항목·동의/환불·주요 일정·공개) + 복제 + 커미션 비공개
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
  const browser = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } })
  const errors = []
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('dialog', (d) => d.accept())
  await login(page, 'staff@dev.local')

  // 1) 기본 정보
  await page.getByRole('link', { name: '캠프·프로그램' }).click()
  await page.getByRole('link', { name: '+ 캠프 만들기' }).click()
  await page.getByLabel('프로그램 이름 (필수)').fill('겨울 스쿨링 캠프')
  await page.getByLabel('기수·시즌').fill('2027 1차')
  check('신청서 링크 주소 자동 추천', (await page.getByLabel('신청서 링크 주소').inputValue()) === 'gyeoul-seukulring-kaempeu-2027-1cha', await page.getByLabel('신청서 링크 주소').inputValue())
  await page.getByLabel('신청서 링크 주소').fill('winter-schooling-2027-1')
  await page.getByLabel('국가').fill('미국')
  await page.getByLabel('출국일(시작일)').fill('2027-01-02')
  await page.getByLabel('귀국일(종료일)').fill('2027-01-29')
  await page.getByLabel('모집 시작일').fill('2026-11-01')
  await page.getByLabel('정원', { exact: true }).fill('10')
  await page.getByLabel('총 참가비(원)').fill('5990000')
  check('파기 예정일 미리보기', await visible(page.getByText('파기 예정일 2027.02.03(수)', { exact: false })))
  await page.getByRole('button', { name: '저장하고 다음 (납부 규칙)' }).click()
  await page.waitForURL(/step=payments/)
  check('기본 정보 저장 → 납부 규칙 단계', true)

  // 2) 납부 규칙 + 커미션(내부)
  await page.getByLabel('금액(원)').first().fill('1000000')
  check('잔금 자동 계산', (await page.getByLabel('금액(원)').nth(1).inputValue()) === '4990000')
  await page.getByRole('button', { name: '+ 추가 납부 항목(항공권 등)' }).click()
  await page.getByLabel('항목 이름').fill('항공권')
  await page.getByLabel('금액(원)').nth(2).fill('1800000')
  await page.getByLabel('기한 규칙').nth(2).selectOption('fixed')
  await page.getByLabel('날짜').fill('2026-11-20')
  await page.getByLabel('이 날 신청하면').fill('2026-11-05')
  check('미리보기: 예약금 신청 후 7일', await visible(page.getByText('1,000,000원 · 2026.11.12(목)까지')))
  check('미리보기: 잔금 출국 30일 전', await visible(page.getByText('4,990,000원 · 2026.12.03(목)까지')))
  check('커미션 내부 전용 표시', await visible(page.getByText('내부 전용 · 학부모 화면·알림에 표시되지 않음')))
  check('커미션 지급 시점(캠프 시작일)', await visible(page.getByText('캠프 시작일(출국일)에 지급')))
  check('커미션 고지 기한 2026.12.03', await visible(page.getByText('고지 기한 2026.12.03(목)', { exact: false })))
  await page.getByLabel('1인당 커미션(원)').fill('700000')
  await page.getByRole('button', { name: '납부 규칙 저장' }).click()
  check('납부 규칙 저장', await visible(page.getByText('납부 규칙과 커미션 정보를 저장했습니다.')))
  const rules = sql(`select string_agg(kind || ':' || amount || ':' || due_rule_type || ':' || coalesce(due_offset_days::text, due_fixed_date::text), ',' order by kind)
    from program_payment_rules r join programs p on p.id = r.program_id where p.slug = 'winter-schooling-2027-1'`)
  check('DB: 납부 규칙 3개', rules === 'balance:4990000:before_start:30,deposit:1000000:after_registration:7,extra:1800000:fixed:2026-11-20', rules)

  // 합계 불일치 검증
  await page.getByLabel('금액(원)').nth(1).fill('1')
  check('합계 불일치 경고', await visible(page.getByText('총 참가비', { exact: false }).filter({ hasText: '와 다릅니다' })))
  await page.getByRole('button', { name: '자동 계산' }).click()

  // 3) 신청서 항목
  await page.getByRole('tab', { name: '3. 신청서 항목' }).click()
  await page.getByRole('radiogroup', { name: '영어 수준' }).getByText('필수').click()
  await page.getByText('여권 사진 업로드 받기').click()
  await page.getByRole('button', { name: '신청서 항목 저장' }).click()
  check('신청서 항목 저장', await visible(page.getByText('신청서 항목을 저장했습니다.')))
  const formCfg = sql(`select (form_config->'fields'->>'english_level') || ':' || passport_upload_enabled from programs where slug = 'winter-schooling-2027-1'`)
  check('DB: 영어 수준 필수·여권 업로드', formCfg === 'required:true', formCfg)

  // 4) 동의·환불 규정
  await page.getByRole('tab', { name: '4. 동의·환불 규정' }).click()
  await page.waitForFunction(() => document.querySelector('textarea[aria-label="환불 규정"]')?.value.length > 0, null, { timeout: 10000 })
  check('환불 규정 기본안 자동 입력(캠프명 치환)', (await page.getByLabel('환불 규정').inputValue()).includes('[겨울 스쿨링 캠프 환불 규정]'))
  await page.getByLabel('현지 학교·기관명').fill('Cornerstone Christian Academy')
  await page.getByLabel('학교·기관 국가').fill('미국')
  await page.getByText('학부모에게 보일 동의 문구 미리보기').click()
  check('제3자 제공 동의 문구에 학교명 반영', await visible(page.getByText('Cornerstone Christian Academy / 미국', { exact: false })))
  await page.getByRole('button', { name: '동의·환불 규정 저장' }).click()
  check('동의·환불 규정 저장', await visible(page.getByText('동의·환불 규정을 저장했습니다', { exact: false })))
  await page.getByLabel('환불 규정').fill((await page.getByLabel('환불 규정').inputValue()) + '\n6. 추가 조항')
  await page.getByRole('button', { name: '동의·환불 규정 저장' }).click()
  check('환불 규정 수정 시 버전 증가', await visible(page.getByText('환불 규정 v2', { exact: false })))

  // 5) 주요 일정
  await page.getByRole('tab', { name: '5. 주요 일정' }).click()
  check('자동 일정: 커미션 고지 기한', await visible(page.getByText('커미션 사전 고지 기한 (MOU 학원)')))
  await page.getByRole('button', { name: '+ 항공권 발권 (출국 30일 전)' }).click()
  check('제안 일정 추가', await visible(page.getByText('2026.12.03(목)').nth(1)))
  await page.getByLabel('일정 이름').fill('학부모 설명회')
  await page.getByLabel('날짜').fill('2026-12-12')
  await page.getByRole('button', { name: '추가', exact: true }).click()
  check('직접 일정 추가', await visible(page.getByText('"학부모 설명회" 일정을 추가했습니다.')))

  // 6) 공개 (모집 시작 경고는 M6 E2E에서 자세히 확인)
  await page.getByRole('tab', { name: '7. 공개' }).click()
  await page.getByLabel('모집 상태').selectOption('open')
  check('준비물이 남으면 모집 중 전환 경고(직원)', await visible(page.getByText('모집 전에 끝내야 할 준비물', { exact: false })))
  check('DB: 모집 전 유지', sql(`select status from programs where slug = 'winter-schooling-2027-1'`) === 'before')
  check('신청서 링크', await visible(page.getByText(`${BASE}/register/winter-schooling-2027-1`, { exact: true })))
  check('학원별 링크', await visible(page.getByText(`${BASE}/register/winter-schooling-2027-1?ref=daejeon-into`, { exact: true })))
  await page.getByRole('button', { name: '전체 복사' }).click()
  check('학원별 링크 전체 복사', await visible(page.getByText('학원 1곳의 링크를 복사했습니다', { exact: false })))
  check('배포 시 링크 잠금', sql(`select slug_locked from programs where slug = 'winter-schooling-2027-1'`) === 't')
  await page.screenshot({ path: `${OUT}/m5-publish.png`, fullPage: true })

  // 7) 복제
  await page.getByRole('button', { name: '다음 기수로 복제' }).click()
  await page.getByLabel('새 출국일').fill('2027-01-30')
  await page.getByLabel('새 기수·시즌').fill('2027 2차')
  await page.getByRole('button', { name: '복제하기' }).click()
  await page.waitForTimeout(1500)
  check('복제 후 새 프로그램 화면', await visible(page.getByText('다른 기수에서 복제한 프로그램입니다', { exact: false })))
  check('복제: 날짜 이동', await visible(page.getByText('2027.01.30(토) ~ 2027.02.26(금)', { exact: false })))
  const copy = sql(`select p.status || '|' || p.slug_locked || '|' || count(r.*) || '|' || coalesce(p.commission_notice_sent_on::text, '-') from programs p
    left join program_payment_rules r on r.program_id = p.id where p.season = '2027 2차' group by p.id`)
  check('복제: 모집 전·잠금 해제·규칙 3개·고지 기록 초기화', copy === 'before|false|3|-', copy)

  // 8) 목록
  await page.getByRole('link', { name: '캠프·프로그램' }).click()
  check('목록: 정원 대비 등록', await visible(page.getByText('/ 10명', { exact: false })))
  check('목록: 커미션 표시(내부)', await visible(page.getByText('커미션 700,000원').first()))
  await page.screenshot({ path: `${OUT}/m5-list.png`, fullPage: true })
  await ctx.close()

  // 9) 공개 신청서: 프로그램은 보이고 커미션은 없음
  const pub = await browser.newPage({ viewport: { width: 375, height: 812 } })
  pub.on('pageerror', (e) => errors.push(e.message))
  await pub.goto(`${BASE}/apply`)
  check('공개 신청서: 새 캠프가 관심 프로그램에 표시', await visible(pub.getByText('겨울 스쿨링 캠프 (2027 1차)')))
  check('공개 신청서: 커미션 문구 없음', (await pub.getByText('커미션').count()) === 0)
  await pub.close()

  // 10) 현지 팀 접근 불가 + 모바일
  const v = await browser.newPage()
  await login(v, 'viewer@dev.local')
  await v.goto(`${BASE}/admin/programs`)
  check('현지 팀: 캠프 관리 접근 불가', await visible(v.getByText('접근 권한이 없습니다')))
  await v.close()
  const m = await browser.newPage({ viewport: { width: 375, height: 812 } })
  m.on('pageerror', (e) => errors.push(e.message))
  await login(m, 'staff@dev.local')
  const pid = sql(`select id from programs where slug = 'winter-schooling-2027-1'`)
  for (const step of ['basic', 'payments', 'policies', 'publish']) {
    await m.goto(`${BASE}/admin/programs/${pid}?step=${step}`)
    await m.waitForTimeout(800)
    const w = await m.evaluate(() => document.documentElement.scrollWidth)
    check(`375px 가로 스크롤 없음: ${step}`, w <= 375, `scrollWidth=${w}`)
  }
  await m.goto(`${BASE}/admin/programs/${pid}?step=payments`)
  await m.waitForTimeout(800)
  await m.screenshot({ path: `${OUT}/m5-payments-mobile.png`, fullPage: true })
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
