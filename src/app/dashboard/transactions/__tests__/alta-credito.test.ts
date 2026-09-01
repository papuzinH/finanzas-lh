import { describe, it, expect } from 'vitest'
import { cicloDeCompra, type CreditCardCycle } from '@/lib/finance/cycles'

// El alta completa toca Supabase y auth; lo que se fija aca es la REGLA que la
// action aplica: la fecha guardada sale del vencimiento del ciclo de la compra,
// no de sumar meses a los defaults de la tarjeta.
describe('alta de una compra con tarjeta', () => {
  const ciclos: CreditCardCycle[] = [
    { id: 'ago', user_id: 'u1', payment_method_id: 'visa', closing_date: '2026-08-20', due_date: '2026-09-01', source: 'generated', created_at: '2026-01-01T00:00:00Z' },
    { id: 'sep', user_id: 'u1', payment_method_id: 'visa', closing_date: '2026-09-24', due_date: '2026-10-05', source: 'declared', created_at: '2026-01-01T00:00:00Z' },
  ]

  it('una compra despues del cierre vence en el resumen siguiente, con la fecha REAL de ese resumen', () => {
    const ciclo = cicloDeCompra('2026-08-21', ciclos)
    expect(ciclo?.id).toBe('sep')
    expect(ciclo?.due_date).toBe('2026-10-05') // y no el "dia 1" que dicen los defaults
  })
})
