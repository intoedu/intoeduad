// M21 브라우저 E2E: 현지 팀(담당 캠프만) — 최종 오리엔테이션 일정(미국 동부 시간 입력 → 한국 시간 안내)·일괄 안내·같은 내용 건너뛰기·변경 안내,
//                 1:1 오리엔테이션 일정 저장·안내·변경 안내 → 발송 함수(DRY RUN)가 변수까지 만들어 "보냄" 처리
// 다시 돌릴 때는 npx supabase db reset 후 실행
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
  try {
    await locator.first().waitFor({ state: 'visible', timeout })
    return true
  } catch {
    return false
  }
}
const poll = async (fn, want, tries = 30) => {
  let v
  for (let i = 0; i < tries; i++) {
    v = fn()
    if (v === want) return v
    await new Promise((r) => setTimeout(r, 500))
  }
  return v
}
async function login(page, id) {
  await page.goto(`${BASE}/login`)
  await page.getByLabel('아이디 또는 이메일').fill(id)
  await page.getByLabel('비밀번호').fill('devpass1234')
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL('**/admin')
}

;(async () => {
  const US = 'aaaaaaaa-0000-0000-0000-000000000001'
  // 등록생 2명 + 대기 1명(안내 대상 아님), 알림톡 켜기(로컬 발송 함수는 DRY RUN)
  sql(`insert into registrations (program_id, status, student_name_ko, student_name_en, parent_name, parent_phone, kakao_use) values
    ('${US}', 'received', '오티학생', 'OT KID', '오티부모', '01021210001', true),
    ('${US}', 'confirmed', '오티둘째', null, '둘째부모', '01021210002', true),
    ('${US}', 'waitlisted', '대기학생', null, '대기부모', '01021210003', true)`)
  sql(`update settings set value = jsonb_build_object('enabled', true, 'sender_number', '0212345678', 'pf_id', 'PF-TEST', 'sms_fallback', true,
    'templates', (select jsonb_object_agg(k, 'T-' || k) from unnest(array['lead_received','registration_payment_notice','registration_waitlisted',
      'payment_notice_correction','orientation_scheduled','orientation_rescheduled','final_orientation_notice','final_orientation_changed']) k)) where key = 'solapi'`)
  sql(`delete from message_logs`)

  const browser = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } })
  const errors = []
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('dialog', (d) => d.accept())
  await login(page, 'viewer@dev.local')

  // 1) 현지 팀 메뉴·담당 캠프만
  check('현지 팀 메뉴에 오리엔테이션 안내', await visible(page.getByRole('link', { name: '오리엔테이션 안내' })))
  await page.getByRole('link', { name: '오리엔테이션 안내' }).click()
  await page.waitForURL('**/admin/orientation')
  await page.getByLabel('캠프').waitFor()
  check('담당 캠프만 보임', (await page.getByLabel('캠프').locator('option').count()) === 1)
  await page.getByLabel('입력하는 시간 기준').selectOption('America/New_York')

  // 2) 최종 오리엔테이션: 뉴욕 12/20 00:00 = 한국 12/20 14:00
  await page.getByLabel(/^일시 \(미국 동부/).fill('2026-12-20T00:00')
  check('한국 시간 미리 보기', await visible(page.getByText('학부모 안내: 2026년 12월 20일(일) 14:00 (한국 시간)')))
  await page.getByLabel('장소·방식').fill('인투유학 대전 센터 3층')
  await page.getByLabel(/참고 사항/).fill('학생과 학부모님이 함께 참석해 주세요')
  await page.getByRole('button', { name: '일정 저장' }).click()
  check('최종 OT 저장', await visible(page.getByText('최종 오리엔테이션 일정을 저장했습니다', { exact: false })))
  check('캠프 일정(캘린더)에 표시', sql(`select date || '|' || memo from program_milestones where program_id = '${US}' and category = 'orientation' and title = '최종 오리엔테이션'`)
    === '2026-12-20|14:00 (한국 시간) · 인투유학 대전 센터 3층')
  check('대상: 등록생 2명(대기 제외)', (await page.getByRole('checkbox', { name: /학부모에게 보내기/ }).count()) === 2)
  check('미리 보기에 한국 시간', await visible(page.getByText('■ 일시: 2026년 12월 20일(일) 14:00 (한국 시간)', { exact: false })))
  await page.screenshot({ path: `${OUT}/m21-final.png`, fullPage: true })
  await page.getByRole('button', { name: '선택한 2명에게 안내 보내기' }).click()
  check('2명 발송 요청', await visible(page.getByText('2명에게 발송을 요청했습니다', { exact: false })))
  const sent = await poll(() => sql(`select count(*) from message_logs where purpose = 'final_orientation_notice' and status = 'sent'`), '2')
  check('발송 함수(DRY RUN)가 변수까지 만들어 보냄', sent === '2', sent + ' / ' + sql(`select string_agg(coalesce(error, status), ', ') from message_logs where purpose like 'final%'`))
  await page.reload()
  await page.getByLabel('입력하는 시간 기준').selectOption('America/New_York')
  check('목록 상태: 최종 OT 안내 보냄', (await page.getByText('최종 OT 안내 보냄').count()) === 2)
  await page.getByRole('button', { name: '모두 선택' }).click()
  await page.getByRole('button', { name: '선택한 2명에게 안내 보내기' }).click()
  check('같은 내용은 건너뜀', await visible(page.getByText('2명은 이미 같은 내용을 받아 건너뛰었습니다', { exact: false })))

  // 3) 일정 변경 → 변경 안내
  await page.getByLabel(/^일시 \(미국 동부/).fill('2026-12-21T05:00')
  await page.getByRole('button', { name: '일정 바꾸기' }).click()
  check('변경 저장', await visible(page.getByText('2026년 12월 21일(월) 19:00 (한국 시간)', { exact: false })))
  check('바뀐 일정 미안내 표시', await visible(page.getByText('바뀐 일정 아직 안내 안 함')))
  await page.getByRole('button', { name: '아직 안 받은 분만' }).click()
  await page.getByRole('button', { name: '선택한 2명에게 안내 보내기' }).click()
  await poll(() => sql(`select count(*) from message_logs where purpose = 'final_orientation_changed' and status = 'sent'`), '2')
  check('변경 안내(이전 일시 포함)', sql(`select count(*) from message_logs where purpose = 'final_orientation_changed' and status = 'sent'
    and (context ->> 'previous_starts_at')::timestamptz = '2026-12-20 05:00+00'`) === '2')

  // 4) 1:1 오리엔테이션
  await page.getByRole('tab', { name: '1:1 오리엔테이션' }).click()
  check('1:1 목록', await visible(page.getByText('일정을 정한 학생 0명 / 전체 2명')))
  await page.getByRole('button', { name: '일정 정하기' }).first().click()
  await page.getByLabel(/^일시 \(미국 동부/).fill('2026-12-14T20:00')
  check('1:1 한국 시간 미리 보기', await visible(page.getByText('학부모 안내: 2026년 12월 15일(화) 10:00 (한국 시간)')))
  check('담당 기본값(로그인한 선생님)', (await page.getByLabel('담당').inputValue()) === '현지팀(개발) 선생님')
  await page.getByLabel('담당').fill('줄리엣 선생님 (미국 센터)')
  await page.getByLabel('진행 방식').fill('Zoom 화상 · 회의 ID 812 3456 7890 · 암호 1234')
  await page.getByRole('button', { name: '저장하고 안내 보내기' }).click()
  check('저장하고 안내', await visible(page.getByText('일정 안내 발송을 요청했습니다', { exact: false })))
  const one = await poll(() => sql(`select status from message_logs where purpose = 'orientation_scheduled'`), 'sent')
  check('1:1 일정 안내 보냄', one === 'sent', one + ' ' + sql(`select coalesce(error, '') from message_logs where purpose = 'orientation_scheduled'`))
  await page.getByRole('button', { name: '일정 고치기' }).click()
  await page.getByLabel(/^일시 \(미국 동부/).fill('2026-12-16T19:00')
  await page.getByRole('button', { name: '저장하고 안내 보내기' }).click()
  check('바꾸면 변경 안내', await visible(page.getByText('변경 안내 발송을 요청했습니다', { exact: false })))
  await poll(() => sql(`select status from message_logs where purpose = 'orientation_rescheduled'`), 'sent')
  check('1:1 변경 안내 보냄', sql(`select status from message_logs where purpose = 'orientation_rescheduled'`) === 'sent')
  await page.getByRole('button', { name: '일정 정하기' }).first().click()
  await page.getByLabel(/^일시 \(미국 동부/).fill('2026-12-15T20:00')
  await page.getByLabel('진행 방식').fill('전화')
  await page.getByRole('button', { name: '저장만' }).click()
  check('저장만(안내 안 보냄)', await visible(page.getByText('안내는 아직 보내지 않음', { exact: false })))
  check('저장만 한 학생: 안내 보내기 버튼', await visible(page.getByRole('button', { name: '안내 보내기', exact: true })))
  check('대기열에 개인정보 없음', sql(`select count(*) from message_logs where context::text ~ '오티|0102121'`) === '0')
  await page.screenshot({ path: `${OUT}/m21-one.png`, fullPage: true })

  // 5) 직원은 모든 캠프, 발송 기록에 이름표
  const staff = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  staff.on('pageerror', (e) => errors.push(e.message))
  await login(staff, 'staff@dev.local')
  await staff.goto(`${BASE}/admin/orientation`)
  await staff.getByLabel('캠프').waitFor()
  check('직원: 모든 캠프', (await staff.getByLabel('캠프').locator('option').count()) >= 2)
  await staff.goto(`${BASE}/admin/messages`)
  check('발송 기록에 최종 OT 안내', await visible(staff.getByRole('cell', { name: '최종 OT 변경 안내' })))

  check('화면 오류 없음', errors.length === 0, errors.join(' / '))
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
