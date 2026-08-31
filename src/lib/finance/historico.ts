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
