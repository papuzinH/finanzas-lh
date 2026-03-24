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

    // CASO F: Editar entidad
    if (parsed.intencion === 'editar') {
      return {
        type: 'edit',
        data: {
          entity: parsed.entidad,
          search: parsed.busqueda,
          changes: parsed.cambios || {},
        },
      }
    }

    // CASO G: Eliminar entidad
    if (parsed.intencion === 'eliminar') {
      return {
        type: 'delete',
        data: {
          entity: parsed.entidad,
          search: parsed.busqueda,
        },
      }
    }

    // CASO H: Confirmar acción pendiente
    if (parsed.intencion === 'confirmar_accion') {
      return {
        type: 'confirm_action',
        data: {
          action: parsed.accion === 'reasignar'
            ? 'reassign'
            : parsed.accion === 'confirmar'
              ? 'confirm_delete'
              : 'cancel',
          reassignTo: parsed.reasignar_a,
        },
      }
    }

    // CASO I: Crear meta de ahorro
    if (parsed.intencion === 'crear_objetivo_ahorro') {
      return {
        type: 'create_goal',
        data: {
          name: parsed.nombre,
          type: parsed.tipo,
          targetAmount: parsed.monto_objetivo,
          currency: parsed.moneda ?? 'ARS',
          targetDate: parsed.fecha_objetivo ?? null,
        },
      }
    }

    // CASO J: Crear presupuesto
    if (parsed.intencion === 'crear_presupuesto') {
      return {
        type: 'create_budget',
        data: {
          categoryName: parsed.categoria,
          categoryId: parsed.category_id,
          limitAmount: parsed.monto_limite,
          currency: parsed.moneda ?? 'ARS',
        },
      }
    }

    // CASO K: Consultar objetivos
    if (parsed.intencion === 'consultar_objetivo') {
      return {
        type: 'query_goal',
        data: {
          queryType: parsed.tipo_consulta,
          search: parsed.busqueda ?? null,
        },
      }
    }

    // CASO L: Editar objetivo o presupuesto
    if (parsed.intencion === 'editar_objetivo') {
      return {
        type: 'edit_goal',
        data: {
          entity: parsed.entidad,
          search: parsed.busqueda,
          changes: parsed.cambios || {},
        },
      }
    }

    // CASO M: Eliminar objetivo o presupuesto
    if (parsed.intencion === 'eliminar_objetivo') {
      return {
        type: 'delete_goal',
        data: {
          entity: parsed.entidad,
          search: parsed.busqueda,
        },
      }
    }

    // CASO N: Aportar a meta
    if (parsed.intencion === 'aportar_meta') {
      return {
        type: 'goal_contribution',
        data: {
          search: parsed.busqueda,
          amount: parsed.monto,
          currency: parsed.moneda ?? 'ARS',
          note: parsed.nota ?? null,
          date: parsed.fecha,
        },
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

function buildChatPrompt(categories, conversationHistory, goalContext) {
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

  // Construir sección de contexto de objetivos
  let goalsSection = ''
  if (goalContext && (goalContext.savingsGoals.length > 0 || goalContext.categoryBudgets.length > 0)) {
    const goalsText = goalContext.savingsGoals.length > 0
      ? `\nMETAS DE AHORRO DEL USUARIO:\n${goalContext.savingsGoals.map(g =>
          `- "${g.name}" (${g.type === 'one_time' ? 'meta única' : 'mensual'}): objetivo ${g.currency} ${g.targetAmount.toLocaleString()}, progreso ${g.percent.toFixed(1)}%${g.type === 'one_time' ? `, ${g.daysLeft !== null ? g.daysLeft + ' días restantes' : 'sin fecha'}` : ', este mes: ' + g.currentMonthContributed.toLocaleString()}, estado: ${g.status === 'completed' ? '✅ lograda' : '⏳ activa'} [ID: ${g.id}]`
        ).join('\n')}`
      : ''

    const budgetsText = goalContext.categoryBudgets.length > 0
      ? `\nPRESUPUESTOS MENSUALES DEL USUARIO:\n${goalContext.categoryBudgets.map(b =>
          `- ${b.categoryEmoji || ''} ${b.categoryName}: límite ${b.currency} ${b.limit.toLocaleString()}, gastado ${b.spent.toLocaleString()} (${b.percent.toFixed(1)}%), estado: ${b.status === 'exceeded' ? '🔴 superado' : b.status === 'warning' ? '🟡 cuidado' : '🟢 ok'} [ID: ${b.id}]`
        ).join('\n')}`
      : ''

    goalsSection = goalsText + budgetsText + '\n'
  }

  // Construir sección de historial conversacional
  const historySection = conversationHistory && conversationHistory.length > 0
    ? `\nHISTORIAL DE CONVERSACIÓN (mensajes recientes, de más antiguo a más nuevo):
${conversationHistory.map(m => `${m.role === 'user' ? 'USUARIO' : 'ASISTENTE'}: ${m.content}`).join('\n')}
---
Usá este historial para resolver referencias implícitas (ej: "esa categoría", "el anterior", "ahora la otra", "sí borralo").
Si el asistente pidió confirmación en su último mensaje, priorizá detectar la intención "confirmar_accion".\n`
    : ''

  return `Actúa como un asistente financiero experto en el contexto económico argentino.
Tu objetivo es extraer datos estructurados de un mensaje natural y categorizarlos con precisión usando los IDs provistos.
${goalsSection}${historySection}
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

--- CASO D: CONSULTA (el usuario pregunta sobre sus finanzas) ---
Si el usuario hace una pregunta sobre sus gastos, balance, suscripciones, cuotas, inversiones, o movimientos.
Devuelve esta estructura:
{
  "intencion": "consulta",
  "tipo": "balance_global | gasto_mes | ingreso_mes | resumen_mes | categoria_mes | mayor_gasto | medio_pago_consumo | medio_pago_cierre | cuotas_mes | cuota_especifica | suscripciones_lista | suscripciones_total | portfolio | busqueda | ultimos_movimientos | proyeccion_mes",
  "filtros": {
    "categoria": null,
    "medio_pago": null,
    "descripcion": null,
    "limite": null
  }
}

--- CASO E: SALUDO, PREGUNTA O MENSAJE NO FINANCIERO ---
Si el usuario saluda o el mensaje no corresponde a ninguno de los casos anteriores.
Devuelve esta estructura:
{
  "intencion": "conversacion",
  "respuesta": "Tu respuesta en español, amigable y breve."
}

--- CASO F: EDITAR UNA ENTIDAD EXISTENTE ---
Si el usuario quiere modificar/editar/cambiar algo existente (ej: "cambiá la categoría del café", "editá el monto del último gasto", "renombrá la categoría Ropa a Indumentaria").
Devuelve esta estructura:
{
  "intencion": "editar",
  "entidad": "transaccion | medio_pago | categoria | suscripcion",
  "busqueda": "Keyword para encontrar la entidad",
  "cambios": { "campo": "nuevo_valor" }
}

--- CASO G: ELIMINAR UNA ENTIDAD ---
Si el usuario quiere borrar/eliminar/quitar algo (ej: "borrá el gasto del café", "eliminá la categoría Ropa", "sacá el medio de pago Efectivo").
Devuelve esta estructura:
{
  "intencion": "eliminar",
  "entidad": "transaccion | medio_pago | categoria | suscripcion | cuota",
  "busqueda": "Keyword para encontrar la entidad"
}

--- CASO H: CONFIRMAR UNA ACCIÓN PENDIENTE ---
Si en el mensaje anterior el asistente pidió confirmación (por ejemplo, para reasignar transacciones antes de borrar un medio de pago), y el usuario responde confirmando, cancelando, o indicando a dónde reasignar.
Devuelve esta estructura:
{
  "intencion": "confirmar_accion",
  "accion": "reasignar | confirmar | cancelar",
  "reasignar_a": "Nombre de la entidad destino (solo si accion es 'reasignar')"
}

Ejemplos de confirmación:
- "sí, borralo" → { "intencion": "confirmar_accion", "accion": "confirmar" }
- "no, cancelá" → { "intencion": "confirmar_accion", "accion": "cancelar" }
- "reasignalas a Mercado Pago" → { "intencion": "confirmar_accion", "accion": "reasignar", "reasignar_a": "Mercado Pago" }

--- CASO I: CREAR META DE AHORRO ---
Si el usuario quiere crear una nueva meta de ahorro (ej: "Quiero ahorrar para las vacaciones", "Poneme una meta de $200.000 para junio").
Devuelve esta estructura:
{
  "intencion": "crear_objetivo_ahorro",
  "nombre": "Nombre descriptivo de la meta",
  "tipo": "one_time | monthly",
  "monto_objetivo": 200000,
  "moneda": "ARS",
  "fecha_objetivo": "YYYY-MM-DD"
}

--- CASO J: CREAR PRESUPUESTO POR CATEGORÍA ---
Si el usuario quiere establecer un límite mensual de gasto por categoría.
Devuelve esta estructura:
{
  "intencion": "crear_presupuesto",
  "categoria": "Nombre de la categoría",
  "category_id": "El UUID exacto sacado del DICCIONARIO DE IDs",
  "monto_limite": 80000,
  "moneda": "ARS"
}

--- CASO K: CONSULTAR OBJETIVOS O PRESUPUESTOS ---
Si el usuario pregunta sobre sus metas, objetivos de ahorro o presupuestos.
Devuelve esta estructura:
{
  "intencion": "consultar_objetivo",
  "tipo_consulta": "lista_metas | meta_especifica | lista_presupuestos | presupuesto_especifico | resumen_objetivos",
  "busqueda": null
}

--- CASO L: EDITAR META O PRESUPUESTO ---
Si el usuario quiere modificar una meta existente o un presupuesto.
Devuelve esta estructura:
{
  "intencion": "editar_objetivo",
  "entidad": "objetivo | presupuesto",
  "busqueda": "keyword para encontrar la meta/presupuesto",
  "cambios": { "campo": "nuevo_valor" }
}

--- CASO M: ELIMINAR META O PRESUPUESTO ---
Si el usuario quiere eliminar una meta o presupuesto.
Devuelve esta estructura:
{
  "intencion": "eliminar_objetivo",
  "entidad": "objetivo | presupuesto",
  "busqueda": "keyword para encontrar la meta/presupuesto"
}

--- CASO N: REGISTRAR APORTE A META ---
Si el usuario quiere registrar dinero que aportó a una meta (ej: "Puse $10.000 en mi meta de vacaciones", "Aporté $500 USD al fondo de emergencia").
Devuelve esta estructura:
{
  "intencion": "aportar_meta",
  "busqueda": "keyword para encontrar la meta",
  "monto": 10000,
  "moneda": "ARS",
  "nota": null,
  "fecha": "YYYY-MM-DD"
}

REGLAS CRÍTICAS DE PROCESAMIENTO:
1. Si detectas palabras como "Cobré", "Sueldo", "Me transfirieron", "Ingreso", define "tipo": "income" y "categoria": "Ingresos".
2. Si "es_gasto_real" es false, el resto de campos pueden ser null.
3. Prioriza tu lista de categorías personalizada. Si no encaja, usa "Otros".
4. Si el usuario dice palabras como 'mensual', 'suscripción', 'débito automático', 'plan', prioriza la intención 'suscripcion' sobre 'transaccion'.
5. El campo "category_id" ES OBLIGATORIO para transacciones y suscripciones. Nunca lo dejes null si encontraste una categoría.
6. Si el usuario dice "borrá", "eliminá", "sacá", "quitá" → intención "eliminar".
7. Si el usuario dice "cambiá", "editá", "modificá", "renombrá", "actualizá" → intención "editar".
8. Si el mensaje anterior del asistente pedía confirmación y el usuario responde sí/no/reasignar → intención "confirmar_accion".
9. CONTEXTO CONVERSACIONAL: Usá el historial de la conversación para resolver referencias implícitas.
10. Si el usuario menciona "meta", "objetivo de ahorro" → priorizar intenciones crear_objetivo_ahorro o consultar_objetivo.
11. Si el usuario menciona "presupuesto", "límite de gasto" → priorizar crear_presupuesto o consultar_objetivo.
12. Si el usuario dice "aporté", "puse", "guardé" refiriéndose a una meta → intención "aportar_meta".
13. Los IDs de metas y presupuestos están en el contexto inicial. Usalos para editar/eliminar cuando el usuario refiera a una meta por nombre.`
}

// ============================================
// REIMPLEMENTACIÓN: buildOnboardingPrompt
// ============================================

const PROMPT_NAME_OB = `Sos un asistente que necesita extraer el nombre del usuario de su mensaje.
El usuario acaba de responder a la pregunta "¿Cómo querés que te llame?".

Devolvé EXCLUSIVAMENTE un JSON con esta estructura:
{
  "name": "El nombre extraído del mensaje"
}

Reglas:
- Si el mensaje contiene un nombre claro (ej: "Juan", "Soy María", "Decime Ale"), extraelo.
- Si no es claro, usá lo que dijo como nombre (ej: si dice "hola" devolvé "hola" como nombre).
- No agregues texto fuera del JSON.
- Siempre devolvé JSON válido.`

const PROMPT_CATEGORIES_OB = `Sos un asistente financiero experto argentino. El usuario te va a describir sus gastos típicos en lenguaje natural.

Tu trabajo es generar una lista de categorías personalizadas basada en lo que describe.

Devolvé EXCLUSIVAMENTE un JSON con esta estructura:
{
  "categories": [
    {
      "emoji": "🛒",
      "name": "Supermercado",
      "description": "Compras de alimentos, bebidas, artículos de limpieza y higiene personal"
    }
  ]
}

Reglas:
- Generá entre 5 y 12 categorías relevantes según lo que describe el usuario.
- Si el usuario es vago (ej: "lo normal"), generá categorías genéricas útiles: Comida, Transporte, Entretenimiento, Salud, Hogar, Ropa, Educación, Servicios.
- Cada categoría necesita: emoji representativo, nombre corto, y descripción detallada de qué incluye.
- Los nombres deben ser concisos (1-2 palabras).
- Las descripciones deben ayudar a clasificar gastos futuros (se usan como contexto para IA).
- Pensá en el contexto argentino (super, kiosco, nafta, sube, etc.).
- Siempre incluí al menos: una de comida, una de transporte, una general/otros.
- No agregues texto fuera del JSON.`

const PROMPT_PAYMENT_METHODS_OB = `Sos un asistente que extrae información de medios de pago del mensaje del usuario.
El usuario está configurando sus medios de pago. Puede mencionar uno o varios en un solo mensaje, y también puede editar o borrar medios ya cargados.

Devolvé EXCLUSIVAMENTE un JSON con una de estas estructuras:

--- Si el usuario describe UN solo medio de pago ---
{
  "intention": "create",
  "name": "Visa",
  "type": "credit",
  "closing_day": 24,
  "payment_day": 5
}

--- Si el usuario describe VARIOS medios en un mensaje ---
{
  "intention": "create_batch",
  "methods": [
    { "name": "Efectivo", "type": "cash", "closing_day": null, "payment_day": null },
    { "name": "Visa", "type": "credit", "closing_day": null, "payment_day": null }
  ],
  "needs_follow_up": ["Visa"]
}

--- Si el usuario quiere BORRAR un medio ya cargado ---
{
  "intention": "delete",
  "delete_name": "Efectivo"
}

--- Si el usuario quiere CAMBIAR un medio ya cargado ---
{
  "intention": "edit",
  "old_name": "Efectivo",
  "new_name": "Mercado Pago",
  "new_type": "debit"
}

--- Si el usuario indica que TERMINÓ ---
{
  "intention": "finish"
}

Reglas para "create":
- type: uno de "credit", "debit", "cash"
- closing_day y payment_day: solo para credit. Si no dice, null.

Reglas para "create_batch":
- needs_follow_up: nombres de tarjetas credit sin closing_day/payment_day.

Reglas para "delete":
- delete_name: el nombre del medio a borrar.

Reglas para "edit":
- old_name: nombre actual, new_name: nombre nuevo.

Reglas para "finish":
- Detectá: "listo", "ya está", "no más", "terminé", etc.

- No agregues texto fuera del JSON.
- Siempre devolvé JSON válido.`

function buildDefaultPaymentPrompt(methods) {
  const methodList = methods.map(m => {
    const icon = m.type === 'credit' ? '💳' : m.type === 'debit' ? '🏧' : '💵'
    return `${icon} ${m.name} (${m.type})`
  }).join('\n')
  return `Sos un asistente que identifica qué medio de pago eligió el usuario como principal.

Los medios de pago disponibles son:
${methodList}

El usuario responde a "¿Cuál es el que más usás?".

Devolvé EXCLUSIVAMENTE un JSON con esta estructura:
{
  "payment_method_name": "Nombre exacto del medio elegido"
}

Reglas:
- Buscá coincidencia parcial: si dice "visa" y hay "Visa", usá "Visa".
- No agregues texto fuera del JSON.
- Siempre devolvé JSON válido.`
}

function buildConfirmCategoriesPrompt(categories) {
  const list = categories.map(c => `${c.emoji} ${c.name}: ${c.description}`).join('\n')
  return `Sos un asistente que evalúa si el usuario confirma o quiere modificar una lista de categorías propuestas.

Las categorías propuestas fueron:
${list}

El usuario responde a la pregunta "¿Te parecen bien estas categorías?".

Devolvé EXCLUSIVAMENTE un JSON con esta estructura:
{
  "confirmed": true/false,
  "adjustments": "Descripción de los cambios pedidos (si confirmed es false)"
}

Reglas:
- Si dice "sí", "dale", "ok", "perfecto", "me gusta", "están bien", etc. → confirmed: true
- Si pide cambios → confirmed: false, adjustments describe qué quiere cambiar.
- No agregues texto fuera del JSON.`
}

function buildOnboardingPrompt(step, context) {
  switch (step) {
    case 'name': return PROMPT_NAME_OB
    case 'categories': return PROMPT_CATEGORIES_OB
    case 'confirm_categories': return buildConfirmCategoriesPrompt(context?.proposedCategories || [])
    case 'payment_methods': return PROMPT_PAYMENT_METHODS_OB
    case 'default_payment': return buildDefaultPaymentPrompt(context?.savedPaymentMethods || [])
  }
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
// TESTS: Nuevos intents F-N (Wave 4)
// ============================================

console.log('\n========================================')
console.log('  NUEVOS INTENTS WAVE 4 (F-N)')
console.log('========================================\n')

test('CASO F: parsea editar transacción', () => {
  const input = JSON.stringify({ intencion: 'editar', entidad: 'transaccion', busqueda: 'almuerzo', cambios: { descripcion: 'Almuerzo ejecutivo' } })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('edit')
  if (result.type === 'edit') {
    expect(result.data.entity).toBe('transaccion')
    expect(result.data.search).toBe('almuerzo')
  }
})

test('CASO F: parsea editar medio de pago', () => {
  const input = JSON.stringify({ intencion: 'editar', entidad: 'medio_pago', busqueda: 'Visa', cambios: { nombre: 'Visa Platinum' } })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('edit')
  if (result.type === 'edit') {
    expect(result.data.entity).toBe('medio_pago')
  }
})

test('CASO F: parsea editar categoría', () => {
  const input = JSON.stringify({ intencion: 'editar', entidad: 'categoria', busqueda: 'Comida', cambios: { nombre: 'Alimentación' } })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('edit')
})

test('CASO F: parsea editar suscripción', () => {
  const input = JSON.stringify({ intencion: 'editar', entidad: 'suscripcion', busqueda: 'Netflix', cambios: { valor: 7500 } })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('edit')
  if (result.type === 'edit') expect(result.data.entity).toBe('suscripcion')
})

test('CASO F: edit con cambios vacíos retorna objeto vacío', () => {
  const input = JSON.stringify({ intencion: 'editar', entidad: 'transaccion', busqueda: 'cafe', cambios: {} })
  const result = parseGeminiResponse(input)
  if (result.type === 'edit') {
    expect(JSON.stringify(result.data.changes)).toBe('{}')
  }
})

test('CASO G: parsea eliminar transacción', () => {
  const input = JSON.stringify({ intencion: 'eliminar', entidad: 'transaccion', busqueda: 'almuerzo del viernes' })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('delete')
  if (result.type === 'delete') {
    expect(result.data.entity).toBe('transaccion')
    expect(result.data.search).toBe('almuerzo del viernes')
  }
})

test('CASO G: parsea eliminar medio de pago', () => {
  const input = JSON.stringify({ intencion: 'eliminar', entidad: 'medio_pago', busqueda: 'Efectivo' })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('delete')
  if (result.type === 'delete') expect(result.data.entity).toBe('medio_pago')
})

test('CASO G: parsea eliminar suscripción', () => {
  const input = JSON.stringify({ intencion: 'eliminar', entidad: 'suscripcion', busqueda: 'Spotify' })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('delete')
})

test('CASO G: parsea eliminar plan de cuotas', () => {
  const input = JSON.stringify({ intencion: 'eliminar', entidad: 'cuota', busqueda: 'TV Samsung' })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('delete')
  if (result.type === 'delete') expect(result.data.entity).toBe('cuota')
})

test('CASO H: parsea acción reasignar (reassign)', () => {
  const input = JSON.stringify({ intencion: 'confirmar_accion', accion: 'reasignar', reasignar_a: 'Mercado Pago' })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('confirm_action')
  if (result.type === 'confirm_action') {
    expect(result.data.action).toBe('reassign')
    expect(result.data.reassignTo).toBe('Mercado Pago')
  }
})

test('CASO H: parsea acción confirmar eliminación (confirm_delete)', () => {
  const input = JSON.stringify({ intencion: 'confirmar_accion', accion: 'confirmar' })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('confirm_action')
  if (result.type === 'confirm_action') expect(result.data.action).toBe('confirm_delete')
})

test('CASO H: parsea acción cancelar', () => {
  const input = JSON.stringify({ intencion: 'confirmar_accion', accion: 'cancelar' })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('confirm_action')
  if (result.type === 'confirm_action') expect(result.data.action).toBe('cancel')
})

test('CASO I: parsea meta de ahorro one_time', () => {
  const input = JSON.stringify({ intencion: 'crear_objetivo_ahorro', nombre: 'Vacaciones Europa', tipo: 'one_time', monto_objetivo: 500000, moneda: 'ARS', fecha_objetivo: '2026-12-31' })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('create_goal')
  if (result.type === 'create_goal') {
    expect(result.data.name).toBe('Vacaciones Europa')
    expect(result.data.type).toBe('one_time')
    expect(result.data.targetAmount).toBe(500000)
    expect(result.data.targetDate).toBe('2026-12-31')
  }
})

test('CASO I: parsea meta mensual sin fecha', () => {
  const input = JSON.stringify({ intencion: 'crear_objetivo_ahorro', nombre: 'Fondo emergencia', tipo: 'monthly', monto_objetivo: 50000, moneda: 'ARS', fecha_objetivo: null })
  const result = parseGeminiResponse(input)
  if (result.type === 'create_goal') {
    expect(result.data.type).toBe('monthly')
    expect(result.data.targetDate === null).toBe(true)
  }
})

test('CASO I: parsea meta en USD', () => {
  const input = JSON.stringify({ intencion: 'crear_objetivo_ahorro', nombre: 'iPhone', tipo: 'one_time', monto_objetivo: 1000, moneda: 'USD', fecha_objetivo: '2026-06-01' })
  const result = parseGeminiResponse(input)
  if (result.type === 'create_goal') expect(result.data.currency).toBe('USD')
})

test('CASO J: parsea creación de presupuesto', () => {
  const input = JSON.stringify({ intencion: 'crear_presupuesto', categoria: 'Comida', category_id: 'cat-001', monto_limite: 80000, moneda: 'ARS' })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('create_budget')
  if (result.type === 'create_budget') {
    expect(result.data.categoryName).toBe('Comida')
    expect(result.data.limitAmount).toBe(80000)
  }
})

test('CASO K: parsea consulta de lista de metas', () => {
  const input = JSON.stringify({ intencion: 'consultar_objetivo', tipo_consulta: 'lista_metas', busqueda: null })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('query_goal')
  if (result.type === 'query_goal') expect(result.data.queryType).toBe('lista_metas')
})

test('CASO K: parsea consulta de meta específica', () => {
  const input = JSON.stringify({ intencion: 'consultar_objetivo', tipo_consulta: 'meta_especifica', busqueda: 'Vacaciones' })
  const result = parseGeminiResponse(input)
  if (result.type === 'query_goal') {
    expect(result.data.search).toBe('Vacaciones')
  }
})

test('CASO K: parsea consulta de lista de presupuestos', () => {
  const input = JSON.stringify({ intencion: 'consultar_objetivo', tipo_consulta: 'lista_presupuestos', busqueda: null })
  const result = parseGeminiResponse(input)
  if (result.type === 'query_goal') expect(result.data.queryType).toBe('lista_presupuestos')
})

test('CASO L: parsea editar objetivo', () => {
  const input = JSON.stringify({ intencion: 'editar_objetivo', entidad: 'objetivo', busqueda: 'Vacaciones', cambios: { monto_objetivo: 600000 } })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('edit_goal')
  if (result.type === 'edit_goal') {
    expect(result.data.entity).toBe('objetivo')
    expect(result.data.search).toBe('Vacaciones')
  }
})

test('CASO L: parsea editar presupuesto', () => {
  const input = JSON.stringify({ intencion: 'editar_objetivo', entidad: 'presupuesto', busqueda: 'Comida', cambios: { monto_limite: 100000 } })
  const result = parseGeminiResponse(input)
  if (result.type === 'edit_goal') expect(result.data.entity).toBe('presupuesto')
})

test('CASO M: parsea eliminar objetivo', () => {
  const input = JSON.stringify({ intencion: 'eliminar_objetivo', entidad: 'objetivo', busqueda: 'Fondo emergencia' })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('delete_goal')
  if (result.type === 'delete_goal') {
    expect(result.data.entity).toBe('objetivo')
    expect(result.data.search).toBe('Fondo emergencia')
  }
})

test('CASO M: parsea eliminar presupuesto', () => {
  const input = JSON.stringify({ intencion: 'eliminar_objetivo', entidad: 'presupuesto', busqueda: 'Ropa' })
  const result = parseGeminiResponse(input)
  if (result.type === 'delete_goal') expect(result.data.entity).toBe('presupuesto')
})

test('CASO N: parsea contribución a meta', () => {
  const input = JSON.stringify({ intencion: 'aportar_meta', busqueda: 'Vacaciones', monto: 25000, moneda: 'ARS', nota: 'Ahorro bonificación', fecha: '2026-03-23' })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('goal_contribution')
  if (result.type === 'goal_contribution') {
    expect(result.data.search).toBe('Vacaciones')
    expect(result.data.amount).toBe(25000)
    expect(result.data.note).toBe('Ahorro bonificación')
  }
})

test('CASO N: parsea contribución sin nota', () => {
  const input = JSON.stringify({ intencion: 'aportar_meta', busqueda: 'iPhone', monto: 50, moneda: 'USD', nota: null, fecha: '2026-03-23' })
  const result = parseGeminiResponse(input)
  if (result.type === 'goal_contribution') {
    expect(result.data.note === null).toBe(true)
    expect(result.data.currency).toBe('USD')
  }
})

// ============================================
// TESTS: Historial y GoalContext en chatPrompt (Wave 4)
// ============================================

console.log('\n========================================')
console.log('  HISTORIAL Y GOAL CONTEXT (Wave 4)')
console.log('========================================\n')

test('sin historial no incluye HISTORIAL DE CONVERSACIÓN', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('HISTORIAL DE CONVERSACIÓN')).toBe(false)
})

test('historial vacío no incluye sección', () => {
  const prompt = buildChatPrompt([], [])
  expect(prompt.includes('HISTORIAL DE CONVERSACIÓN')).toBe(false)
})

test('con historial incluye HISTORIAL DE CONVERSACIÓN', () => {
  const history = [
    { role: 'user', content: 'Gasté 5000 en comida' },
    { role: 'chanchito', content: '✅ Gasto registrado' },
  ]
  const prompt = buildChatPrompt([], history)
  expect(prompt.includes('HISTORIAL DE CONVERSACIÓN')).toBe(true)
})

test('historial formatea mensajes de usuario como USUARIO:', () => {
  const history = [{ role: 'user', content: 'mensaje de usuario' }]
  const prompt = buildChatPrompt([], history)
  expect(prompt.includes('USUARIO: mensaje de usuario')).toBe(true)
})

test('historial formatea mensajes de chanchito como ASISTENTE:', () => {
  const history = [{ role: 'chanchito', content: 'respuesta del bot' }]
  const prompt = buildChatPrompt([], history)
  expect(prompt.includes('ASISTENTE: respuesta del bot')).toBe(true)
})

test('historial incluye instrucción de referencias implícitas', () => {
  const history = [{ role: 'user', content: 'algo' }]
  const prompt = buildChatPrompt([], history)
  expect(prompt.includes('referencias implícitas')).toBe(true)
})

test('historial incluye instrucción de confirmar_accion', () => {
  const history = [{ role: 'chanchito', content: '¿Reasignar?' }, { role: 'user', content: 'sí' }]
  const prompt = buildChatPrompt([], history)
  expect(prompt.includes('confirmar_accion')).toBe(true)
})

test('sin goalContext no incluye METAS DE AHORRO', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('METAS DE AHORRO')).toBe(false)
})

