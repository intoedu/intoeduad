// M17 브라우저 E2E: 항공권·ESTA·보험 대행 — 캠프 설정 → 학부모 신청서 대행 선택(필수·대행료) → 완료 화면 → 출국 서류 정보 제출(동의·보호자)
//                 → 다시 열기(여권번호 가림) → 직원 상세(출국 서류·ESTA 상태) → 권한 없는 직원 → 목록 필터 → 직원 직접 입력
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
async function login(page, id) {
  await page.goto(`${BASE}/login`)
  await page.getByLabel('아이디 또는 이메일').fill(id)
  await page.getByLabel('비밀번호').fill('devpass1234')
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL('**/admin')
}

;(async () => {
  sql(`delete from programs where slug = 'agency-e2e'`)
  const start = sql(`select (public.kst_today() + 60)::text`)
  const pid = sql(`insert into programs (type, name, season, start_date, end_date, capacity, total_price, slug, waitlist_enabled)
    values ('camp', '대행 캠프', '2027 겨울', '${start}', '${start}'::date + 25, 10, 5000000, 'agency-e2e', true) returning id`).split('\n')[0]
  sql(`insert into program_payment_rules (program_id, kind, label, amount, due_rule_type, due_offset_days) values
    ('${pid}', 'deposit', '계약금', 1000000, 'after_registration', 7), ('${pid}', 'balance', '원금', 4000000, 'before_start', 30)`)

  const browser = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } })
  const errors = []
  const admin = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  admin.on('pageerror', (e) => errors.push(e.message))
  await login(admin, 'admin@dev.local')

  // 1) 캠프 설정: 대행 안내 켜기 + 미국 내 연락처
  await admin.goto(`${BASE}/admin/programs/${pid}?step=payments`)
  await admin.getByText('신청서에서 항공권·ESTA·여행자보험 대행 여부 묻기').click()
  await admin.getByLabel('미국 내 연락처 이름 (ESTA)').fill('INTO EDU USA OFFICE')
  await admin.getByRole('button', { name: '납부 규칙 저장' }).click()
  await visible(admin.getByText('납부 규칙과 커미션 정보를 저장했습니다.'))
  let saved = ''
  for (let i = 0; i < 20 && saved !== 'true|INTO EDU USA OFFICE'; i++) {
    saved = sql(`select agency_enabled::text || '|' || coalesce(us_contact ->> 'name', '') from programs where id = '${pid}'`)
    if (saved !== 'true|INTO EDU USA OFFICE') await admin.waitForTimeout(300)
  }
  check('캠프 설정 저장: 대행 안내 켜짐·미국 내 연락처', saved === 'true|INTO EDU USA OFFICE', saved)
  sql(`update programs set status = 'open' where id = '${pid}'`)

  // 2) 설정: 대행료 표
  await admin.goto(`${BASE}/admin/settings/general`)
  check('기본 설정: 대행료 3칸', (await admin.getByLabel('2개 선택(원)').inputValue()) === '50000')

  // 3) 학부모 신청서
  const parent = await browser.newPage({ viewport: { width: 390, height: 844 } })
  parent.on('pageerror', (e) => errors.push(e.message))
  await parent.goto(`${BASE}/register/agency-e2e?ref=daejeon-into`)
  check('신청서: 대행 안내 섹션', await visible(parent.getByText('항공권·ESTA·여행자보험 대행').first()))
  await parent.getByLabel('학생 이름(한글)').fill('대행학생')
  await parent.getByLabel(/영문 이름/).fill('hong gildong')
  await parent.getByLabel(/생년월일/).fill('2014-03-15')
  await parent.getByText('남', { exact: true }).click()
  await parent.getByLabel(/^학년/).selectOption('초6')
  await parent.getByLabel('학부모 이름').fill('대행부모')
  await parent.getByLabel('휴대폰 번호').fill('010-1818-1818')
  await parent.getByText('네, 사용해요', { exact: true }).click()
  { const nc = parent.getByText('아니요, 처음이에요', { exact: true }); if (await nc.count()) await nc.click() }
  await parent.getByLabel(/^이메일/).fill('agency@example.com')
  await parent.getByLabel('이름', { exact: true }).fill('보호자')
  await parent.getByLabel('관계').selectOption('아버지')
  await parent.getByLabel('연락처', { exact: true }).fill('010-1818-0000')
  await agreeTo(parent, '[필수] 1. 개인정보').check()
  await agreeTo(parent, '[필수] 3. 개인정보 제3자').check()
  await agreeTo(parent, '[필수] 5. 법정대리인').check()
  await agreeTo(parent, '[필수] 환불 규정 확인').check()
  await parent.getByLabel('[필수] 개인정보 파기 안내를 확인했습니다.').check()
  await parent.getByRole('button', { name: '등록 신청하기' }).click()
  check('대행 여부 미선택 → 안내', await visible(parent.getByText('항공권·ESTA·여행자보험 대행 여부를 선택해 주세요.')))
  await parent.getByText('대행을 원합니다').click()
  await parent.getByRole('button', { name: '등록 신청하기' }).click()
  check('항목 미선택 → 안내', await visible(parent.getByText('대행할 항목을 하나 이상 골라 주세요.')))
  await parent.getByRole('checkbox', { name: /^항공권/ }).check()
  await parent.getByRole('checkbox', { name: /^ESTA/ }).check()
  check('대행료 2개 50,000원 표시', await visible(parent.getByText('대행료 50,000원')))
  let w = await parent.evaluate(() => document.documentElement.scrollWidth)
  check('390px 신청서 가로 스크롤 없음', w <= 390, `scrollWidth=${w}`)
  await parent.getByRole('button', { name: '등록 신청하기' }).click()
  await parent.waitForURL('**/register/done', { timeout: 15000 }).catch(() => {})
  check('완료 화면: 대행 신청 표시', await visible(parent.getByText('대행 신청:', { exact: false })))
  check('완료 화면: 납부 일정에 대행료', await visible(parent.getByText('대행료(항공권·ESTA)', { exact: false })))
  const rid = sql(`select id from registrations where student_name_ko = '대행학생'`)
  check('DB: 대행 선택·대행료·납부 줄', sql(`select agency_choice || '|' || array_to_string(agency_services, ',') || '|' || agency_fee || '|' ||
      (select amount_due from payment_schedules where registration_id = r.id and agency_fee) from registrations r where id = '${rid}'`) === 'agency|esta,flight|50000|50000')

  // 4) 출국 서류 정보
  await parent.getByRole('link', { name: '출국 서류 정보 입력하기' }).click()
  await parent.waitForURL('**/travel', { timeout: 15000 }).catch(() => {})
  check('출국 서류 화면 열림', await visible(parent.getByRole('heading', { name: '출국 서류 정보' })))
  check('학생 영문 이름 미리 채움(성/이름)', (await parent.getByLabel('영문 성 (여권과 동일)').first().inputValue()) === 'HONG' &&
    (await parent.getByLabel('영문 이름 (여권과 동일)').first().inputValue()) === 'GILDONG')
  await parent.getByRole('button', { name: '출국 서류 정보 보내기' }).click()
  check('필수 항목 안내(여권번호)', await visible(parent.getByText('여권번호를 입력해 주세요.')))
  await parent.getByLabel('여권번호').first().fill('m1234 5678')
  await parent.getByLabel('여권 발급일').first().fill('2022-01-10')
  await parent.getByLabel('여권 만료일').first().fill('2032-01-10')
  await parent.getByLabel('출생 도시 (영문)').first().fill('seoul')
  await parent.getByLabel('아버지 영문 성명').first().fill('hong gilsan')
  await parent.getByLabel('어머니 영문 성명').first().fill('kim younghee')
  await parent.getByLabel('집 주소 (영문)').first().fill('12, Teheran-ro, Gangnam-gu, Seoul')
  await parent.getByRole('button', { name: '+ 함께 출국하는 보호자 추가' }).click()
  await parent.getByLabel('학생과의 관계').selectOption('어머니')
  await parent.getByLabel('영문 성 (여권과 동일)').nth(1).fill('KIM')
  await parent.getByLabel('영문 이름 (여권과 동일)').nth(1).fill('YOUNGHEE')
  await parent.getByLabel('성별').nth(1).selectOption('female')
  await parent.getByLabel('생년월일').nth(1).fill('1984-08-08')
  await parent.getByLabel('여권번호').nth(1).fill('M87654321')
  await parent.getByLabel('여권 만료일').nth(1).fill('2030-08-08')
  await parent.getByLabel('직장명 (영문)').fill('Self-employed')
  await parent.getByRole('button', { name: '출국 서류 정보 보내기' }).click()
  check('동의 없으면 안내', await visible(parent.getByText('필수 동의 항목에 모두 동의해 주세요.').first()))
  await parent.getByText('[필수] 출국 서류 대행을 위한 개인정보 수집·이용 및 국외 제공 동의에 동의합니다.').click()
  await parent.getByText('[필수] 고유식별정보(여권번호) 처리 동의에 동의합니다.').click()
  w = await parent.evaluate(() => document.documentElement.scrollWidth)
  check('390px 출국 서류 화면 가로 스크롤 없음', w <= 390, `scrollWidth=${w}`)
  await parent.screenshot({ path: `${OUT}/m17-travel.png`, fullPage: true })
  await parent.getByRole('button', { name: '출국 서류 정보 보내기' }).click()
  check('제출 완료 안내', await visible(parent.getByText('출국 서류 정보를 받았습니다')))
  check('DB: 출국자 2명·여권번호 정리·동의 기록', sql(`select count(*) || '|' || max(passport_no) filter (where traveler_type = 'student') || '|' ||
      (select count(*) from consent_records where registration_id = '${rid}' and kind like 'travel%')
      from registration_travelers where registration_id = '${rid}'`) === '2|M12345678|2')
  const travelUrl = parent.url()
  await parent.goBack()
  await parent.goto(travelUrl.replace(/\/travel$/, '/travel'))
  check('다시 열면 여권번호 가림·수정 버튼', await visible(parent.getByText('저장됨: ******678', { exact: false })) &&
    await visible(parent.getByRole('button', { name: '수정한 내용 저장' })))

  // 5) 관리자 상세
  await admin.goto(`${BASE}/admin/registrations/${rid}`)
  check('상세: 대행 표시', await visible(admin.getByText('대행료 50,000원', { exact: false })))
  check('상세: 출국 서류 제출 표시', await visible(admin.getByText(/^제출 /)))
  check('상세: 출국 서류 내용(여권번호) 보임', await visible(admin.getByText('M12345678')))
  await admin.getByLabel('ESTA', { exact: true }).first().selectOption('approved')
  await admin.waitForTimeout(1000)
  check('ESTA 진행 상태 저장', sql(`select esta_status from registration_travelers where registration_id = '${rid}' and traveler_type = 'student'`) === 'approved')
  await admin.screenshot({ path: `${OUT}/m17-detail.png`, fullPage: true })

  // 대행 선택 변경 → 대행료 6만, 변경 사유
  await admin.getByRole('button', { name: '선택 바꾸기' }).click()
  await admin.getByRole('checkbox', { name: /^여행자보험/ }).check()
  await admin.getByRole('button', { name: '저장', exact: true }).click()
  await admin.waitForTimeout(1000)
  check('담당자 대행 변경 → 대행료 60,000원', sql(`select amount_due from payment_schedules where registration_id = '${rid}' and agency_fee and canceled_at is null`) === '60000')

  // 6) 여권 열람 권한 없는 직원
  const staff = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await login(staff, 'staff2@dev.local')
  await staff.goto(`${BASE}/admin/registrations/${rid}`)
  check('열람 권한 없는 직원: 출국 서류 내용 숨김', await visible(staff.getByText('여권 열람 권한이 있는 담당자만 볼 수 있습니다.')) &&
    (await staff.getByText('M12345678').count()) === 0)

  // 7) 목록 필터
  await admin.goto(`${BASE}/admin/registrations?flag=agency`)
  check('목록 필터(대행): 학생 표시·대행 배지', await visible(admin.getByText('대행학생')) && await visible(admin.getByText('항공권·ESTA·여행자보험').first()))
  await admin.goto(`${BASE}/admin/registrations?flag=self`)
  await admin.waitForTimeout(1000)
  check('목록 필터(직접): 대행 학생 없음', (await admin.getByText('대행학생').count()) === 0)

  // 8) 직원 직접 입력
  await admin.goto(`${BASE}/admin/registrations/new?program=${pid}`)
  check('직원 직접 입력: 대행 선택 보임', await visible(admin.getByText('대행을 원합니다')))

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
