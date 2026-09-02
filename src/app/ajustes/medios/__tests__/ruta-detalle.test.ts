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
});