test('goalContext vacío no incluye secciones', () => {
  const prompt = buildChatPrompt([], undefined, { savingsGoals: [], categoryBudgets: [] })
  expect(prompt.includes('METAS DE AHORRO')).toBe(false)
  expect(prompt.includes('PRESUPUESTOS MENSUALES')).toBe(false)
})

test('goalContext con metas incluye METAS DE AHORRO DEL USUARIO', () => {
  const goalContext = {
    savingsGoals: [{
      id: 'g1', name: 'Vacaciones', type: 'one_time',
      targetAmount: 100000, currency: 'ARS', targetDate: '2026-12-31',
      totalContributed: 30000, currentMonthContributed: 0,
      percent: 30, daysLeft: 280, status: 'active',
    }],
    categoryBudgets: [],
  }
  const prompt = buildChatPrompt([], undefined, goalContext)
  expect(prompt.includes('METAS DE AHORRO DEL USUARIO')).toBe(true)
  expect(prompt.includes('Vacaciones')).toBe(true)
})

test('goalContext con presupuestos incluye PRESUPUESTOS MENSUALES DEL USUARIO', () => {
  const goalContext = {
    savingsGoals: [],
    categoryBudgets: [{
      id: 'b1', categoryName: 'Comida', categoryEmoji: '🍔',
      limit: 50000, currency: 'ARS', spent: 30000,
      percent: 60, status: 'ok',
    }],
  }
  const prompt = buildChatPrompt([], undefined, goalContext)
  expect(prompt.includes('PRESUPUESTOS MENSUALES DEL USUARIO')).toBe(true)
  expect(prompt.includes('Comida')).toBe(true)
})

