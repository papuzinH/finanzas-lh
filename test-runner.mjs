/**
 * Test runner para el pipeline de IA del chatbot.
 * Ejecuta tests del intentParser y chatPrompt sin dependencias externas.
 *
 * Nota: Reimplanta las funciones como JS puro para evitar dependencias de compilación.
 */

// ============================================
// REIMPLEMENTACIÓN: parseGeminiResponse
// ============================================

function parseGeminiResponse(rawResponse) {
  try {
    // Limpiar markdown backticks si existen
    const cleaned = rawResponse
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()

    if (!cleaned) {
      return {
        type: 'error',
        message: 'Error al parsear respuesta de IA: Unexpected end of JSON input',
      }
    }

    const parsed = JSON.parse(cleaned)

    // Validar que tiene una intención
    if (!parsed.intencion) {
      return {
        type: 'error',
        message: 'No se pudo determinar la intención del mensaje',
      }
    }

    // CASO A: Transacción
    if (parsed.intencion === 'transaccion') {
      const txData = parsed

      // Si no es un gasto real, retornar error
      if (!txData.es_gasto_real) {
        return {
          type: 'error',
          message: 'Este mensaje no corresponde a un movimiento de dinero real',
        }
      }

      // Si es cuota
      if (txData.cuotas.es_cuota && txData.cuotas.cantidad > 1) {
        return {
          type: 'installment',
          data: {
            description: txData.compra,
            amount: txData.cuotas.monto_total / txData.cuotas.cantidad,
            totalAmount: txData.cuotas.monto_total,
            installmentsCount: txData.cuotas.cantidad,
            type: txData.tipo,
            categoryId: txData.category_id || null,
            categoryName: txData.categoria || null,
            paymentMethodName: txData.medio_pago,
            date: txData.fecha,
            isReal: txData.es_gasto_real,
          },
        }
      }

      // Si es transacción simple
      return {
        type: 'transaction',
        data: {
          description: txData.compra,
          amount: txData.valor,
          type: txData.tipo,
          categoryId: txData.category_id || null,
          categoryName: txData.categoria || null,
          paymentMethodName: txData.medio_pago,
          date: txData.fecha,
          isReal: txData.es_gasto_real,
        },
      }
    }

    // CASO B: Configuración de tarjeta
    if (parsed.intencion === 'configuracion_tarjeta') {
      const cardData = parsed

      const closingDate = new Date(cardData.fecha_cierre)
      const paymentDate = new Date(cardData.fecha_vencimiento)

      return {
        type: 'card_config',
        data: {
          paymentMethodName: cardData.tarjeta_match,
          closingDay: closingDate.getUTCDate(),
          paymentDay: paymentDate.getUTCDate(),
        },
      }
    }

    // CASO C: Suscripción
    if (parsed.intencion === 'suscripcion') {
      const subData = parsed

      return {
        type: 'subscription',
        data: {
          description: subData.descripcion,
          amount: subData.valor,
          currency: subData.moneda,
          frequency: subData.frecuencia,
          categoryId: subData.category_id || null,
          categoryName: subData.categoria || null,
          paymentMethodName: subData.medio_pago,
        },
      }
    }

    // CASO D: Consulta
    if (parsed.intencion === 'consulta') {
      return {
        type: 'query',
        queryType: parsed.tipo,
        filters: parsed.filtros ?? { categoria: null, medio_pago: null, descripcion: null, limite: null },
      }
    }

    // CASO E: Conversación
    if (parsed.intencion === 'conversacion') {
      return {
        type: 'conversation',
        reply: parsed.respuesta,
      }
    }

    return {
      type: 'error',
      message: 'Intención no reconocida',
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Error desconocido'
    return {
      type: 'error',
      message: `Error al parsear respuesta de IA: ${errorMsg}`,
    }
  }
}

// ============================================
// REIMPLEMENTACIÓN: buildChatPrompt
// ============================================

function buildChatPrompt(categories) {
  // Construir la lista de categorías en formato de referencia
  const categoriesPrompt = categories
    .map((cat) => `- ${cat.emoji || '📁'} ${cat.name}: para ${cat.name.toLowerCase()}`)
    .join('\n')

  // Construir el diccionario de IDs (nombre -> UUID)
  const categoriesMap = categories.reduce(
    (acc, cat) => {
      acc[cat.name] = cat.id
      return acc
    },
    {}
  )

  const now = new Date().toISOString().split('T')[0] // Formato YYYY-MM-DD

  return `Actúa como un asistente financiero experto en el contexto económico argentino.
Tu objetivo es extraer datos estructurados de un mensaje natural y categorizarlos con precisión usando los IDs provistos.

INPUTS:
1. Mensaje del Usuario: el usuario escribirá un mensaje sobre un gasto, ingreso, suscripción o configuración de tarjeta.

2. Lista de Categorías (Referencia):
${categoriesPrompt}

3. DICCIONARIO DE IDs (Mapa Nombre -> UUID):
${JSON.stringify(categoriesMap, null, 2)}

INSTRUCCIONES:
Analiza el mensaje y devuelve EXCLUSIVAMENTE un objeto JSON.
Detecta la INTENCIÓN y elige la estructura correcta.
IMPORTANTE: Cuando elijas una categoría, busca su nombre exacto en el "DICCIONARIO DE IDs" y extrae el UUID correspondiente para el campo "category_id".

--- CASO A: ES UNA TRANSACCIÓN (Gasto, Compra, Cuotas, Ingreso) ---
Si el usuario informa un movimiento de dinero.
Devuelve esta estructura:
{
  "intencion": "transaccion",
  "compra": "Breve descripción del ítem (ej: Zapatillas Nike)",
  "categoria": "El nombre exacto de la categoría elegida (ej: 'Comida')",
  "category_id": "El UUID exacto sacado del DICCIONARIO DE IDs correspondiente a la categoría elegida.",
  "valor": 0, (Número positivo puro. Si es gasto 12000, pon 12000. Si es ingreso, también positivo).
  "tipo": "Uno de: 'expense' (gasto) o 'income' (ingreso/sueldo/cobro)",
  "medio_pago": "Nombre del medio si se menciona (ej: 'Visa', 'Master', 'Mercado Pago', 'Efectivo'). Si no dice nada, devuelve null.",
  "es_gasto_real": true, (Poner false si es publicidad, spam, aviso de seguridad, 'novedades', o notificaciones que NO implican movimiento de dinero),
  "cuotas": {
    "es_cuota": boolean, (true si el usuario menciona explícitamente cuotas, pagos o plan de pagos),
    "cantidad": number, (1 si es pago único. Si son cuotas, la cantidad, ej: 6),
    "monto_total": number (El precio TOTAL de la compra. IMPORTANTE: Si el usuario dice '6 cuotas de 10.000', el total es 60000. Si dice 'TV 100.000 en 6 pagos', el total es 100000)
  },
  "fecha": "YYYY-MM-DD" (Calculada en relación a hoy: ${now}. Por ejemplo, si dice 'hoy' es ${now}, si es ayer es el dia previo a ${now}. Si no dice nada, se asume que es ${now})
}

--- CASO B: CONFIGURACIÓN DE TARJETA (El usuario informa fechas) ---
Si el usuario dice algo como "La Visa cierra el 24/12 y vence el 05/01" o "Master cierra el 20".
Devuelve esta estructura:
{
  "intencion": "configuracion_tarjeta",
  "tarjeta_match": "Parte del nombre de la tarjeta para buscarla (ej: 'Visa')",
  "fecha_cierre": "YYYY-MM-DD" (Si solo dice el día '24', asume el cierre próximo lógico según la fecha de hoy: ${now}),
  "fecha_vencimiento": "YYYY-MM-DD" (Calcula la fecha lógica de vencimiento posterior al cierre)
}

--- CASO C: SUSCRIPCIÓN O GASTO FIJO (Recurring Plan) ---
Si el usuario menciona un gasto que se repite (ej: "Suscripción Netflix", "Pago el gimnasio todos los meses", "Débito automático de seguro", "Alquiler").
Devuelve esta estructura:
{
  "intencion": "suscripcion",
  "descripcion": "Nombre del servicio (ej: Spotify)",
  "valor": 0, (Monto mensual),
  "moneda": "ARS" (o USD si especifica),
  "categoria": "Nombre de la categoría elegida",
  "category_id": "El UUID exacto sacado del DICCIONARIO DE IDs",
  "frecuencia": "monthly", (Por defecto 'monthly', salvo que diga 'anual' o 'semanal'),
  "medio_pago": "Nombre del medio de pago si se menciona (ej: 'Visa'). Si no, null."
}

REGLAS CRÍTICAS DE PROCESAMIENTO:
1. Si detectas palabras como "Cobré", "Sueldo", "Me transfirieron", "Ingreso", define "tipo": "income" y "categoria": "Ingresos".
2. Si "es_gasto_real" es false, el resto de campos pueden ser null.
3. Prioriza tu lista de categorías personalizada. Si no encaja, usa "Otros".
4. Si el usuario dice palabras como 'mensual', 'suscripción', 'débito automático', 'plan', prioriza la intención 'suscripcion' sobre 'transaccion'.
5. El campo "category_id" ES OBLIGATORIO para transacciones y suscripciones. Nunca lo dejes null si encontraste una categoría.`
}

// ============================================
// Mini test runner
// ============================================

let passed = 0
let failed = 0

function test(desc, fn) {
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

function expect(val) {
  return {
    toBe: (expected) => {
      if (val !== expected) throw new Error(`expected ${expected}, got ${val}`)
    },
    toBeTruthy: () => {
      if (!val) throw new Error(`expected truthy, got ${val}`)
    },
    toBeNull: () => {
      if (val !== null) throw new Error(`expected null, got ${val}`)
    },
    toEqual: (expected) => {
      if (JSON.stringify(val) !== JSON.stringify(expected)) {
        throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(val)}`)
      }
    },
    toInclude: (expected) => {
      if (!String(val).includes(String(expected))) {
        throw new Error(`expected to include ${expected}, got "${val}"`)
      }
    },
    toBeGreaterThan: (expected) => {
      if (val <= expected) throw new Error(`expected > ${expected}, got ${val}`)
    },
  }
}

// ============================================
// TESTS: intentParser
// ============================================

console.log('\n========================================')
console.log('  INTENTPARSER.TEST.TS')
console.log('========================================\n')

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
  }
})

test('rechaza transacción no real', () => {
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
})

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
    expect(result.data.totalAmount).toBe(300000)
    expect(result.data.installmentsCount).toBe(6)
    expect(result.data.amount).toBe(50000)
  }
})

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
  }
})

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

test('maneja JSON inválido gracefully', () => {
  const result = parseGeminiResponse('esto no es json valido')
  expect(result.type).toBe('error')
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
})

test('maneja JSON envuelto en markdown code blocks', () => {
  const input = `\`\`\`json
{"intencion":"transaccion","compra":"Café","categoria":"Comida","category_id":"abc","valor":2000,"tipo":"expense","medio_pago":null,"es_gasto_real":true,"cuotas":{"es_cuota":false,"cantidad":1,"monto_total":2000},"fecha":"2026-03-15"}
\`\`\``
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('transaction')
})

test('maneja category_id null', () => {
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

// ============================================
// TESTS: chatPrompt
// ============================================

console.log('\n========================================')
console.log('  CHATPROMPT.TEST.TS')
console.log('========================================\n')

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

test('incluye una categoría simple', () => {
  const categories = [
    { id: '1', name: 'Comida', emoji: '🍔' },
  ]
  const prompt = buildChatPrompt(categories)
  expect(prompt.includes('Comida')).toBe(true)
})

test('incluye el emoji de la categoría', () => {
  const categories = [
    { id: '1', name: 'Comida', emoji: '🍔' },
  ]
  const prompt = buildChatPrompt(categories)
  expect(prompt.includes('🍔')).toBe(true)
})

test('incluye múltiples categorías', () => {
  const categories = [
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
  const categories = [
    { id: '1', name: 'Otros', emoji: null },
  ]
  const prompt = buildChatPrompt(categories)
  expect(prompt.includes('📁')).toBe(true)
})

test('construye diccionario de IDs de categorías', () => {
  const categories = [
    { id: 'abc-123', name: 'Comida', emoji: '🍔' },
    { id: 'def-456', name: 'Transporte', emoji: '🚗' },
  ]
  const prompt = buildChatPrompt(categories)
  expect(prompt.includes('abc-123')).toBe(true)
  expect(prompt.includes('def-456')).toBe(true)
})

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
})

test('incluye CASO B para tarjetas', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('CASO B')).toBe(true)
})

test('incluye CASO C para suscripciones', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('CASO C')).toBe(true)
})

