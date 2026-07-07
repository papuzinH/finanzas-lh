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
  methodId: number
  name: string
  total: number
  totalARS: number
  totalUSD: number
  nextPaymentDate: Date
  isCycleClosed: boolean
  isPending: boolean
  isPaidManually: boolean
}
