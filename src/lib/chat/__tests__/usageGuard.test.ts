import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { getDailyLimit } from '../usageGuard'

const originalEnv = { ...process.env }

function restoreEnv() {
  process.env.CHAT_DAILY_LIMIT_FREE = originalEnv.CHAT_DAILY_LIMIT_FREE
  process.env.CHAT_DAILY_LIMIT_PRO = originalEnv.CHAT_DAILY_LIMIT_PRO
}

beforeEach(() => {
  delete process.env.CHAT_DAILY_LIMIT_FREE
  delete process.env.CHAT_DAILY_LIMIT_PRO
})

afterAll(restoreEnv)

describe('getDailyLimit', () => {
  it('free tier retorna 30 por defecto', () => {
    expect(getDailyLimit('free')).toBe(30)
  })

  it('pro tier retorna 300 por defecto', () => {
    expect(getDailyLimit('pro')).toBe(300)
  })

  it('free tier respeta CHAT_DAILY_LIMIT_FREE', () => {
    process.env.CHAT_DAILY_LIMIT_FREE = '50'
    expect(getDailyLimit('free')).toBe(50)
  })

  it('pro tier respeta CHAT_DAILY_LIMIT_PRO', () => {
    process.env.CHAT_DAILY_LIMIT_PRO = '500'
    expect(getDailyLimit('pro')).toBe(500)
  })

  it('free y pro retornan valores distintos', () => {
    expect(getDailyLimit('free')).toBeLessThan(getDailyLimit('pro'))
  })
})
