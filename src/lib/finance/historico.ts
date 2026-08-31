// src/lib/finance/historico.ts
import { format, subMonths } from 'date-fns'
import { parseLocalDate } from '@/lib/utils/dates'
import type { Category } from '@/types/database'
import type { ProcessedTransaction } from './types'

/** Un mes de la serie de una categoría. `real` está en pesos de hoy. */
export type PuntoMes = {
  /** 'YYYY-MM' */
  month: string
  nominal: number
  real: number
  /** El mes en curso: su monto es parcial, el mes no cerró. */
  enCurso: boolean
}

export type SerieCategoria = {
  categoryId: string
  categoryName: string
  emoji: string | null
  /** Sólo los meses CON actividad, del más viejo al más nuevo. */
  puntos: PuntoMes[]
}

/**
 * Factor para llevar un mes a pesos de hoy: el producto de (1 + ipc/100) de
 * todos los meses POSTERIORES a él, incluido el actual. Es la misma mecánica
 * que `getRealAdjustedTrend` en el store; un mes sin IPC publicado aporta
 * factor 1 (el INDEC publica con mes y medio de rezago, así que el mes en
 * curso nunca tiene el suyo).
 */
export function factorAPesosDeHoy(
  month: string,
  inflacion: Array<{ month: string; rate: number }>,
  now: Date,
): number {
  const porMes = new Map(inflacion.map((r) => [r.month, r.rate]))
  const mesActual = format(now, 'yyyy-MM')
  let factor = 1
  let cursor = now
  while (format(cursor, 'yyyy-MM') > month) {
    const fm = format(cursor, 'yyyy-MM')
    if (fm !== mesActual || porMes.has(fm)) {
      factor *= 1 + (porMes.get(fm) ?? 0) / 100
    }
    cursor = subMonths(cursor, 1)
  }
  return factor
}

export function computeSeriesPorCategoria(
  transactions: ProcessedTransaction[],
  categories: Category[],
  inflacion: Array<{ month: string; rate: number }>,
  months: number,
  now: Date,
): SerieCategoria[] {
  const mesActual = format(now, 'yyyy-MM')
  const desde = format(subMonths(now, months - 1), 'yyyy-MM')

  const relevantes = transactions.filter((t) => {
    if (t.type !== 'expense') return false
    if (t.card_payment_for || t.is_balance_adjustment) return false
    if (parseLocalDate(t.date) > now) return false // cuotas futuras: no son historia
    const mes = (t.periodDate || t.date).slice(0, 7)
    return mes >= desde && mes <= mesActual
  })

  const porCategoria = new Map<string, Map<string, number>>()
  for (const t of relevantes) {
    const mes = (t.periodDate || t.date).slice(0, 7)
    const porMes = porCategoria.get(t.category_id) ?? new Map<string, number>()
    porMes.set(mes, (porMes.get(mes) ?? 0) + Math.abs(Number(t.amount)))
    porCategoria.set(t.category_id, porMes)
  }

  return [...porCategoria.entries()].map(([categoryId, porMes]) => {
    const categoria = categories.find((c) => c.id === categoryId)
    return {
      categoryId,
      categoryName: categoria?.name ?? 'Otros',
      emoji: categoria?.emoji ?? null,
      puntos: [...porMes.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, nominal]) => ({
          month,
          nominal,
          real: nominal * factorAPesosDeHoy(month, inflacion, now),
          enCurso: month === mesActual,
        })),
    }
  })
}

/** Contra qué se compara el mes en curso. */
export type Vara = 'promedio' | 'mes_anterior'

export type Desvio = {
  /** Gasto del tramo del mes en curso, en pesos de hoy. */
  actual: number
  /** La vara, recortada al mismo tramo y en pesos de hoy. */
  referencia: number
  /** (actual − referencia) / referencia. `null` si la referencia es 0. */
  pct: number | null
  /** Hasta qué día del mes se recortaron los meses previos. */
  diaDeCorte: number
  /** true cuando el mes en curso tenía muy pocos días y se usó el último mes cerrado. */
  usaMesCerrado: boolean
}

/** Días mínimos del mes en curso para que el tramo diga algo. */
const DIAS_MINIMOS_DE_TRAMO = 3

