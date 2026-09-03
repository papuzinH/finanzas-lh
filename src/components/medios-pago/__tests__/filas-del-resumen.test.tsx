import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Fila, FilasDelResumen, accionesDeFila } from '../filas-del-resumen';
import type { ProcessedTransaction } from '@/lib/finance/types';
import type { RecurringPlan } from '@/types/database';
import type { ResumenNavegable } from '@/lib/finance/detalle-resumen';

const tx = (over: Partial<ProcessedTransaction>): ProcessedTransaction => ({
  id: 't1', user_id: 'u1', payment_method_id: 'visa', cycle_id: 'ago',
  amount: 15000, type: 'expense', description: 'Supermercado', date: '2026-09-01',
  purchase_date: '2026-08-05', category_id: 'cat1', created_at: '2026-08-05T10:00:00Z',
  periodDate: '2026-08-20', realPaymentDate: '2026-09-01',
  card_payment_for: null, installment_plan_id: null, recurring_plan_id: null,
  original_amount: null, original_currency: null, is_balance_adjustment: false,
  ...over,
} as ProcessedTransaction);

const plan = (over: Partial<RecurringPlan> = {}): RecurringPlan => ({
  id: 'p1', user_id: 'u1', payment_method_id: 'visa', description: 'Netflix',
  amount: 15000, category_id: 'cat1', created_at: '2026-08-01T00:00:00Z',
  is_active: true, billing_day: 5, currency: 'ARS', exchange_rate: null,
  frequency: 'monthly', original_amount: null, rate_pair: null,
  ...over,
} as RecurringPlan);

