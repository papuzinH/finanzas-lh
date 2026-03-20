/**
 * Tests para buildChatPrompt - chatPrompt
 * Función pura que construye el system prompt
 */

import { buildChatPrompt } from '../chatPrompt'
import type { Category } from '../chatPrompt'

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
        throw new Error(`expected to include ${expected}, got "${val}"`)
      }
    },
    toBeGreaterThan: (expected: any) => {
      if (val <= expected) throw new Error(`expected > ${expected}, got ${val}`)
    },
  }
}

console.log('\n=== Tests: chatPrompt.ts ===\n')

// ============================================
// Casos básicos
// ============================================

test('retorna string no vacío', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.length > 0).toBe(true)
})

test('retorna prompt con longitud mínima (> 100 caracteres)', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.length).toBeGreaterThan(100)
})

test('incluye instrucciones de formato JSON', () => {
  const prompt = buildChatPrompt([])
  const hasJson = prompt.includes('JSON') || prompt.includes('json')
  expect(hasJson).toBe(true)
})

test('incluye instrucciones sobre transacciones', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('transaccion')).toBe(true)
})

test('incluye instrucciones sobre suscripciones', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('suscripcion')).toBe(true)
})

test('incluye instrucciones sobre tarjetas', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('tarjeta')).toBe(true)
})

// ============================================
// Categorías del usuario
// ============================================

test('incluye una categoría simple', () => {
  const categories: Category[] = [
    { id: '1', name: 'Comida', emoji: '🍔' },
  ]
  const prompt = buildChatPrompt(categories)
  expect(prompt.includes('Comida')).toBe(true)
})

test('incluye el emoji de la categoría', () => {
  const categories: Category[] = [
    { id: '1', name: 'Comida', emoji: '🍔' },
  ]
  const prompt = buildChatPrompt(categories)
  expect(prompt.includes('🍔')).toBe(true)
})

test('incluye múltiples categorías', () => {
  const categories: Category[] = [
    { id: '1', name: 'Comida', emoji: '🍔' },
    { id: '2', name: 'Transporte', emoji: '🚗' },
    { id: '3', name: 'Entretenimiento', emoji: '🎬' },
  ]
  const prompt = buildChatPrompt(categories)
  expect(prompt.includes('Comida')).toBe(true)
  expect(prompt.includes('Transporte')).toBe(true)
  expect(prompt.includes('Entretenimiento')).toBe(true)
})

test('usa emoji genérico cuando no hay emoji', () => {
  const categories: Category[] = [
    { id: '1', name: 'Otros', emoji: null },
  ]
  const prompt = buildChatPrompt(categories)
  expect(prompt.includes('📁')).toBe(true) // emoji por defecto
})

test('construye diccionario de IDs de categorías', () => {
  const categories: Category[] = [
    { id: 'abc-123', name: 'Comida', emoji: '🍔' },
    { id: 'def-456', name: 'Transporte', emoji: '🚗' },
  ]
  const prompt = buildChatPrompt(categories)
  // El prompt debe incluir el JSON stringificado del diccionario
  expect(prompt.includes('abc-123')).toBe(true)
  expect(prompt.includes('def-456')).toBe(true)
})

// ============================================
// Estructura del prompt
// ============================================

test('incluye sección INPUTS', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('INPUTS')).toBe(true)
})

test('incluye sección INSTRUCCIONES', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('INSTRUCCIONES')).toBe(true)
})

test('incluye CASO A para transacciones', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('CASO A')).toBe(true)
  expect(prompt.includes('Transacción')).toBe(true)
})

test('incluye CASO B para configuración de tarjeta', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('CASO B')).toBe(true)
  expect(prompt.includes('CONFIGURACIÓN')).toBe(true)
})

test('incluye CASO C para suscripciones', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('CASO C')).toBe(true)
  expect(prompt.includes('suscripción')).toBe(true)
})

test('incluye REGLAS CRÍTICAS', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('REGLAS CRÍTICAS')).toBe(true)
})

// ============================================
// Fecha actual
// ============================================

test('incluye fecha actual en formato YYYY-MM-DD', () => {
  const prompt = buildChatPrompt([])
  const dateRegex = /\d{4}-\d{2}-\d{2}/
  expect(dateRegex.test(prompt)).toBe(true)
})