test('goalContext muestra porcentaje de progreso', () => {
  const goalContext = {
    savingsGoals: [{
      id: 'g1', name: 'Auto', type: 'one_time',
      targetAmount: 1000000, currency: 'ARS', targetDate: '2027-01-01',
      totalContributed: 250000, currentMonthContributed: 0,
      percent: 25, daysLeft: 280, status: 'active',
    }],
    categoryBudgets: [],
  }
  const prompt = buildChatPrompt([], undefined, goalContext)
  expect(prompt.includes('25.0%')).toBe(true)
})

test('goalContext presupuesto excedido muestra superado', () => {
  const goalContext = {
    savingsGoals: [],
    categoryBudgets: [{
      id: 'b2', categoryName: 'Ropa', categoryEmoji: '👕',
      limit: 20000, currency: 'ARS', spent: 25000,
      percent: 125, status: 'exceeded',
    }],
  }
  const prompt = buildChatPrompt([], undefined, goalContext)
  expect(prompt.includes('superado')).toBe(true)
})

test('prompt incluye CASO F para editar', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('CASO F')).toBe(true)
})

test('prompt incluye CASO G para eliminar', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('CASO G')).toBe(true)
})

// ============================================
// TESTS: CASO D, E, H y REGLAS (chatPrompt)
// ============================================

