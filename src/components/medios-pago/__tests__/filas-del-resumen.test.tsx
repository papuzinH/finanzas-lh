import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FilasDelResumen } from '../filas-del-resumen';
import type { ProcessedTransaction } from '@/lib/finance/types';

const tx = (over: Partial<ProcessedTransaction>): ProcessedTransaction => ({
  id: 't1', user_id: 'u1', payment_method_id: 'visa', cycle_id: 'ago',
  amount: 15000, type: 'expense', description: 'Supermercado', date: '2026-09-01',
  purchase_date: '2026-08-05', category_id: 'cat1', created_at: '2026-08-05T10:00:00Z',
  periodDate: '2026-08-20', realPaymentDate: '2026-09-01',
  card_payment_for: null, installment_plan_id: null, recurring_plan_id: null,
  original_amount: null, original_currency: null, is_balance_adjustment: false,
  ...over,
} as ProcessedTransaction);

describe('FilasDelResumen', () => {
  it('muestra la fecha de COMPRA, no la de vencimiento', () => {
    const html = renderToStaticMarkup(
      <FilasDelResumen filas={{ conFecha: [tx({ purchase_date: '2026-08-05', date: '2026-09-01' })], sinFecha: [] }} />,
    );
    expect(html).toContain('5 ago');
    expect(html).not.toContain('1 sep');
  });

  it('marca las cuotas', () => {
    const html = renderToStaticMarkup(
      <FilasDelResumen filas={{ conFecha: [tx({ installment_plan_id: 'p1' })], sinFecha: [] }} />,
    );
    expect(html).toContain('Cuota');
  });

  it('marca las mensualidades', () => {
    const html = renderToStaticMarkup(
      <FilasDelResumen filas={{ conFecha: [tx({ recurring_plan_id: 'r1' })], sinFecha: [] }} />,
    );
    expect(html).toContain('Mensualidad');
  });

  it('un consumo en dolares se muestra en su moneda original', () => {
    const html = renderToStaticMarkup(
      <FilasDelResumen filas={{ conFecha: [tx({ original_currency: 'USD', original_amount: 100 })], sinFecha: [] }} />,
    );
    expect(html).toContain('100');
  });

  it('un reintegro se distingue de un consumo', () => {
    const html = renderToStaticMarkup(
      <FilasDelResumen filas={{ conFecha: [tx({ type: 'income', description: 'Reintegro' })], sinFecha: [] }} />,
    );
    expect(html).toContain('+');
  });

  it('las sin fecha de compra van en su propio bloque, con explicacion', () => {
    const html = renderToStaticMarkup(
      <FilasDelResumen filas={{ conFecha: [], sinFecha: [tx({ id: 'v', purchase_date: null })] }} />,
    );
    expect(html).toContain('Sin fecha de compra');
    expect(html.toLowerCase()).toContain('antes de que');
  });

  it('sin ningun movimiento muestra el estado vacio del sistema', () => {
    const html = renderToStaticMarkup(<FilasDelResumen filas={{ conFecha: [], sinFecha: [] }} />);
    expect(html).toContain('border-dashed');
  });

  it('no dibuja el bloque de sin fecha cuando no hay ninguna', () => {
    const html = renderToStaticMarkup(
      <FilasDelResumen filas={{ conFecha: [tx({})], sinFecha: [] }} />,
    );
    expect(html).not.toContain('Sin fecha de compra');
  });
});
