import { describe, expect, it } from 'vitest'
import { applyLink } from './links'

describe('applyLink', () => {
  it('학원 링크', () => {
    expect(applyLink('https://crm.example.com', 'daejeon-into')).toBe('https://crm.example.com/apply/daejeon-into')
  })

  it('상담실장 링크는 c 파라미터', () => {
    expect(applyLink('https://crm.example.com', 'daejeon-into', 'kim')).toBe(
      'https://crm.example.com/apply/daejeon-into?c=kim',
    )
  })
})