console.log('\n========================================')
console.log('  CASO D/E/H/I-N Y REGLAS CRÍTICAS')
console.log('========================================\n')

test('prompt incluye CASO H para confirmar acción pendiente', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('CASO H')).toBe(true)
})

test('prompt incluye intención confirmar_accion en CASO H', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('confirmar_accion')).toBe(true)
})

test('prompt incluye acción reasignar en CASO H', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('reasignar')).toBe(true)
})

test('prompt incluye campo reasignar_a en CASO H', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('reasignar_a')).toBe(true)
})

test('prompt incluye ejemplo "sí, borralo" para dependency check', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('borralo')).toBe(true)
})

test('prompt incluye ejemplo reasignación a Mercado Pago', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('Mercado Pago')).toBe(true)
})

test('prompt incluye CASO D para consultas', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('CASO D')).toBe(true)
})

test('prompt incluye tipo balance_global en CASO D', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('balance_global')).toBe(true)
})

test('prompt incluye tipo proyeccion_mes en CASO D', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('proyeccion_mes')).toBe(true)
})

test('prompt incluye tipo ultimos_movimientos en CASO D', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('ultimos_movimientos')).toBe(true)
})

test('prompt incluye campo filtros en CASO D', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('"filtros"')).toBe(true)
})

test('prompt incluye CASO E para mensajes no financieros', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('CASO E')).toBe(true)
})

