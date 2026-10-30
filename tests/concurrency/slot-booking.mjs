// 상담 시간 동시 예약 테스트: 정원 N인 슬롯에 동시에 20건을 보내면 정확히 N건만 성공해야 한다.
// 실행: 로컬 Supabase + functions serve 실행 상태에서 `node tests/concurrency/slot-booking.mjs`
import { execFileSync } from 'node:child_process'

const API = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'
const DB = process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const REQUESTS = 20

function sql(query) {
  return execFileSync('psql', ['-qAt', DB, '-c', query], { encoding: 'utf8' }).trim()
}

async function run(capacity, offsetDays) {
  const slotId = sql(
    `insert into consultation_slots (starts_at, ends_at, capacity)
     values (now() + interval '${offsetDays} days', now() + interval '${offsetDays} days 30 minutes', ${capacity})
     returning id`,
  )
  const base = 10_000_000 + offsetDays * 1000
  const responses = await Promise.all(
    Array.from({ length: REQUESTS }, (_, i) =>
      fetch(`${API}/functions/v1/public-lead-submit`, {
        method: 'POST',
        headers: { apikey: KEY, 'content-type': 'application/json' },
        body: JSON.stringify({
          student_name: `동시학생${i}`,
          parent_name: `동시부모${i}`,
          parent_phone: `010${base + i}`,
          agree_privacy: true,
          agree_guardian: true,
          slot_id: slotId,
        }),
      }).then((r) => r.status),
    ),
  )
  const ok = responses.filter((s) => s === 200).length
  const full = responses.filter((s) => s === 409).length
  const booked = Number(sql(`select booked_count from consultation_slots where id = '${slotId}'`))
  const consultations = Number(sql(`select count(*) from consultations where slot_id = '${slotId}'`))
  const pass = ok === capacity && full === REQUESTS - capacity && booked === capacity && consultations === capacity
  console.log(
    `${pass ? 'PASS' : 'FAIL'} 정원 ${capacity} · 동시 ${REQUESTS}건 → 성공 ${ok}, 마감 ${full}, 슬롯 예약 수 ${booked}, 상담 기록 ${consultations}`,
  )
  return pass
}

const results = [await run(1, 30), await run(3, 31)]
process.exit(results.every(Boolean) ? 0 : 1)
