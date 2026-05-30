import { getDailyLimit } from '../usageGuard'

let passed = 0
let failed = 0

function test(desc: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✅ ${desc}`)
    passed++
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.log(`  ❌ ${desc}: ${msg}`)
    failed++
  }
}

function expect(val: unknown) {
  return {
    toBe: (expected: unknown) => {
      if (val !== expected) throw new Error(`expected ${expected}, got ${val}`)
    },
  }
}

console.log('\n=== Tests: usageGuard.ts ===\n')

const originalEnv = { ...process.env }

function restoreEnv() {
  process.env.CHAT_DAILY_LIMIT_FREE = originalEnv.CHAT_DAILY_LIMIT_FREE
  process.env.CHAT_DAILY_LIMIT_PRO = originalEnv.CHAT_DAILY_LIMIT_PRO
}

test('free tier retorna 30 por defecto', () => {
  delete process.env.CHAT_DAILY_LIMIT_FREE
  expect(getDailyLimit('free')).toBe(30)
  restoreEnv()
})

test('pro tier retorna 300 por defecto', () => {
  delete process.env.CHAT_DAILY_LIMIT_PRO
  expect(getDailyLimit('pro')).toBe(300)
  restoreEnv()
})

test('free tier respeta CHAT_DAILY_LIMIT_FREE', () => {
  process.env.CHAT_DAILY_LIMIT_FREE = '50'
  expect(getDailyLimit('free')).toBe(50)
  restoreEnv()
})

test('pro tier respeta CHAT_DAILY_LIMIT_PRO', () => {
  process.env.CHAT_DAILY_LIMIT_PRO = '500'
  expect(getDailyLimit('pro')).toBe(500)
  restoreEnv()
})

test('free y pro retornan valores distintos', () => {
  delete process.env.CHAT_DAILY_LIMIT_FREE
  delete process.env.CHAT_DAILY_LIMIT_PRO
  const freeLim = getDailyLimit('free')
  const proLim = getDailyLimit('pro')
  if (freeLim >= proLim) throw new Error(`free (${freeLim}) debe ser menor que pro (${proLim})`)
  restoreEnv()
})

console.log(`\n=== Resultados ===`)
console.log(`✅ Pasaron: ${passed}`)
console.log(`❌ Fallaron: ${failed}`)
console.log(`📊 Total: ${passed + failed}`)

if (failed > 0) process.exit(1)
