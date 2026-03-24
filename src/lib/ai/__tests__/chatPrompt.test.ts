/* eslint-disable @typescript-eslint/no-explicit-any */
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

// ============================================
// Historial conversacional
// ============================================

test('sin historial no incluye sección HISTORIAL', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('HISTORIAL DE CONVERSACIÓN')).toBe(false)
})

test('historial vacío no incluye sección HISTORIAL', () => {
  const prompt = buildChatPrompt([], [])
  expect(prompt.includes('HISTORIAL DE CONVERSACIÓN')).toBe(false)
})

test('con historial incluye sección HISTORIAL DE CONVERSACIÓN', () => {
  const history = [
    { role: 'user' as const, content: 'Gasté 5000 en comida' },
    { role: 'chanchito' as const, content: '✅ Gasto registrado: Comida $5000' },
  ]
  const prompt = buildChatPrompt([], history)
  expect(prompt.includes('HISTORIAL DE CONVERSACIÓN')).toBe(true)
})

test('historial formatea mensajes del usuario como USUARIO:', () => {
  const history = [
    { role: 'user' as const, content: 'mensaje de prueba del usuario' },
  ]
  const prompt = buildChatPrompt([], history)
  expect(prompt.includes('USUARIO: mensaje de prueba del usuario')).toBe(true)
})

test('historial formatea mensajes de chanchito como ASISTENTE:', () => {
  const history = [
    { role: 'chanchito' as const, content: 'respuesta del asistente' },
  ]
  const prompt = buildChatPrompt([], history)
  expect(prompt.includes('ASISTENTE: respuesta del asistente')).toBe(true)
})

test('historial incluye instrucción de referencias implícitas', () => {
  const history = [
    { role: 'user' as const, content: 'algo' },
  ]
  const prompt = buildChatPrompt([], history)
  expect(prompt.includes('referencias implícitas')).toBe(true)
})

test('historial con múltiples mensajes los incluye todos', () => {
  const history = [
    { role: 'user' as const, content: 'primer mensaje' },
    { role: 'chanchito' as const, content: 'primera respuesta' },
    { role: 'user' as const, content: 'segundo mensaje' },
  ]
  const prompt = buildChatPrompt([], history)
  expect(prompt.includes('primer mensaje')).toBe(true)
  expect(prompt.includes('primera respuesta')).toBe(true)
  expect(prompt.includes('segundo mensaje')).toBe(true)
})

test('historial incluye instrucción de detectar confirmar_accion', () => {
  const history = [
    { role: 'chanchito' as const, content: '¿Querés reasignar las transacciones?' },
    { role: 'user' as const, content: 'sí' },
  ]
  const prompt = buildChatPrompt([], history)
  expect(prompt.includes('confirmar_accion')).toBe(true)
})

// ============================================
// Contexto de objetivos (goalContext)
// ============================================

test('sin goalContext no incluye sección de metas', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('METAS DE AHORRO')).toBe(false)
  expect(prompt.includes('PRESUPUESTOS MENSUALES')).toBe(false)
})

test('goalContext vacío no incluye sección de metas', () => {
  const prompt = buildChatPrompt([], undefined, { savingsGoals: [], categoryBudgets: [] })
  expect(prompt.includes('METAS DE AHORRO')).toBe(false)
  expect(prompt.includes('PRESUPUESTOS MENSUALES')).toBe(false)
})

test('goalContext con metas incluye METAS DE AHORRO', () => {
  const goalContext = {
    savingsGoals: [{
      id: 'g1',
      name: 'Vacaciones',
      type: 'one_time' as const,
      targetAmount: 100000,
      currency: 'ARS' as const,
      targetDate: '2026-12-31',
      totalContributed: 30000,
      currentMonthContributed: 5000,
      percent: 30,
      daysLeft: 280,
      status: 'active' as const,
    }],
    categoryBudgets: [],
  }
  const prompt = buildChatPrompt([], undefined, goalContext)
  expect(prompt.includes('METAS DE AHORRO DEL USUARIO')).toBe(true)
  expect(prompt.includes('Vacaciones')).toBe(true)
})

