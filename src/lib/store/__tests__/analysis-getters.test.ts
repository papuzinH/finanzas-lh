import { describe, it, expect, beforeEach } from 'vitest';
import { useFinanceStore } from '@/lib/store/financeStore';

// Helper: setear estado crudo del store en cada test
function seed(partial: Record<string, unknown>) {
  useFinanceStore.setState(partial as never);
}

beforeEach(() => {
  useFinanceStore.setState({
    transactions: [], installmentPlans: [], paymentMethods: [], recurringPlans: [],
    categories: [], exchangeRates: [], dolarBlue: null, displayCurrency: 'ARS',
    inflationSeries: [],
  } as never);
});

describe('displayCurrency slice', () => {
  it('default es ARS y toDisplay devuelve el mismo monto', () => {
    const s = useFinanceStore.getState();
    expect(s.displayCurrency).toBe('ARS');
    expect(s.toDisplay(1000)).toBe(1000);
  });

  it('setDisplayCurrency cambia el estado', () => {
    useFinanceStore.getState().setDisplayCurrency('USD');
    expect(useFinanceStore.getState().displayCurrency).toBe('USD');
  });

  it('getUsdRate usa MEP si existe, sino blue, sino 1', () => {
    seed({ dolarBlue: { compra: 900, venta: 1000, fechaActualizacion: '' } });
    expect(useFinanceStore.getState().getUsdRate()).toBe(1000);
    seed({ exchangeRates: [{ pair: 'USD_ARS_MEP', rate: 1200 }] });
    expect(useFinanceStore.getState().getUsdRate()).toBe(1200);
  });

  it('toDisplay convierte a USD cuando displayCurrency=USD', () => {
    seed({ dolarBlue: { compra: 900, venta: 1000, fechaActualizacion: '' }, displayCurrency: 'USD' });
    expect(useFinanceStore.getState().toDisplay(100000)).toBe(100);
  });
});
