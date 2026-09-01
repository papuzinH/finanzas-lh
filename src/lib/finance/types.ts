import type { Transaction } from '@/types/database'

/** Transacción con campos de procesamiento (periodDate visual + fecha real de pago). */
export type ProcessedTransaction = Transaction & {
  periodDate: string
  realPaymentDate: string
}

export interface DolarBlue {
  compra: number
  venta: number
  fechaActualizacion: string
}

export type CreditCardCycleSummary = {
  methodId: string
  name: string
  total: number
  totalARS: number
  totalUSD: number
  nextPaymentDate: Date
  isCycleClosed: boolean
  isPending: boolean
  isPaidManually: boolean
  /**
   * true = este resumen YA VENCIO y no tiene pago registrado. Se sigue contando
   * como compromiso a proposito (ver computePendingCreditCards): el ciclo avanza
   * solo y sin esto el disponible subia por plata que ya no esta.
   */
  isOverdue: boolean
}