test('prompt incluye intención conversacion en CASO E', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('"conversacion"')).toBe(true)
})

test('prompt incluye CASO I para metas de ahorro', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('CASO I')).toBe(true)
})

test('prompt incluye intención crear_objetivo_ahorro', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('crear_objetivo_ahorro')).toBe(true)
})

test('prompt incluye tipos one_time y monthly para metas', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('one_time')).toBe(true)
  expect(prompt.includes('monthly')).toBe(true)
})

test('prompt incluye CASO J para presupuestos', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('CASO J')).toBe(true)
})

test('prompt incluye intención crear_presupuesto', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('crear_presupuesto')).toBe(true)
})

test('prompt incluye campo monto_limite', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('monto_limite')).toBe(true)
})

test('prompt incluye CASO K para consultar objetivos', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('CASO K')).toBe(true)
})

test('prompt incluye tipo lista_metas', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('lista_metas')).toBe(true)
})

test('prompt incluye CASO L para editar metas', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('CASO L')).toBe(true)
})

test('prompt incluye intención editar_objetivo', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('editar_objetivo')).toBe(true)
})

test('prompt incluye CASO M para eliminar metas', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('CASO M')).toBe(true)
})

test('prompt incluye intención eliminar_objetivo', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('eliminar_objetivo')).toBe(true)
})

