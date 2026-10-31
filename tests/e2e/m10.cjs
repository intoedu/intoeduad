// M10 브라우저 E2E: 커미션 — 자동 산정(소개·학원 간 소개)·지급 지연 경고·선택 지급·보류·제외·기록 시트 CSV
//                 → 원장님 월말 보고(이름 가림) → 사전 고지일 기록 → 특별 합의 금액·공휴일 → 직원 권한
const { chromium } = require('playwright')
const { execFileSync } = require('child_process')
const fs = require('fs')
const OUT = process.env.E2E_OUT || 'test-results'
fs.mkdirSync(OUT, { recursive: true })
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
// 등록 → 완납 → 소개 경로 확인 = 등록 확정
function confirmedReg(program, name, phone, shareAgreed) {
  const partner = sql(`select id from partners where code = 'daejeon-into'`)
  const contact = sql(`select id from partner_contacts where code = 'kim'`)
  const id = sql(`insert into registrations (program_id, partner_id, partner_contact_id, attribution_source, student_name_ko, parent_name, parent_phone, status, destroy_due_date, partner_share_agreed)
    values ('${program}', '${partner}', '${contact}', 'link', '${name}', '부모', '${phone}', 'deposit_pending', public.kst_today() + 90, ${shareAgreed}) returning id`).split('\n')[0]
  sql(`insert into payment_schedules (registration_id, kind, label, amount_due, due_date) values ('${id}', 'balance', '참가비', 1000000, public.kst_today() + 10)`)
  sql(`insert into payments (schedule_id, amount, method) select id, 1000000, 'transfer' from payment_schedules where registration_id = '${id}'`)
  sql(`update registrations set attribution_confirmed_at = now() where id = '${id}'`)
  return id
}

