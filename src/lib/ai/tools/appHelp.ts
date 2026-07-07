import { z } from 'zod'
import type { ToolDef } from './types'

const appHelpSchema = z.object({
  tema: z
    .string()
    .describe(
      'Concepto o palabra clave de la app a explicar (ej: "disponible real", "ciclo de tarjeta", "cuotas", "período")',
    ),
})

type AppHelpArgs = z.infer<typeof appHelpSchema>

interface AppHelpEntry {
  titulo: string
  explicacion: string
}

// Diccionario estático de conceptos internos de la app. Redactado en voz de
// Chanchito (cercana, rioplatense suave) a partir de la sección "Store" de
// CLAUDE.md — fuente de verdad conceptual de este repo. No inventa mecánicas
// que CLAUDE.md no describa.
const CONCEPTS: Record<string, AppHelpEntry> = {
  'disponible-real': {
    titulo: 'Disponible Real',
    explicacion:
      'Es el número grande que ves en el inicio: tu plata libre para gastar hoy, ya restando las mensualidades y tarjetas que sabés que vas a pagar. Ojo con esto: cuando pagás una mensualidad o el resumen de una tarjeta, el Disponible Real global NO se mueve — esa plata ya estaba descontada como compromiso pendiente, solo pasa de un bucket a otro. Lo que sí baja es el saldo del medio de pago con el que pagaste.',
  },
  'saldo-bruto': {
    titulo: 'Saldo Bruto',
    explicacion:
      'Es toda la plata que tenés en tus cuentas, antes de apartar lo que ya debés. Se calcula sumando tu Disponible Real más las mensualidades pendientes de este mes y lo que te falta pagar de tarjetas. Es un número más optimista que el Disponible Real, porque todavía no restó los compromisos que se vienen.',
  },
  'ciclo-de-tarjeta': {
    titulo: 'Ciclo de tarjeta (cerrado vs. en curso)',
    explicacion:
      'Cada tarjeta tiene un ciclo con fecha de cierre y de vencimiento, y ese ciclo recién avanza al siguiente resumen cuando el vencimiento actual ya pasó — el día exacto del vencimiento, ese resumen sigue siendo el vigente, porque ese día todavía lo debés. Por eso podés ver una tarjeta en estado "cerrado" (el resumen ya cerró y está esperando que lo pagues) y otra "en curso" (todavía está acumulando consumos del período actual) al mismo tiempo: depende de en qué punto del ciclo esté cada una.',
  },
  mensualidades: {
    titulo: 'Mensualidades',
    explicacion:
      'Las mensualidades (suscripciones, alquiler, gimnasio, etc.) no son un número aparte: cuando marcás una como pagada, Chanchito crea una transacción real con ese monto. Por eso marcarla pagada no mueve tu Disponible Real global — esa plata ya estaba contada como compromiso pendiente, ahora simplemente queda registrada como un gasto real en vez de una promesa.',
  },
  'pago-de-tarjeta': {
    titulo: 'Pago de tarjeta',
    explicacion:
      'Cuando pagás el resumen de una tarjeta, se crea una transacción de gasto en el medio de pago que usaste para pagarla (por ejemplo tu cuenta de Mercado Pago) — esa sí baja el saldo real de esa cuenta. Pero para el Disponible Real global y para tus estadísticas de gasto, ese pago es neutro: las compras que hiciste con la tarjeta ya se contaron una por una cuando las hiciste, así que sumar también el pago del resumen sería contarlas dos veces.',
  },
  cuotas: {
    titulo: 'Cuotas',
    explicacion:
      'Cuando comprás algo en cuotas, cada cuota se registra como su propia transacción. Una cuota "pertenece" al mes de su vencimiento, no al mes en que hiciste la compra — así que si comprás algo hoy pero tu tarjeta vence recién el mes que viene, esa cuota va a aparecer en el resumen del mes que viene.',
  },
  'medio-predeterminado': {
    titulo: 'Medio predeterminado',
    explicacion:
      'Es el medio de pago que marcaste como el que usás normalmente — solo puede haber uno por vez. Si le contás un gasto a Chanchito por chat y no le decís con qué pagaste, asume que fue con tu medio predeterminado. Lo configurás con el toggle "Predeterminado" al crear o editar un medio de pago.',
  },
  'metas-y-presupuestos': {
    titulo: 'Metas y presupuestos',
    explicacion:
      'Las metas de ahorro pueden ser únicas (juntar un monto para una fecha, como un viaje) o mensuales (un objetivo que se reinicia cada mes). Los presupuestos son distintos: le ponés un límite mensual a una categoría, como "Comida", y Chanchito te avisa si te estás por pasar o si ya te pasaste, comparando contra lo que gastaste ese mes en esa categoría.',
  },
  'periodDate-vs-fecha-real': {
    titulo: 'Fecha visual (periodDate) vs. fecha real',
    explicacion:
      'Cada transacción tiene dos fechas: la fecha real en que se hizo, y la fecha visual (periodDate) que usa Chanchito para agruparla en un mes. Para compras en cuotas o con tarjeta de crédito, esas dos fechas pueden no coincidir: la fecha visual sigue el ciclo de cierre/vencimiento de la tarjeta, no el día en que compraste. Por eso un gasto que hiciste en un mes puede aparecer agrupado en el resumen de otro mes distinto.',
  },
}