describe('FilasDelResumen', () => {
  it('muestra la fecha de COMPRA, no la de vencimiento', () => {
    const html = renderToStaticMarkup(
      <FilasDelResumen filas={{ conFecha: [tx({ purchase_date: '2026-08-05', date: '2026-09-01' })], sinFecha: [], reintegros: [], porDebitar: [] }} />,
    );
    expect(html).toContain('5 ago');
    expect(html).not.toContain('1 sep');
  });

  it('marca las cuotas', () => {
    const html = renderToStaticMarkup(
      <FilasDelResumen filas={{ conFecha: [tx({ installment_plan_id: 'p1' })], sinFecha: [], reintegros: [], porDebitar: [] }} />,
    );
    expect(html).toContain('Cuota');
  });

  it('marca las mensualidades', () => {
    const html = renderToStaticMarkup(
      <FilasDelResumen filas={{ conFecha: [tx({ recurring_plan_id: 'r1' })], sinFecha: [], reintegros: [], porDebitar: [] }} />,
    );
    expect(html).toContain('Mensualidad');
  });

  it('un consumo en dolares se muestra en su moneda original', () => {
    const html = renderToStaticMarkup(
      <FilasDelResumen filas={{ conFecha: [tx({ original_currency: 'USD', original_amount: 100 })], sinFecha: [], reintegros: [], porDebitar: [] }} />,
    );
    expect(html).toContain('100');
  });

  it('un reintegro se distingue de un consumo', () => {
    const html = renderToStaticMarkup(
      <FilasDelResumen filas={{ conFecha: [], sinFecha: [], reintegros: [tx({ type: 'income', description: 'Reintegro', purchase_date: null })], porDebitar: [] }} />,
    );
    expect(html).toContain('+');
    expect(html).toContain('text-good');
  });

  // purchase_date es null en TODO income por diseño y t.date en credito es el
  // VENCIMIENTO: el reintegro no tiene fecha propia. Iba a "sinFecha", bajo un
  // encabezado que afirmaba que se cargo antes de que la app guardara la fecha.
  it('los reintegros van en su propio bloque, con copy que no miente', () => {
    const html = renderToStaticMarkup(
      <FilasDelResumen filas={{ conFecha: [], sinFecha: [], reintegros: [tx({ id: 'r', type: 'income', description: 'Reintegro', purchase_date: null })], porDebitar: [] }} />,
    );
    expect(html).toContain('Reintegros y devoluciones');
    expect(html).not.toContain('Sin fecha de compra');
    expect(html).not.toContain('antes de que');
    expect(html).not.toContain('Sin fecha<');
  });

  it('un reintegro no arrastra la fecha de vencimiento como si fuera de compra', () => {
    const html = renderToStaticMarkup(
      <FilasDelResumen filas={{ conFecha: [], sinFecha: [], reintegros: [tx({ type: 'income', purchase_date: null, date: '2026-09-01' })], porDebitar: [] }} />,
    );
    expect(html).not.toContain('1 sep');
  });

  it('las sin fecha de compra van en su propio bloque, con explicacion', () => {
    const html = renderToStaticMarkup(
      <FilasDelResumen filas={{ conFecha: [], sinFecha: [tx({ id: 'v', purchase_date: null })], reintegros: [], porDebitar: [] }} />,
    );
    expect(html).toContain('Sin fecha de compra');
    expect(html.toLowerCase()).toContain('antes de que');
  });

  it('sin ningun movimiento muestra el estado vacio del sistema', () => {
    const html = renderToStaticMarkup(<FilasDelResumen filas={{ conFecha: [], sinFecha: [], reintegros: [], porDebitar: [] }} />);
    expect(html).toContain('border-dashed');
  });

  // El invariante de la pantalla: el total de la cabecera tiene que ser explicable por
  // lo que se ve abajo. computePaymentMethodStatus suma al ciclo toda mensualidad activa
  // del medio sin transaccion propia ahi, asi que esas mensualidades tienen que verse.
  it('un resumen sin movimientos pero con un plan activo NO muestra el estado vacio', () => {
    const html = renderToStaticMarkup(
      <FilasDelResumen filas={{ conFecha: [], sinFecha: [], reintegros: [], porDebitar: [plan()] }} />,
    );
    expect(html).not.toContain('Sin movimientos en este resumen');
    expect(html).toContain('Netflix');
    expect(html).toContain('por debitar');
    expect(html).toContain('15.000');
  });

  it('una mensualidad por debitar se distingue de un movimiento real', () => {
    const html = renderToStaticMarkup(
      <FilasDelResumen filas={{ conFecha: [tx({ description: 'Supermercado' })], sinFecha: [], reintegros: [], porDebitar: [plan()] }} />,
    );
    // La compra va en surface-2 con texto normal; la que falta debitar, apagada.
    expect(html).toContain('bg-surface-2');
    expect(html).toContain('text-faint');
  });

  it('un plan en dolares muestra su importe original, como las filas en USD', () => {
    const html = renderToStaticMarkup(
      <FilasDelResumen filas={{ conFecha: [], sinFecha: [], reintegros: [], porDebitar: [plan({ currency: 'USD', original_amount: 12, amount: 15600 })] }} />,
    );
    expect(html).toContain('u$s 12');
    expect(html).not.toContain('15.600');
  });

  it('sin mensualidades pendientes no dibuja el bloque', () => {
    const html = renderToStaticMarkup(
      <FilasDelResumen filas={{ conFecha: [tx({})], sinFecha: [], reintegros: [], porDebitar: [] }} />,
    );
    expect(html).not.toContain('por debitar');
  });

  it('no dibuja el bloque de sin fecha cuando no hay ninguna', () => {
    const html = renderToStaticMarkup(
      <FilasDelResumen filas={{ conFecha: [tx({})], sinFecha: [], reintegros: [], porDebitar: [] }} />,
    );
    expect(html).not.toContain('Sin fecha de compra');
  });
});

describe('Fila (fechaDe)', () => {
  it('default "compra": usa purchase_date, igual que antes', () => {
    const html = renderToStaticMarkup(
      <Fila t={tx({ purchase_date: '2026-08-05', date: '2026-09-01' })} />,
    );
    expect(html).toContain('5 ago');
    expect(html).not.toContain('1 sep');
  });

  it('"compra" sin purchase_date muestra "Sin fecha" (un GASTO viejo, de antes de esa columna)', () => {
    const html = renderToStaticMarkup(
      <Fila t={tx({ purchase_date: null, date: '2026-09-01' })} />,
    );
    expect(html).toContain('Sin fecha');
    expect(html).not.toContain('1 sep');
  });

  it('"ninguna" no muestra fecha alguna: el reintegro no tiene una honesta que mostrar', () => {
    const html = renderToStaticMarkup(
      <Fila t={tx({ type: 'income', description: 'Reintegro', purchase_date: null, date: '2026-09-01' })} fechaDe="ninguna" />,
    );
    expect(html).toContain('Reintegro');
    expect(html).not.toContain('Sin fecha');
    expect(html).not.toContain('1 sep');
  });

  it('"ninguna" conserva las etiquetas de cuota y mensualidad', () => {
    const html = renderToStaticMarkup(
      <Fila t={tx({ installment_plan_id: 'p1', purchase_date: null })} fechaDe="ninguna" />,
    );
    expect(html).toContain('Cuota');
  });

  it('"movimiento": usa t.date, ignora purchase_date', () => {
    const html = renderToStaticMarkup(
      <Fila t={tx({ purchase_date: '2026-08-05', date: '2026-09-01' })} fechaDe="movimiento" />,
    );
    expect(html).toContain('1 sep');
    expect(html).not.toContain('5 ago');
  });

  it('"movimiento" en un ingreso (purchase_date null por diseño) muestra la fecha real, no "Sin fecha"', () => {
    const html = renderToStaticMarkup(
      <Fila t={tx({ type: 'income', description: 'Sueldo', purchase_date: null, date: '2026-09-01' })} fechaDe="movimiento" />,
    );
    expect(html).toContain('1 sep');
    expect(html).not.toContain('Sin fecha');
  });
});

