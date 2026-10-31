// M7 브라우저 E2E: 캠프 등록 신청서 — 기본 설정·동의 문구 버전 → 학원 링크로 신청(모바일) → 완료·신청 내용 확인
//                → 상담 기록 링크로 미리 채움 → 정원 도달 시 대기 접수 → 모집 전·마감 화면 → 고객 카드 타임라인
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

const agreeTo = (page, title) => page.getByRole('checkbox', { name: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) })

async function fillStudent(page, { ko, en, phone }) {
  await page.getByLabel('학생 이름(한글)').fill(ko)
  await page.getByLabel(/영문 이름/).fill(en)
  await page.getByLabel(/생년월일/).fill('2015-03-02')
  await page.getByText('여', { exact: true }).click()
  await page.getByLabel(/^학년/).selectOption('초6')
  await page.getByLabel('학부모 이름').fill('이엄마')
  await page.getByLabel('휴대폰 번호').fill(phone)
  await page.getByLabel(/^이메일/).fill('mom@example.com')
  await page.getByLabel('이름', { exact: true }).fill('이아빠')
  await page.getByLabel('관계').selectOption('아버지')
  await page.getByLabel('연락처', { exact: true }).fill('010-3333-4444')
}

async function agreeAll(page, { health = false } = {}) {
  // 여권 사진은 M8에서 따로 확인 — 여기서는 "나중에 제출"
  const later = page.getByText('나중에 제출', { exact: true })
  if (await later.count()) await later.click()
  await agreeTo(page, '[필수] 1. 개인정보').check()
  await agreeTo(page, '[필수] 2. 고유식별정보').check()
  await agreeTo(page, '[필수] 3. 개인정보 제3자').check()
  if (health) await agreeTo(page, '[선택] 4. 민감정보').check()
  await agreeTo(page, '[필수] 5. 법정대리인').check()
  await agreeTo(page, '[필수] 환불 규정 확인').check()
  await page.getByLabel('[필수] 개인정보 파기 안내를 확인했습니다.').check()
}

