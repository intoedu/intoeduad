// M4 브라우저 E2E: 상담 신청 목록·필터 → 고객 카드(담당자·상태·소개 경로 확인·상담 방식·일정 변경·메모·타임라인·신청서 링크)
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

async function submitLead(body) {
  const res = await fetch(`${API}/functions/v1/public-lead-submit`, {
    method: 'POST',
    headers: { apikey: KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ agree_privacy: true, agree_guardian: true, ...body }),
  })
  return res.status
}

;(async () => {
  // 준비: 상담 시간 2개 + 신청 2건(실장 링크 + 슬롯 / 기타 경로)
  sql(`insert into consultation_slots (starts_at, ends_at) values
       (date_trunc('hour', now()) + interval '2 days', date_trunc('hour', now()) + interval '2 days 30 minutes'),
       (date_trunc('hour', now()) + interval '3 days', date_trunc('hour', now()) + interval '3 days 30 minutes')`)
  const firstSlot = sql(`select id from consultation_slots order by starts_at limit 1`)
  const s1 = await submitLead({
    partner_code: 'daejeon-into', contact_code: 'kim', student_name: '정하준', student_grade: '중2', interests: ['camp'],
    program_ids: [sql(`select id from programs where slug = 'us-schooling-2027w'`)],
    parent_name: '정부모', parent_phone: '01070001111', relation: '아버지', topics: ['cost'], message: '비용 문의', slot_id: firstSlot,
  })
  const s2 = await submitLead({ source_other: '블로그', student_name: '한지우', student_grade: '초6', parent_name: '한부모', parent_phone: '01070002222', relation: '어머니' })
  check('준비: 신청 2건 접수', s1 === 200 && s2 === 200, `${s1}/${s2}`)

  const browser = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } })
  const errors = []
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('dialog', (d) => d.accept())

  await login(page, 'staff@dev.local')
  check('사이드바 신규 배지 2', await visible(page.getByLabel('신규 2건')))
  await page.getByRole('link', { name: /^상담 신청/ }).click()
  await page.waitForURL('**/admin/leads')
  check('목록: 두 건 표시', await visible(page.getByText('정하준 · 중2')) && await visible(page.getByText('한지우 · 초6')))
  check('목록: 소개 경로 미확인 배지', (await page.getByText('소개 경로 미확인', { exact: true }).count()) === 2)
  check('목록: 상담 방식 미정 표시', await visible(page.getByText('방식 미정')))

  // 필터·검색
  await page.getByLabel('검색').fill('7000-2222'.replace('-', ''))
  await page.waitForTimeout(800)
  check('검색: 전화번호 일부로 찾기', (await page.getByText('한지우 · 초6').count()) === 1 && (await page.getByText('정하준 · 중2').count()) === 0)
  await page.getByLabel('검색').fill('')
  await page.waitForTimeout(800)
  await page.getByLabel('유입 학원').selectOption({ label: '대전 인투학원' })
  await page.waitForTimeout(500)
  check('필터: 학원', (await page.getByText('정하준 · 중2').count()) === 1 && (await page.getByText('한지우 · 초6').count()) === 0)
  await page.getByLabel('유입 학원').selectOption({ label: '모든 학원' })
  await page.screenshot({ path: `${OUT}/m4-list.png`, fullPage: true })

  // 고객 카드
  await page.getByText('정하준 · 중2').click()
  await page.waitForURL(/\/admin\/leads\/[0-9a-f-]+$/)
  check('카드: 신청 내용', await visible(page.getByText('비용 문의')))
  await page.getByLabel('소개한 선생님(상담실장)').locator('option', { hasText: '김상담' }).waitFor({ state: 'attached' })
  check('카드: 실장 링크로 들어온 소개 경로 표시', (await page.getByLabel('소개한 선생님(상담실장)').inputValue()) !== '')
  await page.getByRole('button', { name: '내가 담당하기' }).click()
  check('담당자 지정', await visible(page.getByText('내가 담당하기로 했습니다.')))
  await page.getByLabel('진행 상태').selectOption('contacting')
  check('상태 변경', await visible(page.getByText('상태를 변경했습니다.')))

  // 상담 방식: 화상 + 링크
  await page.getByText('화상', { exact: true }).click()
  check('상담 방식 화상 지정', await visible(page.getByText('상담 방식을 "화상"(으)로 정했습니다.')))
  await page.getByLabel('화상 회의 링크').fill('javascript:alert(1)')
  await page.getByRole('button', { name: '링크 저장' }).click()
  check('잘못된 회의 링크 거부', await visible(page.getByText('http:// 또는 https:// 로 시작해야 합니다', { exact: false })))
  await page.getByLabel('화상 회의 링크').fill('https://meet.example.com/abc')
  await page.getByRole('button', { name: '링크 저장' }).click()
  check('회의 링크 저장', await visible(page.getByText('화상 회의 링크를 저장했습니다.')))

  // 일정 변경: 다른 슬롯으로
  await page.getByRole('button', { name: '일정 변경' }).click()
  await page.getByLabel('열려 있는 상담 시간에서 고르기').selectOption({ index: 1 })
  await page.getByRole('button', { name: '이 시간으로 변경' }).click()
  check('일정 변경', await visible(page.getByText('상담 일정을 변경했습니다.')))
  const counts = sql(`select string_agg(booked_count::text, ',' order by starts_at) from consultation_slots`)
  check('일정 변경 시 이전 시간은 다시 열림', counts === '0,1', counts)

  // 소개 경로 확인
  await page.getByRole('button', { name: '소개 경로 확인 처리' }).click()
  check('소개 경로 확인', await visible(page.getByText('소개 경로를 확인했습니다.', { exact: false })))
  check('확인 후 직원은 수정 불가(잠김)', await page.getByLabel('소개 학원').isDisabled())
  const confirmedBy = sql(`select s.name from leads l join staff_profiles s on s.id = l.attribution_confirmed_by where l.student_name = '정하준'`)
  check('확인자 기록', confirmedBy === '행정직원(개발)', confirmedBy)

  // 메모 + 타임라인
  await page.getByLabel('메모 입력').fill('아버지와 통화, 화상 상담 선호')
  await page.getByRole('button', { name: '메모 남기기' }).click()
  check('메모 저장', await visible(page.getByText('아버지와 통화, 화상 상담 선호').first()))
  await page.reload()
  for (const text of ['상담 신청 접수', '담당자 지정: 행정직원(개발)', '상태 변경: 신규 → 연락 중', '상담 방식: 화상', '상담 일정 변경', '소개 경로 확인']) {
    check(`타임라인: ${text}`, await visible(page.getByText(text, { exact: true })))
  }

  // 등록 신청서 링크
  await page.getByRole('button', { name: '링크 만들고 복사' }).click()
  check('신청서 링크 생성', await visible(page.getByText('등록 신청서 링크를 복사했습니다', { exact: false })))
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  check('링크 형식(프로그램·토큰·학원 코드)', /\/register\/us-schooling-2027w\?t=[A-Za-z0-9_-]{30,}&ref=daejeon-into$/.test(clip), clip)
  check('토큰은 해시로만 저장', sql(`select count(*) from access_tokens where token_hash = encode(extensions.digest('${clip.split('t=')[1].split('&')[0]}', 'sha256'), 'hex')`) === '1')
  await page.screenshot({ path: `${OUT}/m4-detail.png`, fullPage: true })

  // 상담 완료 → 취소 시 슬롯 반환
  await page.getByRole('button', { name: '상담 완료' }).click()
  check('상담 완료 기록', await visible(page.getByText('상담 완료로 기록했습니다.')))
  await page.getByRole('button', { name: '상담 취소' }).click()
  check('상담 취소', await visible(page.getByText('상담을 취소했습니다.')))
  check('취소하면 슬롯 반환', sql(`select sum(booked_count) from consultation_slots`) === '0')
  check('취소 후 상담 추가 버튼', await visible(page.getByRole('button', { name: '+ 상담 추가' })))
  await ctx.close()

  // 관리자: 확인 해제 가능
  const actx = await browser.newContext({ viewport: { width: 1366, height: 900 } })
  const admin = await actx.newPage()
  admin.on('pageerror', (e) => errors.push(e.message))
  admin.on('dialog', (d) => d.accept())
  await login(admin, 'admin@dev.local')
  await admin.goto(`${BASE}/admin/leads?unconfirmed=1`)
  check('관리자: 미확인 필터', await visible(admin.getByText('한지우 · 초6')) && (await admin.getByText('정하준 · 중2').count()) === 0)
  await admin.goto(`${BASE}/admin/leads`)
  await admin.getByText('정하준 · 중2').click()
  await admin.getByRole('button', { name: '확인 해제 (관리자)' }).click()
  check('관리자: 확인 해제', await visible(admin.getByText('소개 경로 확인을 해제했습니다.')))
  await actx.close()

  // 모바일 375px
  const mctx = await browser.newContext({ viewport: { width: 375, height: 812 } })
  const m = await mctx.newPage()
  m.on('pageerror', (e) => errors.push(e.message))
  await login(m, 'staff@dev.local')
  await m.goto(`${BASE}/admin/leads`)
  await visible(m.getByText('정하준 · 중2'))
  let w = await m.evaluate(() => document.documentElement.scrollWidth)
  check('375px 목록 가로 스크롤 없음', w <= 375, `scrollWidth=${w}`)
  await m.getByText('정하준 · 중2').click()
  await visible(m.getByText('신청 내용'))
  w = await m.evaluate(() => document.documentElement.scrollWidth)
  check('375px 고객 카드 가로 스크롤 없음', w <= 375, `scrollWidth=${w}`)
  await mctx.close()

  // 현지 팀: 접근 불가
  const vctx = await browser.newContext()
  const v = await vctx.newPage()
  await login(v, 'viewer@dev.local')
  await v.goto(`${BASE}/admin/leads`)
  check('현지 팀: 상담 신청 접근 불가', await visible(v.getByText('접근 권한이 없습니다')))
  await vctx.close()

  check('브라우저 스크립트 오류 없음', errors.length === 0, errors.join(' | '))
  await browser.close()
  console.log(results.join('\n'))
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0)
})().catch((e) => {
  console.log(results.join('\n'))
  console.error('E2E 중단:', e.message.split('\n')[0])
  process.exit(1)
})
