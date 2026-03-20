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
// CASO C: Suscripciones
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

console.log(`\n=== Resultados ===`)
console.log(`✅ Pasaron: ${passed}`)
console.log(`❌ Fallaron: ${failed}`)
console.log(`📊 Total: ${passed + failed}`)

if (failed > 0) {
  process.exit(1)
}
