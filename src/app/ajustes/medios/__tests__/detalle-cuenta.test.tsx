import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DetalleDeCuenta } from '../[id]/detalle-cuenta';
import type { AccountBalance } from '@/lib/finance/pocket';
import type { ProcessedTransaction } from '@/lib/finance/types';
import type { PaymentMethod } from '@/types/database';

/**
 * Regresion del fix round 1 (Critical): un medio personal siempre tiene
 * `cuenta === null` (computeAvailableToSpend los filtra, lib/finance/pocket.ts),
 * y el saldo mostrado daba $0 en vez del fallback a status.projectedTotal.
 */

const metodo = (over: Partial<PaymentMethod> = {}): PaymentMethod => ({
  id: 'm1', user_id: 'u1', name: 'Juan', type: 'debit', bucket: 'pocket',
  created_at: '2026-01-01T00:00:00Z', default_closing_day: null, default_payment_day: null,
  initial_balance: 0, initial_balance_at: null, is_default: false, is_personal: false,
  ...over,
} as PaymentMethod);

const cuenta = (over: Partial<AccountBalance> = {}): AccountBalance => ({
  methodId: 'm1', name: 'Juan', bucket: 'pocket', balance: 0, anchored: true,
  ...over,
});

const render = (over: Partial<Parameters<typeof DetalleDeCuenta>[0]> = {}) =>
  renderToStaticMarkup(
    <DetalleDeCuenta
      method={metodo()}
      cuenta={null}
      status={{ fixedCosts: 0, projectedTotal: 0 }}
      transactions={[] as ProcessedTransaction[]}
      paymentMethods={[metodo()]}
      {...over}
    />,
  );

describe('DetalleDeCuenta — saldo', () => {
  it('cuenta de debito con cuenta anclada: "Saldo actual" = cuenta.balance, en verde si es positivo', () => {
    const html = render({ cuenta: cuenta({ balance: 50000 }) });
    expect(html).toContain('Saldo actual');
    expect(html).toContain('50.000');
    expect(html).toContain('text-good');
    expect(html).not.toContain('Le debés');
  });

  it('cuenta de debito con saldo negativo: sigue diciendo "Saldo actual", en rojo', () => {
    const html = render({ cuenta: cuenta({ balance: -1000 }) });
    expect(html).toContain('Saldo actual');
    expect(html).toContain('text-bad');
  });

  it('cuenta sin anclar avisa "Sin saldo declarado"', () => {
    const html = render({ cuenta: cuenta({ anchored: false }) });
    expect(html).toContain('Sin saldo declarado');
  });

  it('medio personal (cuenta SIEMPRE null): usa el fallback status.projectedTotal, no $0', () => {
    const html = render({
      method: metodo({ is_personal: true }),
      cuenta: null,
      status: { fixedCosts: 0, projectedTotal: -8000 },
    });
    expect(html).toContain('Le debés');
    expect(html).toContain('8.000');
    expect(html).not.toContain('$ 0,00');
    expect(html).toContain('text-bad');
  });

  it('medio personal a favor: "A favor", en verde, monto sin signo', () => {
    const html = render({
      method: metodo({ is_personal: true }),
      cuenta: null,
      status: { fixedCosts: 0, projectedTotal: 3000 },
    });
    expect(html).toContain('A favor');
    expect(html).toContain('3.000');
    expect(html).not.toContain('-$');
    expect(html).toContain('text-good');
  });

  it('medio personal muestra la linea de transferencia', () => {
    const html = render({
      method: metodo({ is_personal: true, default_payment_day: 10 }),
      cuenta: null,
      status: { fixedCosts: 0, projectedTotal: -1000 },
    });
    expect(html).toContain('Se transfiere el día 10');
  });
});