export function computeDesvioPorTramo(
  txsDeLaCategoria: ProcessedTransaction[],
  inflacion: Array<{ month: string; rate: number }>,
  vara: Vara,
  months: number,
  now: Date,
  forzarMesCerrado?: boolean,
): Desvio | null {
  const diaDeHoy = now.getDate()
  const usaMesCerrado = diaDeHoy < DIAS_MINIMOS_DE_TRAMO || forzarMesCerrado === true
  const mesAncla = usaMesCerrado
    ? format(subMonths(now, 1), 'yyyy-MM')
    : format(now, 'yyyy-MM')
  const diaDeCorte = usaMesCerrado ? 31 : diaDeHoy

  const desde = format(subMonths(now, months - 1), 'yyyy-MM')

  /** Suma de una categoría en un mes, recortada al día de corte, en pesos de hoy. */
  const totalDelTramo = (mes: string): number =>
    txsDeLaCategoria
      .filter((t) => {
        if (t.type !== 'expense') return false
        if (t.card_payment_for || t.is_balance_adjustment) return false
        const fecha = parseLocalDate(t.date)
        if (fecha > now) return false
        if ((t.periodDate || t.date).slice(0, 7) !== mes) return false
        return parseLocalDate(t.periodDate || t.date).getDate() <= diaDeCorte
      })
      .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0) *
    factorAPesosDeHoy(mes, inflacion, now)

  const mesesPrevios: string[] = []
  for (let k = 1; k < months; k++) {
    const mes = format(subMonths(parseLocalDate(`${mesAncla}-01`), k), 'yyyy-MM')
    if (mes < desde) break
    mesesPrevios.push(mes)
  }
  if (mesesPrevios.length === 0) return null

  const actual = totalDelTramo(mesAncla)

  if (vara === 'mes_anterior') {
    // El único mes de referencia posible es el inmediato anterior: si no hay
    // nada cargado ahí, no hay con qué comparar (a diferencia de 'promedio',
    // acá no hay otros meses en los que apoyarse).
    const referencia = totalDelTramo(mesesPrevios[0])
    if (referencia === 0) return null
    return {
      actual,
      referencia,
      pct: (actual - referencia) / referencia,
      diaDeCorte,
      usaMesCerrado,
    }
  }

  // 'promedio': se promedia solo entre los meses CON actividad en el tramo —
  // promediar contra meses vacíos (categoría sin historial esos meses)
  // diluiría la referencia en vez de reflejar el gasto habitual real.
  const mesesConActividad = mesesPrevios.map((mes) => totalDelTramo(mes)).filter((total) => total > 0)
  const referencia =
    mesesConActividad.length > 0
      ? mesesConActividad.reduce((acc, total) => acc + total, 0) / mesesConActividad.length
      : 0

  return {
    actual,
    referencia,
    pct: referencia > 0 ? (actual - referencia) / referencia : null,
    diaDeCorte,
    usaMesCerrado,
  }
}

export type Clasificacion = 'nivel' | 'evento'
export type Pico = { month: string; monto: number }

/**
 * Cuántas veces el mes típico tiene que valer el pico para ser un evento.
 *
 * Se compara contra la MEDIANA de los otros meses, no contra su promedio: el
 * promedio ya está contaminado por el pico que se intenta detectar.
 *
 * La primera formulación de esta regla era «un mes concentra más de la mitad
 * del total», y se descartó porque cambia de significado con la ventana: para
 * llevarse la mitad del total el pico tiene que valer (N−1) veces un mes
 * típico, o sea 3× con 4 meses y 11× con 12. La regla se volvía más exigente
 * sola a medida que el usuario junta historia.
 */
const VECES_PARA_SER_EVENTO = 3

/** Meses cerrados mínimos para animarse a clasificar. */
const MESES_MINIMOS = 3

function mediana(valores: number[]): number {
  if (valores.length === 0) return 0
  const orden = [...valores].sort((a, b) => a - b)
  const medio = Math.floor(orden.length / 2)
  return orden.length % 2 === 0 ? (orden[medio - 1] + orden[medio]) / 2 : orden[medio]
}

/**
 * ¿La categoría cambió de nivel, o tuvo un gasto excepcional?
 *
 * Sólo mira meses CERRADOS: hace falta un mes completo para saber si algo fue
 * un evento. Limitación conocida: un evento del mes en curso se clasifica como
 * «nivel» hasta que el mes cierre — se aceptó para que una fila no salte de
 * grupo a mitad de mes y vuelva sola.
 */