test('fecha actual es hoy', () => {
  const prompt = buildChatPrompt([])
  const today = new Date().toISOString().split('T')[0]
  expect(prompt.includes(today)).toBe(true)
})

// ============================================
// Diccionario de IDs
// ============================================

test('crea diccionario con nombre -> id', () => {
  const categories: Category[] = [
    { id: 'id-1', name: 'Comida', emoji: '🍔' },
    { id: 'id-2', name: 'Salud', emoji: '💊' },
  ]
  const prompt = buildChatPrompt(categories)
  // El diccionario debe estar en JSON dentro del prompt
  expect(prompt.includes('"Comida"')).toBe(true)
  expect(prompt.includes('"id-1"')).toBe(true)
})

test('diccionario es válido JSON', () => {
  const categories: Category[] = [
    { id: 'uuid-001', name: 'Viajes', emoji: '✈️' },
    { id: 'uuid-002', name: 'Casa', emoji: '🏠' },
  ]
  const prompt = buildChatPrompt(categories)
  // Extraer el JSON del diccionario (está entre { } dentro del prompt)
  const jsonMatch = prompt.match(/\{[^{}]*"Viajes"[^{}]*\}/)
  expect(jsonMatch !== null).toBe(true)
})

// ============================================
// Contexto económico argentino
// ============================================

test('menciona contexto argentino', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('argentino')).toBe(true)
})

test('incluye tipos de medios de pago comunes en Argentina', () => {
  const prompt = buildChatPrompt([])
  // Debe mencionar ejemplos como Visa, Master, Mercado Pago, Efectivo
  const hasMedioPago = prompt.includes('Visa') || prompt.includes('pago') || prompt.includes('Mercado')
  expect(hasMedioPago).toBe(true)
})

// ============================================
// Campos JSON esperados
// ============================================

test('prompt menciona campo "compra" para transacciones', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('compra')).toBe(true)
})

test('prompt menciona campo "categoria" para transacciones', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('categoria')).toBe(true)
})

test('prompt menciona campo "category_id" como obligatorio', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('category_id')).toBe(true)
})

test('prompt menciona campo "valor" para transacciones', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('valor')).toBe(true)
})

test('prompt menciona campo "cuotas"', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('cuota')).toBe(true)
})

test('prompt menciona campo "fecha"', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('fecha')).toBe(true)
})

// ============================================
// Campos de suscripción
// ============================================

test('prompt menciona campo "descripcion" para suscripciones', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('descripcion')).toBe(true)
})

test('prompt menciona campo "frecuencia" para suscripciones', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('frecuencia')).toBe(true)
})

test('prompt menciona "monthly" como opción de frecuencia', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('monthly')).toBe(true)
})

// ============================================
// Edge cases
// ============================================

test('maneja arreglo vacío de categorías', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.length > 0).toBe(true)
  expect(prompt.includes('INSTRUCCIONES')).toBe(true)
})

test('maneja muchas categorías sin problemas', () => {
  const categories: Category[] = Array.from({ length: 20 }, (_, i) => ({
    id: `id-${i}`,
    name: `Categoría ${i}`,
    emoji: '📁',
  }))
  const prompt = buildChatPrompt(categories)
  expect(prompt.length > 100).toBe(true)
  expect(prompt.includes('Categoría 0')).toBe(true)
  expect(prompt.includes('Categoría 19')).toBe(true)
})

test('maneja nombres de categoría con caracteres especiales', () => {
  const categories: Category[] = [
    { id: '1', name: 'Educación & Cultura', emoji: '📚' },
    { id: '2', name: 'Salud/Médico', emoji: '⚕️' },
  ]
  const prompt = buildChatPrompt(categories)
  expect(prompt.includes('Educación & Cultura')).toBe(true)
  expect(prompt.includes('Salud/Médico')).toBe(true)
})

test('maneja emoji con variaciones', () => {
  const categories: Category[] = [
    { id: '1', name: 'Viajes', emoji: '✈️' },
    { id: '2', name: 'Comida', emoji: '🍕' },
  ]
  const prompt = buildChatPrompt(categories)
  expect(prompt.includes('✈️')).toBe(true)
  expect(prompt.includes('🍕')).toBe(true)
})

console.log(`\n=== Resultados ===`)
console.log(`✅ Pasaron: ${passed}`)
console.log(`❌ Fallaron: ${failed}`)
console.log(`📊 Total: ${passed + failed}`)

if (failed > 0) {
  process.exit(1)
}