test('goalContext con presupuestos incluye PRESUPUESTOS MENSUALES', () => {
  const goalContext = {
    savingsGoals: [],
    categoryBudgets: [{
      id: 'b1',
      categoryName: 'Comida',
      categoryEmoji: '🍔',
      limit: 50000,
      currency: 'ARS' as const,
      spent: 30000,
      percent: 60,
      status: 'ok' as const,
    }],
  }
  const prompt = buildChatPrompt([], undefined, goalContext)
  expect(prompt.includes('PRESUPUESTOS MENSUALES DEL USUARIO')).toBe(true)
  expect(prompt.includes('Comida')).toBe(true)
})

test('goalContext muestra porcentaje de progreso de meta', () => {
  const goalContext = {
    savingsGoals: [{
      id: 'g1',
      name: 'Auto',
      type: 'one_time' as const,
      targetAmount: 1000000,
      currency: 'ARS' as const,
      targetDate: '2027-01-01',
      totalContributed: 250000,
      currentMonthContributed: 0,
      percent: 25,
      daysLeft: 280,
      status: 'active' as const,
    }],
    categoryBudgets: [],
  }
  const prompt = buildChatPrompt([], undefined, goalContext)
  expect(prompt.includes('25.0%')).toBe(true)
})

test('goalContext muestra estado excedido del presupuesto', () => {
  const goalContext = {
    savingsGoals: [],
    categoryBudgets: [{
      id: 'b2',
      categoryName: 'Ropa',
      categoryEmoji: '👕',
      limit: 20000,
      currency: 'ARS' as const,
      spent: 25000,
      percent: 125,
      status: 'exceeded' as const,
    }],
  }
  const prompt = buildChatPrompt([], undefined, goalContext)
  expect(prompt.includes('superado')).toBe(true)
})

test('prompt incluye CASO F para editar entidad', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('CASO F')).toBe(true)
  expect(prompt.includes('editar')).toBe(true)
})

test('prompt incluye CASO G para eliminar entidad', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('CASO G')).toBe(true)
  expect(prompt.includes('eliminar')).toBe(true)
})

// ============================================
// CASO H: confirmar_accion (dependency checks)
// ============================================

test('prompt incluye CASO H para confirmar acción pendiente', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('CASO H')).toBe(true)
})

test('prompt incluye intención "confirmar_accion" en CASO H', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('confirmar_accion')).toBe(true)
})

test('prompt incluye acción "reasignar" en CASO H', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('reasignar')).toBe(true)
})

test('prompt incluye acción "confirmar" en CASO H', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('"confirmar"')).toBe(true)
})

test('prompt incluye acción "cancelar" en CASO H', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('"cancelar"')).toBe(true)
})

test('prompt incluye campo "reasignar_a" en CASO H', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('reasignar_a')).toBe(true)
})

test('prompt incluye ejemplo "sí, borralo" para confirmar_accion', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('borralo')).toBe(true)
})

test('prompt incluye ejemplo "no, cancelá" para confirmar_accion', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('cancelá')).toBe(true)
})

test('prompt incluye ejemplo de reasignación a Mercado Pago', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('Mercado Pago')).toBe(true)
})

// ============================================
// CASO D: consultas
// ============================================

test('prompt incluye CASO D para consultas financieras', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('CASO D')).toBe(true)
})

test('prompt incluye intención "consulta"', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('"consulta"')).toBe(true)
})

test('prompt incluye tipo "balance_global"', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('balance_global')).toBe(true)
})

test('prompt incluye tipo "gasto_mes"', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('gasto_mes')).toBe(true)
})

test('prompt incluye tipo "proyeccion_mes"', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('proyeccion_mes')).toBe(true)
})

test('prompt incluye tipo "ultimos_movimientos"', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('ultimos_movimientos')).toBe(true)
})

test('prompt incluye campo "filtros" en CASO D', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('"filtros"')).toBe(true)
})