const resumen = (over: Partial<ResumenNavegable> = {}): ResumenNavegable => ({
  id: 'c1', closingDate: '2026-08-10', dueDate: '2026-08-18', source: 'generated', estado: 'pendiente',
  ...over,
});

// El ActionSheet vive detrás de un Dialog que arranca cerrado: su HTML nunca aparece en
// un render de servidor (ver el comentario de mover-al-resumen-dialog.tsx), así que el
// botón que lo abre se testea via markup, pero las ACCIONES que ofrece se testean
// llamando a `accionesDeFila` directo -- mismo dato que Fila le pasa al ActionSheet.
describe('el menú de la fila', () => {
  it('una fila con vecinos ofrece el menú', () => {
    const html = renderToStaticMarkup(
      <Fila t={tx({})} anterior={resumen({ id: 'ant' })} siguiente={resumen({ id: 'sig' })} />,
    );
    expect(html).toContain('aria-label="Más opciones"');
  });

  it('una fila SIN vecinos no monta el menú: el markup es el mismo de antes de esta task', () => {
    const html = renderToStaticMarkup(<Fila t={tx({})} />);
    // Sin aria-label ni botón: no se monta el trigger del ActionSheet.
    expect(html).not.toContain('aria-label="Más opciones"');
    expect(html).not.toContain('<button');
    // El monto sigue siendo el UNICO hermano del bloque de descripción -- no se envolvió
    // en el div "flex shrink-0 items-center gap-1" que agrega el botón.
    expect(html).toContain('<p class="shrink-0 tnum text-sm font-bold text-text">');
    expect(html).not.toContain('flex shrink-0 items-center gap-1');
  });

  it('mover se ofrece en una cuota, editar y eliminar no', () => {
    const acciones = accionesDeFila(tx({ installment_plan_id: 'p1' }), () => {});
    const mover = acciones.find((a) => a.label === 'Mover a otro resumen')!;
    const editar = acciones.find((a) => a.label === 'Editar')!;
    const eliminar = acciones.find((a) => a.label === 'Eliminar')!;

    expect(mover.disabled).toBeFalsy();
    expect(editar.disabled).toBe(true);
    expect(editar.disabledHint).toBe('Esta transacción pertenece a un plan de cuotas.');
    expect(eliminar.disabled).toBe(true);
    expect(eliminar.disabledHint).toBe('Esta transacción pertenece a un plan de cuotas.');
  });

  it('una mensualidad posteada no ofrece mover', () => {
    const acciones = accionesDeFila(tx({ recurring_plan_id: 'r1' }), () => {});
    const mover = acciones.find((a) => a.label === 'Mover a otro resumen')!;
    expect(mover.disabled).toBe(true);
  });

  it('un reintegro no ofrece mover', () => {
    const acciones = accionesDeFila(tx({ type: 'income' }), () => {});
    const mover = acciones.find((a) => a.label === 'Mover a otro resumen')!;
    expect(mover.disabled).toBe(true);
  });

  it('una compra suelta SÍ ofrece mover', () => {
    const acciones = accionesDeFila(tx({}), () => {});
    const mover = acciones.find((a) => a.label === 'Mover a otro resumen')!;
    expect(mover.disabled).toBeFalsy();
  });
});
