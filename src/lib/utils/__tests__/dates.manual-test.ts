/**
 * MANUAL TEST SUITE FOR dates.ts
 *
 * This file contains manual test implementations that can be run
 * without a test framework for validation/demonstration purposes.
 *
 * To use this for actual testing, install Vitest and use dates.test.ts instead.
 */

import {
  parseLocalDate,
  formatLocalDate,
  todayString,
  isInSameMonth,
  getCreditCardPeriod,
  getInstallmentPaymentDate,
} from '../dates'

// Simple assertion function
function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`)
  }
  console.log(`✓ ${message}`)
}

// Test runner
function test(description: string, fn: () => void): void {
  try {
    fn()
    console.log(`\n✓ PASS: ${description}`)
  } catch (error) {
    console.error(`\n✗ FAIL: ${description}`)
    console.error(`  ${error instanceof Error ? error.message : String(error)}`)
  }
}

console.log('=== DATES.TS TEST SUITE ===\n')

// Test: parseLocalDate
test('parseLocalDate - parsea fecha ISO como fecha local', () => {
  const date = parseLocalDate('2024-03-15')
  assert(date.getFullYear() === 2024, 'Year should be 2024')
  assert(date.getMonth() === 2, 'Month should be 2 (March)')
  assert(date.getDate() === 15, 'Day should be 15')
})

test('parseLocalDate - mantiene el día correcto sin cambios UTC', () => {
  const date = parseLocalDate('2024-03-15')
  assert(date.getDate() === 15, 'Day must be 15, not affected by UTC conversion')
})

test('parseLocalDate - parsea primer día del mes', () => {
  const date = parseLocalDate('2024-01-01')
  assert(date.getFullYear() === 2024, 'Year should be 2024')
  assert(date.getMonth() === 0, 'Month should be 0 (January)')
  assert(date.getDate() === 1, 'Day should be 1')
})

test('parseLocalDate - parsea último día del mes', () => {
  const date = parseLocalDate('2024-12-31')
  assert(date.getDate() === 31, 'Day should be 31')
  assert(date.getMonth() === 11, 'Month should be 11 (December)')
})

// Test: formatLocalDate
test('formatLocalDate - formatea fecha a YYYY-MM-DD', () => {
  const date = new Date(2024, 2, 15) // 15 March 2024
  const formatted = formatLocalDate(date)
  assert(formatted === '2024-03-15', `Should format to '2024-03-15', got '${formatted}'`)
})

test('formatLocalDate - usa zero-padding en mes', () => {
  const date = new Date(2024, 0, 15) // 15 January 2024
  const formatted = formatLocalDate(date)
  assert(formatted === '2024-01-15', `Should format to '2024-01-15', got '${formatted}'`)
})

test('formatLocalDate - usa zero-padding en día', () => {
  const date = new Date(2024, 2, 5) // 5 March 2024
  const formatted = formatLocalDate(date)
  assert(formatted === '2024-03-05', `Should format to '2024-03-05', got '${formatted}'`)
})

// Test: todayString
test('todayString - retorna fecha en formato YYYY-MM-DD', () => {
  const today = todayString()
  const regex = /^\d{4}-\d{2}-\d{2}$/
  assert(regex.test(today), `Should match YYYY-MM-DD format, got '${today}'`)
})

// Test: isInSameMonth
test('isInSameMonth - retorna true para fechas en mismo mes', () => {
  const reference = new Date(2024, 2, 1) // March 2024
  assert(
    isInSameMonth('2024-03-15', reference),
    'March 15 should be in same month as March 1'
  )
  assert(
    isInSameMonth('2024-03-31', reference),
    'March 31 should be in same month as March 1'
  )
})

test('isInSameMonth - retorna false para diferentes meses', () => {
  const reference = new Date(2024, 2, 1) // March 2024
  assert(
    !isInSameMonth('2024-02-28', reference),
    'February 28 should NOT be in same month as March 1'
  )
  assert(
    !isInSameMonth('2024-04-01', reference),
    'April 1 should NOT be in same month as March 1'
  )
})

test('isInSameMonth - retorna false para diferentes años', () => {
  const reference = new Date(2024, 2, 1) // March 2024
  assert(
    !isInSameMonth('2023-03-15', reference),
    'March 2023 should NOT be in same month as March 2024'
  )
})

// Test: getInstallmentPaymentDate
test('getInstallmentPaymentDate - compra antes del cierre', () => {
  const payDate = getInstallmentPaymentDate('2024-03-10', 24, 6)
  assert(payDate.getMonth() === 3, 'Payment month should be April (3)')
  assert(payDate.getDate() === 6, 'Payment day should be 6')
})

test('getInstallmentPaymentDate - compra después del cierre', () => {
  const payDate = getInstallmentPaymentDate('2024-03-27', 24, 6)
  assert(payDate.getMonth() === 4, 'Payment month should be May (4)')
  assert(payDate.getDate() === 6, 'Payment day should be 6')
})

test('getInstallmentPaymentDate - compra en día de cierre', () => {
  const payDate = getInstallmentPaymentDate('2024-03-24', 24, 6)
  assert(payDate.getMonth() === 3, 'Payment month should be April (3)')
  assert(payDate.getDate() === 6, 'Payment day should be 6')
})

test('getInstallmentPaymentDate - compra en Diciembre', () => {
  const payDate = getInstallmentPaymentDate('2023-12-27', 24, 6)
  assert(payDate.getFullYear() === 2024, 'Year should be 2024')
  assert(payDate.getMonth() === 1, 'Payment month should be February (1)')
  assert(payDate.getDate() === 6, 'Payment day should be 6')
})

test('getInstallmentPaymentDate - respeta payment day diferente', () => {
  const payDate = getInstallmentPaymentDate('2024-03-10', 15, 25)
  assert(payDate.getMonth() === 3, 'Payment month should be April')
  assert(payDate.getDate() === 25, 'Payment day should be 25')
})

// Test: getCreditCardPeriod
test('getCreditCardPeriod - calcula período antes del cierre', () => {
  const reference = new Date(2024, 2, 15) // March 15
  const { periodEnd, paymentDate } = getCreditCardPeriod(24, 6, reference)

  assert(periodEnd.getDate() === 24, 'Period should end on day 24')
  assert(periodEnd.getMonth() === 2, 'Period should end in March')
  assert(paymentDate.getMonth() === 3, 'Payment should be in April')
  assert(paymentDate.getDate() === 6, 'Payment should be on day 6')
})

test('getCreditCardPeriod - calcula período después del cierre', () => {
  const reference = new Date(2024, 2, 27) // March 27
  const { periodEnd, paymentDate } = getCreditCardPeriod(24, 6, reference)

  assert(periodEnd.getDate() === 24, 'Period should end on day 24')
  assert(periodEnd.getMonth() === 3, 'Period should end in April')
  assert(paymentDate.getMonth() === 4, 'Payment should be in May')
  assert(paymentDate.getDate() === 6, 'Payment should be on day 6')
})

test('getCreditCardPeriod - maneja transición de año', () => {
  const reference = new Date(2024, 11, 27) // December 27
  const { periodEnd, paymentDate } = getCreditCardPeriod(24, 6, reference)

  assert(periodEnd.getDate() === 24, 'Period should end on day 24')
  assert(periodEnd.getMonth() === 0, 'Period should end in January')
  assert(periodEnd.getFullYear() === 2025, 'Should be year 2025')
  assert(paymentDate.getMonth() === 1, 'Payment should be in February')
  assert(paymentDate.getFullYear() === 2025, 'Should be year 2025')
})

console.log('\n=== TEST SUITE COMPLETE ===')
