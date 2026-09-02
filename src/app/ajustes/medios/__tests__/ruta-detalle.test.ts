/**
 * Guard estructural de la ruta de detalle. Mismo criterio que nav-config.test.ts:
 * un destino que no existe se descubre en produccion como un 404, no en la suite.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const raiz = resolve(__dirname, '../../../../..');

describe('ruta /ajustes/medios/[id]', () => {
  it('tiene su page.tsx', () => {
    expect(existsSync(resolve(raiz, 'src/app/ajustes/medios/[id]/page.tsx'))).toBe(true);
  });

  it('lee params como Promise, que es la API de Next 16', () => {
    const src = readFileSync(resolve(raiz, 'src/app/ajustes/medios/[id]/page.tsx'), 'utf8');
    expect(src).toMatch(/params:\s*Promise</);
  });

  it('el detalle no desestructura getters del store', () => {
    // El React Compiler congela un getter sacado suelto; ver store-freshness.test.ts.
    const src = readFileSync(resolve(raiz, 'src/app/ajustes/medios/[id]/detalle-client.tsx'), 'utf8');
    expect(src).not.toMatch(/const\s*\{[^}]*getCardCycleDetail[^}]*\}\s*=\s*useFinanceStore/);
  });

  it('EditarCicloDialog se monta con key por resumen', () => {
    // Su estado se inicializa una sola vez, en el useState. Navegar entre resumenes es
    // router.replace sobre el mismo segmento: React re-renderiza pero NO remonta, asi
    // que sin key el dialogo guarda las fechas del primer resumen visto sobre el id del
    // resumen actual. Mismo guard que en institutional-card.tsx.
    const src = readFileSync(resolve(raiz, 'src/app/ajustes/medios/[id]/detalle-client.tsx'), 'utf8');
    expect(src).toMatch(/<EditarCicloDialog\s+key=\{cicloActual\.id\}/);
  });
});

describe('EditarCicloDialog: todos sus montajes llevan key', () => {
  // El bug no es de un archivo: es de este componente. Cualquier montaje nuevo sin key
  // repite la falla, asi que el guard barre los dos que existen.
  const montajes = [
    'src/app/ajustes/medios/[id]/detalle-client.tsx',
    'src/components/medios-pago/institutional-card.tsx',
  ];

  it.each(montajes)('%s', (archivo) => {
    const src = readFileSync(resolve(raiz, archivo), 'utf8');
    // Cada apertura de la etiqueta (no el import ni el cierre) tiene que traer key=.
    const aperturas = src.match(/<EditarCicloDialog[\s\n][^>]*/g) ?? [];
    expect(aperturas.length).toBeGreaterThan(0);
    for (const a of aperturas) expect(a).toMatch(/\skey=\{/);
  });
});

describe('el modal de detalle se retiro', () => {
  it('el archivo ya no existe', () => {
    expect(existsSync(resolve(raiz, 'src/components/medios-pago/payment-method-detail-modal.tsx'))).toBe(false);
  });

  it('nadie lo importa', () => {
    const cards = ['institutional-card.tsx', 'personal-debt-card.tsx'];
    for (const f of cards) {
      const src = readFileSync(resolve(raiz, 'src/components/medios-pago', f), 'utf8');
      expect(src).not.toContain('PaymentMethodDetailModal');
    }
  });

  it('el guard de estados vacios no exceptua un archivo que ya no existe', () => {
    const src = readFileSync(resolve(raiz, 'src/components/shared/__tests__/empty-state-adoption.test.ts'), 'utf8');
    expect(src).not.toContain('payment-method-detail-modal');
  });

  it('el getter huerfano se retiro del store', () => {
    const src = readFileSync(resolve(raiz, 'src/lib/store/financeStore.ts'), 'utf8');
    expect(src).not.toContain('getPaymentMethodTransactionsForCurrentMonth');
  });
});