test('incluye REGLAS CRÍTICAS', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('REGLAS CRÍTICAS')).toBe(true)
})

test('incluye fecha actual en formato YYYY-MM-DD', () => {
  const prompt = buildChatPrompt([])
  const dateRegex = /\d{4}-\d{2}-\d{2}/
  expect(dateRegex.test(prompt)).toBe(true)
})

test('menciona contexto argentino', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('argentino')).toBe(true)
})

test('maneja muchas categorías sin problemas', () => {
  const categories = Array.from({ length: 20 }, (_, i) => ({
    id: `id-${i}`,
    name: `Categoría ${i}`,
    emoji: '📁',
  }))
  const prompt = buildChatPrompt(categories)
  expect(prompt.length > 100).toBe(true)
  expect(prompt.includes('Categoría 0')).toBe(true)
})

test('maneja nombres de categoría con caracteres especiales', () => {
  const categories = [
    { id: '1', name: 'Educación & Cultura', emoji: '📚' },
  ]
  const prompt = buildChatPrompt(categories)
  expect(prompt.includes('Educación & Cultura')).toBe(true)
})

// ============================================
// TESTS: Query Intent
// ============================================

console.log('\n========================================')
console.log('  QUERY INTENT TESTS')
console.log('========================================\n')

test('parsea consulta de balance global', () => {
  const input = JSON.stringify({ intencion: 'consulta', tipo: 'balance_global', filtros: { categoria: null, medio_pago: null, descripcion: null, limite: null } })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('query')
  expect(result.queryType).toBe('balance_global')
})

