/**
 * El subtítulo de cada sección repetía palabra por palabra el título del bloque
 * vacío de abajo —«Ponele un objetivo a tu ahorro» dos veces, a centímetros una
 * de otra—. Se resolvió con el mismo criterio que ya se había aplicado en Inicio
 * ("el título quedaba huérfano"): el subtítulo aparece solo cuando tiene algo que
 * contar.
 *
 * ⚠️ **Acá solo se puede probar el caso vacío, y no por elección.** Zustand pasa
 * `api.getInitialState()` como `getServerSnapshot` (`zustand/esm/react.mjs`), así
 * que bajo `renderToStaticMarkup` los campos que se desestructuran del store
 * (`savingsGoals`, `categoryBudgets`) son **siempre los del estado inicial**, por
 * más `setState` que se haga antes. Los getters se salvan porque su cuerpo llama
 * `get()`: sembrando metas, el hero muestra el total nuevo y las listas siguen
 * vacías. Es la misma clase de trampa que el React Compiler
 * (ver `store-freshness.test.ts`) por otra vía, y **no ocurre en el navegador**,
 * donde el store está suscripto.
 *
 * El escenario de esta prueba coincide con el estado inicial, así que es honesto;
 * la pantalla **con** datos no es testeable por esta vía y se verifica en el gate
 * visual (que es además el único caso que el usuario ya puede ver en su app).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { useFinanceStore } from '@/lib/store/financeStore';
import { ObjetivosClient } from '../objetivos-client';

const VACIO = {
  transactions: [], installmentPlans: [], paymentMethods: [], recurringPlans: [],
  categories: [], categoryBudgets: [], savingsGoals: [], savingsGoalContributions: [],
  exchangeRates: [], dolarBlue: null, displayCurrency: 'ARS', inflationSeries: [],
  internalTransfers: [], isInitialized: true,
};

const html = () => renderToStaticMarkup(<ObjetivosClient />);

describe('ObjetivosClient sin nada cargado', () => {
  beforeEach(() => useFinanceStore.setState(VACIO as never));

  it('no repite el mismo texto en el subtítulo y en el bloque vacío', () => {
    const out = html();
    // Una sola vez: la del <h3> del EmptyState.
    expect(out.match(/Ponele un objetivo a tu ahorro/g)).toHaveLength(1);
    expect(out.match(/Controlá en qué gastás/g)).toHaveLength(1);
  });

  it('sigue mostrando el hero: la pantalla no arranca con una lista vacía', () => {
    expect(html()).toContain('Guardado para tus metas');
  });
});

describe('dónde se crea', () => {
  beforeEach(() => useFinanceStore.setState(VACIO as never));

  it('el header ya no tiene botón: crear meta y crear presupuesto son acciones distintas', () => {
    // El «+» del header abría un sheet preguntando cuál de las dos querías.
    expect(html()).not.toContain('Crear meta o presupuesto');
    expect(html()).not.toContain('Qué querés crear');
  });

  it('cada sección tiene su propio «+», así que se puede crear también con la lista llena', () => {
    const out = html();
    expect(out).toContain('aria-label="Nueva meta de ahorro"');
    expect(out).toContain('aria-label="Nuevo presupuesto"');
  });

  it('los botones de sección respetan el mínimo táctil de 44px', () => {
    // `size="icon"` del Button base son 40px: por eso van con h-11 w-11 encima.
    const out = html();
    const seccion = out.slice(0, out.indexOf('border-dashed'));
    expect(seccion).toMatch(/h-11 w-11[^"]*"[^>]*aria-label="Nueva meta de ahorro"/);
  });

  it('el CTA del bloque vacío crece centrado, no hacia un costado', () => {
    expect(html()).toContain('left-1/2');
  });
});