;(async () => {
  const referrer = sql(`insert into partners (name, region, code) values ('세종 소개학원', '세종', 'sejong-ref') returning id`).split('\n')[0]
  sql(`update partners set referred_by_partner_id = '${referrer}' where code = 'daejeon-into'`)
  sql(`update settings set value = jsonb_set(value, '{referral_rate}', '0.1') where key = 'commission'`)
  const camp = sql(`insert into programs (type, name, season, start_date, end_date, total_price, slug, commission_amount)
    values ('camp', '미국 캠프', '2027 겨울', public.kst_today() + 40, public.kst_today() + 60, 1000000, 'comm-e2e', 300000) returning id`).split('\n')[0]
  const study = sql(`insert into programs (type, name, start_date, end_date, total_price, slug)
    values ('study_abroad', '미국 유학', public.kst_today() + 200, public.kst_today() + 500, 1000000, 'study-e2e') returning id`).split('\n')[0]
  const r1 = confirmedReg(camp, '박세준', '01055550001', false)
  const r2 = confirmedReg(camp, '김하늘', '01055550002', true)
  const r3 = confirmedReg(study, '이유학', '01055550003', false)
  check('DB: 등록 확정 → 커미션 자동 산정(소개 2 + 학원 간 소개 2 + 유학 2)', sql(`select count(*) from commissions`) === '6')
  check('DB: 유학 금액 미정 → 보류', sql(`select status from commissions where registration_id = '${r3}' and kind = 'base'`) === 'held')
  // 김하늘 커미션 지급 예정일을 지난 날짜로 → 지급 지연
  sql(`update commissions set due_date = public.kst_today() - 3 where registration_id = '${r2}' and kind = 'base'`)

  const browser = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } })
  const errors = []
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  let promptAnswer = '대표 판단 대기'
  page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? promptAnswer : undefined))
  await login(page, 'admin@dev.local')

  // 1) 지급 관리
  await page.goto(`${BASE}/admin/commissions`)
  check('지급 지연 경고', await visible(page.getByText('지급하지 않은 커미션이', { exact: false })))
  check('지연 표시', await visible(page.getByText('지연', { exact: true })))
  check('학원 간 소개 수수료 행', await visible(page.getByText('학원 간 소개 수수료').first()))
  check('금액 미정 표시', await visible(page.getByRole('cell', { name: '미정' })))
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '기록 시트 CSV' }).click()])
  const csv = fs.readFileSync(await dl.path(), 'utf8')
  check('기록 시트 CSV(부록 C 항목)', csv.includes('소개 학원,상담실장,구분,학생,프로그램,신청일,계약금(예약금) 납부,완납일') && csv.includes('박세준'))
  await page.getByLabel('김하늘 지급 선택').first().check()
  await page.getByLabel('메모(이체 내역 등)').fill('국민 이체')
  await page.getByRole('button', { name: '지급 완료 기록' }).click()
  check('선택 지급 처리', await visible(page.getByText('1건을 지급 완료로 기록했습니다.')))
  check('DB: 지급 완료·지급자', sql(`select status || '/' || (paid_by is not null) from commissions where registration_id = '${r2}' and kind = 'base'`) === 'paid/true')
  check('지급 후 지연 경고 사라짐', (await page.getByText('지급하지 않은 커미션이', { exact: false }).count()) === 0)
  // 보류(사유 입력) → 제외
  const row1 = page.getByRole('row', { name: '커미션 대전 인투학원 박세준' })
  await row1.getByRole('button', { name: '보류' }).click()
  check('보류 처리(사유)', await visible(page.getByText('대표 판단 대기')))
  promptAnswer = '허위·과장 분쟁'
  await page.getByLabel('상태').selectOption('all')
  await page.getByRole('row', { name: '커미션 대전 인투학원 박세준' }).getByRole('button', { name: '제외' }).click()
  check('지급 제외(사유)', await visible(page.getByText('허위·과장 분쟁')))
  check('DB: 관리자 처리는 자동 판단 해제', sql(`select auto_status from commissions where registration_id = '${r1}' and kind = 'base'`) === 'f')
  await page.screenshot({ path: `${OUT}/m10-payouts.png`, fullPage: true })

  // 2) 원장님 월말 보고 — 학원 제공 동의 없는 학생은 이름 가림
  await page.getByRole('tab', { name: '원장님 안내·월말 보고' }).click()
  await page.getByLabel('학원', { exact: true }).selectOption({ label: '대전 인투학원' })
  const report = page.getByLabel('안내 문구')
  await report.waitFor()
  const text = await report.inputValue()
  check('월말 보고: 이름 가림(동의 없음)', text.includes('박*준') && !text.includes('박세준'))
  check('월말 보고: 동의한 학생은 이름 표시', text.includes('김하늘'))
  check('월말 보고: 이번 달 지급 합계', text.includes('이번 달 지급 내역 (합계 300,000원)'))
  check('카카오톡 요약', (await page.getByLabel('카카오톡 요약').inputValue()).includes('이번 달 지급 300,000원'))
  await page.getByRole('button', { name: '복사' }).first().click()
  check('안내 문구 복사', await visible(page.getByText('안내 문구을(를) 복사했습니다.')))

  // 3) 사전 고지
  await page.getByRole('tab', { name: '사전 고지(제8조)' }).click()
  const notice = page.locator('div', { has: page.getByText('미국 캠프 (2027 겨울)', { exact: true }) }).last().locator('..')
  await page.getByRole('button', { name: '고지일 기록' }).first().click()
  check('고지일 기록 + 이의 기한 표시', await visible(page.getByText('이의 기한', { exact: false })))
  check('DB: 고지일', sql(`select commission_notice_sent_on is not null from programs where id = '${camp}'`) === 't')
  void notice

  // 4) 설정: 특별 합의 금액 → 지급 전 커미션 재계산, 공휴일
  await page.getByRole('tab', { name: '요율·특별 합의·공휴일' }).click()
  check('공휴일: 확인 필요 표시(어린이날)', await visible(page.getByText('확인 필요').first()))
  await page.getByLabel('학원', { exact: true }).selectOption({ label: '대전 인투학원' })
  await page.getByLabel('프로그램').selectOption({ label: '미국 유학' })
  await page.getByLabel('1인당 금액').fill('450000')
  await page.getByRole('button', { name: '저장' }).nth(1).click()
  check('특별 합의 금액 저장', await visible(page.getByText('특별 합의 금액을 저장했습니다.')))
  check('DB: 보류(금액 미정) → 지급 예정 450,000', sql(`select status || '/' || amount from commissions where registration_id = '${r3}' and kind = 'base'`) === 'scheduled/450000')
  await page.getByLabel('날짜').fill('2027-06-03')
  await page.getByLabel('이름').fill('임시공휴일')
  await page.getByRole('button', { name: '공휴일 추가' }).click()
  check('공휴일 추가', await visible(page.getByText('임시공휴일')))

  // 5) 등록생 상세에 커미션(내부)
  await page.goto(`${BASE}/admin/registrations/${r2}`)
  check('등록생 상세: 커미션(내부 전용)', await visible(page.getByText('커미션 (내부 전용)')))

  // 6) 직원: 열람만
  const staff = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  staff.on('pageerror', (e) => errors.push(e.message))
  await login(staff, 'staff@dev.local')
  await staff.goto(`${BASE}/admin/commissions`)
  check('직원: 커미션 열람', await visible(staff.getByRole('cell', { name: /세종 소개학원/ })))
  check('직원: 지급 선택·처리 버튼 없음', (await staff.getByRole('button', { name: '지급 완료 기록' }).count()) === 0 && (await staff.getByRole('button', { name: '보류' }).count()) === 0)
  await staff.getByRole('tab', { name: '요율·특별 합의·공휴일' }).click()
  check('직원: 설정 변경 불가 안내', await visible(staff.getByText('설정은 관리자만 바꿀 수 있습니다.')))
  // 학부모 화면에는 커미션 정보 없음
  sql(`update programs set status = 'open' where id = '${camp}'`)
  const parent = await browser.newPage({ viewport: { width: 375, height: 812 } })
  await parent.goto(`${BASE}/register/comm-e2e`)
  await parent.getByRole('heading', { name: /등록 신청/ }).waitFor()
  check('학부모 신청서: 커미션 정보 없음', !/커미션|수수료|300,000/.test(await parent.content()))

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