;(async () => {
  const start = sql(`select (public.kst_today() + 60)::text`)
  const pid = sql(`insert into programs (type, name, season, country, start_date, end_date, capacity, total_price, slug,
      passport_upload_enabled, health_field_enabled, waitlist_enabled, third_party_recipients, description)
    values ('camp', '미국 스쿨링 캠프', '2027 겨울', '미국', '${start}', '${start}'::date + 25, 2, 5000000, 'us-school-e2e',
      true, true, true, '{"ticketing":"하나투어","school":{"name":"Lincoln School","country":"미국"},"lodging":{"name":"Maple Homestay","country":"미국"}}',
      '미국 현지 학교 정규 수업 체험') returning id`).split('\n')[0]
  sql(`insert into program_payment_rules (program_id, kind, label, amount, due_rule_type, due_offset_days)
    values ('${pid}', 'deposit', '예약금', 1000000, 'after_registration', 7), ('${pid}', 'balance', '잔금', 4000000, 'before_start', 30)`)
  sql(`update programs set status = 'open' where id = '${pid}'`)
  // 제3자 대상 미입력 캠프(공개 단계 경고 확인용)
  const pid2 = sql(`insert into programs (type, name, start_date, end_date, total_price, slug)
    values ('camp', '대상 미입력 캠프', '${start}', '${start}'::date + 10, 0, 'no-recipients-e2e') returning id`).split('\n')[0]

  const browser = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } })
  const errors = []
  const admin = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  admin.on('pageerror', (e) => errors.push(e.message))
  admin.on('dialog', (d) => d.accept())
  await login(admin, 'admin@dev.local')

  // 1) 기본 설정: 카카오 채널·입금 계좌
  await admin.goto(`${BASE}/admin/settings/general`)
  await admin.getByLabel('채널 채팅 주소').fill('https://pf.kakao.com/_AkclX/chat')
  await admin.getByLabel('은행').fill('국민은행')
  await admin.getByLabel('계좌번호').fill('123456-01-234567')
  await admin.getByRole('button', { name: '기본 설정 저장' }).click()
  check('입금 계좌는 셋 다 입력해야 저장(예금주 누락)', await visible(admin.getByText('은행·계좌번호·예금주를 모두 입력해 주세요.')))
  await admin.getByLabel('예금주').fill('인투유학')
  await admin.getByRole('button', { name: '기본 설정 저장' }).click()
  check('기본 설정 저장', await visible(admin.getByText('기본 설정을 저장했습니다.')))
  check('DB: 입금 계좌', sql(`select value->>'holder' from settings where key = 'bank_account'`) === '인투유학')

  // 2) 동의 문구 새 버전 (개인정보 수집·이용 v2)
  await admin.goto(`${BASE}/admin/settings/consents`)
  const privacyCard = admin.getByRole('region', { name: '등록 신청 — 1. 개인정보 수집·이용' })
  await privacyCard.getByRole('button', { name: '보기·수정' }).click()
  const body = privacyCard.getByLabel('본문')
  await body.fill((await body.inputValue()) + '\n5. 문의: 인투유학 카카오톡 채널')
  await privacyCard.getByRole('button', { name: '새 버전으로 저장' }).click()
  check('동의 문구 v2 저장', await visible(admin.getByText('문구를 v2로 저장했습니다.', { exact: false })))
  check('DB: 기존 v1 보존 + v2 추가', sql(`select string_agg(version::text, ',' order by version) from consent_documents where kind = 'reg_privacy'`) === '1,2')
  await admin.screenshot({ path: `${OUT}/m7-consents.png`, fullPage: true })

  // 3) 공개 단계: 제3자 제공 대상 미입력 경고
  await admin.goto(`${BASE}/admin/programs/${pid2}?step=publish`)
  check('제3자 제공 대상 미입력 경고', await visible(admin.getByText('항공권 발권처·현지 학교·기관·숙소 기관이(가) 비어 있어', { exact: false })))
  await admin.goto(`${BASE}/admin/programs/${pid}?step=publish`)
  await admin.waitForTimeout(800)
  check('대상 입력 캠프는 경고 없음', (await admin.getByText('비어 있어, 신청서의 제3자 제공').count()) === 0)

  // 4) 학부모: 학원·실장 링크로 신청 (모바일 375px)
  const parent = await browser.newPage({ viewport: { width: 375, height: 812 } })
  parent.on('pageerror', (e) => errors.push(e.message))
  await parent.goto(`${BASE}/register/us-school-e2e?ref=daejeon-into&c=kim`)
  check('신청서: 캠프 정보', await visible(parent.getByRole('heading', { name: '미국 스쿨링 캠프 (2027 겨울) 등록 신청' })))
  check('소개 경로 자동 표시', await visible(parent.getByText('대전 인투학원 김상담 선생님 소개로 신청합니다.', { exact: false })))
  check('납부 안내: 예약금·잔금 미리보기', await visible(parent.getByText('1,000,000원')) && await visible(parent.getByText('4,000,000원')))
  check('제3자 제공 문구에 기관 치환', (await parent.content()).includes('Lincoln School'))
  check('동의 문구 최신 버전(v2) 표시', (await parent.content()).includes('5. 문의: 인투유학 카카오톡 채널'))
  check('파기 안내 상자', await visible(parent.getByRole('note', { name: '개인정보 파기 안내' })))
  check('여권 제출 선택', await visible(parent.getByText('지금 올리기', { exact: true })))
  let w = await parent.evaluate(() => document.documentElement.scrollWidth)
  check('375px 신청서 가로 스크롤 없음', w <= 375, `scrollWidth=${w}`)

  await parent.getByRole('button', { name: '등록 신청하기' }).click()
  check('빈 제출 시 오류 안내', await visible(parent.getByText('학생 이름을 입력해 주세요.')))
  check('필수 동의 안내', await visible(parent.getByText('필수 동의 항목에 모두 동의해 주세요.')))
  await fillStudent(parent, { ko: '이바다', en: 'lee  bada', phone: '010-1111-2222' })
  await parent.getByLabel('건강 특이사항 (선택)').fill('땅콩 알레르기')
  await agreeAll(parent)
  await parent.getByRole('button', { name: '등록 신청하기' }).click()
  check('건강 정보 입력 시 민감정보 동의 요구', await visible(parent.getByText('민감정보 수집·이용에 동의해 주세요', { exact: false })))
  await agreeTo(parent, '[선택] 4. 민감정보').check()
  await agreeTo(parent, '[선택] 6. 소개 학원').check()
  check('학원 제공 동의에 학원명 치환', (await parent.content()).includes('대전 인투학원 (인투유학을 소개한 학원)'))
  await parent.screenshot({ path: `${OUT}/m7-register-form.png`, fullPage: true })
  await parent.getByRole('button', { name: '등록 신청하기' }).click()
  await parent.waitForURL('**/register/done', { timeout: 15000 }).catch(() => {})
  check('완료 화면', await visible(parent.getByRole('heading', { name: '등록 신청이 접수되었습니다' })))
  check('완료: 입금 계좌', await visible(parent.getByText('국민은행 123456-01-234567 (예금주 인투유학)')))
  check('완료: 납부 일정', await visible(parent.getByText('4,000,000원')))
  check('완료: 파기 안내', await visible(parent.getByRole('note', { name: '개인정보 파기 안내' })))
  check('완료: 카카오톡 문의 버튼', (await parent.getByRole('link', { name: '인투유학 카카오톡 문의 바로가기' }).getAttribute('href')) === 'https://pf.kakao.com/_AkclX/chat')
  w = await parent.evaluate(() => document.documentElement.scrollWidth)
  check('375px 완료 화면 가로 스크롤 없음', w <= 375, `scrollWidth=${w}`)
  await parent.screenshot({ path: `${OUT}/m7-register-done.png`, fullPage: true })

  const reg = sql(`select status || '|' || coalesce(student_name_en,'') || '|' || attribution_source || '|' || partner_share_agreed || '|' ||
      (select name from partner_contacts where id = partner_contact_id) from registrations where program_id = '${pid}' and student_name_ko = '이바다'`)
  check('DB: 등록(신청 접수·영문 대문자·링크 경로·학원 제공 동의·실장)', reg === 'received|LEE BADA|link|true|김상담', reg)
  check('DB: 납부 일정 2건', sql(`select count(*) from payment_schedules s join registrations r on r.id = s.registration_id where r.program_id = '${pid}'`) === '2')
  check('DB: 동의 기록에 v2 문구 저장', sql(`select document_version from consent_records c join registrations r on r.id = c.registration_id
    where r.program_id = '${pid}' and c.kind = 'reg_privacy'`) === '2')
  check('DB: 건강 정보 저장', sql(`select count(*) from registration_health_notes h join registrations r on r.id = h.registration_id where r.program_id = '${pid}'`) === '1')

  // 5) 신청 내용 확인 페이지
  await parent.getByRole('link', { name: '신청 내용 확인 페이지 열기' }).click()
  check('신청 내용 확인: 상태', await visible(parent.getByText('신청 접수')))
  check('신청 내용 확인: 학생·여권 미제출', await visible(parent.getByText('이바다')) && await visible(parent.getByText('미제출')))
  check('신청 내용 확인: 납부 예정', await visible(parent.getByText('납부 예정').first()))
  check('신청 내용 확인: 주소 미표시', !(await parent.content()).includes('mom@example.com'))
  await parent.screenshot({ path: `${OUT}/m7-my.png`, fullPage: true })
  await parent.goto(`${BASE}/my/not-a-real-token-1234567890`)
  check('잘못된 확인 링크', await visible(parent.getByText('링크가 올바르지 않거나 만료되었습니다.')))

  // 6) 상담 기록 링크 → 미리 채움, 상담 고객 등록 전환
  const leadId = sql(`insert into leads (student_name, student_grade, parent_name, parent_phone, status)
    values ('김하늘', '초5', '김엄마', '01077778888', 'consulted') returning id`).split('\n')[0]
  sql(`insert into access_tokens (token_hash, purpose, lead_id, expires_at)
    values (encode(extensions.digest('e2e-prefill-token-abcdefg', 'sha256'), 'hex'), 'prefill', '${leadId}', now() + interval '3 days')`)
  await parent.goto(`${BASE}/register/us-school-e2e?t=e2e-prefill-token-abcdefg`)
  await parent.waitForTimeout(1500)
  check('미리 채움: 학생 이름', (await parent.getByLabel('학생 이름(한글)').inputValue()) === '김하늘')
  check('미리 채움: 학부모 번호', (await parent.getByLabel('휴대폰 번호').inputValue()) === '01077778888')
  check('학원 정보 없으면 경로 선택', await visible(parent.getByLabel('어디서 알게 되셨나요?')))
  await parent.getByLabel('어디서 알게 되셨나요?').selectOption({ label: '해당 없음' })
  await parent.getByLabel(/영문 이름/).fill('KIM HANEUL')
  await parent.getByLabel(/생년월일/).fill('2016-05-05')
  await parent.getByText('남', { exact: true }).click()
  await parent.getByLabel(/^학년/).selectOption('초5')
  await parent.getByLabel(/^이메일/).fill('kim@example.com')
  await parent.getByLabel('이름', { exact: true }).fill('김아빠')
  await parent.getByLabel('연락처', { exact: true }).fill('01055556666')
  await agreeAll(parent)
  check('학원 없으면 학원 제공 동의 미표시', (await agreeTo(parent, '[선택] 6. 소개 학원').count()) === 0)
  await parent.getByRole('button', { name: '등록 신청하기' }).click()
  check('미리 채움 신청 완료', await visible(parent.getByRole('heading', { name: '등록 신청이 접수되었습니다' }), 15000))
  check('DB: 상담 고객 등록 전환', sql(`select status from leads where id = '${leadId}'`) === 'converted')
  check('DB: 등록-상담 연결', sql(`select count(*) from registrations where lead_id = '${leadId}'`) === '1')

  // 7) 정원(2명) 도달 → 대기 접수
  await parent.goto(`${BASE}/register/us-school-e2e`)
  check('정원 도달: 대기 접수 안내', await visible(parent.getByText('대기 접수', { exact: false })))
  check('대기: 납부 안내 미표시', (await parent.getByRole('heading', { name: '납부 안내' }).count()) === 0)
  await parent.getByLabel('어디서 알게 되셨나요?').selectOption({ label: '기타 (직접 입력)' })
  await parent.getByLabel('알게 된 경로').fill('지인 소개')
  await fillStudent(parent, { ko: '박세번', en: 'PARK SEBEON', phone: '010-9999-0000' })
  await agreeAll(parent)
  await parent.getByRole('button', { name: '대기 신청하기' }).click()
  check('대기 접수 완료 화면', await visible(parent.getByRole('heading', { name: '대기 접수되었습니다' }), 15000))
  check('DB: 대기·납부 일정 없음·경로 직접 입력', sql(`select status || '|' || (select count(*) from payment_schedules where registration_id = r.id) || '|' || source_other
    from registrations r where student_name_ko = '박세번'`) === 'waitlisted|0|지인 소개')

  // 8) 모집 마감·모집 전
  sql(`update programs set status = 'closed' where id = '${pid}'`)
  await parent.goto(`${BASE}/register/us-school-e2e`)
  check('마감 화면', await visible(parent.getByText('모집이 마감되었습니다.')))
  await parent.goto(`${BASE}/register/no-recipients-e2e`)
  check('모집 전 화면', await visible(parent.getByText('아직 모집 전입니다', { exact: false })))
  await parent.goto(`${BASE}/register/nothing-here`)
  check('없는 신청서', await visible(parent.getByText('신청서를 찾을 수 없습니다', { exact: false })))

  // 9) 고객 카드 타임라인에 등록 표시
  await admin.goto(`${BASE}/admin/leads/${leadId}`)
  check('고객 카드: 등록 신청 타임라인', await visible(admin.getByText('등록 신청 접수: 미국 스쿨링 캠프 (2027 겨울)')))

  // 10) 직원은 설정(기본 설정·동의 문구) 접근 불가
  const staff = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  await login(staff, 'staff@dev.local')
  await staff.goto(`${BASE}/admin/settings/consents`)
  await staff.waitForTimeout(1000)
  check('직원: 동의 문구 화면 접근 불가', (await staff.getByRole('button', { name: '새 버전으로 저장' }).count()) === 0)

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