test('prompt incluye CASO N para aportar a metas', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('CASO N')).toBe(true)
})

test('prompt incluye intención aportar_meta', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('aportar_meta')).toBe(true)
})

test('REGLA 6: mapea borrar/eliminar a intención eliminar', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('borrá')).toBe(true)
  expect(prompt.includes('"eliminar"')).toBe(true)
})

test('REGLA 7: mapea cambiá/editá a intención editar', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('cambiá')).toBe(true)
  expect(prompt.includes('"editar"')).toBe(true)
})

test('REGLA 9: menciona CONTEXTO CONVERSACIONAL', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('CONTEXTO CONVERSACIONAL')).toBe(true)
})

test('REGLA 12: mapea aporté/puse a aportar_meta', () => {
  const prompt = buildChatPrompt([])
  expect(prompt.includes('aporté') || prompt.includes('puse') || prompt.includes('guardé')).toBe(true)
  expect(prompt.includes('aportar_meta')).toBe(true)
})

// ============================================
// TESTS: Edge cases dependency checks
// ============================================

console.log('\n========================================')
console.log('  EDGE CASES: DEPENDENCY CHECKS')
console.log('========================================\n')

test('delete de medio_pago con busqueda compuesta', () => {
  const input = JSON.stringify({ intencion: 'eliminar', entidad: 'medio_pago', busqueda: 'Visa Platinum' })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('delete')
  if (result.type === 'delete') {
    expect(result.data.search).toBe('Visa Platinum')
    expect(result.data.entity).toBe('medio_pago')
  }
})

