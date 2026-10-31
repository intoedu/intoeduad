// 등록 신청 동시 제출 테스트: 정원 N인 캠프에 동시에 20건을 보내면
// 대기 미사용 → 정확히 N건만 접수(나머지 마감), 대기 사용 → N건 접수 + 나머지 대기(납부 일정 없음)
// 실행: 로컬 Supabase + functions serve 실행 상태에서 `node tests/concurrency/registration-capacity.mjs`
import { execFileSync } from 'node:child_process'

const API = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'
const DB = process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const REQUESTS = 20

function sql(query) {
  return execFileSync('psql', ['-qAt', DB, '-c', query], { encoding: 'utf8' }).trim()
}

async function run(capacity, waitlist, tag) {
  const slug = `concurrency-${tag}-${Date.now().toString(36)}`
  const pid = sql(
    `insert into programs (type, name, start_date, end_date, capacity, total_price, slug, waitlist_enabled)
     values ('camp', '동시 신청 캠프', public.kst_today() + 60, public.kst_today() + 80, ${capacity}, 1000000, '${slug}', ${waitlist})
     returning id`,
  ).split('\n')[0]
  sql(`insert into program_payment_rules (program_id, kind, label, amount, due_rule_type, due_offset_days)
       values ('${pid}', 'balance', '참가비', 1000000, 'after_registration', 7)`)
  sql(`update programs set status = 'open' where id = '${pid}'`)
  const base = 20_000_000 + capacity * 1000 + (waitlist ? 500 : 0)
  const responses = await Promise.all(
    Array.from({ length: REQUESTS }, (_, i) =>
      fetch(`${API}/functions/v1/public-register`, {
        method: 'POST',
        headers: { apikey: KEY, 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          slug,
          student_name_ko: `동시학생${i}`,
          student_name_en: 'TEST',
          birth_date: '2015-01-01',
          gender: 'male',
          grade: '초6',
          parent_name: `동시부모${i}`,
          parent_phone: `010${base + i}`,
          parent_email: 'a@b.co',
          emergency_name: '비상',
          emergency_phone: '01000000000',
          agree: { reg_privacy: true, reg_third_party: true, reg_guardian: true, refund: true, destruction_notice: true },
        }),
      }).then(async (r) => ({ status: r.status, body: await r.json() })),
    ),
  )
  const received = responses.filter((r) => r.status === 200 && r.body.status === 'received').length
  const waitlisted = responses.filter((r) => r.status === 200 && r.body.status === 'waitlisted').length
  const full = responses.filter((r) => r.status === 409 && r.body.code === 'FULL').length
  const dbEnrolled = Number(sql(`select count(*) from registrations where program_id = '${pid}' and status = 'received'`))
  const dbSchedules = Number(sql(`select count(*) from payment_schedules s join registrations r on r.id = s.registration_id where r.program_id = '${pid}'`))
  const expectWait = waitlist ? REQUESTS - capacity : 0
  const ok =
    received === capacity && dbEnrolled === capacity && dbSchedules === capacity && waitlisted === expectWait && full === (waitlist ? 0 : REQUESTS - capacity)
  console.log(`${ok ? 'PASS' : 'FAIL'} 정원 ${capacity}·대기 ${waitlist ? '사용' : '미사용'}: 접수 ${received}, 대기 ${waitlisted}, 마감 ${full} (DB 접수 ${dbEnrolled}, 납부 일정 ${dbSchedules})`)
  return ok
}

const results = [await run(1, false, 'a'), await run(3, true, 'b')]
process.exit(results.every(Boolean) ? 0 : 1)
