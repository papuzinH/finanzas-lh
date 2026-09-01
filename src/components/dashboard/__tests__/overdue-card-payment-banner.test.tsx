/**
 * El banner va arriba del hero en el home, así que su caso más frecuente —nadie
 * con resúmenes vencidos— tiene que rendir vacío sin romper nada.
 *
 * El caso CON vencidos no se monta acá a propósito: el banner reusa
 * `CreditCardCycleChip`, que usa `useRouter`, y eso no sobrevive a
 * `renderToStaticMarkup` sin el contexto del App Router. La decisión de qué dice
 * el aviso vive en `avisoDeVencidos` (puro), que sí está cubierto en
 * `lib/utils/__tests__/compromisos-copy.test.ts`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { useFinanceStore } from '@/lib/store/financeStore';
import { OverdueCardPaymentBanner } from '../overdue-card-payment-banner';
import type { PaymentMethod } from '@/types/database';

const visa = {
  id: 'cred', user_id: 'u1', name: 'Visa', type: 'credit',
  default_closing_day: 19, default_payment_day: 1, created_at: '2026-01-01',
  is_personal: false, is_default: false, bucket: 'pocket',
  initial_balance: 0, initial_balance_at: null,
} as PaymentMethod;

const billetera = {
  ...visa, id: 'poc', name: 'Billetera', type: 'debit', is_default: true,
  default_closing_day: null, default_payment_day: null,
  initial_balance: 100000, initial_balance_at: '2026-07-01',
} as PaymentMethod;

beforeEach(() => {
  useFinanceStore.setState({
    transactions: [], installmentPlans: [], paymentMethods: [], recurringPlans: [],
    categories: [], categoryBudgets: [], savingsGoals: [], savingsGoalContributions: [],
    exchangeRates: [], dolarBlue: null, displayCurrency: 'ARS', inflationSeries: [],
    internalTransfers: [],
  } as never);
});

describe('OverdueCardPaymentBanner', () => {
  it('sin medios de pago no dibuja nada', () => {
    expect(renderToStaticMarkup(<OverdueCardPaymentBanner />)).toBe('');
  });

  it('con una tarjeta al día tampoco: el aviso no aparece porque sí', () => {
    useFinanceStore.setState({ paymentMethods: [visa, billetera] } as never);
    expect(renderToStaticMarkup(<OverdueCardPaymentBanner />)).toBe('');
  });
});
