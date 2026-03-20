import { parse, format, startOfMonth, endOfMonth, isAfter, isBefore, isSameMonth, addMonths, getDate } from 'date-fns'

/**
 * Parsea un string de fecha ISO (YYYY-MM-DD) como fecha LOCAL.
 * Evita el bug de UTC donde "2024-03-19" se interpreta como medianoche UTC
 * y puede aparecer como "2024-03-18" en timezones UTC-X.
 */
export function parseLocalDate(dateString: string): Date {
  // parse() interpreta la fecha en el timezone local del browser
  return parse(dateString, 'yyyy-MM-dd', new Date())
}

/**
 * Formatea una Date a string ISO local (YYYY-MM-DD) sin conversión UTC.
 */
export function formatLocalDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/**
 * Retorna la fecha de hoy como string ISO local.
 */
export function todayString(): string {
  return formatLocalDate(new Date())
}

/**
 * Compara si una fecha string está en el mismo mes que una Date de referencia.
 */
export function isInSameMonth(dateString: string, reference: Date): boolean {
  return isSameMonth(parseLocalDate(dateString), reference)
}

/**
 * Dado el día de cierre y día de vencimiento de una tarjeta,
 * calcula el inicio y fin del período de facturación actual.
 * Ejemplo: cierre día 24, vencimiento día 6.
 */
export function getCreditCardPeriod(closingDay: number, paymentDay: number, referenceDate: Date = new Date()): {
  periodStart: Date
  periodEnd: Date
  paymentDate: Date
} {
  const year = referenceDate.getFullYear()
  const month = referenceDate.getMonth()
  const day = referenceDate.getDate()

  let periodEndMonth = month
  let periodEndYear = year

  // Si todavía no pasó el cierre este mes, el período termina este mes
  // Si ya pasó el cierre, el período termina el próximo mes
  if (day > closingDay) {
    periodEndMonth = month + 1
    if (periodEndMonth > 11) {
      periodEndMonth = 0
      periodEndYear = year + 1
    }
  }

  const periodEnd = new Date(periodEndYear, periodEndMonth, closingDay)
  const periodStart = new Date(
    periodEndMonth === 0 ? periodEndYear - 1 : periodEndYear,
    periodEndMonth === 0 ? 11 : periodEndMonth - 1,
    closingDay + 1
  )

  // La fecha de pago es después del cierre
  const paymentMonth = periodEndMonth + 1 > 11 ? 0 : periodEndMonth + 1
  const paymentYear = periodEndMonth + 1 > 11 ? periodEndYear + 1 : periodEndYear
  const paymentDate = new Date(paymentYear, paymentMonth, paymentDay)

  return { periodStart, periodEnd, paymentDate }
}

/**
 * Calcula la fecha de pago real de una transacción en tarjeta de crédito.
 * Si la fecha de transacción cae en el período actual, el pago es en el próximo vencimiento.
 */
export function getInstallmentPaymentDate(
  transactionDate: string,
  closingDay: number,
  paymentDay: number
): Date {
  const txDate = parseLocalDate(transactionDate)
  const txDay = getDate(txDate)

  // Si la transacción es antes o en el día de cierre, cierra este mes
  // Si es después del cierre, cierra el próximo mes
  const txMonth = txDate.getMonth()
  const txYear = txDate.getFullYear()

  let closingMonth = txMonth
  let closingYear = txYear

  if (txDay > closingDay) {
    closingMonth += 1
    if (closingMonth > 11) {
      closingMonth = 0
      closingYear += 1
    }
  }

  // El vencimiento es el mes siguiente al cierre
  const paymentMonth = closingMonth + 1 > 11 ? 0 : closingMonth + 1
  const paymentYear = closingMonth + 1 > 11 ? closingYear + 1 : closingYear

  return new Date(paymentYear, paymentMonth, paymentDay)
}