export function clasificarSerie(puntos: PuntoMes[]): {
  clasificacion: Clasificacion
  pico: Pico | null
} {
  const cerrados = puntos.filter((p) => !p.enCurso)
  if (cerrados.length < MESES_MINIMOS) return { clasificacion: 'nivel', pico: null }

  const pico = cerrados.reduce((max, p) => (p.real > max.real ? p : max), cerrados[0])
  const otros = cerrados.filter((p) => p.month !== pico.month).map((p) => p.real)

  let referencia = mediana(otros)
  if (referencia === 0) {
    // Pasa de verdad: una categoría sin gasto en algún mes (Fernet en mayo).
    // Con mediana 0 cualquier pico sería infinito, así que se usa el promedio
    // de los meses que sí tuvieron actividad.
    const activos = otros.filter((v) => v > 0)
    if (activos.length === 0) return { clasificacion: 'nivel', pico: null }
    referencia = activos.reduce((a, b) => a + b, 0) / activos.length
  }

  return pico.real > referencia * VECES_PARA_SER_EVENTO
    ? { clasificacion: 'evento', pico: { month: pico.month, monto: pico.real } }
    : { clasificacion: 'nivel', pico: null }
}

export type FilaHistorico = {
  categoryId: string
  categoryName: string
  emoji: string | null
  /** Meses completos con actividad, para el sparkline. */
  puntos: PuntoMes[]
  /** `null` si la categoría no tiene meses previos con los que compararse. */
  desvio: Desvio | null
  clasificacion: Clasificacion
  /** Sólo cuando la clasificación es 'evento'. */
  pico: Pico | null
}

export type Historico = {
  filas: FilaHistorico[]
  /** Hasta qué día del mes se recortaron los meses de referencia. */
  diaDeCorte: number
  usaMesCerrado: boolean
  /** El mes del que habla el desvío ('YYYY-MM'). */
  mesAncla: string
  /** Los meses contra los que se comparó, para poder nombrarlos en la UI. */
  mesesDeReferencia: string[]
}

export function computeHistorico(
  transactions: ProcessedTransaction[],
  categories: Category[],
  inflacion: Array<{ month: string; rate: number }>,
  opciones: { vara: Vara; months?: number; now?: Date },
): Historico {
  const months = opciones.months ?? 6
  const now = opciones.now ?? new Date()
  const series = computeSeriesPorCategoria(transactions, categories, inflacion, months, now)

  // Si el usuario no cargó NADA este mes, el tramo no dice nada y se cae al
  // último mes cerrado. Se mira sobre el total, no por categoría: que UNA
  // categoría no tenga gastos este mes es información, no falta de datos.
  const mesEnCurso = format(now, 'yyyy-MM')
  const mesEnCursoVacio = !series.some((s) => s.puntos.some((p) => p.month === mesEnCurso))

  const filas: FilaHistorico[] = series.map((serie) => {
    const suyas = transactions.filter((t) => t.category_id === serie.categoryId)
    const { clasificacion, pico } = clasificarSerie(serie.puntos)
    const desvioCrudo = computeDesvioPorTramo(suyas, inflacion, opciones.vara, months, now, mesEnCursoVacio)
    // Con vara 'promedio', sin NINGÚN mes previo con actividad, computeDesvioPorTramo
    // no devuelve null: devuelve { referencia: 0, pct: null, ... } (no hay "0% de
    // cambio" que decir, hay ausencia de referencia). Acá se traduce ese caso a
    // desvío null: la categoría no se movió, nació.
    const desvio = desvioCrudo && desvioCrudo.pct === null ? null : desvioCrudo
    return {
      categoryId: serie.categoryId,
      categoryName: serie.categoryName,
      emoji: serie.emoji,
      puntos: serie.puntos,
      desvio,
      clasificacion,
      pico,
    }
  })

  const diaDeHoy = now.getDate()
  const usaMesCerrado = diaDeHoy < DIAS_MINIMOS_DE_TRAMO || mesEnCursoVacio
  const mesAncla = usaMesCerrado ? format(subMonths(now, 1), 'yyyy-MM') : format(now, 'yyyy-MM')
  const desde = format(subMonths(now, months - 1), 'yyyy-MM')
  const mesesDeReferencia: string[] = []
  for (let k = 1; k < months; k++) {
    const mes = format(subMonths(parseLocalDate(`${mesAncla}-01`), k), 'yyyy-MM')
    if (mes < desde) break
    mesesDeReferencia.push(mes)
  }

  return {
    filas,
    diaDeCorte: usaMesCerrado ? 31 : diaDeHoy,
    usaMesCerrado,
    mesAncla,
    mesesDeReferencia,
  }
}