/** Quita acentos y pasa a minúsculas, para matching insensible a mayúsculas/acentos. */
const COMBINING_MARKS_REGEX = new RegExp('[̀-ͯ]', 'g')

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(COMBINING_MARKS_REGEX, '')
    .toLowerCase()
    .trim()
}

/**
 * Separa una clave o título en palabras "buscables": convierte camelCase
 * (periodDate → period Date) y guiones/guiones bajos en espacios, normaliza
 * y descarta palabras cortas (conectores como "de", "vs") para no generar
 * falsos positivos en el matching por inclusión.
 */
function toSearchTokens(s: string): string[] {
  const withSpaces = s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ')
  return normalize(withSpaces)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4)
}

const CONCEPT_TOKENS: Record<string, string[]> = Object.fromEntries(
  Object.entries(CONCEPTS).map(([key, entry]) => [
    key,
    Array.from(new Set([...toSearchTokens(key), ...toSearchTokens(entry.titulo)])),
  ]),
)

/**
 * Matchea el tema pedido contra el diccionario, por inclusión y sin distinguir
 * acentos/mayúsculas. Varios conceptos comparten palabras (ej. "tarjeta"
 * aparece en ciclo-de-tarjeta y en pago-de-tarjeta), así que en vez de
 * quedarnos con el primer token que matchee, contamos cuántos tokens matchean
 * por concepto y devolvemos el que tenga más — el más específico para la
 * consulta.
 */
function findConcept(tema: string): AppHelpEntry | undefined {
  const query = normalize(tema)
  if (!query) return undefined

  let bestKey: string | undefined
  let bestScore = 0

  for (const [key, tokens] of Object.entries(CONCEPT_TOKENS)) {
    const score = tokens.filter((token) => query.includes(token) || token.includes(query)).length
    if (score > bestScore) {
      bestScore = score
      bestKey = key
    }
  }

  return bestKey ? CONCEPTS[bestKey] : undefined
}

export const appHelpTool: ToolDef<typeof appHelpSchema> = {
  name: 'get_app_help',
  description:
    'Explica un concepto interno de la app (Disponible Real, ciclo de tarjeta, mensualidades, pago de tarjeta, cuotas, medio predeterminado, metas/presupuestos, periodDate vs. fecha real) para que el usuario entienda cómo funciona algo que vio en la app. No accede a datos del usuario. Si el tema no está en el diccionario, devuelve la lista de temas disponibles para ofrecérselos.',
  kind: 'read',
  schema: appHelpSchema,
  execute: async (rawArgs) => {
    const args = rawArgs as AppHelpArgs
    const entry = findConcept(args.tema)

    if (!entry) {
      return {
        ok: true,
        data: {
          mensaje: 'No tengo ese concepto en mi diccionario. Estos son los temas que puedo explicarte:',
          temas: Object.values(CONCEPTS).map((c) => c.titulo),
        },
      }
    }

    return { ok: true, data: entry }
  },
}
