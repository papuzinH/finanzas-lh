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
