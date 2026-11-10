import { describe, expect, it } from 'vitest'
import { isStaleChunkError } from './staleChunk'

describe('배포 뒤 예전 화면 조각 오류 판별', () => {
  it('브라우저별 문구', () => {
    expect(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/PartnerDetailPage-Bl3Yi-z.js'))).toBe(true)
    expect(isStaleChunkError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isStaleChunkError(new Error('error loading dynamically imported module'))).toBe(true)
  })
  it('다른 오류는 아님', () => {
    expect(isStaleChunkError(new Error('권한이 없습니다'))).toBe(false)
    expect(isStaleChunkError(null)).toBe(false)
  })
})
