import { parse, format, isSameMonth, getDate } from 'date-fns'

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
 * Convierte un objeto Date a string YYYY-MM-DD usando hora local (no UTC).
 * Usar en lugar de date.toISOString() para evitar desfase por timezone.
 */
export function dateToLocalString(date: Date): string {
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

  // La fecha de pago es después del cierre: cae en el MISMO mes del cierre si
  // el día de vencimiento es posterior al de cierre (ej. cierra el 10, vence el
  // 25), y recién el mes siguiente si es anterior (ej. cierra el 24, vence el 6).
  // Mismo criterio que `calculateCreditPaymentDate`.
  const paymentMonthOffset = paymentDay < closingDay ? 1 : 0
  // El constructor normaliza el overflow de mes (12 → enero del año siguiente).
  const paymentDate = new Date(periodEndYear, periodEndMonth + paymentMonthOffset, paymentDay)

  return { periodStart, periodEnd, paymentDate }
}

/**
 * Calcula la fecha de pago real de una transacción en tarjeta de crédito.
 *
 * Reglas:
 * - Si diaCompra > closingDay → salta al próximo ciclo (+1 mes base)
 * - Si paymentDay < closingDay → el pago cae el mes siguiente al cierre (+1 mes adicional)
 * - Se fija el día exacto de vencimiento
 *
 * Esto garantiza consistencia entre chatbot e input manual.
 */
export function calculateCreditPaymentDate(
  purchaseDateStr: string,
  closingDay: number,
  paymentDay: number
): string {
  const fecha = parseLocalDate(purchaseDateStr)
  const diaCompra = getDate(fecha)
  const fechaPago = new Date(fecha)

  if (diaCompra > closingDay) {
    fechaPago.setMonth(fechaPago.getMonth() + 1)
  }
  if (paymentDay < closingDay) {
    fechaPago.setMonth(fechaPago.getMonth() + 1)
  }
  fechaPago.setDate(paymentDay)
  return formatLocalDate(fechaPago)
}

/**
 * Primer y último día del mes al que pertenece `dateString` ('yyyy-MM-dd'),
 * como strings del mismo formato.
 *
 * Se deriva del STRING y no de un `Date` a propósito: `new Date('2026-09-01')`
 * es medianoche UTC, que en una zona negativa como la argentina cae el 31 de
 * agosto — así que `getMonth()` devuelve el mes anterior justo para las fechas
 * del día 1. El guard anti-duplicado de `payCreditCardCycle` tenía ese bug, y
 * pega en la tarjeta que vence el día 1: dejaba registrar un pago duplicado del
 * mes en curso y, si existía uno del mes anterior, cortaba con "listo" sin
 * guardar nada. Sin `Date` de por medio el resultado no depende de la TZ del
 * runtime (el server de Vercel corre en UTC y la máquina de desarrollo no).
 */
export function rangoDelMes(dateString: string): { start: string; end: string } {
  const [year, month] = dateString.split('-').map(Number);
  const ultimoDia = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(ultimoDia).padStart(2, '0')}` };
}