test('delete de categoria con acento en busqueda', () => {
  const input = JSON.stringify({ intencion: 'eliminar', entidad: 'categoria', busqueda: 'Educación' })
  const result = parseGeminiResponse(input)
  if (result.type === 'delete') {
    expect(result.data.search).toBe('Educación')
  }
})

test('confirm_action: reasignar a entidad con nombre compuesto', () => {
  const input = JSON.stringify({ intencion: 'confirmar_accion', accion: 'reasignar', reasignar_a: 'Mercado Pago Tarjeta' })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('confirm_action')
  if (result.type === 'confirm_action') {
    expect(result.data.action).toBe('reassign')
    expect(result.data.reassignTo).toBe('Mercado Pago Tarjeta')
  }
})

test('confirm_action: reasignar a Otros (categoría genérica)', () => {
  const input = JSON.stringify({ intencion: 'confirmar_accion', accion: 'reasignar', reasignar_a: 'Otros' })
  const result = parseGeminiResponse(input)
  if (result.type === 'confirm_action') {
    expect(result.data.action).toBe('reassign')
    expect(result.data.reassignTo).toBe('Otros')
  }
})

test('edit con múltiples cambios simultáneos', () => {
  const input = JSON.stringify({ intencion: 'editar', entidad: 'transaccion', busqueda: 'Netflix', cambios: { descripcion: 'Netflix Premium', monto: 8500, categoria: 'Entretenimiento' } })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('edit')
  if (result.type === 'edit') {
    expect(result.data.changes.descripcion).toBe('Netflix Premium')
    expect(result.data.changes.monto).toBe(8500)
  }
})

test('edit de medio_pago cambiando días de ciclo de tarjeta', () => {
  const input = JSON.stringify({ intencion: 'editar', entidad: 'medio_pago', busqueda: 'Master', cambios: { closing_day: 20, payment_day: 5 } })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('edit')
  if (result.type === 'edit') {
    expect(result.data.changes.closing_day).toBe(20)
    expect(result.data.changes.payment_day).toBe(5)
  }
})

test('delete de cuota con busqueda descriptiva', () => {
  const input = JSON.stringify({ intencion: 'eliminar', entidad: 'cuota', busqueda: 'notebook Lenovo' })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('delete')
  if (result.type === 'delete') {
    expect(result.data.entity).toBe('cuota')
    expect(result.data.search).toBe('notebook Lenovo')
  }
})

test('edit de suscripción desactivándola (is_active false)', () => {
  const input = JSON.stringify({ intencion: 'editar', entidad: 'suscripcion', busqueda: 'Disney+', cambios: { is_active: false } })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('edit')
  if (result.type === 'edit') {
    expect(result.data.entity).toBe('suscripcion')
    expect(result.data.changes.is_active).toBe(false)
  }
})

test('conversacion parsea reply correctamente', () => {
  const input = JSON.stringify({ intencion: 'conversacion', respuesta: '¡Hola! Podés registrar gastos, ingresos y suscripciones.' })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('conversation')
  if (result.type === 'conversation') {
    expect(result.reply).toBe('¡Hola! Podés registrar gastos, ingresos y suscripciones.')
  }
})

test('backticks en confirm_action se limpian correctamente', () => {
  const raw = '```json\n{"intencion":"confirmar_accion","accion":"confirmar"}\n```'
  const result = parseGeminiResponse(raw)
  expect(result.type).toBe('confirm_action')
})

test('intención desconocida retorna error con mensaje descriptivo', () => {
  const input = JSON.stringify({ intencion: 'hacer_magia', datos: 'algo' })
  const result = parseGeminiResponse(input)
  expect(result.type).toBe('error')
  if (result.type === 'error') {
    expect(result.message.length > 0).toBe(true)
  }
})

// ============================================
// TESTS: Onboarding Prompts (Wave 4 — Batch)
// ============================================

console.log('\n========================================')
console.log('  ONBOARDING PROMPTS WAVE 4')
console.log('========================================\n')

test('prompt name menciona extraer nombre', () => {
  const prompt = buildOnboardingPrompt('name')
  expect(prompt.includes('nombre')).toBe(true)
  expect(prompt.includes('"name"')).toBe(true)
})

