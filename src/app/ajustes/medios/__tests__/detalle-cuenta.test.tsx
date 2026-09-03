/**
 * Markup de DetalleDeCuenta. Sin jsdom: se verifica el HTML que produce
 * renderToStaticMarkup, no el layout ni la interaccion.
 *
 * El caso que motiva el archivo es `mostrarSaldo={false}`: la rama que la pantalla de
 * detalle usa para una tarjeta de credito SIN resumenes materializados, que antes
 * quedaba en un callejon sin salida (solo el parrafo "todavia no tiene resumenes").
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DetalleDeCuenta } from '../[id]/detalle-cuenta';
import type { ProcessedTransaction } from '@/lib/finance/types';
import type { PaymentMethod } from '@/types/database';

const metodo = (over: Partial<PaymentMethod> = {}): PaymentMethod => ({
  id: 'mp', user_id: 'u1', name: 'Mercado Pago', type: 'debit',
  default_closing_day: null, default_payment_day: null, created_at: '2026-01-01',
  is_personal: false, is_default: false, bucket: 'pocket',
  initial_balance: 0, initial_balance_at: null,
  ...over,
} as PaymentMethod);

const tx = (over: Partial<ProcessedTransaction>): ProcessedTransaction => ({
  id: 't1', user_id: 'u1', payment_method_id: 'mp', cycle_id: null,
  amount: 4200, type: 'expense', description: 'Verdulería', date: '2026-09-02',
  purchase_date: '2026-09-02', category_id: 'cat1', created_at: '2026-09-02T10:00:00Z',
  periodDate: '2026-09-02', realPaymentDate: '2026-09-02',
  card_payment_for: null, installment_plan_id: null, recurring_plan_id: null,
  original_amount: null, original_currency: null, is_balance_adjustment: false,
  ...over,
} as ProcessedTransaction);

const render = (over: Partial<Parameters<typeof DetalleDeCuenta>[0]> = {}) =>
  renderToStaticMarkup(
    <DetalleDeCuenta
      method={metodo()}
      cuenta={null}
      status={{ fixedCosts: 30000, projectedTotal: -12000 }}
      transactions={[tx({})]}
      paymentMethods={[metodo()]}
      {...over}
    />,
  );

describe('DetalleDeCuenta', () => {
  // El "mes actual" de isExpenseInCurrentMonthScope sale del reloj: sin congelarlo el
  // test pasa o falla segun el dia en que se corra.
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-02T12:00:00')) });
  afterEach(() => { vi.useRealTimers() });

  it('una cuenta muestra saldo, costos fijos y los movimientos del mes', () => {
    const html = render();
    expect(html).toContain('Saldo actual');
    expect(html).toContain('Costos fijos');
    expect(html).toContain('Verdulería');
  });

  it('un medio personal habla de deuda, no de saldo', () => {
    const html = render({ method: metodo({ is_personal: true, name: 'Juan' }) });
    expect(html).toContain('Le debés');
    expect(html).not.toContain('Saldo actual');
  });

  it('mostrarSaldo=false esconde el saldo pero conserva costos fijos y movimientos', () => {
    // La tarjeta de credito sin resumenes: para ella ese numero no es un "saldo
    // actual", y la card de la lista dice "Al día" porque sin ciclo el desglose es 0.
    const html = render({
      method: metodo({ id: 'visa', name: 'Visa sin cierre', type: 'credit' }),
      transactions: [tx({ payment_method_id: 'visa' })],
      paymentMethods: [metodo({ id: 'visa', type: 'credit' })],
      mostrarSaldo: false,
    });
    expect(html).not.toContain('Saldo actual');
    expect(html).toContain('Costos fijos');
    expect(html).toContain('Verdulería');
    expect(html).toContain('grid-cols-1');
  });

  it('sin movimientos del mes cae al estado vacio del sistema', () => {
    const html = render({ transactions: [] });
    expect(html).toContain('Sin movimientos este mes');
  });
});
