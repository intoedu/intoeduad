import { describe, expect, it } from 'vitest'
import { fitWithin, passportKind, watermarkText } from './passport'

describe('여권 사진 처리 기준', () => {
  it('형식 판별(확장자·형식 정보)', () => {
    expect(passportKind('IMG_0001.HEIC', '')).toBe('heic')
    expect(passportKind('a.jpg', 'image/jpeg')).toBe('jpeg')
    expect(passportKind('scan.pdf', 'application/pdf')).toBe('pdf')
    expect(passportKind('photo', 'image/png')).toBe('png')
    expect(passportKind('doc.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(null)
  })

  it('긴 변을 2400px 이하로 비율 유지', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 2400, height: 1800, scaled: true })
    expect(fitWithin(3024, 4032)).toEqual({ width: 1800, height: 2400, scaled: true })
    expect(fitWithin(1200, 800)).toEqual({ width: 1200, height: 800, scaled: false })
  })

  it('워터마크 문구', () => {
    expect(watermarkText('김행정', '2026-11-01 10:00')).toBe('인투유학 내부용 · 김행정 · 2026-11-01 10:00')
  })
})
