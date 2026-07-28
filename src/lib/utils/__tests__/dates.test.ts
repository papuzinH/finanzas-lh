import { describe, it, expect } from 'vitest'
import {
  parseLocalDate,
  formatLocalDate,
  todayString,
  isInSameMonth,
  getCreditCardPeriod,
  calculateCreditPaymentDate,
} from '../dates'

describe('dates.ts', () => {
  describe('parseLocalDate', () => {
    it('parsea una fecha ISO como fecha local (no UTC)', () => {
      const date = parseLocalDate('2024-03-15')
      expect(date.getFullYear()).toBe(2024)
      expect(date.getMonth()).toBe(2) // Marzo = 2 (0-indexed)
      expect(date.getDate()).toBe(15)
    })

    it('no cambia el día al cruzar midnight UTC', () => {
      // Este era el bug: "2024-03-15" se parseaba como UTC midnight
      // y en timezone UTC-3 aparecía como 2024-03-14
      const date = parseLocalDate('2024-03-15')
      expect(date.getDate()).toBe(15) // Siempre debe ser 15
    })

    it('parsea correctamente el primer día del mes', () => {
      const date = parseLocalDate('2024-01-01')
      expect(date.getFullYear()).toBe(2024)
      expect(date.getMonth()).toBe(0)
      expect(date.getDate()).toBe(1)
    })

    it('parsea correctamente el último día del mes', () => {
      const date = parseLocalDate('2024-12-31')
      expect(date.getDate()).toBe(31)
      expect(date.getMonth()).toBe(11)
    })

    it('parsea correctamente fechas en años diferentes', () => {
      const date2020 = parseLocalDate('2020-02-29') // Año bisiesto
      expect(date2020.getFullYear()).toBe(2020)
      expect(date2020.getMonth()).toBe(1)
      expect(date2020.getDate()).toBe(29)
    })
  })

  describe('formatLocalDate', () => {
    it('formatea una fecha a YYYY-MM-DD', () => {
      const date = new Date(2024, 2, 15) // 15 Marzo 2024 (local)
      expect(formatLocalDate(date)).toBe('2024-03-15')
    })

    it('formatea con zero-padding correcto en mes', () => {
      const date = new Date(2024, 0, 15) // 15 Enero 2024
      expect(formatLocalDate(date)).toBe('2024-01-15')
    })

    it('formatea con zero-padding correcto en día', () => {
      const date = new Date(2024, 2, 5) // 5 Marzo 2024
      expect(formatLocalDate(date)).toBe('2024-03-05')
    })

    it('formatea el último día del año', () => {
      const date = new Date(2024, 11, 31)
      expect(formatLocalDate(date)).toBe('2024-12-31')
    })
  })

  describe('todayString', () => {
    it('retorna la fecha de hoy en formato YYYY-MM-DD', () => {
      const today = todayString()
      // Verificar que tiene el formato correcto
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      // Verificar que es parseable como fecha
      const parsed = parseLocalDate(today)
      expect(parsed).toBeInstanceOf(Date)
      expect(parsed.getFullYear()).toBeGreaterThan(2020)
    })
  })

  describe('isInSameMonth', () => {
    it('retorna true para fechas en el mismo mes', () => {
      const reference = new Date(2024, 2, 1) // Marzo 2024
      expect(isInSameMonth('2024-03-15', reference)).toBe(true)
      expect(isInSameMonth('2024-03-01', reference)).toBe(true)
      expect(isInSameMonth('2024-03-31', reference)).toBe(true)
    })

    it('retorna false para fechas en diferente mes del mismo año', () => {
      const reference = new Date(2024, 2, 1) // Marzo 2024
      expect(isInSameMonth('2024-02-28', reference)).toBe(false)
      expect(isInSameMonth('2024-04-01', reference)).toBe(false)
    })

    it('retorna false para fechas en diferente año', () => {
      const reference = new Date(2024, 2, 1) // Marzo 2024
      expect(isInSameMonth('2023-03-15', reference)).toBe(false)
      expect(isInSameMonth('2025-03-15', reference)).toBe(false)
    })

    it('compara mes-año correctamente para días adyacentes', () => {
      const referenceEarlyMonth = new Date(2024, 2, 1) // 1 Marzo
      const referenceLateMonth = new Date(2024, 2, 31) // 31 Marzo
      expect(isInSameMonth('2024-03-31', referenceEarlyMonth)).toBe(true)
      expect(isInSameMonth('2024-04-01', referenceLateMonth)).toBe(false)
    })
  })

  // Estos casos testeaban `getInstallmentPaymentDate`, una función que no
  // existe (ni existió) en `dates.ts`. La lógica que describen es la de
  // `calculateCreditPaymentDate`, que sí corre en producción: es la que fija
  // `transactions.date` de las compras en crédito. Se reapuntaron ahí.
  describe('calculateCreditPaymentDate', () => {
    // Cierre día 24, pago día 6
    const closingDay = 24
    const paymentDay = 6

    it('compra antes del cierre → paga el mes siguiente al cierre', () => {
      // Compra el 10 de Marzo → cierra el 24 de Marzo → paga el 6 de Abril
      expect(calculateCreditPaymentDate('2024-03-10', closingDay, paymentDay)).toBe('2024-04-06')
    })

    it('compra después del cierre → paga dos meses después', () => {
      // Compra el 27 de Marzo → cierra el 24 de Abril → paga el 6 de Mayo
      expect(calculateCreditPaymentDate('2024-03-27', closingDay, paymentDay)).toBe('2024-05-06')
    })

    it('compra en el día de cierre → paga el mes siguiente', () => {
      // Compra el 24 de Marzo → cierra el 24 de Marzo → paga el 6 de Abril
      expect(calculateCreditPaymentDate('2024-03-24', closingDay, paymentDay)).toBe('2024-04-06')
    })

    it('compra en Diciembre después del cierre → paga en Febrero del año siguiente', () => {
      // Compra el 27 de Diciembre → cierra el 24 de Enero → paga el 6 de Febrero
      expect(calculateCreditPaymentDate('2023-12-27', closingDay, paymentDay)).toBe('2024-02-06')
    })

    it('compra el 1 del mes → cierra dentro del mismo mes → paga el mes siguiente', () => {
      expect(calculateCreditPaymentDate('2024-01-01', closingDay, paymentDay)).toBe('2024-02-06')
    })

    it('si el vencimiento cae después del cierre, se paga en el MISMO mes', () => {
      // Cierre día 15, pago día 25: la compra del 10/03 entra en el resumen
      // que cierra el 15/03 y vence el 25/03 — no el mes siguiente.
      // (El test viejo esperaba Abril, contradiciendo al de getCreditCardPeriod.)
      expect(calculateCreditPaymentDate('2024-03-10', 15, 25)).toBe('2024-03-25')
    })

    it('maneja correctamente años bisiestos', () => {
      // Compra en Febrero de año bisiesto
      expect(calculateCreditPaymentDate('2024-02-15', 24, 6)).toBe('2024-03-06')
    })
  })

  describe('getCreditCardPeriod', () => {
    const closingDay = 24
    const paymentDay = 6

    it('calcula período correcto en medio del mes (antes del cierre)', () => {
      // Referencia: 15 de Marzo → aún no cerró el 24
      const reference = new Date(2024, 2, 15) // 15 Marzo
      const { periodEnd, paymentDate } = getCreditCardPeriod(
        closingDay,
        paymentDay,
        reference
      )

      // El período termina el 24 de Marzo
      expect(periodEnd.getDate()).toBe(24)
      expect(periodEnd.getMonth()).toBe(2) // Marzo

      // El pago es el 6 de Abril
      expect(paymentDate.getMonth()).toBe(3) // Abril
      expect(paymentDate.getDate()).toBe(6)
    })

    it('calcula período correcto después del cierre', () => {
      // Referencia: 27 de Marzo → ya cerró el 24
      const reference = new Date(2024, 2, 27) // 27 Marzo
      const { periodEnd, paymentDate } = getCreditCardPeriod(
        closingDay,
        paymentDay,
        reference
      )

      // El período termina el 24 de Abril
      expect(periodEnd.getDate()).toBe(24)
      expect(periodEnd.getMonth()).toBe(3) // Abril

      // El pago es el 6 de Mayo
      expect(paymentDate.getMonth()).toBe(4) // Mayo
      expect(paymentDate.getDate()).toBe(6)
    })

    it('calcula periodStart correctamente (día siguiente al cierre anterior)', () => {
      const reference = new Date(2024, 2, 15) // 15 Marzo
      const { periodStart } = getCreditCardPeriod(closingDay, paymentDay, reference)

      // El período debería empezar el 25 de Febrero (día siguiente al cierre del 24)
      expect(periodStart.getDate()).toBe(25)
      expect(periodStart.getMonth()).toBe(1) // Febrero
    })

    it('maneja transición de año correctamente', () => {
      const reference = new Date(2024, 11, 27) // 27 Diciembre
      const { periodEnd, paymentDate } = getCreditCardPeriod(
        closingDay,
        paymentDay,
        reference
      )

      // El período termina el 24 de Enero
      expect(periodEnd.getDate()).toBe(24)
      expect(periodEnd.getMonth()).toBe(0) // Enero
      expect(periodEnd.getFullYear()).toBe(2025)

      // El pago es el 6 de Febrero
      expect(paymentDate.getMonth()).toBe(1) // Febrero
      expect(paymentDate.getFullYear()).toBe(2025)
    })

    it('cuando paymentDay es mayor que closingDay, pago va al mes siguiente', () => {
      // Cierre día 24, pago día 6 (mes siguiente)
      const reference = new Date(2024, 2, 15)
      const { paymentDate } = getCreditCardPeriod(24, 6, reference)

      // Si payment_day (6) <= closing_day (24), el pago es el mes siguiente
      expect(paymentDate.getMonth()).toBe(3) // Abril (siguiente)
    })

    it('calcula correctamente cuando payment día es posterior al cierre', () => {
      // Cierre día 10, pago día 25 (mismo mes)
      const reference = new Date(2024, 2, 5) // 5 Marzo
      const { periodEnd, paymentDate } = getCreditCardPeriod(10, 25, reference)

      expect(periodEnd.getDate()).toBe(10)
      expect(paymentDate.getMonth()).toBe(2) // Marzo (mismo mes)
      expect(paymentDate.getDate()).toBe(25)
    })
  })
})
