/**
 * Prompts especializados de Gemini para cada paso del onboarding.
 * Basados en la lógica del flujo de n8n (Chanchito_PROD.json).
 */

import type { OnboardingStep, ProposedCategory, SavedPaymentMethod } from './onboardingTypes'

export function buildOnboardingPrompt(
  step: OnboardingStep,
  context?: {
    proposedCategories?: ProposedCategory[]
    savedPaymentMethods?: SavedPaymentMethod[]
  }
): string {
  switch (step) {
    case 'name':
      return PROMPT_NAME
    case 'categories':
      return PROMPT_CATEGORIES
    case 'confirm_categories':
      return buildConfirmCategoriesPrompt(context?.proposedCategories || [])
    case 'payment_methods':
      return PROMPT_PAYMENT_METHODS
    case 'default_payment':
      return buildDefaultPaymentPrompt(context?.savedPaymentMethods || [])
  }
}

const PROMPT_NAME = `Sos un asistente que necesita extraer el nombre del usuario de su mensaje.
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

const PROMPT_CATEGORIES = `Sos un asistente financiero experto argentino. El usuario te va a describir sus gastos típicos en lenguaje natural.

Tu trabajo es generar una lista de categorías personalizadas basada en lo que describe.

Devolvé EXCLUSIVAMENTE un JSON con esta estructura:
{
  "categories": [
    {
      "emoji": "🛒",
      "name": "Supermercado",
      "description": "Compras de alimentos, bebidas, artículos de limpieza y higiene personal"
    },
    {
      "emoji": "🚗",
      "name": "Transporte",
      "description": "Nafta, peajes, estacionamiento, Uber, colectivo, subte"
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

function buildConfirmCategoriesPrompt(categories: ProposedCategory[]): string {
  const categoryList = categories
    .map(c => `${c.emoji} ${c.name}: ${c.description}`)
    .join('\n')

  return `Sos un asistente que evalúa si el usuario confirma o quiere modificar una lista de categorías propuestas.

Las categorías propuestas fueron:
${categoryList}

El usuario responde a la pregunta "¿Te parecen bien estas categorías?".

Devolvé EXCLUSIVAMENTE un JSON con esta estructura:
{
  "confirmed": true/false,
  "adjustments": "Descripción de los cambios pedidos (si confirmed es false)"
}

Reglas:
- Si dice "sí", "dale", "ok", "perfecto", "me gusta", "están bien", etc. → confirmed: true
- Si pide cambios, agrega/quita categorías, o dice "no" → confirmed: false, y en adjustments describí qué quiere cambiar.
- No agregues texto fuera del JSON.`
}

const PROMPT_PAYMENT_METHODS = `Sos un asistente que extrae información de medios de pago del mensaje del usuario.
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
    { "name": "Mercado Pago", "type": "debit", "closing_day": null, "payment_day": null },
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
- name: nombre del medio (ej: "Visa", "Master", "Mercado Pago", "Efectivo", "BBVA Débito")
- type: uno de "credit" (tarjeta de crédito), "debit" (débito/billetera virtual), "cash" (efectivo)
- closing_day: día del mes de cierre (solo para credit). Si no dice, null.
- payment_day: día del mes de vencimiento/pago (solo para credit). Si no dice, null.
- Si es "debit" o "cash", closing_day y payment_day son null.
- Detectá el tipo por contexto: "crédito", "débito", "efectivo", "billetera", etc.
- Si dice "Visa" sin especificar, asumí credit.
- Si dice "Mercado Pago" sin especificar, asumí debit.
- Si dice solo "Efectivo" o "Cash", type es "cash".

Reglas para "create_batch":
- Detectá cuando el usuario lista varios medios separados por comas, "y", o enumeración.
- Ejemplos: "efectivo, mercado pago y visa crédito", "tengo visa, master y efectivo"
- methods: array con cada medio detectado.
- needs_follow_up: nombres de tarjetas credit que NO tienen closing_day/payment_day definidos. Solo incluí credit sin fechas.
- Si TODAS las tarjetas credit ya tienen fechas, needs_follow_up debe ser array vacío.

Reglas para "delete":
- Detectá intenciones de borrar: "borrá efectivo", "sacá la visa", "eliminá mercado pago", "quitá efectivo"
- delete_name: el nombre del medio a borrar.

Reglas para "edit":
- Detectá intenciones de cambio: "cambiá efectivo por mercado pago", "renombrá visa a bbva"
- old_name: nombre actual, new_name: nombre nuevo, new_type: tipo nuevo (si cambia).

Reglas para "finish":
- Detectá intención de terminar: "listo", "ya está", "no más", "esos son todos", "terminé", etc.

- No agregues texto fuera del JSON.
- Siempre devolvé JSON válido.`

function buildDefaultPaymentPrompt(methods: SavedPaymentMethod[]): string {
  const methodList = methods
    .map(m => {
      const icon = m.type === 'credit' ? '💳' : m.type === 'debit' ? '🏧' : '💵'
      return `${icon} ${m.name} (${m.type})`
    })
    .join('\n')

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
- Si dice "la tarjeta" y solo hay una credit, elegí esa.
- Si no es claro, elegí el que más se parezca a lo que dijo.
- No agregues texto fuera del JSON.
- Siempre devolvé JSON válido.`
}
