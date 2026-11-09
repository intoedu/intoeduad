import { describe, expect, it } from 'vitest'
import { formatOt, isoToZonedLocal, zonedLocalToIso } from './orientation'

describe('오리엔테이션 일시', () => {
  it('미국 동부 시간으로 넣으면 한국 시간으로 안내(겨울: 14시간 차)', () => {
    const iso = zonedLocalToIso('2026-12-14T20:00', 'America/New_York')!
    expect(iso).toBe('2026-12-15T01:00:00.000Z')
    expect(formatOt(iso)).toBe('2026년 12월 15일(화) 10:00')
  })
  it('여름(서머타임)에는 13시간 차', () => {
    expect(formatOt(zonedLocalToIso('2027-07-01T20:00', 'America/New_York')!)).toBe('2027년 7월 2일(금) 09:00')
  })
  it('LA·한국 시간 입력, 다시 입력칸 값으로', () => {
    const iso = zonedLocalToIso('2026-12-14T17:00', 'America/Los_Angeles')!
    expect(formatOt(iso)).toBe('2026년 12월 15일(화) 10:00')
    expect(isoToZonedLocal(iso, 'Asia/Seoul')).toBe('2026-12-15T10:00')
    expect(isoToZonedLocal(zonedLocalToIso('2026-12-15T10:00', 'Asia/Seoul')!, 'America/Los_Angeles')).toBe('2026-12-14T17:00')
  })
  it('형식이 틀리면 null', () => {
    expect(zonedLocalToIso('2026-12-15', 'Asia/Seoul')).toBeNull()
  })
})