test('parsea consulta de gasto del mes', () => {
  const input = JSON.stringify({ intencion: 'consulta', tipo: 'gasto_mes', filtros: { categoria: null, medio_pago: null, descripcion: null, limite: null } })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('query')
  expect(result.queryType).toBe('gasto_mes')
})

test('parsea consulta de categoría con filtro', () => {
  const input = JSON.stringify({ intencion: 'consulta', tipo: 'categoria_mes', filtros: { categoria: 'Comida', medio_pago: null, descripcion: null, limite: null } })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('query')
  expect(result.queryType).toBe('categoria_mes')
  expect(result.filters.categoria).toBe('Comida')
})

test('parsea consulta de cierre de tarjeta', () => {
  const input = JSON.stringify({ intencion: 'consulta', tipo: 'medio_pago_cierre', filtros: { categoria: null, medio_pago: 'Visa', descripcion: null, limite: null } })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('query')
  expect(result.filters.medio_pago).toBe('Visa')
})

test('parsea consulta de últimos movimientos con límite', () => {
  const input = JSON.stringify({ intencion: 'consulta', tipo: 'ultimos_movimientos', filtros: { categoria: null, medio_pago: null, descripcion: null, limite: 10 } })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('query')
  expect(result.filters.limite).toBe(10)
})

