/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests para buildOnboardingPrompt - onboardingPrompt
 * Funciones puras que construyen prompts de onboarding.
 * Wave 4 — Fase 2.5 del roadmap Chanchito.
 */

import { buildOnboardingPrompt } from '../onboardingPrompt'
import type { ProposedCategory, SavedPaymentMethod } from '../onboardingTypes'

// Mini test runner inline
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

function expect(val: any) {
  return {
    toBe: (expected: any) => {
      if (val !== expected) throw new Error(`expected ${expected}, got ${val}`)
    },
    toBeTruthy: () => {
      if (!val) throw new Error(`expected truthy, got ${val}`)
    },
    toBeNull: () => {
      if (val !== null) throw new Error(`expected null, got ${val}`)
    },
    toEqual: (expected: any) => {
      if (JSON.stringify(val) !== JSON.stringify(expected)) {
        throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(val)}`)
      }
    },
    toInclude: (expected: any) => {
      if (!String(val).includes(String(expected))) {
        throw new Error(`expected to include "${expected}", got "${val}"`)
      }
    },
    toBeGreaterThan: (expected: any) => {
      if (val <= expected) throw new Error(`expected > ${expected}, got ${val}`)
    },
  }
}

console.log('\n=== Tests: onboardingPrompt.ts ===\n')

// ============================================
// Paso: name
// ============================================

test('prompt de name es string no vacío', () => {
  const prompt = buildOnboardingPrompt('name')
  expect(prompt.length > 0).toBe(true)
})

test('prompt de name menciona extraer nombre del usuario', () => {
  const prompt = buildOnboardingPrompt('name')
  expect(prompt.includes('nombre')).toBe(true)
})

test('prompt de name devuelve JSON con campo "name"', () => {
  const prompt = buildOnboardingPrompt('name')
  expect(prompt.includes('"name"')).toBe(true)
})

test('prompt de name pide JSON válido', () => {
  const prompt = buildOnboardingPrompt('name')
  expect(prompt.includes('JSON')).toBe(true)
})

// ============================================
// Paso: categories
// ============================================

test('prompt de categories es string no vacío', () => {
  const prompt = buildOnboardingPrompt('categories')
  expect(prompt.length > 0).toBe(true)
})

test('prompt de categories menciona generar categorías', () => {
  const prompt = buildOnboardingPrompt('categories')
  const hasCategories = prompt.includes('categorías') || prompt.includes('categories')
  expect(hasCategories).toBe(true)
})

test('prompt de categories incluye estructura JSON con array categories', () => {
  const prompt = buildOnboardingPrompt('categories')
  expect(prompt.includes('"categories"')).toBe(true)
})

test('prompt de categories menciona entre 5 y 12 categorías', () => {
  const prompt = buildOnboardingPrompt('categories')
  expect(prompt.includes('5') && prompt.includes('12')).toBe(true)
})

test('prompt de categories menciona contexto argentino', () => {
  const prompt = buildOnboardingPrompt('categories')
  expect(prompt.includes('argentino') || prompt.includes('argentin')).toBe(true)
})

test('prompt de categories incluye campos emoji, name, description', () => {
  const prompt = buildOnboardingPrompt('categories')
  expect(prompt.includes('"emoji"')).toBe(true)
  expect(prompt.includes('"name"')).toBe(true)
  expect(prompt.includes('"description"')).toBe(true)
})

// ============================================
// Paso: confirm_categories
// ============================================

test('prompt de confirm_categories incluye las categorías propuestas', () => {
  const cats: ProposedCategory[] = [
    { emoji: '🍔', name: 'Comida', description: 'Gastos de alimentación' },
    { emoji: '🚗', name: 'Transporte', description: 'Movilidad y combustible' },
  ]
  const prompt = buildOnboardingPrompt('confirm_categories', { proposedCategories: cats })
  expect(prompt.includes('Comida')).toBe(true)
  expect(prompt.includes('Transporte')).toBe(true)
})

test('prompt de confirm_categories incluye emojis de las categorías', () => {
  const cats: ProposedCategory[] = [
    { emoji: '🎬', name: 'Entretenimiento', description: 'Ocio y diversión' },
  ]
  const prompt = buildOnboardingPrompt('confirm_categories', { proposedCategories: cats })
  expect(prompt.includes('🎬')).toBe(true)
})

test('prompt de confirm_categories incluye campo "confirmed"', () => {
  const prompt = buildOnboardingPrompt('confirm_categories', { proposedCategories: [] })
  expect(prompt.includes('"confirmed"')).toBe(true)
})

test('prompt de confirm_categories incluye campo "adjustments"', () => {
  const prompt = buildOnboardingPrompt('confirm_categories', { proposedCategories: [] })
  expect(prompt.includes('"adjustments"')).toBe(true)
})

test('prompt de confirm_categories explica "sí" como confirmed true', () => {
  const prompt = buildOnboardingPrompt('confirm_categories', { proposedCategories: [] })
  expect(prompt.includes('confirmed: true')).toBe(true)
})

// ============================================
// Paso: payment_methods (batch)
// ============================================

test('prompt de payment_methods es string no vacío', () => {
  const prompt = buildOnboardingPrompt('payment_methods')
  expect(prompt.length > 0).toBe(true)
})

test('prompt de payment_methods incluye intención "create"', () => {
  const prompt = buildOnboardingPrompt('payment_methods')
  expect(prompt.includes('"create"')).toBe(true)
})

test('prompt de payment_methods incluye intención "create_batch"', () => {
  const prompt = buildOnboardingPrompt('payment_methods')
  expect(prompt.includes('"create_batch"')).toBe(true)
})

test('prompt de payment_methods incluye intención "delete"', () => {
  const prompt = buildOnboardingPrompt('payment_methods')
  expect(prompt.includes('"delete"')).toBe(true)
})

test('prompt de payment_methods incluye intención "edit"', () => {
  const prompt = buildOnboardingPrompt('payment_methods')
  expect(prompt.includes('"edit"')).toBe(true)
})

test('prompt de payment_methods incluye intención "finish"', () => {
  const prompt = buildOnboardingPrompt('payment_methods')
  expect(prompt.includes('"finish"')).toBe(true)
})

test('prompt de payment_methods incluye campo "needs_follow_up"', () => {
  const prompt = buildOnboardingPrompt('payment_methods')
  expect(prompt.includes('needs_follow_up')).toBe(true)
})

test('prompt de payment_methods distingue tipos credit/debit/cash', () => {
  const prompt = buildOnboardingPrompt('payment_methods')
  expect(prompt.includes('"credit"')).toBe(true)
  expect(prompt.includes('"debit"')).toBe(true)
  expect(prompt.includes('"cash"')).toBe(true)
})

test('prompt de payment_methods menciona closing_day y payment_day', () => {
  const prompt = buildOnboardingPrompt('payment_methods')
  expect(prompt.includes('closing_day')).toBe(true)
  expect(prompt.includes('payment_day')).toBe(true)
})

test('prompt de payment_methods explica reglas de batch (múltiples medios)', () => {
  const prompt = buildOnboardingPrompt('payment_methods')
  const hasBatch = prompt.includes('VARIOS') || prompt.includes('varios') || prompt.includes('create_batch')
  expect(hasBatch).toBe(true)
})

test('prompt de payment_methods explica "delete_name" para borrar', () => {
  const prompt = buildOnboardingPrompt('payment_methods')
  expect(prompt.includes('delete_name')).toBe(true)
})

test('prompt de payment_methods explica "old_name" y "new_name" para editar', () => {
  const prompt = buildOnboardingPrompt('payment_methods')
  expect(prompt.includes('old_name')).toBe(true)
  expect(prompt.includes('new_name')).toBe(true)
})

test('prompt de payment_methods menciona Visa y Mercado Pago como ejemplos', () => {
  const prompt = buildOnboardingPrompt('payment_methods')
  expect(prompt.includes('Visa')).toBe(true)
  expect(prompt.includes('Mercado Pago')).toBe(true)
})

test('prompt de payment_methods detecta "listo" como finish', () => {
  const prompt = buildOnboardingPrompt('payment_methods')
  expect(prompt.includes('listo') || prompt.includes('terminé')).toBe(true)
})

// ============================================
// Paso: default_payment
// ============================================

test('prompt de default_payment sin métodos es string no vacío', () => {
  const prompt = buildOnboardingPrompt('default_payment', { savedPaymentMethods: [] })
  expect(prompt.length > 0).toBe(true)
})

test('prompt de default_payment incluye los métodos guardados', () => {
  const methods: SavedPaymentMethod[] = [
    { id: 1, name: 'Visa', type: 'credit', closingDay: 24, paymentDay: 5 },
    { id: 2, name: 'Efectivo', type: 'cash', closingDay: null, paymentDay: null },
  ]
  const prompt = buildOnboardingPrompt('default_payment', { savedPaymentMethods: methods })
  expect(prompt.includes('Visa')).toBe(true)
  expect(prompt.includes('Efectivo')).toBe(true)
})

test('prompt de default_payment usa ícono 💳 para crédito', () => {
  const methods: SavedPaymentMethod[] = [
    { id: 1, name: 'Master', type: 'credit', closingDay: 10, paymentDay: 1 },
  ]
  const prompt = buildOnboardingPrompt('default_payment', { savedPaymentMethods: methods })
  expect(prompt.includes('💳')).toBe(true)
})

test('prompt de default_payment usa ícono 🏧 para débito', () => {
  const methods: SavedPaymentMethod[] = [
    { id: 1, name: 'Débito BBVA', type: 'debit', closingDay: null, paymentDay: null },
  ]
  const prompt = buildOnboardingPrompt('default_payment', { savedPaymentMethods: methods })
  expect(prompt.includes('🏧')).toBe(true)
})

test('prompt de default_payment usa ícono 💵 para efectivo', () => {
  const methods: SavedPaymentMethod[] = [
    { id: 1, name: 'Efectivo', type: 'cash', closingDay: null, paymentDay: null },
  ]
  const prompt = buildOnboardingPrompt('default_payment', { savedPaymentMethods: methods })
  expect(prompt.includes('💵')).toBe(true)
})

test('prompt de default_payment incluye campo "payment_method_name"', () => {
  const prompt = buildOnboardingPrompt('default_payment', { savedPaymentMethods: [] })
  expect(prompt.includes('payment_method_name')).toBe(true)
})

// ============================================
// Consistencia y estructura JSON
// ============================================

test('todos los prompts incluyen "JSON válido"', () => {
  const steps = ['name', 'categories', 'payment_methods'] as const
  steps.forEach(step => {
    const prompt = buildOnboardingPrompt(step)
    const hasJsonRule = prompt.includes('JSON') || prompt.includes('json')
    expect(hasJsonRule).toBe(true)
  })
})

test('todos los prompts prohíben texto fuera del JSON', () => {
  const steps = ['name', 'categories', 'payment_methods'] as const
  steps.forEach(step => {
    const prompt = buildOnboardingPrompt(step)
    const hasNoTextRule = prompt.includes('fuera del JSON') || prompt.includes('EXCLUSIVAMENTE')
    expect(hasNoTextRule).toBe(true)
  })
})

console.log(`\n=== Resultados ===`)
console.log(`✅ Pasaron: ${passed}`)
console.log(`❌ Fallaron: ${failed}`)
console.log(`📊 Total: ${passed + failed}`)

if (failed > 0) {
  process.exit(1)
}
