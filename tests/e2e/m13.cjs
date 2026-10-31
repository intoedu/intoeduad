// M13 브라우저 E2E: 알림 — 설정(솔라피·직원 알림·사이트 주소) → 등록 신청 즉시 납부 안내·직원 알림(드라이런) → 발송 기록(번호 가림)
//                 → 금액 변경 후 정정 안내 1회 → 테스트 발송 → 꺼 두면 "보내지 않음" + 다시 보내기 → 예약 작업 경로
const { chromium } = require('playwright')
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const OUT = process.env.E2E_OUT || 'test-results'
fs.mkdirSync(OUT, { recursive: true })
const BASE = 'http://localhost:5173'
const API = 'http://127.0.0.1:54321'
const KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'
const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const sql = (q) => execFileSync('psql', ['-qAt', DB, '-c', q], { encoding: 'utf8' }).trim()
const env = Object.fromEntries(fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/.env'), 'utf8').split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)))
const results = []
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`)
const visible = async (locator, timeout = 10000) => {
  try { await locator.first().waitFor({ state: 'visible', timeout }); return true } catch { return false }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
async function login(page, email) {
  await page.goto(`${BASE}/login`)
  await page.getByLabel('이메일').fill(email)
  await page.getByLabel('비밀번호').fill('devpass1234')
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL('**/admin')
}
async function waitStatus(purpose, relatedId) {
  for (let i = 0; i < 30; i++) {
    const s = sql(`select status from message_logs where purpose = '${purpose}'${relatedId ? ` and related_id = '${relatedId}'` : ''} order by created_at desc limit 1`)
    if (s && s !== 'queued') return s
    await wait(500)
  }
  return 'queued'
}

;(async () => {
  check('준비: 로컬 드라이런 모드', env.SOLAPI_DRY_RUN === 'true')
  const pid = sql(`insert into programs (type, name, season, start_date, end_date, capacity, total_price, slug)
    values ('camp', '알림 캠프', '2027 겨울', public.kst_today() + 40, public.kst_today() + 60, 10, 5000000, 'msg-e2e') returning id`).split('\n')[0]
  sql(`insert into program_payment_rules (program_id, kind, label, amount, due_rule_type, due_offset_days)
    values ('${pid}', 'deposit', '예약금', 1000000, 'after_registration', 7), ('${pid}', 'balance', '잔금', 4000000, 'before_start', 30)`)
  sql(`update programs set status = 'open' where id = '${pid}'`)

  const browser = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } })
  const errors = []
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('dialog', (d) => d.accept())
  await login(page, 'admin@dev.local')

  // 1) 설정
  await page.goto(`${BASE}/admin/settings/general`)
  await page.getByLabel('채널 채팅 주소').fill('https://pf.kakao.com/_AkclX/chat')
  await page.getByLabel('사이트 주소').fill('https://intoedu.example')
  await page.getByLabel('은행').fill('국민은행')
  await page.getByLabel('계좌번호').fill('123456-01-234567')
  await page.getByLabel('예금주').fill('인투유학')
  await page.getByRole('button', { name: '기본 설정 저장' }).click()
  check('기본 설정(사이트 주소) 저장', await visible(page.getByText('기본 설정을 저장했습니다.')))
  await page.getByRole('tab', { name: '알림' }).click()
  check('알림 설정: API 키는 화면에 없음 안내', await visible(page.getByText('Edge Function 시크릿', { exact: false })))
  await page.getByLabel('알림톡·문자 사용').check()
  await page.getByLabel('발신번호(솔라피 등록 번호)').fill('02-123-4567')
  await page.getByLabel('카카오 채널 pfId').fill('KA01PF_TEST')
  for (const name of ['상담 신청 접수 안내', '캠프 등록 신청 접수·납부 안내', '캠프 대기 접수 안내', '납부 안내 변경']) await page.getByLabel(name).fill(`tpl_${name.length}`)
  await page.getByLabel('직원 알림 사용', { exact: false }).check()
  await page.getByLabel('신규 상담 신청').check()
  await page.getByLabel('신규 캠프 등록 신청').check()
  await page.getByRole('button', { name: '알림 설정 저장' }).click()
  check('알림 설정 저장', await visible(page.getByText('알림 설정을 저장했습니다.')))
  const me = page.getByRole('listitem', { name: '알림 받을 직원 관리자(개발)' })
  await me.getByLabel('관리자(개발) 휴대폰').fill('010-9999-0000')
  await me.getByLabel('문자').check()
  await me.getByRole('button', { name: '저장' }).click()
  check('직원 알림 받기 저장', await visible(page.getByText('관리자(개발)님 알림 받기를 저장했습니다.')))
  await page.getByRole('button', { name: '나에게 문자 테스트' }).click()
  check('테스트 문자(드라이런 보냄)', await visible(page.getByText('테스트 발송 결과: 보냄 1', { exact: false }), 15000))

  // 2) 학부모 등록 신청 → 즉시 납부 안내 + 직원 알림
  const r = await fetch(`${API}/functions/v1/public-register`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'submit', slug: 'msg-e2e', student_name_ko: '알림학생', student_name_en: 'ALIM', birth_date: '2015-01-01', gender: 'male', grade: '초6',
      parent_name: '알림부모', parent_phone: '010-4444-5678', parent_email: 'p@example.com', emergency_name: '아빠', emergency_phone: '01099998888',
      agree: { reg_privacy: true, reg_third_party: true, reg_guardian: true, refund: true, destruction_notice: true } }),
  })
  check('등록 신청 접수', r.status === 200)
  const reg = sql(`select id from registrations where student_name_ko = '알림학생'`)
  check('납부 안내 알림톡 즉시 처리(드라이런 보냄)', (await waitStatus('registration_payment_notice', reg)) === 'sent')
  check('직원 알림(신규 등록) 보냄', (await waitStatus('staff_new_registration', reg)) === 'sent')
  check('DB: 번호는 가린 형태 + 해시만', sql(`select to_masked || '|' || (length(to_hash) = 64) from message_logs where purpose = 'registration_payment_notice'`) === '010-****-5678|true')
  check('DB: 알림톡 버튼용 확인 링크 새로 발급', sql(`select count(*) from access_tokens where registration_id = '${reg}' and purpose = 'my_view'`) === '2')

  // 3) 발송 기록 화면
  await page.goto(`${BASE}/admin/messages`)
  check('발송 기록: 등록·납부 안내 보냄', await visible(page.getByRole('row', { name: /등록·납부 안내.*010-\*\*\*\*-5678.*보냄/ })))
  check('발송 기록: 직원 알림(이름 표시)', await visible(page.getByRole('row', { name: /직원: 신규 등록.*관리자\(개발\)/ })))
  await page.screenshot({ path: `${OUT}/m13-messages.png`, fullPage: true })

  // 4) 금액 변경 → 정정 안내 1회
  await page.goto(`${BASE}/admin/registrations/${reg}`)
  check('등록생 상세: 알림 발송 이력', await visible(page.getByRole('list', { name: '알림 발송 기록' }).getByText('등록·납부 안내')))
  const bal = page.getByRole('listitem', { name: '납부 일정 잔금' })
  await bal.getByRole('button', { name: '금액·기한 변경' }).click()
  await bal.getByLabel('금액', { exact: true }).fill('3800000')
  await bal.getByLabel('바꾸는 이유(필수, 기록됨)').fill('숙소 변경 감액')
  await bal.getByRole('button', { name: '변경 저장' }).click()
  await page.getByRole('button', { name: '정정 안내 보내기' }).click()
  check('정정 안내 보냄', await visible(page.getByText('납부 정정 안내를 보냈습니다.'), 15000))
  check('DB: 정정 안내 기록', sql(`select payment_correction_sent_at is not null from registrations where id = '${reg}'`) === 't')
  await page.reload()
  check('정정 후 안내 문구 사라짐', (await page.getByText('정정 안내를 1회 보내 주세요', { exact: false }).count()) === 0)

  // 5) 알림 끄면 "보내지 않음" + 이유, 관리자 다시 보내기
  sql(`update settings set value = jsonb_set(value, '{enabled}', 'false') where key = 'solapi'`)
  await fetch(`${API}/functions/v1/public-lead-submit`, {
    method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ student_name: '꺼짐학생', parent_name: '부모', parent_phone: '01055554444', agree_privacy: true, agree_guardian: true }),
  })
  const lead = sql(`select id from leads where student_name = '꺼짐학생'`)
  check('알림 꺼짐 → 보내지 않음', (await waitStatus('lead_received', lead)) === 'skipped')
  await page.goto(`${BASE}/admin/messages`)
  check('보내지 않은 이유 표시', await visible(page.getByText('알림톡 사용 안 함(설정)').first()))
  sql(`update settings set value = jsonb_set(value, '{enabled}', 'true') where key = 'solapi'`)
  await page.getByRole('row', { name: /상담 접수 안내.*보내지 않음/ }).getByRole('button', { name: '다시 보내기' }).click()
  await page.getByRole('button', { name: '대기 건 지금 보내기' }).click()
  check('다시 보내기 → 보냄', (await waitStatus('lead_received', lead)) === 'sent')

  // 6) 예약 작업 경로
  check('예약 작업: 매분 발송', sql(`select schedule from cron.job where jobname = 'message-sender'`) === '* * * * *')
  const bad = await fetch(`${API}/functions/v1/message-sender`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'x-runner-token': 'nope' } })
  check('러너 토큰 없으면 거부', bad.status === 403)
  sql(`select vault.create_secret('http://api.supabase.internal:8000', 'project_url'); select vault.create_secret('${KEY}', 'publishable_key'); select vault.create_secret('${env.MESSAGE_RUNNER_TOKEN}', 'message_runner_token')`)
  sql(`insert into message_logs (channel, purpose, status, related_type, recipient_staff_id) values ('sms', 'staff_test', 'queued', 'staff', '11111111-1111-1111-1111-111111111111')`)
  const reqId = sql(`select public.invoke_message_sender()`)
  let code = ''
  for (let i = 0; i < 20 && !code; i++) {
    await wait(500)
    code = sql(`select coalesce(status_code::text, '') from net._http_response where id = ${reqId}`)
  }
  check('DB → 발송 함수 호출(pg_net) 200', code === '200', code)

  check('페이지 오류 없음', errors.length === 0, errors.join(' | '))
  await browser.close()
  console.log(results.join('\n'))
  const failed = results.filter((x) => x.startsWith('FAIL')).length
  console.log(`\n${results.length - failed}/${results.length} PASS`)
  process.exit(failed ? 1 : 0)
})().catch((e) => {
  console.error(e)
  console.log(results.join('\n'))
  process.exit(1)
})
