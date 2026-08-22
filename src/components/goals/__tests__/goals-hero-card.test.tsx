/**
 * El hero de /objetivos se ocultaba entero cuando no había metas activas, y ese
 * era justo el momento en que más falta hacía: quien recién llega entraba a la
 * pantalla y encontraba dos cajas punteadas, sin cifra, sin marca y sin entrada
 * — exactamente el problema que el rediseño del 22-ago había venido a arreglar
 * ("Objetivos es la única pantalla que arranca directo con una lista").
 *
 * El copy del caso vacío existía en `goalsHeadline` desde el primer día y nunca
 * se llegó a ver en pantalla, porque el componente devolvía `null` antes.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { useFinanceStore } from '@/lib/store/financeStore';
import { GoalsHeroCard } from '../goals-hero-card';

beforeEach(() => {
  useFinanceStore.setState({
    transactions: [], installmentPlans: [], paymentMethods: [], recurringPlans: [],
    categories: [], categoryBudgets: [], savingsGoals: [], savingsGoalContributions: [],
    exchangeRates: [], dolarBlue: null, displayCurrency: 'ARS', inflationSeries: [],
    internalTransfers: [],
  } as never);
});

const html = () => renderToStaticMarkup(<GoalsHeroCard />);

describe('GoalsHeroCard sin metas', () => {
  it('sigue en pantalla: la entrada de /objetivos no desaparece', () => {
    expect(html()).not.toBe('');
  });

  it('muestra la cifra en cero en vez de esconderse', () => {
    expect(html()).toContain('Guardado para tus metas');
    // es-AR separa el signo del número con un espacio duro (U+00A0), no uno normal.
    expect(html()).toMatch(/\$\s0</);
  });

  it('invita en lugar de informar un porcentaje que no existe', () => {
    const out = html();
    expect(out).toContain('Todavía no te pusiste ninguna meta');
    expect(out).not.toContain('te faltan');
  });

  it('no dibuja la barra de progreso sin un objetivo contra el cual medir', () => {
    expect(html()).not.toContain('role="progressbar"');
  });

  it('conserva la firma de la marca: es el momento de marca de la pantalla', () => {
    expect(html()).toContain('var(--shadow-bandera)');
  });
});

describe('GoalsHeroCard con metas', () => {
  beforeEach(() => {
    useFinanceStore.setState({
      savingsGoals: [
        {
          id: 'g1', name: 'Bariloche', type: 'one_time', target_amount: 900000,
          currency: 'ARS', target_date: null, is_active: true,
          created_at: '2026-03-01T00:00:00Z',
        },
      ],
      savingsGoalContributions: [
        { id: 'c1', goal_id: 'g1', amount: 350000, date: '2026-08-01' },
      ],
    } as never);
  });

  it('muestra lo guardado y cuánto falta', () => {
    const out = html();
    expect(out).toContain('Guardado para tus metas');
    expect(out).toContain('te faltan');
  });

  it('dibuja la barra cuando hay un objetivo contra el cual medir', () => {
    expect(html()).toContain('role="progressbar"');
  });
});