test('prompt name pide JSON válido', () => {
  const prompt = buildOnboardingPrompt('name')
  expect(prompt.includes('JSON')).toBe(true)
})

test('prompt categories incluye estructura con array categories', () => {
  const prompt = buildOnboardingPrompt('categories')
  expect(prompt.includes('"categories"')).toBe(true)
})

test('prompt categories menciona 5 y 12 como rango', () => {
  const prompt = buildOnboardingPrompt('categories')
  expect(prompt.includes('5') && prompt.includes('12')).toBe(true)
})

test('prompt categories incluye emoji, name, description', () => {
  const prompt = buildOnboardingPrompt('categories')
  expect(prompt.includes('"emoji"')).toBe(true)
  expect(prompt.includes('"name"')).toBe(true)
  expect(prompt.includes('"description"')).toBe(true)
})

test('prompt categories menciona contexto argentino', () => {
  const prompt = buildOnboardingPrompt('categories')
  const hasArg = prompt.includes('argentino') || prompt.includes('argentin')
  expect(hasArg).toBe(true)
})

test('prompt confirm_categories incluye categorías propuestas', () => {
  const cats = [
    { emoji: '🍔', name: 'Comida', description: 'Alimentación' },
    { emoji: '🚗', name: 'Transporte', description: 'Movilidad' },
  ]
  const prompt = buildOnboardingPrompt('confirm_categories', { proposedCategories: cats })
  expect(prompt.includes('Comida')).toBe(true)
  expect(prompt.includes('Transporte')).toBe(true)
})

test('prompt confirm_categories incluye campos confirmed y adjustments', () => {
  const prompt = buildOnboardingPrompt('confirm_categories', { proposedCategories: [] })
  expect(prompt.includes('"confirmed"')).toBe(true)
  expect(prompt.includes('"adjustments"')).toBe(true)
})

test('prompt payment_methods incluye intención create', () => {
  const prompt = buildOnboardingPrompt('payment_methods')
  expect(prompt.includes('"create"')).toBe(true)
})

test('prompt payment_methods incluye intención create_batch', () => {
  const prompt = buildOnboardingPrompt('payment_methods')
  expect(prompt.includes('"create_batch"')).toBe(true)
})

test('prompt payment_methods incluye intención delete', () => {
  const prompt = buildOnboardingPrompt('payment_methods')
  expect(prompt.includes('"delete"')).toBe(true)
})

test('prompt payment_methods incluye intención edit', () => {
  const prompt = buildOnboardingPrompt('payment_methods')
  expect(prompt.includes('"edit"')).toBe(true)
})

test('prompt payment_methods incluye intención finish', () => {
  const prompt = buildOnboardingPrompt('payment_methods')
  expect(prompt.includes('"finish"')).toBe(true)
})

test('prompt payment_methods incluye campo needs_follow_up', () => {
  const prompt = buildOnboardingPrompt('payment_methods')
  expect(prompt.includes('needs_follow_up')).toBe(true)
})

test('prompt payment_methods distingue credit/debit/cash', () => {
  const prompt = buildOnboardingPrompt('payment_methods')
  expect(prompt.includes('"credit"')).toBe(true)
  expect(prompt.includes('"debit"')).toBe(true)
  expect(prompt.includes('"cash"')).toBe(true)
})

test('prompt payment_methods incluye closing_day y payment_day', () => {
  const prompt = buildOnboardingPrompt('payment_methods')
  expect(prompt.includes('closing_day')).toBe(true)
  expect(prompt.includes('payment_day')).toBe(true)
})

test('prompt payment_methods incluye delete_name', () => {
  const prompt = buildOnboardingPrompt('payment_methods')
  expect(prompt.includes('delete_name')).toBe(true)
})

test('prompt payment_methods incluye old_name y new_name', () => {
  const prompt = buildOnboardingPrompt('payment_methods')
  expect(prompt.includes('old_name')).toBe(true)
  expect(prompt.includes('new_name')).toBe(true)
})

test('prompt payment_methods menciona "listo" como finish', () => {
  const prompt = buildOnboardingPrompt('payment_methods')
  expect(prompt.includes('listo') || prompt.includes('terminé')).toBe(true)
})

test('prompt default_payment incluye métodos guardados', () => {
  const methods = [
    { id: 1, name: 'Visa', type: 'credit', closingDay: 24, paymentDay: 5 },
    { id: 2, name: 'Efectivo', type: 'cash', closingDay: null, paymentDay: null },
  ]
  const prompt = buildOnboardingPrompt('default_payment', { savedPaymentMethods: methods })
  expect(prompt.includes('Visa')).toBe(true)
  expect(prompt.includes('Efectivo')).toBe(true)
})

test('prompt default_payment usa ícono 💳 para crédito', () => {
  const methods = [{ id: 1, name: 'Master', type: 'credit', closingDay: 10, paymentDay: 1 }]
  const prompt = buildOnboardingPrompt('default_payment', { savedPaymentMethods: methods })
  expect(prompt.includes('💳')).toBe(true)
})

test('prompt default_payment usa ícono 🏧 para débito', () => {
  const methods = [{ id: 1, name: 'Débito BBVA', type: 'debit', closingDay: null, paymentDay: null }]
  const prompt = buildOnboardingPrompt('default_payment', { savedPaymentMethods: methods })
  expect(prompt.includes('🏧')).toBe(true)
})

test('prompt default_payment usa ícono 💵 para efectivo', () => {
  const methods = [{ id: 1, name: 'Efectivo', type: 'cash', closingDay: null, paymentDay: null }]
  const prompt = buildOnboardingPrompt('default_payment', { savedPaymentMethods: methods })
  expect(prompt.includes('💵')).toBe(true)
})

test('prompt default_payment incluye campo payment_method_name', () => {
  const prompt = buildOnboardingPrompt('default_payment', { savedPaymentMethods: [] })
  expect(prompt.includes('payment_method_name')).toBe(true)
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
