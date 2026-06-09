/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests para parseGeminiResponse - intentParser
 * Función pura, sin dependencias externas
 */

import { parseGeminiResponse } from '../intentParser'

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
        throw new Error(`expected to include ${expected}`)
      }
    },
  }
}

console.log('\n=== Tests: intentParser.ts ===\n')

// ============================================
// CASO A: Transacciones simples
// ============================================

test('parsea gasto simple correctamente', () => {
  const input = JSON.stringify({
    intencion: 'transaccion',
    compra: 'Almuerzo en restaurante',
    categoria: 'Comida',
    category_id: 'abc-123',
    valor: 12000,
    tipo: 'expense',
    medio_pago: 'Visa',
    es_gasto_real: true,
    cuotas: { es_cuota: false, cantidad: 1, monto_total: 12000 },
    fecha: '2026-03-15',
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('transaction')
  if (result.type === 'transaction') {
    expect(result.data.description).toBe('Almuerzo en restaurante')
    expect(result.data.amount).toBe(12000)
    expect(result.data.type).toBe('expense')
    expect(result.data.categoryId).toBe('abc-123')
    expect(result.data.paymentMethodName).toBe('Visa')
  }
})

test('parsea ingreso (sueldo) correctamente', () => {
  const input = JSON.stringify({
    intencion: 'transaccion',
    compra: 'Sueldo Marzo',
    categoria: 'Ingresos',
    category_id: 'ghi-789',
    valor: 500000,
    tipo: 'income',
    medio_pago: null,
    es_gasto_real: true,
    cuotas: { es_cuota: false, cantidad: 1, monto_total: 500000 },
    fecha: '2026-03-01',
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('transaction')
  if (result.type === 'transaction') {
    expect(result.data.type).toBe('income')
    expect(result.data.amount).toBe(500000)
    expect(result.data.paymentMethodName).toBeNull()
  }
})

test('rechaza transacción no real (spam/notificación)', () => {
  const input = JSON.stringify({
    intencion: 'transaccion',
    compra: 'Notificación de seguridad',
    categoria: 'Otros',
    category_id: 'def-456',
    valor: 0,
    tipo: 'expense',
    medio_pago: null,
    es_gasto_real: false,
    cuotas: { es_cuota: false, cantidad: 1, monto_total: 0 },
    fecha: '2026-03-15',
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('error')
  if (result.type === 'error') {
    expect(result.message).toInclude('movimiento de dinero real')
  }
})

// ============================================
// CASO B: Cuotas/Instalaciones
// ============================================

test('parsea gasto en cuotas correctamente', () => {
  const input = JSON.stringify({
    intencion: 'transaccion',
    compra: 'TV Samsung 55"',
    categoria: 'Hogar',
    category_id: 'def-456',
    valor: 50000,
    tipo: 'expense',
    medio_pago: 'Visa',
    es_gasto_real: true,
    cuotas: { es_cuota: true, cantidad: 6, monto_total: 300000 },
    fecha: '2026-03-15',
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('installment')
  if (result.type === 'installment') {
    expect(result.data.description).toBe('TV Samsung 55"')
    expect(result.data.totalAmount).toBe(300000)
    expect(result.data.installmentsCount).toBe(6)
    expect(result.data.amount).toBe(50000) // 300000 / 6 = 50000 por cuota
  }
})

test('parsea cuota única (sin cuotas reales)', () => {
  const input = JSON.stringify({
    intencion: 'transaccion',
    compra: 'Zapatos Nike',
    categoria: 'Ropa',
    category_id: 'jkl-012',
    valor: 5000,
    tipo: 'expense',
    medio_pago: 'Efectivo',
    es_gasto_real: true,
    cuotas: { es_cuota: false, cantidad: 1, monto_total: 5000 },
    fecha: '2026-03-15',
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('transaction')
  expect(result.type !== 'installment').toBe(true)
})

test('calcula correctamente monto por cuota', () => {
  const input = JSON.stringify({
    intencion: 'transaccion',
    compra: 'Heladera Gafran',
    categoria: 'Hogar',
    category_id: 'mno-345',
    valor: 30000,
    tipo: 'expense',
    medio_pago: 'Master',
    es_gasto_real: true,
    cuotas: { es_cuota: true, cantidad: 12, monto_total: 360000 },
    fecha: '2026-02-01',
  })
  const result = parseGeminiResponse(input)
  if (result.type === 'installment') {
    // 360000 / 12 = 30000 por cuota
    expect(result.data.amount).toBe(30000)
    expect(result.data.totalAmount).toBe(360000)
  }
})

// ============================================
// CASO C: Mensualidades
// ============================================

test('parsea suscripción simple', () => {
  const input = JSON.stringify({
    intencion: 'suscripcion',
    descripcion: 'Netflix',
    valor: 5000,
    moneda: 'ARS',
    categoria: 'Entretenimiento',
    category_id: 'pqr-678',
    frecuencia: 'monthly',
    medio_pago: 'Visa',
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('subscription')
  if (result.type === 'subscription') {
    expect(result.data.description).toBe('Netflix')
    expect(result.data.amount).toBe(5000)
    expect(result.data.currency).toBe('ARS')
    expect(result.data.frequency).toBe('monthly')
  }
})

test('parsea suscripción sin medio de pago', () => {
  const input = JSON.stringify({
    intencion: 'suscripcion',
    descripcion: 'Spotify',
    valor: 9990,
    moneda: 'ARS',
    categoria: 'Entretenimiento',
    category_id: 'pqr-678',
    frecuencia: 'monthly',
    medio_pago: null,
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('subscription')
  if (result.type === 'subscription') {
    expect(result.data.paymentMethodName).toBeNull()
  }
})

test('parsea suscripción anual', () => {
  const input = JSON.stringify({
    intencion: 'suscripcion',
    descripcion: 'Dominio VPS',
    valor: 120,
    moneda: 'USD',
    categoria: 'Tecnología',
    category_id: 'stu-901',
    frecuencia: 'annual',
    medio_pago: 'Mercado Pago',
  })
  const result = parseGeminiResponse(input)
  if (result.type === 'subscription') {
    expect(result.data.frequency).toBe('annual')
    expect(result.data.currency).toBe('USD')
  }
})

// ============================================
// CASO D: Configuración de tarjeta
// ============================================

test('parsea configuración de tarjeta', () => {
  const input = JSON.stringify({
    intencion: 'configuracion_tarjeta',
    tarjeta_match: 'Visa',
    fecha_cierre: '2026-03-24',
    fecha_vencimiento: '2026-04-06',
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('card_config')
  if (result.type === 'card_config') {
    expect(result.data.paymentMethodName).toBe('Visa')
    expect(result.data.closingDay).toBe(24)
    expect(result.data.paymentDay).toBe(6)
  }
})

test('parsea configuración de Master Card', () => {
  const input = JSON.stringify({
    intencion: 'configuracion_tarjeta',
    tarjeta_match: 'Mastercard',
    fecha_cierre: '2026-03-20',
    fecha_vencimiento: '2026-03-30',
  })
  const result = parseGeminiResponse(input)
  if (result.type === 'card_config') {
    expect(result.data.closingDay).toBe(20)
    expect(result.data.paymentDay).toBe(30)
  }
})

// ============================================
// ERRORES: JSON malformado
// ============================================

test('maneja JSON inválido gracefully', () => {
  const result = parseGeminiResponse('esto no es json valido')
  expect(result.type).toBe('error')
  if (result.type === 'error') {
    expect(result.message).toInclude('Error')
  }
})

test('maneja respuesta vacía', () => {
  const result = parseGeminiResponse('')
  expect(result.type).toBe('error')
})

test('maneja JSON sin intención', () => {
  const input = JSON.stringify({
    compra: 'Algo',
    valor: 100,
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('error')
  if (result.type === 'error') {
    expect(result.message).toInclude('intención')
  }
})

test('maneja intención desconocida', () => {
  const input = JSON.stringify({
    intencion: 'intension_inexistente',
    datos: 'algo',
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('error')
  if (result.type === 'error') {
    expect(result.message).toInclude('reconocida')
  }
})

// ============================================
// MARKDOWN CODE BLOCKS
// ============================================

test('maneja JSON envuelto en markdown code blocks (backticks simples)', () => {
  const input = `\`\`\`json
{"intencion":"transaccion","compra":"Café","categoria":"Comida","category_id":"abc","valor":2000,"tipo":"expense","medio_pago":null,"es_gasto_real":true,"cuotas":{"es_cuota":false,"cantidad":1,"monto_total":2000},"fecha":"2026-03-15"}
\`\`\``
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('transaction')
})

test('maneja JSON en markdown sin especificar json', () => {
  const input = `\`\`\`
{"intencion":"transaccion","compra":"Pan","categoria":"Comida","category_id":"def","valor":300,"tipo":"expense","medio_pago":null,"es_gasto_real":true,"cuotas":{"es_cuota":false,"cantidad":1,"monto_total":300},"fecha":"2026-03-19"}
\`\`\``
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('transaction')
})

// ============================================
// CAMPOS OPCIONALES
// ============================================

test('maneja category_id null (transacción)', () => {
  const input = JSON.stringify({
    intencion: 'transaccion',
    compra: 'Gasto vario',
    categoria: 'Otros',
    category_id: null,
    valor: 1000,
    tipo: 'expense',
    medio_pago: null,
    es_gasto_real: true,
    cuotas: { es_cuota: false, cantidad: 1, monto_total: 1000 },
    fecha: '2026-03-15',
  })
  const result = parseGeminiResponse(input)
  if (result.type === 'transaction') {
    expect(result.data.categoryId).toBeNull()
  }
})

test('preserva valores null para medio_pago', () => {
  const input = JSON.stringify({
    intencion: 'transaccion',
    compra: 'Gasto en efectivo anónimo',
    categoria: 'Otros',
    category_id: 'xyz-999',
    valor: 500,
    tipo: 'expense',
    medio_pago: null,
    es_gasto_real: true,
    cuotas: { es_cuota: false, cantidad: 1, monto_total: 500 },
    fecha: '2026-03-10',
  })
  const result = parseGeminiResponse(input)
  if (result.type === 'transaction') {
    expect(result.data.paymentMethodName).toBeNull()
  }
})

// ============================================
// EDGE CASES
// ============================================

test('maneja valores numéricos grandes', () => {
  const input = JSON.stringify({
    intencion: 'transaccion',
    compra: 'Auto de segunda mano',
    categoria: 'Transporte',
    category_id: 'trs-100',
    valor: 5000000,
    tipo: 'expense',
    medio_pago: 'Transferencia',
    es_gasto_real: true,
    cuotas: { es_cuota: false, cantidad: 1, monto_total: 5000000 },
    fecha: '2026-03-15',
  })
  const result = parseGeminiResponse(input)
  if (result.type === 'transaction') {
    expect(result.data.amount).toBe(5000000)
  }
})

test('maneja monedas extranjeras en suscripción', () => {
  const input = JSON.stringify({
    intencion: 'suscripcion',
    descripcion: 'Adobe Creative Cloud',
    valor: 9.99,
    moneda: 'USD',
    categoria: 'Software',
    category_id: 'sft-200',
    frecuencia: 'monthly',
    medio_pago: 'Tarjeta Global',
  })
  const result = parseGeminiResponse(input)
  if (result.type === 'subscription') {
    expect(result.data.currency).toBe('USD')
    expect(result.data.amount).toBe(9.99)
  }
})

test('maneja fechas en diferentes formatos YYYY-MM-DD', () => {
  const input = JSON.stringify({
    intencion: 'transaccion',
    compra: 'Libro',
    categoria: 'Educación',
    category_id: 'edu-50',
    valor: 850,
    tipo: 'expense',
    medio_pago: 'Débito',
    es_gasto_real: true,
    cuotas: { es_cuota: false, cantidad: 1, monto_total: 850 },
    fecha: '2025-12-31',
  })
  const result = parseGeminiResponse(input)
  if (result.type === 'transaction') {
    expect(result.data.date).toBe('2025-12-31')
  }
})

// ============================================
// CASO F: Editar entidad
// ============================================

test('parsea intención de editar transacción', () => {
  const input = JSON.stringify({
    intencion: 'editar',
    entidad: 'transaccion',
    busqueda: 'almuerzo',
    cambios: { descripcion: 'Almuerzo ejecutivo', monto: 15000 },
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('edit')
  if (result.type === 'edit') {
    expect(result.data.entity).toBe('transaccion')
    expect(result.data.search).toBe('almuerzo')
  }
})

test('parsea intención de editar medio de pago', () => {
  const input = JSON.stringify({
    intencion: 'editar',
    entidad: 'medio_pago',
    busqueda: 'Visa',
    cambios: { nombre: 'Visa Platinum' },
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('edit')
  if (result.type === 'edit') {
    expect(result.data.entity).toBe('medio_pago')
    expect(result.data.search).toBe('Visa')
    expect((result.data.changes as any).nombre).toBe('Visa Platinum')
  }
})

test('parsea intención de editar categoría', () => {
  const input = JSON.stringify({
    intencion: 'editar',
    entidad: 'categoria',
    busqueda: 'Comida',
    cambios: { nombre: 'Alimentación', emoji: '🥗' },
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('edit')
  if (result.type === 'edit') {
    expect(result.data.entity).toBe('categoria')
  }
})

test('parsea intención de editar suscripción', () => {
  const input = JSON.stringify({
    intencion: 'editar',
    entidad: 'suscripcion',
    busqueda: 'Netflix',
    cambios: { valor: 7500 },
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('edit')
  if (result.type === 'edit') {
    expect(result.data.entity).toBe('suscripcion')
    expect(result.data.search).toBe('Netflix')
  }
})

test('edit con cambios vacíos usa objeto vacío', () => {
  const input = JSON.stringify({
    intencion: 'editar',
    entidad: 'transaccion',
    busqueda: 'cafe',
    cambios: {},
  })
  const result = parseGeminiResponse(input)
  if (result.type === 'edit') {
    expect(JSON.stringify(result.data.changes)).toBe('{}')
  }
})

// ============================================
// CASO G: Eliminar entidad
// ============================================

test('parsea intención de eliminar transacción', () => {
  const input = JSON.stringify({
    intencion: 'eliminar',
    entidad: 'transaccion',
    busqueda: 'almuerzo del viernes',
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('delete')
  if (result.type === 'delete') {
    expect(result.data.entity).toBe('transaccion')
    expect(result.data.search).toBe('almuerzo del viernes')
  }
})

test('parsea intención de eliminar medio de pago', () => {
  const input = JSON.stringify({
    intencion: 'eliminar',
    entidad: 'medio_pago',
    busqueda: 'Efectivo',
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('delete')
  if (result.type === 'delete') {
    expect(result.data.entity).toBe('medio_pago')
    expect(result.data.search).toBe('Efectivo')
  }
})

test('parsea intención de eliminar categoría', () => {
  const input = JSON.stringify({
    intencion: 'eliminar',
    entidad: 'categoria',
    busqueda: 'Ropa',
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('delete')
  if (result.type === 'delete') {
    expect(result.data.entity).toBe('categoria')
  }
})

test('parsea intención de eliminar suscripción', () => {
  const input = JSON.stringify({
    intencion: 'eliminar',
    entidad: 'suscripcion',
    busqueda: 'Spotify',
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('delete')
  if (result.type === 'delete') {
    expect(result.data.entity).toBe('suscripcion')
    expect(result.data.search).toBe('Spotify')
  }
})

test('parsea intención de eliminar plan de cuotas', () => {
  const input = JSON.stringify({
    intencion: 'eliminar',
    entidad: 'cuota',
    busqueda: 'TV Samsung',
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('delete')
  if (result.type === 'delete') {
    expect(result.data.entity).toBe('cuota')
  }
})

// ============================================
// CASO H: Confirmar acción
// ============================================

test('parsea acción de reasignar (reassign)', () => {
  const input = JSON.stringify({
    intencion: 'confirmar_accion',
    accion: 'reasignar',
    reasignar_a: 'Mercado Pago',
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('confirm_action')
  if (result.type === 'confirm_action') {
    expect(result.data.action).toBe('reassign')
    expect(result.data.reassignTo).toBe('Mercado Pago')
  }
})

test('parsea acción de confirmar eliminación (confirm_delete)', () => {
  const input = JSON.stringify({
    intencion: 'confirmar_accion',
    accion: 'confirmar',
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('confirm_action')
  if (result.type === 'confirm_action') {
    expect(result.data.action).toBe('confirm_delete')
  }
})

test('parsea acción de cancelar', () => {
  const input = JSON.stringify({
    intencion: 'confirmar_accion',
    accion: 'cancelar',
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('confirm_action')
  if (result.type === 'confirm_action') {
    expect(result.data.action).toBe('cancel')
  }
})

test('confirm_action sin reasignar_a tiene reassignTo undefined', () => {
  const input = JSON.stringify({
    intencion: 'confirmar_accion',
    accion: 'confirmar',
  })
  const result = parseGeminiResponse(input)
  if (result.type === 'confirm_action') {
    expect(result.data.reassignTo === undefined).toBe(true)
  }
})

// ============================================
// CASO I: Crear meta de ahorro
// ============================================

test('parsea meta de ahorro one-time con fecha', () => {
  const input = JSON.stringify({
    intencion: 'crear_objetivo_ahorro',
    nombre: 'Vacaciones Europa',
    tipo: 'one_time',
    monto_objetivo: 500000,
    moneda: 'ARS',
    fecha_objetivo: '2026-12-31',
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('create_goal')
  if (result.type === 'create_goal') {
    expect(result.data.name).toBe('Vacaciones Europa')
    expect(result.data.type).toBe('one_time')
    expect(result.data.targetAmount).toBe(500000)
    expect(result.data.currency).toBe('ARS')
    expect(result.data.targetDate).toBe('2026-12-31')
  }
})

test('parsea meta de ahorro monthly sin fecha', () => {
  const input = JSON.stringify({
    intencion: 'crear_objetivo_ahorro',
    nombre: 'Fondo de emergencia',
    tipo: 'monthly',
    monto_objetivo: 50000,
    moneda: 'ARS',
    fecha_objetivo: null,
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('create_goal')
  if (result.type === 'create_goal') {
    expect(result.data.type).toBe('monthly')
    expect(result.data.targetDate).toBeNull()
  }
})

test('parsea meta de ahorro en USD', () => {
  const input = JSON.stringify({
    intencion: 'crear_objetivo_ahorro',
    nombre: 'iPhone nuevo',
    tipo: 'one_time',
    monto_objetivo: 1000,
    moneda: 'USD',
    fecha_objetivo: '2026-06-01',
  })
  const result = parseGeminiResponse(input)
  if (result.type === 'create_goal') {
    expect(result.data.currency).toBe('USD')
    expect(result.data.targetAmount).toBe(1000)
  }
})

// ============================================
// CASO J: Crear presupuesto
// ============================================

test('parsea creación de presupuesto', () => {
  const input = JSON.stringify({
    intencion: 'crear_presupuesto',
    categoria: 'Comida',
    category_id: 'cat-001',
    monto_limite: 80000,
    moneda: 'ARS',
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('create_budget')
  if (result.type === 'create_budget') {
    expect(result.data.categoryName).toBe('Comida')
    expect(result.data.categoryId).toBe('cat-001')
    expect(result.data.limitAmount).toBe(80000)
    expect(result.data.currency).toBe('ARS')
  }
})

test('parsea presupuesto en USD', () => {
  const input = JSON.stringify({
    intencion: 'crear_presupuesto',
    categoria: 'Viajes',
    category_id: 'cat-002',
    monto_limite: 200,
    moneda: 'USD',
  })
  const result = parseGeminiResponse(input)
  if (result.type === 'create_budget') {
    expect(result.data.currency).toBe('USD')
  }
})

// ============================================
// CASO K: Consultar objetivos
// ============================================

test('parsea consulta de lista de metas', () => {
  const input = JSON.stringify({
    intencion: 'consultar_objetivo',
    tipo_consulta: 'lista_metas',
    busqueda: null,
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('query_goal')
  if (result.type === 'query_goal') {
    expect(result.data.queryType).toBe('lista_metas')
    expect(result.data.search).toBeNull()
  }
})

test('parsea consulta de meta específica', () => {
  const input = JSON.stringify({
    intencion: 'consultar_objetivo',
    tipo_consulta: 'meta_especifica',
    busqueda: 'Vacaciones',
  })
  const result = parseGeminiResponse(input)
  if (result.type === 'query_goal') {
    expect(result.data.queryType).toBe('meta_especifica')
    expect(result.data.search).toBe('Vacaciones')
  }
})

test('parsea consulta de lista de presupuestos', () => {
  const input = JSON.stringify({
    intencion: 'consultar_objetivo',
    tipo_consulta: 'lista_presupuestos',
    busqueda: null,
  })
  const result = parseGeminiResponse(input)
  if (result.type === 'query_goal') {
    expect(result.data.queryType).toBe('lista_presupuestos')
  }
})

test('parsea consulta de resumen de objetivos', () => {
  const input = JSON.stringify({
    intencion: 'consultar_objetivo',
    tipo_consulta: 'resumen_objetivos',
    busqueda: null,
  })
  const result = parseGeminiResponse(input)
  if (result.type === 'query_goal') {
    expect(result.data.queryType).toBe('resumen_objetivos')
  }
})

// ============================================
// CASO L: Editar objetivo o presupuesto
// ============================================

test('parsea edición de objetivo de ahorro', () => {
  const input = JSON.stringify({
    intencion: 'editar_objetivo',
    entidad: 'objetivo',
    busqueda: 'Vacaciones Europa',
    cambios: { monto_objetivo: 600000 },
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('edit_goal')
  if (result.type === 'edit_goal') {
    expect(result.data.entity).toBe('objetivo')
    expect(result.data.search).toBe('Vacaciones Europa')
    expect((result.data.changes as any).monto_objetivo).toBe(600000)
  }
})

test('parsea edición de presupuesto', () => {
  const input = JSON.stringify({
    intencion: 'editar_objetivo',
    entidad: 'presupuesto',
    busqueda: 'Comida',
    cambios: { monto_limite: 100000 },
  })
  const result = parseGeminiResponse(input)
  if (result.type === 'edit_goal') {
    expect(result.data.entity).toBe('presupuesto')
    expect(result.data.search).toBe('Comida')
  }
})

// ============================================
// CASO M: Eliminar objetivo o presupuesto
// ============================================

test('parsea eliminación de objetivo', () => {
  const input = JSON.stringify({
    intencion: 'eliminar_objetivo',
    entidad: 'objetivo',
    busqueda: 'Fondo de emergencia',
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('delete_goal')
  if (result.type === 'delete_goal') {
    expect(result.data.entity).toBe('objetivo')
    expect(result.data.search).toBe('Fondo de emergencia')
  }
})

test('parsea eliminación de presupuesto', () => {
  const input = JSON.stringify({
    intencion: 'eliminar_objetivo',
    entidad: 'presupuesto',
    busqueda: 'Ropa',
  })
  const result = parseGeminiResponse(input)
  if (result.type === 'delete_goal') {
    expect(result.data.entity).toBe('presupuesto')
  }
})

// ============================================
// CASO N: Aportar a meta
// ============================================

test('parsea contribución a meta de ahorro', () => {
  const input = JSON.stringify({
    intencion: 'aportar_meta',
    busqueda: 'Vacaciones Europa',
    monto: 25000,
    moneda: 'ARS',
    nota: 'Ahorro de bonificación',
    fecha: '2026-03-23',
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('goal_contribution')
  if (result.type === 'goal_contribution') {
    expect(result.data.search).toBe('Vacaciones Europa')
    expect(result.data.amount).toBe(25000)
    expect(result.data.currency).toBe('ARS')
    expect(result.data.note).toBe('Ahorro de bonificación')
    expect(result.data.date).toBe('2026-03-23')
  }
})

test('parsea contribución a meta sin nota', () => {
  const input = JSON.stringify({
    intencion: 'aportar_meta',
    busqueda: 'iPhone',
    monto: 50,
    moneda: 'USD',
    nota: null,
    fecha: '2026-03-23',
  })
  const result = parseGeminiResponse(input)
  if (result.type === 'goal_contribution') {
    expect(result.data.note).toBeNull()
    expect(result.data.currency).toBe('USD')
  }
})

// ============================================
// Edge cases: flujo de dependency checks
// ============================================

test('delete de medio_pago con busqueda con espacios', () => {
  const input = JSON.stringify({
    intencion: 'eliminar',
    entidad: 'medio_pago',
    busqueda: 'Visa Platinum',
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('delete')
  if (result.type === 'delete') {
    expect(result.data.search).toBe('Visa Platinum')
    expect(result.data.entity).toBe('medio_pago')
  }
})

test('delete de categoria con acento en busqueda', () => {
  const input = JSON.stringify({
    intencion: 'eliminar',
    entidad: 'categoria',
    busqueda: 'Educación',
  })
  const result = parseGeminiResponse(input)
  if (result.type === 'delete') {
    expect(result.data.search).toBe('Educación')
  }
})

test('confirm_action: reasignar a entidad con nombre compuesto', () => {
  const input = JSON.stringify({
    intencion: 'confirmar_accion',
    accion: 'reasignar',
    reasignar_a: 'Mercado Pago Tarjeta',
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('confirm_action')
  if (result.type === 'confirm_action') {
    expect(result.data.action).toBe('reassign')
    expect(result.data.reassignTo).toBe('Mercado Pago Tarjeta')
  }
})

test('confirm_action: reasignar a "Otros" (categoría genérica)', () => {
  const input = JSON.stringify({
    intencion: 'confirmar_accion',
    accion: 'reasignar',
    reasignar_a: 'Otros',
  })
  const result = parseGeminiResponse(input)
  if (result.type === 'confirm_action') {
    expect(result.data.action).toBe('reassign')
    expect(result.data.reassignTo).toBe('Otros')
  }
})

test('edit con múltiples cambios simultáneos', () => {
  const input = JSON.stringify({
    intencion: 'editar',
    entidad: 'transaccion',
    busqueda: 'Netflix',
    cambios: {
      descripcion: 'Netflix Premium',
      monto: 8500,
      categoria: 'Entretenimiento',
    },
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('edit')
  if (result.type === 'edit') {
    expect((result.data.changes as any).descripcion).toBe('Netflix Premium')
    expect((result.data.changes as any).monto).toBe(8500)
    expect((result.data.changes as any).categoria).toBe('Entretenimiento')
  }
})

test('edit de medio_pago cambiando días de ciclo', () => {
  const input = JSON.stringify({
    intencion: 'editar',
    entidad: 'medio_pago',
    busqueda: 'Master',
    cambios: { closing_day: 20, payment_day: 5 },
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('edit')
  if (result.type === 'edit') {
    expect((result.data.changes as any).closing_day).toBe(20)
    expect((result.data.changes as any).payment_day).toBe(5)
  }
})

test('delete de cuota con busqueda descriptiva', () => {
  const input = JSON.stringify({
    intencion: 'eliminar',
    entidad: 'cuota',
    busqueda: 'notebook Lenovo',
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('delete')
  if (result.type === 'delete') {
    expect(result.data.entity).toBe('cuota')
    expect(result.data.search).toBe('notebook Lenovo')
  }
})

test('edit de suscripción desactivándola (is_active false)', () => {
  const input = JSON.stringify({
    intencion: 'editar',
    entidad: 'suscripcion',
    busqueda: 'Disney+',
    cambios: { is_active: false },
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('edit')
  if (result.type === 'edit') {
    expect(result.data.entity).toBe('suscripcion')
    expect((result.data.changes as any).is_active).toBe(false)
  }
})

// ============================================
// Edge cases: contexto conversacional en intents
// ============================================

test('conversacion parsea reply correctamente', () => {
  const input = JSON.stringify({
    intencion: 'conversacion',
    respuesta: '¡Hola! Podés registrar gastos, ingresos y Mensualidades.',
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('conversation')
  if (result.type === 'conversation') {
    expect(result.reply).toBe('¡Hola! Podés registrar gastos, ingresos y Mensualidades.')
  }
})

test('conversacion con respuesta de confirmación pendiente (flujo dependency check)', () => {
  const input = JSON.stringify({
    intencion: 'conversacion',
    respuesta: '¿Querés reasignar las 15 transacciones de Efectivo a otro medio de pago?',
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('conversation')
  if (result.type === 'conversation') {
    expect(result.reply.includes('reasignar')).toBe(true)
  }
})

test('backticks en confirm_action se limpian correctamente', () => {
  const raw = '```json\n{"intencion":"confirmar_accion","accion":"confirmar"}\n```'
  const result = parseGeminiResponse(raw)
  expect(result.type).toBe('confirm_action')
})

test('intención desconocida retorna error con mensaje descriptivo', () => {
  const input = JSON.stringify({
    intencion: 'hacer_magia',
    datos: 'algo',
  })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('error')
  if (result.type === 'error') {
    expect(result.message.length > 0).toBe(true)
  }
})

console.log(`\n=== Resultados ===`)
console.log(`✅ Pasaron: ${passed}`)
console.log(`❌ Fallaron: ${failed}`)
console.log(`📊 Total: ${passed + failed}`)

if (failed > 0) {
  process.exit(1)
}