// ============================================
// CASO E: conversación
// ============================================

test('prompt incluye CASO E para mensajes no financieros', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('CASO E')).toBe(true)
})

test('prompt incluye intención "conversacion"', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('"conversacion"')).toBe(true)
})

test('prompt incluye campo "respuesta" para conversacion', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('"respuesta"')).toBe(true)
})

// ============================================
// CASO I-N: metas de ahorro y presupuestos
// ============================================

test('prompt incluye CASO I para metas de ahorro', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('CASO I')).toBe(true)
})

test('prompt incluye intención "crear_objetivo_ahorro"', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('crear_objetivo_ahorro')).toBe(true)
})

test('prompt incluye tipos de meta "one_time" y "monthly"', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('one_time')).toBe(true)
  expect(prompt.includes('monthly')).toBe(true)
})

test('prompt incluye CASO J para presupuestos por categoría', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('CASO J')).toBe(true)
})

test('prompt incluye intención "crear_presupuesto"', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('crear_presupuesto')).toBe(true)
})

test('prompt incluye campo "monto_limite"', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('monto_limite')).toBe(true)
})

test('prompt incluye CASO K para consultar objetivos', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('CASO K')).toBe(true)
})

test('prompt incluye intención "consultar_objetivo"', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('consultar_objetivo')).toBe(true)
})

test('prompt incluye tipo de consulta "lista_metas"', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('lista_metas')).toBe(true)
})

test('prompt incluye tipo de consulta "resumen_objetivos"', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('resumen_objetivos')).toBe(true)
})

test('prompt incluye CASO L para editar metas', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('CASO L')).toBe(true)
})

test('prompt incluye intención "editar_objetivo"', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('editar_objetivo')).toBe(true)
})

test('prompt incluye CASO M para eliminar metas', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('CASO M')).toBe(true)
})

test('prompt incluye intención "eliminar_objetivo"', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('eliminar_objetivo')).toBe(true)
})

test('prompt incluye CASO N para aportar a metas', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('CASO N')).toBe(true)
})

test('prompt incluye intención "aportar_meta"', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('aportar_meta')).toBe(true)
})

// ============================================
// REGLAS CRÍTICAS #6-13 (edit/delete/confirm/contexto)
// ============================================

test('REGLA 6: mapea "borrá/eliminá" a intención eliminar', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('borrá')).toBe(true)
  expect(prompt.includes('"eliminar"')).toBe(true)
})

test('REGLA 7: mapea "cambiá/editá" a intención editar', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('cambiá')).toBe(true)
  expect(prompt.includes('"editar"')).toBe(true)
})

test('REGLA 8: mapea respuesta de confirmación a confirmar_accion', () => {
  const prompt = buildChatPrompt([])
  // La regla menciona confirmar_accion para respuestas sí/no/reasignar
  expect(prompt.includes('confirmar_accion')).toBe(true)
})

test('REGLA 9: menciona CONTEXTO CONVERSACIONAL', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('CONTEXTO CONVERSACIONAL')).toBe(true)
})

test('REGLA 10-11: menciona metas y presupuestos como intenciones destino', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('crear_objetivo_ahorro') || prompt.includes('consultar_objetivo')).toBe(true)
  expect(prompt.includes('crear_presupuesto') || prompt.includes('consultar_objetivo')).toBe(true)
})

test('REGLA 12: mapea "aporté/puse/guardé" a aportar_meta', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('aporté') || prompt.includes('puse') || prompt.includes('guardé')).toBe(true)
  expect(prompt.includes('aportar_meta')).toBe(true)
})

test('REGLA 13: menciona IDs de metas para editar/eliminar por nombre', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('IDs de metas') || prompt.includes('IDs')).toBe(true)
})

console.log(`\n=== Resultados ===`)
console.log(`✅ Pasaron: ${passed}`)
console.log(`❌ Fallaron: ${failed}`)
console.log(`📊 Total: ${passed + failed}`)

if (failed > 0) {
  process.exit(1)
}