test('parsea consulta de cuota específica', () => {
  const input = JSON.stringify({ intencion: 'consulta', tipo: 'cuota_especifica', filtros: { categoria: null, medio_pago: null, descripcion: 'TV', limite: null } })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('query')
  expect(result.filters.descripcion).toBe('TV')
})

test('parsea consulta de ingreso del mes', () => {
  const input = JSON.stringify({ intencion: 'consulta', tipo: 'ingreso_mes', filtros: { categoria: null, medio_pago: null, descripcion: null, limite: null } })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('query')
  expect(result.queryType).toBe('ingreso_mes')
})

test('parsea consulta de resumen del mes', () => {
  const input = JSON.stringify({ intencion: 'consulta', tipo: 'resumen_mes', filtros: { categoria: null, medio_pago: null, descripcion: null, limite: null } })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('query')
  expect(result.queryType).toBe('resumen_mes')
})

test('parsea consulta de portfolio', () => {
  const input = JSON.stringify({ intencion: 'consulta', tipo: 'portfolio', filtros: { categoria: null, medio_pago: null, descripcion: null, limite: null } })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('query')
  expect(result.queryType).toBe('portfolio')
})

test('parsea consulta de suscripciones lista', () => {
  const input = JSON.stringify({ intencion: 'consulta', tipo: 'suscripciones_lista', filtros: { categoria: null, medio_pago: null, descripcion: null, limite: null } })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('query')
  expect(result.queryType).toBe('suscripciones_lista')
})

test('parsea consulta de suscripciones total', () => {
  const input = JSON.stringify({ intencion: 'consulta', tipo: 'suscripciones_total', filtros: { categoria: null, medio_pago: null, descripcion: null, limite: null } })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('query')
  expect(result.queryType).toBe('suscripciones_total')
})

test('parsea consulta de búsqueda con descripción', () => {
  const input = JSON.stringify({ intencion: 'consulta', tipo: 'busqueda', filtros: { categoria: null, medio_pago: null, descripcion: 'Mercado Libre', limite: null } })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('query')
  expect(result.queryType).toBe('busqueda')
  expect(result.filters.descripcion).toBe('Mercado Libre')
})

test('parsea consulta de medio pago consumo', () => {
  const input = JSON.stringify({ intencion: 'consulta', tipo: 'medio_pago_consumo', filtros: { categoria: null, medio_pago: 'Master', descripcion: null, limite: null } })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('query')
  expect(result.queryType).toBe('medio_pago_consumo')
  expect(result.filters.medio_pago).toBe('Master')
})

test('parsea consulta de cuotas del mes', () => {
  const input = JSON.stringify({ intencion: 'consulta', tipo: 'cuotas_mes', filtros: { categoria: null, medio_pago: null, descripcion: null, limite: null } })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('query')
  expect(result.queryType).toBe('cuotas_mes')
})

test('parsea consulta de mayor gasto', () => {
  const input = JSON.stringify({ intencion: 'consulta', tipo: 'mayor_gasto', filtros: { categoria: null, medio_pago: null, descripcion: null, limite: null } })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('query')
  expect(result.queryType).toBe('mayor_gasto')
})

test('parsea consulta de proyección del mes', () => {
  const input = JSON.stringify({ intencion: 'consulta', tipo: 'proyeccion_mes', filtros: { categoria: null, medio_pago: null, descripcion: null, limite: null } })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('query')
  expect(result.queryType).toBe('proyeccion_mes')
})

test('parsea conversación correctamente', () => {
  const input = JSON.stringify({ intencion: 'conversacion', respuesta: 'Hola, soy Chanchito' })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('conversation')
  expect(result.reply).toBe('Hola, soy Chanchito')
})

test('consulta con filtros null usa defaults', () => {
  const input = JSON.stringify({ intencion: 'consulta', tipo: 'balance_global' })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('query')
  expect(result.filters.categoria).toBeNull()
  expect(result.filters.medio_pago).toBeNull()
  expect(result.filters.descripcion).toBeNull()
  expect(result.filters.limite).toBeNull()
})

// ============================================
// RESULTADOS
// ============================================

console.log(`\n========================================`)
console.log(`RESULTADOS`)
console.log(`========================================`)
console.log(`✅ Pasaron: ${passed}`)
console.log(`❌ Fallaron: ${failed}`)
console.log(`📊 Total: ${passed + failed}`)
console.log(`========================================\n`)

if (failed > 0) {
  process.exit(1)
}
