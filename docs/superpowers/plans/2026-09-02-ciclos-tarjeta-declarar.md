# Declarar el ciclo de tarjeta — Plan 2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el usuario pueda cargar en Chanchito las fechas reales de cierre y vencimiento que su resumen le imprime, y que la app las respete sin re-fechar nada de lo ya cargado.

**Architecture:** El Plan 1 dejó el motor entero: `credit_card_cycles` como entidad, `transactions.cycle_id` como única verdad de pertenencia, y la decisión pura en `lib/finance/cycles.ts`. Falta la puerta de entrada: hoy la palabra `declared` sólo aparece en tests y la app nunca escribe un ciclo declarado. Este plan agrega la segunda mitad del invariante del spec (declarar actualiza los ciclos futuros estimados, y sólo esos), la action que declara, y los tres lugares de UI donde se declara. La regla dura que atraviesa todo: **una regeneración nunca pisa un `declared`, y declarar nunca mueve una transacción de resumen.**

**Tech Stack:** Next.js App Router (Server Actions), Supabase (PostgreSQL + RLS), Zustand, TypeScript, Zod + React Hook Form, Vitest, Playwright para el gate visual.

**Spec:** `docs/superpowers/specs/2026-09-01-ciclos-tarjeta-design.md`

---

## Alcance: por qué este plan es una funcionalidad entera

Lauti fijó que producción recibe funcionalidades enteras, no partes. El spec define **tres**
pantallas. Este plan implementa **una sola, completa**: declarar el ciclo. Las otras dos van en
planes propios, y la razón no es de tamaño sino de independencia:

| Pantalla del spec | Dónde va | Por qué |
|---|---|---|
| 1. Declarar el próximo ciclo | **este plan** | Es lo que resuelve el problema que originó el spec: el cierre se mueve mes a mes y hoy no hay forma de decírselo a la app. Se usa sola. |
| 2. Detalle de la tarjeta agrupado por resumen | Plan 3 | Es visualización de lo que este plan permite cargar. Sin ciclos declarados no tiene nada distinto que mostrar. |
| 3. Mover una compra al resumen vecino | Plan 4 | Es corrección manual de casos de borde. Declarar hacia adelante asigna bien desde el inicio; mover corrige lo ya asignado. |

**Lo que sale a producción al terminar este plan** es la versión 1.0.0 completa: el motor del
Plan 1 (ya en `master`, con su migración verificada contra datos reales el 2026-09-02) más la
capacidad de declarar. Un usuario recibe el resumen, lee las dos fechas que la Ley 25.065 art. 23
obliga a imprimir, las carga, y desde ahí sus compras entran al resumen correcto.

**Lo que este plan NO promete**: que las transacciones ya asignadas se reacomoden al declarar.
Eso es el invariante central del spec, es deliberado, y su contrapartida (mover una compra a mano)
es el Plan 4.

---

## Global Constraints

Valores copiados del spec y del CLAUDE.md del repo. Aplican a **todas** las tasks.

- **El invariante central, las dos mitades.** Declarar un cierre **no reasigna ninguna
  transacción**. Sólo actualiza las fechas de los ciclos **futuros** con `source = 'generated'`.
- **Una regeneración nunca pisa un `declared`.** `source` no es decorativo: distingue una fecha
  que la app estimó de una que el usuario leyó del resumen.
- **Ningún ciclo pasado se toca**, sea `generated` o `declared`. "Futuro" se mide contra el
  `closing_date`, comparado como string `yyyy-MM-dd`.
- **Fechas como string `yyyy-MM-dd`, nunca como `Date`.** Prohibido `dateToLocalString(new Date(string))`:
  corre un día atrás en cualquier runtime con zona horaria negativa. Se barrió el repo el
  2026-09-02 y no queda ninguno; no reintroducirlo. Para parsear, `parseLocalDate` de
  `@/lib/utils/dates`.
- **Toda lógica de decisión vive en `lib/finance/`**, como función pura, consumida por el store
  (cliente) y por las tools del chat (servidor). Nada de cálculo en componentes ni en actions.
- **La escritura de ciclos vive en `lib/ciclos/`**, nunca en `lib/finance/`.
- **Fixtures de ciclos desparejos por defecto.** Un fixture con ciclos mensuales perfectos no
  prueba nada: los dos últimos bugs grandes del repo se escondieron en fixtures prolijos
  (`totalARS === total` en E8, `periodDate === date` en el histórico). Cierres 23-jul / 20-ago /
  24-sep con vencimientos 31-jul / 28-ago / 2-oct son el fixture de referencia.
- **Tokens semánticos siempre**, nunca hex ni colores de Tailwind. Bordes `border-[1.5px] border-border`.
  Touch targets ≥44px. Canvas base 390px, margen lateral `px-5`.
- **Los getters del store se consumen tomando el objeto entero**: `const store = useFinanceStore()`
  y después `store.getX()`. Nunca desestructurar un getter: el React Compiler congela el resultado.
- **Verificación por task**: `npm test` + `npm run lint` (0 errores, 9 warnings es el baseline) +
  `npx tsc --noEmit` limpio.
- **Un commit por task**, mensaje en español rioplatense, sin acentos en el subject.

---

## Estado del que parte este plan

`master`, commit `6ab4a5a`. 927 tests, lint 0 errores, tsc limpio.

Lo que ya existe y este plan **consume**:

- `credit_card_cycles` con `id`, `user_id`, `payment_method_id`, `closing_date`, `due_date`,
  `source` (`'generated' | 'declared'`, con check), `created_at`, unique `(payment_method_id, closing_date)`
  y check `due_date >= closing_date`. RLS por `user_id = auth.uid()`.
- `transactions.cycle_id` (FK, `on delete set null`) y `transactions.purchase_date`.
- `src/lib/finance/cycles.ts` — decisión pura.
- `src/lib/ciclos/asegurar.ts` — `asegurarCiclos`, get-or-create perezoso.
- Los ciclos ya entran al `Promise.all` del store (`financeStore.ts:551`) y quedan en
  `state.creditCardCycles`.
- La migración de datos, verificada el 2026-09-02 contra el dump de producción restaurado en DEV:
  431 de 431 movimientos de crédito imputados, 0 huérfanos, 0 solapes, totales idénticos.

---

## File Structure

| Archivo | Responsabilidad | Task |
|---|---|---|
| `src/lib/ciclos/resolver.ts` | **Crear.** `resolverCicloDeCompra`: la orquestación `asegurarCiclos` + `cicloDeCompra` + fallback, hoy copiada en seis sitios. | 1 |
| `src/lib/finance/cycles.ts` | **Modificar.** Suma `cicloDelMesDe` y `recalcularFuturosGenerated`. Sigue siendo puro. | 2 |
| `src/lib/ciclos/declarar.ts` | **Crear.** La escritura de una declaración: decide update contra insert y recalcula los futuros estimados. | 3 |
| `src/app/medios-pago/actions.ts` | **Modificar.** `declararCiclo` nueva. `updatePaymentMethod` recalcula los futuros estimados. | 3, 4 |
| `src/components/medios-pago/ciclo-fechas-field.tsx` | **Crear.** El par de inputs cierre/vencimiento con su etiqueta de procedencia. Lo comparten la ficha y los diálogos de pago. | 5 |
| `src/components/medios-pago/institutional-card.tsx` | **Modificar.** Muestra las fechas del resumen vigente con su procedencia y abre la edición. | 5 |
| `src/components/medios-pago/declarar-proximo-ciclo.tsx` | **Crear.** El paso opcional «Lo tengo a mano, lo cargo» que se monta dentro de los dos diálogos de pago. | 6 |
| `src/components/compromisos/credit-card-cycle-card.tsx` | **Modificar.** El AlertDialog de pago suma el paso opcional. | 6 |
| `src/components/medios-pago/register-card-payment-dialog.tsx` | **Modificar.** Ídem, en `/ajustes/medios`. | 6 |
| `src/components/compromisos/recordatorio-declarar-ciclo.tsx` | **Crear.** El aviso que aparece el día que el resumen cierra. | 7 |
| `src/lib/finance/recurring.ts` | **Modificar.** La cobertura de mensualidades pasa de mes de `date` a `cycle_id`. | 8 |
| `src/app/compromisos/compromisos-client.tsx` | **Modificar.** Monta el recordatorio; la etiqueta «vence D/M» sale del ciclo. | 7, 9 |
| `scripts/seed-escenarios-tarjeta.mjs` | **Modificar.** Suma la tarjeta de ciclos irregulares reales. | 10 |

---

## Task 1: `resolverCicloDeCompra`, el helper único

Hoy la orquestación `asegurarCiclos` + `cicloDeCompra` + fallback está copiada en **seis** sitios
y ya divergió una vez: el arreglo de zona horaria entró en unos y no en otros. Antes de sumar un
séptimo consumidor conviene unificarla. Esta task **no cambia comportamiento**: es refactor con la
suite existente como red.

**Por qué los tests actuales no se rompen:** las seis suites mockean `@/lib/ciclos/asegurar` y
asertan la ventana con `asegurarCiclosMock.mock.calls[0]`. El helper nuevo vive en
`lib/ciclos/resolver.ts` e importa `asegurarCiclos` de ese mismo módulo, así que el mock sigue
interceptando y las aserciones de ventana siguen valiendo. **No mockear `resolver.ts` en esas suites.**

**Files:**
- Create: `src/lib/ciclos/resolver.ts`
- Create: `src/lib/ciclos/__tests__/resolver.test.ts`
- Modify: `src/app/dashboard/transactions/actions.ts:67-87` (en `createTransaction`) y `:196-210` (en `updateTransaction`)
- Modify: `src/app/dashboard/installments/actions.ts:63-80` (en `createInstallmentPlan`)
- Modify: `src/lib/ai/handlers.ts:201-215` (en `handleTransaction`) y `:309-327` (en `handleInstallment`)

**Interfaces:**
- Consumes: `asegurarCiclos(supabase, method, desde, hasta)` de `@/lib/ciclos/asegurar`; `cicloDeCompra(purchaseDate, ciclos)` de `@/lib/finance/cycles`; `calculateCreditPaymentDate(date, closingDay, paymentDay)` de `@/lib/utils/dates`.
- Produces: `resolverCicloDeCompra(supabase, method, purchaseDate, mesesAdelante)` que devuelve `Promise<ResolucionDeCiclo>`, con `ResolucionDeCiclo = { ciclos: CreditCardCycle[]; ciclo: CreditCardCycle | undefined; dueDate: string }`. Lo consumen las cuatro vías de alta; las tasks 3 a 10 no lo tocan.

**Fuera de alcance de esta task:** `assignDefaultToUnassignedTransactions`
(`transactions/actions.ts:295-333`) resuelve un **lote** con un solo `asegurarCiclos` y una ventana
derivada del rango de fechas. No entra en esta firma y se deja como está.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/ciclos/__tests__/resolver.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { PaymentMethod } from '@/types/database';
import type { CreditCardCycle } from '@/lib/finance/cycles';

vi.mock('@/lib/ciclos/asegurar', () => ({ asegurarCiclos: vi.fn() }));
import { asegurarCiclos } from '@/lib/ciclos/asegurar';
import { resolverCicloDeCompra } from '../resolver';

const asegurarMock = asegurarCiclos as unknown as Mock;

// Ciclos DESPAREJOS a proposito: cierres 23-jul / 20-ago / 24-sep.
// Un fixture mensual perfecto no probaria nada (ver Global Constraints).
const CICLOS: CreditCardCycle[] = [
  { id: 'c-jul', user_id: 'u1', payment_method_id: 'pm1', closing_date: '2026-07-23', due_date: '2026-07-31', source: 'declared', created_at: '2026-01-01T00:00:00Z' },
  { id: 'c-ago', user_id: 'u1', payment_method_id: 'pm1', closing_date: '2026-08-20', due_date: '2026-08-28', source: 'declared', created_at: '2026-01-01T00:00:00Z' },
  { id: 'c-sep', user_id: 'u1', payment_method_id: 'pm1', closing_date: '2026-09-24', due_date: '2026-10-02', source: 'declared', created_at: '2026-01-01T00:00:00Z' },
];

const TARJETA = {
  id: 'pm1', user_id: 'u1', name: 'Visa', type: 'credit',
  default_closing_day: 20, default_payment_day: 28,
} as unknown as PaymentMethod;

const supa = {} as never;

beforeEach(() => { asegurarMock.mockReset(); });

describe('resolverCicloDeCompra', () => {
  it('devuelve el resumen que contiene la compra y su vencimiento', async () => {
    asegurarMock.mockResolvedValue(CICLOS);
    const r = await resolverCicloDeCompra(supa, TARJETA, '2026-09-10', 2);
    expect(r.ciclo?.id).toBe('c-sep');
    expect(r.dueDate).toBe('2026-10-02');
    expect(r.ciclos).toHaveLength(3);
  });

  it('pide la ventana que va de un mes antes de la compra a mesesAdelante despues', async () => {
    asegurarMock.mockResolvedValue(CICLOS);
    await resolverCicloDeCompra(supa, TARJETA, '2026-09-10', 4);
    const [, , desde, hasta] = asegurarMock.mock.calls[0];
    expect((desde as Date).getMonth()).toBe(7);  // agosto
    expect((hasta as Date).getMonth()).toBe(0);  // enero
    expect((hasta as Date).getFullYear()).toBe(2027);
  });

  it('cae al calculo por defaults cuando ningun resumen contiene la compra', async () => {
    asegurarMock.mockResolvedValue([]);
    const r = await resolverCicloDeCompra(supa, TARJETA, '2026-09-10', 2);
    expect(r.ciclo).toBeUndefined();
    // cierre 20 / vence 28: la compra del 10 entra al ciclo que cierra el 20 de septiembre
    expect(r.dueDate).toBe('2026-09-28');
  });

  it('no toca la red ni inventa fechas si la tarjeta no tiene dias configurados', async () => {
    const sinDias = { ...TARJETA, default_closing_day: null, default_payment_day: null } as PaymentMethod;
    const r = await resolverCicloDeCompra(supa, sinDias, '2026-09-10', 2);
    expect(asegurarMock).not.toHaveBeenCalled();
    expect(r.ciclo).toBeUndefined();
    expect(r.dueDate).toBe('2026-09-10');
    expect(r.ciclos).toEqual([]);
  });

  it('respeta la regla del borde: la compra del dia del cierre entra al ciclo que cierra', async () => {
    asegurarMock.mockResolvedValue(CICLOS);
    const r = await resolverCicloDeCompra(supa, TARJETA, '2026-08-20', 2);
    expect(r.ciclo?.id).toBe('c-ago');
    expect(r.dueDate).toBe('2026-08-28');
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/lib/ciclos/__tests__/resolver.test.ts`

Expected: FAIL con `Failed to resolve import "../resolver"`.

- [ ] **Step 3: Escribir el helper**

Crear `src/lib/ciclos/resolver.ts`:

```ts
import { addMonths, subMonths } from 'date-fns';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, PaymentMethod } from '@/types/database';
import { calculateCreditPaymentDate, parseLocalDate } from '@/lib/utils/dates';
import { cicloDeCompra, type CreditCardCycle } from '@/lib/finance/cycles';
import { asegurarCiclos } from './asegurar';

export type ResolucionDeCiclo = {
  /** Los resumenes de la tarjeta, ya asegurados y ordenados por closing_date. */
  ciclos: CreditCardCycle[];
  /** El resumen que contiene la compra. undefined = no hay ninguno que la contenga. */
  ciclo: CreditCardCycle | undefined;
  /** Cuando se cobra: el vencimiento del resumen, o el calculo por defaults si no hay resumen. */
  dueDate: string;
};

/**
 * La orquestacion "a que resumen entra esta compra y cuando se cobra", en un solo lugar.
 *
 * Estaba copiada en seis sitios (dos altas de transaccion, dos de cuotas, dos del chat) y ya
 * divergio una vez: el fix de zona horaria entro en unos y no en otros. Cualquier alta nueva
 * pasa por aca.
 *
 * `purchaseDate` es un string `yyyy-MM-dd` y se usa tal cual: nunca `new Date(string)`, que
 * corre un dia atras en runtimes con zona horaria negativa.
 *
 * Lanza si Supabase falla (lo hereda de asegurarCiclos): el llamador ya tiene su try/catch.
 */
export async function resolverCicloDeCompra(
  supabase: SupabaseClient<Database>,
  method: PaymentMethod,
  purchaseDate: string,
  mesesAdelante: number,
): Promise<ResolucionDeCiclo> {
  const sinCicloConfigurado =
    method.type !== 'credit' || !method.default_closing_day || !method.default_payment_day;

  if (sinCicloConfigurado) {
    return { ciclos: [], ciclo: undefined, dueDate: purchaseDate };
  }

  const compra = parseLocalDate(purchaseDate);
  const ciclos = await asegurarCiclos(
    supabase,
    method,
    subMonths(compra, 1),
    addMonths(compra, mesesAdelante),
  );
  const ciclo = cicloDeCompra(purchaseDate, ciclos);

  return {
    ciclos,
    ciclo,
    dueDate: ciclo
      ? ciclo.due_date
      : calculateCreditPaymentDate(purchaseDate, method.default_closing_day, method.default_payment_day),
  };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/lib/ciclos/__tests__/resolver.test.ts`

Expected: PASS, 5 tests.

- [ ] **Step 5: Reemplazar las cinco copias**

En `src/app/dashboard/transactions/actions.ts`, el bloque de `createTransaction` (hoy L67-87) pasa a:

```ts
if (method.type === 'credit') {
  const { ciclo, dueDate } = await resolverCicloDeCompra(supabase, method, purchaseDate, 2);
  cycleId = ciclo?.id ?? null;
  storedDate = dueDate;
}
```

El de `updateTransaction` (hoy L196-210) es textualmente idéntico al anterior: pasa al mismo
bloque, conservando el guard `if (methodChanged && resolvedMethodId)` que lo envuelve (L184).

Imports: sale `asegurarCiclos` y `cicloDeCompra`, entra
`import { resolverCicloDeCompra } from '@/lib/ciclos/resolver';`. **`calculateCreditPaymentDate`
sigue importado**: lo usa `assignDefaultToUnassignedTransactions`, que no cambia en esta task.

En `src/app/dashboard/installments/actions.ts` (hoy L63-80), donde la ventana depende de la
cantidad de cuotas:

```ts
if (pm.type === 'credit') {
  const r = await resolverCicloDeCompra(supabase, pm, purchaseDateStr, installments_count + 1);
  ciclosDelPlan = r.ciclos;
  cicloInicial = r.ciclo;
  firstInstallmentDateStr = r.dueDate;
}
```

En `src/lib/ai/handlers.ts`, los dos sitios reciben el medio como `ResolvedPaymentMethod`, así que
pasan `paymentMethod.raw`. En `handleTransaction` (L201-215):

```ts
const { ciclo, dueDate } = await resolverCicloDeCompra(supabase, paymentMethod.raw, data.date, 2);
const cycleId = ciclo?.id ?? null;
const realPaymentDate = dueDate;
```

En `handleInstallment` (L309-327), con la ventana del plan:

```ts
const r = await resolverCicloDeCompra(supabase, paymentMethod.raw, data.date, data.installmentsCount + 1);
const ciclosDelPlan = r.ciclos;
const cicloInicial = r.ciclo;
const realPaymentDateBase = r.dueDate;
```

En los dos casos el guard sigue siendo el mismo `if (paymentMethod?.type === 'credit' && ...)` que
ya está; con el helper adentro alcanza con chequear que exista `paymentMethod`.
`calculateRealPaymentDate` (`handlers.ts:102-111`) queda **sin consumidores** y se borra: su
trabajo ahora es el campo `dueDate`.

- [ ] **Step 6: Correr la suite entera**

Run: `npm test`

Expected: PASS, 927 tests. Las seis suites que mockean `@/lib/ciclos/asegurar` siguen verdes sin
tocarse, incluidas las aserciones de ventana. **Si alguna falla, no relajar la aserción**: quiere
decir que el helper movió una ventana, y eso es un cambio de comportamiento que esta task no debe
tener.

- [ ] **Step 7: Verificar y commitear**

```bash
npm run lint && npx tsc --noEmit
git add src/lib/ciclos/resolver.ts src/lib/ciclos/__tests__/resolver.test.ts src/app/dashboard/transactions/actions.ts src/app/dashboard/installments/actions.ts src/lib/ai/handlers.ts
git commit -m "refactor(ciclos): una sola orquestacion para resolver el resumen de una compra"
```

---

## Task 2: Las dos funciones puras que hacen falta para declarar

Declarar un cierre necesita responder dos preguntas, las dos sin tocar la base:

1. **¿Este cierre corrige un resumen que ya existe, o es uno nuevo?** La unique de la tabla es
   `(payment_method_id, closing_date)`, así que declarar «cerró el 24» cuando ya hay un estimado
   del 20 **insertaría un segundo resumen de septiembre** y la tarjeta quedaría con dos. La
   respuesta va por mes calendario, no por fecha exacta.
2. **¿Qué resúmenes futuros hay que recalcular?** Sólo los `generated` posteriores a hoy. Un
   `declared` no se toca nunca, y el pasado tampoco.

**Files:**
- Modify: `src/lib/finance/cycles.ts` (agregar al final; hoy 158 líneas)
- Modify: `src/lib/finance/__tests__/cycles.test.ts`
- Modify: `src/lib/finance/__tests__/escenarios-disponible.test.ts` (agregar E18 al final; hoy 518 líneas, llega hasta E16)

**Interfaces:**
- Consumes: `generarCiclos(method, desde, hasta, existentes)` (`cycles.ts:120`) y `parseLocalDate` de `@/lib/utils/dates`.
- Produces:
  - `cicloDelMesDe(ciclos: CreditCardCycle[], closingDate: string): CreditCardCycle | undefined`
  - `recalcularFuturosGenerated(method: PaymentMethod, ciclos: CreditCardCycle[], hoy: string): CambioDeCiclo[]`
  - `type CambioDeCiclo = { id: string; closing_date: string; due_date: string }`
  - Los consume la Task 3 y la Task 4.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `src/lib/finance/__tests__/cycles.test.ts`:

```ts
describe('cicloDelMesDe', () => {
  const ciclos: CreditCardCycle[] = [
    { id: 'a', user_id: 'u', payment_method_id: 'pm', closing_date: '2026-08-20', due_date: '2026-08-28', source: 'generated', created_at: 'x' },
    { id: 'b', user_id: 'u', payment_method_id: 'pm', closing_date: '2026-09-20', due_date: '2026-09-28', source: 'generated', created_at: 'x' },
  ];

  it('encuentra el resumen del mismo mes calendario aunque el dia no coincida', () => {
    expect(cicloDelMesDe(ciclos, '2026-09-24')?.id).toBe('b');
  });

  it('devuelve undefined si ese mes todavia no tiene resumen', () => {
    expect(cicloDelMesDe(ciclos, '2026-10-24')).toBeUndefined();
  });
});

describe('recalcularFuturosGenerated', () => {
  const metodo = {
    id: 'pm', type: 'credit', default_closing_day: 24, default_payment_day: 2,
  } as unknown as PaymentMethod;

  const ciclos: CreditCardCycle[] = [
    // pasado, estimado: NO se toca
    { id: 'viejo', user_id: 'u', payment_method_id: 'pm', closing_date: '2026-07-20', due_date: '2026-07-28', source: 'generated', created_at: 'x' },
    // futuro, declarado por el usuario: NO se toca
    { id: 'dicho', user_id: 'u', payment_method_id: 'pm', closing_date: '2026-10-22', due_date: '2026-10-30', source: 'declared', created_at: 'x' },
    // futuro, estimado: SI se recalcula
    { id: 'futuro', user_id: 'u', payment_method_id: 'pm', closing_date: '2026-11-20', due_date: '2026-11-28', source: 'generated', created_at: 'x' },
  ];

  it('recalcula solo los estimados futuros', () => {
    const cambios = recalcularFuturosGenerated(metodo, ciclos, '2026-09-02');
    expect(cambios).toHaveLength(1);
    expect(cambios[0]).toEqual({ id: 'futuro', closing_date: '2026-11-24', due_date: '2026-12-02' });
  });

  it('no devuelve cambios cuando las fechas ya coinciden con los defaults', () => {
    const yaAlineado: CreditCardCycle[] = [
      { id: 'ok', user_id: 'u', payment_method_id: 'pm', closing_date: '2026-11-24', due_date: '2026-12-02', source: 'generated', created_at: 'x' },
    ];
    expect(recalcularFuturosGenerated(metodo, yaAlineado, '2026-09-02')).toEqual([]);
  });

  it('devuelve vacio si la tarjeta no tiene dias configurados', () => {
    const sinDias = { ...metodo, default_closing_day: null, default_payment_day: null } as PaymentMethod;
    expect(recalcularFuturosGenerated(sinDias, ciclos, '2026-09-02')).toEqual([]);
  });
});
```

Agregar al final de `src/lib/finance/__tests__/escenarios-disponible.test.ts`:

```ts
describe('E18 — cambiar la config de la tarjeta actualiza los resumenes futuros estimados, y solo esos', () => {
  // El caso medido en DEV el 2026-09-02: el usuario creo la tarjeta con vencimiento el dia 6,
  // el sync materializo cuatro resumenes, despues la edito al dia 2 -- y sus cuotas siguieron
  // venciendo el 6 durante cuatro meses. La tarjeta decia una cosa y sus resumenes otra.
  const metodo = {
    id: 'pm', type: 'credit', default_closing_day: 24, default_payment_day: 2,
  } as unknown as PaymentMethod;

  const ciclos: CreditCardCycle[] = [
    { id: 'ago', user_id: 'u', payment_method_id: 'pm', closing_date: '2026-08-24', due_date: '2026-09-06', source: 'generated', created_at: 'x' },
    { id: 'sep', user_id: 'u', payment_method_id: 'pm', closing_date: '2026-09-24', due_date: '2026-10-06', source: 'generated', created_at: 'x' },
    { id: 'oct', user_id: 'u', payment_method_id: 'pm', closing_date: '2026-10-24', due_date: '2026-11-06', source: 'generated', created_at: 'x' },
  ];

  it('los resumenes que todavia no cerraron toman el vencimiento nuevo', () => {
    const cambios = recalcularFuturosGenerated(metodo, ciclos, '2026-09-02');
    expect(cambios.map((c) => c.id)).toEqual(['sep', 'oct']);
    expect(cambios.map((c) => c.due_date)).toEqual(['2026-10-02', '2026-11-02']);
  });

  it('el resumen que ya cerro NO se toca: sus compras ya estan imputadas', () => {
    const cambios = recalcularFuturosGenerated(metodo, ciclos, '2026-09-02');
    expect(cambios.find((c) => c.id === 'ago')).toBeUndefined();
  });

  it('un resumen declarado por el usuario sobrevive al cambio de config', () => {
    const conDeclarado = ciclos.map((c) =>
      c.id === 'oct' ? { ...c, closing_date: '2026-10-22', due_date: '2026-10-30', source: 'declared' as const } : c,
    );
    const cambios = recalcularFuturosGenerated(metodo, conDeclarado, '2026-09-02');
    expect(cambios.map((c) => c.id)).toEqual(['sep']);
  });
});
```

En `escenarios-disponible.test.ts` hay que importar `recalcularFuturosGenerated` y el tipo
`CreditCardCycle` desde `@/lib/finance/cycles`, y `PaymentMethod` desde `@/types/database`, si no
están ya importados.

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/lib/finance/__tests__/cycles.test.ts src/lib/finance/__tests__/escenarios-disponible.test.ts`

Expected: FAIL con `cicloDelMesDe is not a function` y `recalcularFuturosGenerated is not a function`.

- [ ] **Step 3: Implementar las dos funciones**

Agregar al final de `src/lib/finance/cycles.ts`:

```ts
export type CambioDeCiclo = { id: string; closing_date: string; due_date: string };

/**
 * El resumen cuyo cierre cae en el MISMO MES CALENDARIO que `closingDate`.
 *
 * Declarar es corregir la fecha de un resumen que la app ya estimo, no crear uno nuevo: si el
 * estimado de septiembre cierra el 20 y el usuario declara que cerro el 24, hay que ACTUALIZAR
 * esa fila. Insertar dejaria dos resumenes de septiembre para la misma tarjeta -- la unique de
 * la tabla es (payment_method_id, closing_date) y no lo impide.
 *
 * Espera `ciclos` ya filtrado por tarjeta (ver ciclosDeMetodo).
 */
export function cicloDelMesDe(
  ciclos: CreditCardCycle[],
  closingDate: string,
): CreditCardCycle | undefined {
  const mes = closingDate.slice(0, 7);
  return ciclos.find((c) => c.closing_date.slice(0, 7) === mes);
}

/**
 * Que resumenes futuros hay que re-fechar cuando cambian los defaults de la tarjeta.
 *
 * Es la segunda mitad del invariante del spec: declarar o editar un cierre NO reasigna ninguna
 * transaccion, pero SI actualiza las fechas de los resumenes futuros estimados. Sin esto la
 * ficha de la tarjeta dice una cosa y sus resumenes dicen otra -- medido en DEV el 2026-09-02,
 * con cuatro meses de cuotas venciendo un dia que la tarjeta ya no declaraba.
 *
 * Nunca toca un `declared` (es dato que el usuario leyo del resumen) ni un resumen que ya cerro
 * (sus compras estan imputadas, y re-fecharlo moveria plata de un resumen a otro).
 *
 * Devuelve solo los que efectivamente cambian, para no escribir de mas.
 */
export function recalcularFuturosGenerated(
  method: PaymentMethod,
  ciclos: CreditCardCycle[],
  hoy: string,
): CambioDeCiclo[] {
  if (method.type !== 'credit' || !method.default_closing_day || !method.default_payment_day) {
    return [];
  }

  const futurosEstimados = ciclos
    .filter((c) => c.source === 'generated' && c.closing_date > hoy)
    .sort((a, b) => a.closing_date.localeCompare(b.closing_date));
  if (futurosEstimados.length === 0) return [];

  // generarCiclos ya sabe clampear el dia al ultimo del mes y decidir si el vencimiento cae en
  // el mismo mes o en el siguiente. Se le pide el rango de los futuros SIN pasarle existentes,
  // y se aparea por mes con lo que hay.
  const desde = parseLocalDate(futurosEstimados[0].closing_date);
  const hasta = parseLocalDate(futurosEstimados[futurosEstimados.length - 1].closing_date);
  const frescos = generarCiclos(method, desde, hasta, []);
  const frescoPorMes = new Map(frescos.map((c) => [c.closing_date.slice(0, 7), c]));

  const cambios: CambioDeCiclo[] = [];
  for (const viejo of futurosEstimados) {
    const fresco = frescoPorMes.get(viejo.closing_date.slice(0, 7));
    if (!fresco) continue;
    if (fresco.closing_date === viejo.closing_date && fresco.due_date === viejo.due_date) continue;
    cambios.push({ id: viejo.id, closing_date: fresco.closing_date, due_date: fresco.due_date });
  }
  return cambios;
}
```

Verificar que `parseLocalDate` esté importado en `cycles.ts`; si no, agregar
`import { parseLocalDate } from '@/lib/utils/dates';`.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/lib/finance/__tests__/cycles.test.ts src/lib/finance/__tests__/escenarios-disponible.test.ts`

Expected: PASS.

- [ ] **Step 5: Verificar y commitear**

```bash
npm test && npm run lint && npx tsc --noEmit
git add src/lib/finance/cycles.ts src/lib/finance/__tests__/cycles.test.ts src/lib/finance/__tests__/escenarios-disponible.test.ts
git commit -m "feat(ciclos): decidir que resumen se corrige y cuales futuros se re-fechan"
```

---

## Task 3: Declarar un resumen — la escritura y la action

La primera vez que la aplicación escribe `source: 'declared'`. Hoy esa palabra sólo existe en
tests: verificado con `grep -rn "'declared'" src/`, que devuelve únicamente archivos bajo
`__tests__/`. Los 416 resúmenes que creó la migración son todos estimados.

**Files:**
- Create: `src/lib/ciclos/declarar.ts`
- Create: `src/lib/ciclos/__tests__/declarar.test.ts`
- Create: `src/lib/schemas/ciclo.ts`
- Modify: `src/app/medios-pago/actions.ts` (agregar al final; hoy `createPaymentMethod` L12, `updatePaymentMethod` L56, `deletePaymentMethod` L102, `reassignAndDeletePaymentMethod` L137)

**Interfaces:**
- Consumes: `cicloDelMesDe`, `recalcularFuturosGenerated`, `ciclosDeMetodo` de `@/lib/finance/cycles` (Task 2).
- Produces:
  - `guardarDeclaracion(supabase, method, closingDate, dueDate, hoy): Promise<CreditCardCycle>` en `lib/ciclos/declarar.ts`
  - `realinearFuturos(supabase, method, hoy): Promise<number>` en el mismo archivo, devuelve cuántos resúmenes re-fechó. La consume la Task 4.
  - `declararCiclo(input: DeclararCicloSchema): Promise<ActionResponse>` en `medios-pago/actions.ts`. La consumen las tasks 5, 6 y 7.
  - `declararCicloSchema` y `type DeclararCicloSchema` en `lib/schemas/ciclo.ts`.

- [ ] **Step 1: Escribir el schema**

Crear `src/lib/schemas/ciclo.ts`:

```ts
import { z } from 'zod';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export const declararCicloSchema = z
  .object({
    paymentMethodId: z.string().uuid(),
    // Strings `yyyy-MM-dd` a proposito: nunca Date. Un round trip por Date corre un dia
    // atras en runtimes con zona horaria negativa.
    closingDate: z.string().regex(FECHA, 'Fecha de cierre invalida'),
    dueDate: z.string().regex(FECHA, 'Fecha de vencimiento invalida'),
  })
  .refine((d) => d.dueDate >= d.closingDate, {
    message: 'El vencimiento no puede ser anterior al cierre',
    path: ['dueDate'],
  });

export type DeclararCicloSchema = z.infer<typeof declararCicloSchema>;
```

El `refine` duplica a propósito el check `credit_card_cycles_due_after_closing` de la base: la
validación cerca del usuario da un mensaje en castellano en vez de un error de Postgres.

- [ ] **Step 2: Escribir el test que falla**

Crear `src/lib/ciclos/__tests__/declarar.test.ts`. Usa el mismo doble estático de Supabase que
`src/lib/ciclos/__tests__/asegurar.test.ts` (leerlo antes de escribir este, para copiar el patrón
de encadenado `from().select().eq().order()`):

```ts
import { describe, it, expect, vi } from 'vitest';
import type { PaymentMethod } from '@/types/database';
import { guardarDeclaracion } from '../declarar';

const TARJETA = {
  id: 'pm1', user_id: 'u1', type: 'credit',
  default_closing_day: 20, default_payment_day: 28,
} as unknown as PaymentMethod;

// Estimado de septiembre: cierra el 20, vence el 28. El usuario declara 24-sep / 2-oct.
const EXISTENTES = [
  { id: 'sep', user_id: 'u1', payment_method_id: 'pm1', closing_date: '2026-09-20', due_date: '2026-09-28', source: 'generated', created_at: 'x' },
  { id: 'oct', user_id: 'u1', payment_method_id: 'pm1', closing_date: '2026-10-20', due_date: '2026-10-28', source: 'generated', created_at: 'x' },
];

function dobleSupabase(filas = EXISTENTES) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const inserts: Record<string, unknown>[] = [];
  const supabase = {
    from: () => ({
      select: () => ({ eq: () => ({ order: () => ({ data: filas, error: null }) }) }),
      update: (patch: Record<string, unknown>) => ({
        eq: (_c: string, id: string) => {
          updates.push({ id, patch });
          return { select: () => ({ single: () => ({ data: { ...filas[0], ...patch }, error: null }) }) };
        },
      }),
      insert: (row: Record<string, unknown>) => {
        inserts.push(row);
        return { select: () => ({ single: () => ({ data: { id: 'nuevo', ...row }, error: null }) }) };
      },
    }),
  } as never;
  return { supabase, updates, inserts };
}

describe('guardarDeclaracion', () => {
  it('corrige el resumen del mismo mes en vez de crear uno nuevo', async () => {
    const { supabase, updates, inserts } = dobleSupabase();
    await guardarDeclaracion(supabase, TARJETA, '2026-09-24', '2026-10-02', '2026-09-02');
    expect(inserts).toHaveLength(0);
    const delMes = updates.find((u) => u.id === 'sep');
    expect(delMes?.patch).toMatchObject({
      closing_date: '2026-09-24', due_date: '2026-10-02', source: 'declared',
    });
  });

  it('inserta cuando ese mes todavia no tiene resumen', async () => {
    const { supabase, inserts } = dobleSupabase([]);
    await guardarDeclaracion(supabase, TARJETA, '2026-09-24', '2026-10-02', '2026-09-02');
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      payment_method_id: 'pm1', closing_date: '2026-09-24',
      due_date: '2026-10-02', source: 'declared',
    });
  });

  it('no toca ninguna transaccion: declarar nunca reasigna', async () => {
    const { supabase, updates } = dobleSupabase();
    await guardarDeclaracion(supabase, TARJETA, '2026-09-24', '2026-10-02', '2026-09-02');
    // Solo se escriben filas de credit_card_cycles. Si alguna vez esta task tocara
    // transactions, este test es el que tiene que romperse.
    expect(updates.every((u) => u.patch.closing_date !== undefined || u.patch.due_date !== undefined)).toBe(true);
  });
});
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `npx vitest run src/lib/ciclos/__tests__/declarar.test.ts`

Expected: FAIL con `Failed to resolve import "../declarar"`.

- [ ] **Step 4: Implementar la escritura**

Crear `src/lib/ciclos/declarar.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, PaymentMethod } from '@/types/database';
import {
  ciclosDeMetodo,
  cicloDelMesDe,
  recalcularFuturosGenerated,
  type CreditCardCycle,
} from '@/lib/finance/cycles';

async function leerCiclos(
  supabase: SupabaseClient<Database>,
  methodId: string,
): Promise<CreditCardCycle[]> {
  const { data, error } = await supabase
    .from('credit_card_cycles')
    .select('*')
    .eq('payment_method_id', methodId)
    .order('closing_date', { ascending: true });
  if (error) throw new Error('No pude leer los resumenes de la tarjeta: ' + error.message);
  return ciclosDeMetodo(methodId, (data ?? []) as CreditCardCycle[]);
}

/** Re-fecha los resumenes futuros estimados. Devuelve cuantos cambio. */
async function aplicarRealineado(
  supabase: SupabaseClient<Database>,
  method: PaymentMethod,
  ciclos: CreditCardCycle[],
  hoy: string,
): Promise<number> {
  const cambios = recalcularFuturosGenerated(method, ciclos, hoy);
  for (const c of cambios) {
    const { error } = await supabase
      .from('credit_card_cycles')
      .update({ closing_date: c.closing_date, due_date: c.due_date })
      .eq('id', c.id);
    if (error) throw new Error('No pude actualizar un resumen futuro: ' + error.message);
  }
  return cambios.length;
}

/**
 * Escribe lo que el usuario leyo del resumen.
 *
 * Corrige el resumen del MISMO MES si ya existe (declarar es corregir una estimacion, no crear
 * un resumen paralelo) y lo marca `declared`, para que ninguna regeneracion posterior lo pise.
 *
 * NO toca ninguna transaccion: el invariante central del spec. Lo que estaba imputado a ese
 * resumen sigue imputado, con la fecha nueva.
 */
export async function guardarDeclaracion(
  supabase: SupabaseClient<Database>,
  method: PaymentMethod,
  closingDate: string,
  dueDate: string,
  hoy: string,
): Promise<CreditCardCycle> {
  const ciclos = await leerCiclos(supabase, method.id);
  const delMes = cicloDelMesDe(ciclos, closingDate);

  let guardado: CreditCardCycle;
  if (delMes) {
    const { data, error } = await supabase
      .from('credit_card_cycles')
      .update({ closing_date: closingDate, due_date: dueDate, source: 'declared' })
      .eq('id', delMes.id)
      .select('*')
      .single();
    if (error) throw new Error('No pude guardar el resumen: ' + error.message);
    guardado = data as CreditCardCycle;
  } else {
    const { data, error } = await supabase
      .from('credit_card_cycles')
      .insert({
        user_id: method.user_id,
        payment_method_id: method.id,
        closing_date: closingDate,
        due_date: dueDate,
        source: 'declared',
      })
      .select('*')
      .single();
    if (error) throw new Error('No pude guardar el resumen: ' + error.message);
    guardado = data as CreditCardCycle;
  }

  // Los futuros estimados se re-fechan con los defaults vigentes. El recien declarado ya es
  // `declared`, asi que queda fuera por definicion.
  const actualizados = ciclos.map((c) => (c.id === guardado.id ? guardado : c));
  await aplicarRealineado(supabase, method, actualizados, hoy);

  return guardado;
}

/**
 * Re-fecha los resumenes futuros estimados de una tarjeta contra sus defaults actuales.
 * Se llama cuando el usuario cambia el dia de cierre o de vencimiento en la ficha.
 */
export async function realinearFuturos(
  supabase: SupabaseClient<Database>,
  method: PaymentMethod,
  hoy: string,
): Promise<number> {
  const ciclos = await leerCiclos(supabase, method.id);
  return aplicarRealineado(supabase, method, ciclos, hoy);
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npx vitest run src/lib/ciclos/__tests__/declarar.test.ts`

Expected: PASS, 3 tests.

- [ ] **Step 6: Escribir la action**

Agregar al final de `src/app/medios-pago/actions.ts`:

```ts
export async function declararCiclo(input: DeclararCicloSchema): Promise<ActionResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autorizado' };

  const parsed = declararCicloSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos invalidos' };

  // Dueno del id que llega del cliente (auditoria M4): RLS impide mutar filas ajenas, pero no
  // impide que una fila propia apunte a una tarjeta de otro.
  const { data: method } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('id', parsed.data.paymentMethodId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!method) return { error: 'Medio de pago invalido' };
  if (method.type !== 'credit') return { error: 'Solo las tarjetas de credito tienen resumenes' };

  try {
    await guardarDeclaracion(
      supabase,
      method,
      parsed.data.closingDate,
      parsed.data.dueDate,
      dateToLocalString(new Date()),
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No pude guardar el resumen' };
  }

  revalidatePath('/ajustes/medios');
  revalidatePath('/compromisos');
  revalidatePath('/');
  return { success: true };
}
```

Imports nuevos en ese archivo: `declararCicloSchema`, `type DeclararCicloSchema` de
`@/lib/schemas/ciclo`; `guardarDeclaracion` de `@/lib/ciclos/declarar`; `dateToLocalString` de
`@/lib/utils/dates`.

> `dateToLocalString(new Date())` es correcto acá y no contradice la regla del proyecto: lo
> prohibido es `dateToLocalString(new Date(unString))`, que hace round trip de un string por
> `Date`. Formatear el reloj de hoy es justamente para lo que existe.

- [ ] **Step 7: Test de la action**

Crear el test siguiendo el patrón de `src/app/medios-pago/__tests__/payment-method-dueno.test.ts`
(leerlo primero: mockea `@/utils/supabase/server` y llama la action directo). Tres casos:

1. Una tarjeta de otro usuario da `{ error: 'Medio de pago invalido' }` y **no** llama a `guardarDeclaracion`.
2. Un vencimiento anterior al cierre da `{ error: 'El vencimiento no puede ser anterior al cierre' }`.
3. El camino feliz llama a `guardarDeclaracion` con los strings tal cual llegaron, sin round trip por `Date`.

- [ ] **Step 8: Verificar y commitear**

```bash
npm test && npm run lint && npx tsc --noEmit
git add src/lib/ciclos/declarar.ts src/lib/ciclos/__tests__/declarar.test.ts src/lib/schemas/ciclo.ts src/app/medios-pago/actions.ts src/app/medios-pago/__tests__/
git commit -m "feat(ciclos): declarar un resumen escribe la fecha real del banco"
```

---

## Task 4: Cambiar los días de la tarjeta re-fecha los resúmenes futuros

El bug medido en DEV el 2026-09-02, cerrado. Hoy `updatePaymentMethod`
(`medios-pago/actions.ts:56`) escribe `default_closing_day` y `default_payment_day` y **no toca
ningún resumen**: la ficha queda diciendo una cosa y los resúmenes otra, por todo el tiempo que
duren los ya materializados.

**Files:**
- Modify: `src/app/medios-pago/actions.ts:56-94` (`updatePaymentMethod`)
- Create: `src/app/medios-pago/__tests__/update-realinea-ciclos.test.ts`

**Interfaces:**
- Consumes: `realinearFuturos(supabase, method, hoy)` de `@/lib/ciclos/declarar` (Task 3).
- Produces: nada nuevo. Cambia el comportamiento de `updatePaymentMethod`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/app/medios-pago/__tests__/update-realinea-ciclos.test.ts`, mockeando
`@/lib/ciclos/declarar`:

```ts
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/ciclos/declarar', () => ({ realinearFuturos: vi.fn().mockResolvedValue(0) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const guardada = {
  id: 'pm1', user_id: 'u1', type: 'credit',
  default_closing_day: 24, default_payment_day: 6,
};

// Doble de Supabase: mismo patron que payment-method-dueno.test.ts (leerlo antes).
// `select().eq().eq().maybeSingle()` devuelve la tarjeta guardada; `update()` no falla.
const from = vi.fn(() => ({
  select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: guardada, error: null }) }) }) }),
  update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
}));

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from,
  }),
}));

import { realinearFuturos } from '@/lib/ciclos/declarar';
import { updatePaymentMethod } from '../actions';
const realinearMock = realinearFuturos as unknown as Mock;

const BASE = { name: 'Visa', type: 'credit' as const, default_closing_day: 24, default_payment_day: 6 };

beforeEach(() => { realinearMock.mockClear(); });

describe('updatePaymentMethod re-fecha los resumenes futuros', () => {
  it('llama a realinearFuturos cuando cambia el dia de vencimiento', async () => {
    // guardada: cierre 24 / vence 6  ->  se edita a cierre 24 / vence 2
    await updatePaymentMethod('pm1', { ...BASE, default_payment_day: 2 });
    expect(realinearMock).toHaveBeenCalledTimes(1);
    expect(realinearMock.mock.calls[0][1]).toMatchObject({ id: 'pm1' });
  });

  it('llama a realinearFuturos cuando cambia el dia de cierre', async () => {
    await updatePaymentMethod('pm1', { ...BASE, default_closing_day: 20 });
    expect(realinearMock).toHaveBeenCalledTimes(1);
  });

  it('NO lo llama si los dos dias quedaron iguales', async () => {
    await updatePaymentMethod('pm1', { ...BASE, name: 'Visa Galicia' });
    expect(realinearMock).not.toHaveBeenCalled();
  });

  it('NO lo llama para un medio que no es credito', async () => {
    await updatePaymentMethod('pm1', {
      name: 'Mercado Pago', type: 'debit',
      default_closing_day: null, default_payment_day: null,
    });
    expect(realinearMock).not.toHaveBeenCalled();
  });

  it('devuelve success aunque el realineado falle: la tarjeta ya se guardo', async () => {
    realinearMock.mockRejectedValueOnce(new Error('boom'));
    const r = await updatePaymentMethod('pm1', { ...BASE, default_payment_day: 2 });
    expect(r).toEqual({ success: true });
  });
});
```

> El último caso es una decisión, no un descuido: el `update` de la tarjeta ya se aplicó cuando
> corre el realineado. Si el realineado falla y la action devuelve error, el usuario ve «no se
> guardó» sobre un cambio que **sí** se guardó. Se prefiere guardar y dejar los resúmenes
> desalineados, que es el estado de hoy y se corrige en el próximo intento.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/app/medios-pago/__tests__/update-realinea-ciclos.test.ts`

Expected: FAIL, `realinearFuturos` no se llamó.

- [ ] **Step 3: Implementar**

En `updatePaymentMethod`, **antes** del `update`, leer la tarjeta guardada para comparar; después
del `update` exitoso, realinear:

```ts
const { data: previo } = await supabase
  .from('payment_methods')
  .select('type, default_closing_day, default_payment_day')
  .eq('id', id)
  .eq('user_id', user.id)
  .maybeSingle();

// ... el update que ya existe (L76-88) ...

const diasCambiaron =
  previo?.default_closing_day !== (parsed.data.default_closing_day ?? null) ||
  previo?.default_payment_day !== (parsed.data.default_payment_day ?? null);

if (parsed.data.type === 'credit' && diasCambiaron) {
  // Los resumenes que todavia no cerraron toman los dias nuevos. Los que ya cerraron NO:
  // sus compras estan imputadas. Los declarados tampoco: son dato del banco.
  try {
    const { data: method } = await supabase
      .from('payment_methods').select('*').eq('id', id).eq('user_id', user.id).maybeSingle();
    if (method) await realinearFuturos(supabase, method, dateToLocalString(new Date()));
  } catch {
    // La tarjeta ya se guardo. Dejar los resumenes desalineados es el estado de hoy y se
    // corrige en el proximo intento; devolver error diria que no se guardo, y no es cierto.
  }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/app/medios-pago/__tests__/update-realinea-ciclos.test.ts`

Expected: PASS, 5 tests.

- [ ] **Step 5: Verificar y commitear**

```bash
npm test && npm run lint && npx tsc --noEmit
git add src/app/medios-pago/actions.ts src/app/medios-pago/__tests__/update-realinea-ciclos.test.ts
git commit -m "fix(ciclos): cambiar los dias de la tarjeta re-fecha los resumenes futuros"
```

---

## Task 5: Las fechas del resumen en la ficha de la tarjeta

El tercero de los tres lugares del spec, y el único que no depende de haber pagado. La ficha
muestra el cierre y el vencimiento del resumen vigente, marcados **«del resumen»** o
**«estimado»**, y deja corregirlos en cualquier momento.

**Files:**
- Create: `src/components/medios-pago/ciclo-fechas-field.tsx`
- Create: `src/components/medios-pago/editar-ciclo-dialog.tsx`
- Modify: `src/components/medios-pago/institutional-card.tsx` (props en L31-47; el modal de detalle se monta en L289-293 y `EditPaymentMethodDialog` en L295-299)
- Create: `src/components/medios-pago/__tests__/ciclo-fechas.test.tsx`

**Interfaces:**
- Consumes: `declararCiclo(input)` de `@/app/medios-pago/actions` (Task 3); `cicloVigente`, `ciclosDeMetodo` de `@/lib/finance/cycles`; `useFinanceStore` (los ciclos ya están en `state.creditCardCycles`, cargados en `financeStore.ts:551`).
- Produces: `<CicloFechasField value={{ closingDate, dueDate }} onChange={...} />`, que también usa la Task 6.

- [ ] **Step 1: Escribir el test de markup que falla**

Crear `src/components/medios-pago/__tests__/ciclo-fechas.test.tsx`, con
`renderToStaticMarkup` (el patrón de markup del repo; no hay jsdom):

```tsx
describe('procedencia de las fechas del resumen', () => {
  it('un resumen declarado se muestra como "del resumen"', () => {
    const html = renderToStaticMarkup(<EtiquetaProcedencia source="declared" />);
    expect(html).toContain('del resumen');
    expect(html).not.toContain('estimado');
  });

  it('un resumen generado se muestra como "estimado"', () => {
    const html = renderToStaticMarkup(<EtiquetaProcedencia source="generated" />);
    expect(html).toContain('estimado');
  });

  it('los dos inputs de fecha tienen su label accesible', () => {
    const html = renderToStaticMarkup(
      <CicloFechasField value={{ closingDate: '2026-09-24', dueDate: '2026-10-02' }} onChange={() => {}} />,
    );
    expect(html).toContain('Cierre');
    expect(html).toContain('Vencimiento');
    expect(html).toContain('2026-09-24');
    expect(html).toContain('2026-10-02');
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/components/medios-pago/__tests__/ciclo-fechas.test.tsx`

Expected: FAIL, el módulo no existe.

- [ ] **Step 3: Escribir el componente de campos**

Crear `src/components/medios-pago/ciclo-fechas-field.tsx`:

```tsx
'use client';

import { Input } from '@/components/ui/input';
import { Chip } from '@/components/ui/chip';

export type FechasDeCiclo = { closingDate: string; dueDate: string };

/**
 * De donde salen las fechas de un resumen: leidas del papel del banco o estimadas por la app.
 * No es decorativo -- es lo que le dice al usuario en cual puede confiar.
 */
export function EtiquetaProcedencia({ source }: { source: 'generated' | 'declared' }) {
  return (
    <Chip tone={source === 'declared' ? 'accent' : 'muted'}>
      {source === 'declared' ? 'del resumen' : 'estimado'}
    </Chip>
  );
}

/**
 * El par cierre / vencimiento. Los valores entran y salen como string `yyyy-MM-dd`:
 * nunca pasan por Date, que en zona horaria negativa corre un dia atras.
 */
export function CicloFechasField({
  value,
  onChange,
  disabled,
}: {
  value: FechasDeCiclo;
  onChange: (v: FechasDeCiclo) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold text-muted">Cierre</span>
        <Input
          type="date"
          className="min-h-[44px]"
          value={value.closingDate}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, closingDate: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold text-muted">Vencimiento</span>
        <Input
          type="date"
          className="min-h-[44px]"
          value={value.dueDate}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, dueDate: e.target.value })}
        />
      </label>
    </div>
  );
}
```

Verificar contra `src/components/ui/chip.tsx` qué valores acepta `tone` antes de escribirlo; si
no existe `muted`, usar el que corresponda al gris del sistema.

- [ ] **Step 4: Escribir el diálogo de edición y montarlo en la ficha**

Crear `src/components/medios-pago/editar-ciclo-dialog.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CicloFechasField, type FechasDeCiclo } from './ciclo-fechas-field';
import { declararCiclo } from '@/app/medios-pago/actions';
import { declararCicloSchema } from '@/lib/schemas/ciclo';
import { useFinanceStore } from '@/lib/store/financeStore';
import type { CreditCardCycle } from '@/lib/finance/cycles';

export function EditarCicloDialog({
  open, onOpenChange, methodId, ciclo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  methodId: string;
  ciclo: CreditCardCycle;
}) {
  const store = useFinanceStore();
  const router = useRouter();
  const [pendiente, setPendiente] = useState(false);
  const [fechas, setFechas] = useState<FechasDeCiclo>({
    closingDate: ciclo.closing_date,
    dueDate: ciclo.due_date,
  });

  async function guardar() {
    const input = { paymentMethodId: methodId, ...fechas };
    const parsed = declararCicloSchema.safeParse(input);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Datos invalidos');
      return;
    }
    setPendiente(true);
    const r = await declararCiclo(parsed.data);
    setPendiente(false);
    if (r.error) { toast.error(r.error); return; }
    toast.success('Listo, guardamos las fechas de tu resumen');
    onOpenChange(false);
    await store.fetchAllData();
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Fechas del resumen</DialogTitle>
          <DialogDescription>
            Copialas del resumen del banco. No mueve ningun movimiento que ya tengas cargado.
          </DialogDescription>
        </DialogHeader>
        <CicloFechasField value={fechas} onChange={setFechas} disabled={pendiente} />
        <Button variant="accent" className="min-h-[44px]" onClick={guardar} disabled={pendiente}>
          {pendiente ? 'Guardando…' : 'Guardar'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
```

> El `DialogDescription` no es opcional: un `DialogContent` sin descripción accesible avisa por
> consola, y fue uno de los dos defectos que el navegador encontró en el popup de novedades.

En `institutional-card.tsx`, junto a las fechas que la ficha ya muestra, agregar la etiqueta de
procedencia del resumen vigente y el botón que abre el diálogo:

```tsx
const store = useFinanceStore();
const vigente = cicloVigente(ciclosDeMetodo(pm.id, store.creditCardCycles), new Date());
// ...
{vigente && (
  <>
    <div className="flex items-center gap-2">
      <EtiquetaProcedencia source={vigente.source} />
      <Button variant="ghost" className="min-h-[44px]" onClick={() => setEditandoCiclo(true)}>
        Corregir fechas
      </Button>
    </div>
    <EditarCicloDialog
      open={editandoCiclo}
      onOpenChange={setEditandoCiclo}
      methodId={pm.id}
      ciclo={vigente}
    />
  </>
)}
```

El estado `const [editandoCiclo, setEditandoCiclo] = useState(false)` va junto a los que la ficha
ya tiene para el modal de detalle (L289-293) y `EditPaymentMethodDialog` (L295-299).

Si la tarjeta no tiene ningún resumen materializado, el bloque no se muestra: no hay nada que
corregir todavía. **Cómo consumir el store**: el objeto entero y después sus campos, nunca un
getter desestructurado, que el React Compiler lo congela.

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npx vitest run src/components/medios-pago/`

Expected: PASS.

- [ ] **Step 6: Verificar y commitear**

```bash
npm test && npm run lint && npx tsc --noEmit
git add src/components/medios-pago/
git commit -m "feat(ciclos): la ficha de la tarjeta muestra y corrige las fechas del resumen"
```

---

## Task 6: Declarar el próximo resumen al marcar el pago

El paso **opcional** dentro de los dos diálogos de pago. La estimación se muestra como texto gris
y un botón «Lo tengo a mano, lo cargo» la vuelve editable.

> **Confirmar exige un gesto.** Darle «Pagué» de largo nunca convierte una estimación en dato
> declarado. Si lo hiciera, la app quedaría afirmando que conoce fechas que inventó, y después no
> habría forma de distinguir cuál es cuál. **Este es el requisito que hay que verificar en el gate
> visual de la Task 10.**

La razón de que sea opcional está en el spec: el usuario marca los pagos de memoria y sin el
resumen a mano, y una fricción ahí pega justo en la acción que, según E11, es lo único que impide
que el disponible se infle solo.

**Files:**
- Create: `src/components/medios-pago/declarar-proximo-ciclo.tsx`
- Modify: `src/components/compromisos/credit-card-cycle-card.tsx` (el AlertDialog «¿Ya pagaste la…?» arranca en L173; el bloque del medio financiador está en L193-210; `handleConfirm` en L127-153)
- Modify: `src/components/medios-pago/register-card-payment-dialog.tsx` (campos hasta L204; submit L77-111; botón con `disabled` en L211)
- Create: `src/components/medios-pago/__tests__/declarar-proximo-ciclo.test.tsx`

**Interfaces:**
- Consumes: `CicloFechasField` (Task 5), `declararCiclo` (Task 3), `payCreditCardCycle(params)` que ya existe en `compromisos/actions.ts:158`.
- Produces: `<DeclararProximoCiclo methodId estimado={{ closingDate, dueDate }} onDeclarar={...} />`.

- [ ] **Step 1: Escribir el test que falla**

```tsx
describe('DeclararProximoCiclo', () => {
  it('arranca cerrado, mostrando la estimacion como texto', () => {
    const html = renderToStaticMarkup(
      <DeclararProximoCiclo methodId="pm1" estimado={{ closingDate: '2026-09-27', dueDate: '2026-10-04' }} onDeclarar={() => {}} />,
    );
    expect(html).toContain('Estimado');
    expect(html).toContain('Lo tengo a mano');
    // cerrado: sin inputs de fecha
    expect(html).not.toContain('type="date"');
  });

  it('el boton de abrir es un touch target de 44px', () => {
    const html = renderToStaticMarkup(
      <DeclararProximoCiclo methodId="pm1" estimado={{ closingDate: '2026-09-27', dueDate: '2026-10-04' }} onDeclarar={() => {}} />,
    );
    expect(html).toMatch(/min-h-\[44px\]|h-11|h-12/);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/components/medios-pago/__tests__/declarar-proximo-ciclo.test.tsx`

Expected: FAIL, el módulo no existe.

- [ ] **Step 3: Escribir el componente**

Crear `src/components/medios-pago/declarar-proximo-ciclo.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { parseLocalDate } from '@/lib/utils/dates';
import { CicloFechasField, type FechasDeCiclo } from './ciclo-fechas-field';

const corto = (d: string) => format(parseLocalDate(d), "d MMM", { locale: es });

/**
 * El paso OPCIONAL de cargar las fechas del proximo resumen mientras se marca un pago.
 *
 * Arranca cerrado a proposito: el usuario marca los pagos de memoria y sin el resumen a mano, y
 * una friccion aca pega justo en la accion que (E11) es lo unico que impide que el disponible se
 * infle solo.
 *
 * No escribe nada por su cuenta: avisa por `onDeclarar` y el dialogo que lo contiene decide
 * cuando guardar. Si el usuario nunca lo abre, `onDeclarar` nunca se llama y la estimacion sigue
 * siendo una estimacion -- ese es el requisito de "confirmar exige un gesto".
 */
export function DeclararProximoCiclo({
  estimado,
  onDeclarar,
}: {
  estimado: FechasDeCiclo;
  onDeclarar: (fechas: FechasDeCiclo | null) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [fechas, setFechas] = useState<FechasDeCiclo>(estimado);

  if (!abierto) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-xs text-muted">
          Estimado: cierra {corto(estimado.closingDate)} · vence {corto(estimado.dueDate)}
        </p>
        <Button
          type="button"
          variant="ghost"
          className="min-h-[44px] self-start"
          onClick={() => { setAbierto(true); onDeclarar(fechas); }}
        >
          Lo tengo a mano, lo cargo
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">Copialas del resumen del banco.</p>
      <CicloFechasField
        value={fechas}
        onChange={(v) => { setFechas(v); onDeclarar(v); }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Montarlo en los dos diálogos**

En `credit-card-cycle-card.tsx`, dentro del AlertDialog de pago, **debajo** del bloque del medio
financiador (después de L210). La estimación del próximo resumen sale del ciclo siguiente al que
se está pagando; si no hay ninguno materializado, el componente no se muestra:

```tsx
const [fechasDeclaradas, setFechasDeclaradas] = useState<FechasDeCiclo | null>(null);
// ...
{proximo && (
  <DeclararProximoCiclo
    estimado={{ closingDate: proximo.closing_date, dueDate: proximo.due_date }}
    onDeclarar={setFechasDeclaradas}
  />
)}
```

Y en `handleConfirm` (L127-153), después del `payCreditCardCycle` que ya existe:

```ts
const pago = await payCreditCardCycle({ /* ...los mismos params de hoy... */ });
if (pago.error) { toast.error(pago.error); setConfirming(false); return; }

// Solo si el usuario abrio el paso Y el resumen siguiente existe. Si nunca lo abrio,
// fechasDeclaradas es null y la estimacion sigue siendo estimacion.
if (fechasDeclaradas && proximo) {
  const d = await declararCiclo({
    paymentMethodId: card.methodId,
    closingDate: fechasDeclaradas.closingDate,
    dueDate: fechasDeclaradas.dueDate,
  });
  if (d.error) toast.warning('Registramos el pago, pero no pudimos guardar las fechas: ' + d.error);
}
```

**El orden importa y no es intercambiable**: el pago es lo que el usuario vino a hacer, así que va
primero y un fallo al declarar no puede impedirlo. Por eso la declaración avisa con un toast en vez
de devolver error.

En `register-card-payment-dialog.tsx`, lo mismo: el componente después de L204 (dentro del
contenedor con scroll, `.overflow-y-auto` en L135) y la misma secuencia dentro de `onSubmit`
(L77-111), usando el ciclo siguiente a `cicloAPagar` (calculado en L71).

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npm test`

Expected: PASS. Los tests que ya existen de esos dos diálogos siguen verdes: el paso es opcional y
por defecto está cerrado, así que el camino de pago no cambia.

- [ ] **Step 6: Verificar y commitear**

```bash
npm run lint && npx tsc --noEmit
git add src/components/medios-pago/ src/components/compromisos/credit-card-cycle-card.tsx
git commit -m "feat(ciclos): al marcar el pago se puede cargar el proximo resumen"
```

---

## Task 7: El recordatorio, el día que el resumen cierra

El segundo lugar del spec. **No aparece al pagar**, sino el día en que ese resumen cierra, que es
cuando el banco emite el papel. Nunca pide algo que el usuario todavía no puede tener. «Ahora no»
lo silencia hasta el cierre siguiente.

Ese «Ahora no» necesita dónde vivir, y **no puede ser `localStorage`**: la app se abre en el
teléfono y en la computadora, y el aviso reaparecería una vez por dispositivo. Es exactamente la
lección del tour, que el popup de novedades ya resolvió poniendo el estado en la base. Acá el
estado es por resumen, así que va como columna de `credit_card_cycles`.

**Files:**
- Create: `supabase/migrations/<timestamp>_credit_card_cycles_reminder.sql`
- Create: `src/components/compromisos/recordatorio-declarar-ciclo.tsx`
- Modify: `src/app/medios-pago/actions.ts` (agregar `posponerRecordatorioDeCiclo`)
- Modify: `src/app/compromisos/compromisos-client.tsx` (montar el aviso arriba de las cards de tarjeta, antes de L572)
- Modify: `src/types/database.ts` (la columna nueva en `credit_card_cycles`, hoy L162-206)
- Create: `src/lib/finance/__tests__/recordatorio-ciclo.test.ts`

**Interfaces:**
- Consumes: `declararCiclo` (Task 3), `CicloFechasField` (Task 5).
- Produces:
  - `ciclosQuePidenDeclaracion(ciclos: CreditCardCycle[], hoy: string): CreditCardCycle[]` en `lib/finance/cycles.ts`
  - `posponerRecordatorioDeCiclo(cycleId: string): Promise<ActionResponse>` en `medios-pago/actions.ts`

- [ ] **Step 1: Escribir la migración**

```bash
set -a; . ./.env.local; set +a
supabase migration new credit_card_cycles_reminder
```

Contenido:

```sql
-- El recordatorio de declarar las fechas del resumen aparece el dia que ese resumen cierra.
-- "Ahora no" tiene que sobrevivir al cambio de dispositivo: la app se abre en el telefono y en
-- la compu, y en localStorage el aviso reaparece una vez por cada uno. Es la leccion del tour.
alter table public.credit_card_cycles
  add column if not exists reminder_dismissed_at timestamptz;

comment on column public.credit_card_cycles.reminder_dismissed_at is
  'Cuando el usuario dijo "ahora no" al pedido de declarar las fechas de este resumen. NULL = nunca.';
```

Aplicar sólo a DEV por ahora (producción va en el orden de salida, al final del plan):

```bash
supabase db push --linked
supabase migration list --linked   # Local y Remote deben coincidir
```

Y agregar la columna a mano en `src/types/database.ts`, en `Row` (`reminder_dismissed_at: string | null`),
`Insert` y `Update` (`reminder_dismissed_at?: string | null`) de `credit_card_cycles`.

> **No regenerar `types/database.ts` desde el MCP**: se perderían las uniones literales de dominio
> (`'generated' | 'declared'`, `'income' | 'expense'`…) que están puestas a mano.

- [ ] **Step 2: Escribir el test de la regla que falla**

Crear `src/lib/finance/__tests__/recordatorio-ciclo.test.ts`:

```ts
const base = { user_id: 'u', payment_method_id: 'pm', created_at: 'x', reminder_dismissed_at: null };

describe('ciclosQuePidenDeclaracion', () => {
  it('pide declarar un resumen estimado que ya cerro', () => {
    const ciclos = [{ ...base, id: 'a', closing_date: '2026-09-01', due_date: '2026-09-10', source: 'generated' as const }];
    expect(ciclosQuePidenDeclaracion(ciclos, '2026-09-02').map((c) => c.id)).toEqual(['a']);
  });

  it('no pide nada antes del cierre: el banco todavia no emitio el resumen', () => {
    const ciclos = [{ ...base, id: 'a', closing_date: '2026-09-24', due_date: '2026-10-02', source: 'generated' as const }];
    expect(ciclosQuePidenDeclaracion(ciclos, '2026-09-02')).toEqual([]);
  });

  it('no pide un resumen que el usuario ya declaro', () => {
    const ciclos = [{ ...base, id: 'a', closing_date: '2026-09-01', due_date: '2026-09-10', source: 'declared' as const }];
    expect(ciclosQuePidenDeclaracion(ciclos, '2026-09-02')).toEqual([]);
  });

  it('no pide uno que el usuario pospuso', () => {
    const ciclos = [{ ...base, id: 'a', closing_date: '2026-09-01', due_date: '2026-09-10', source: 'generated' as const, reminder_dismissed_at: '2026-09-02T10:00:00Z' }];
    expect(ciclosQuePidenDeclaracion(ciclos, '2026-09-02')).toEqual([]);
  });

  it('pide solo el mas reciente cuando hay varios cerrados sin declarar', () => {
    const ciclos = [
      { ...base, id: 'jul', closing_date: '2026-07-23', due_date: '2026-07-31', source: 'generated' as const },
      { ...base, id: 'ago', closing_date: '2026-08-20', due_date: '2026-08-28', source: 'generated' as const },
    ];
    expect(ciclosQuePidenDeclaracion(ciclos, '2026-09-02').map((c) => c.id)).toEqual(['ago']);
  });

  it('pide uno por CADA tarjeta, no uno en total', () => {
    const ciclos = [
      { ...base, id: 'visa', payment_method_id: 'pm1', closing_date: '2026-08-20', due_date: '2026-08-28', source: 'generated' as const },
      { ...base, id: 'master', payment_method_id: 'pm2', closing_date: '2026-08-27', due_date: '2026-09-04', source: 'generated' as const },
    ];
    expect(ciclosQuePidenDeclaracion(ciclos, '2026-09-02').map((c) => c.id).sort()).toEqual(['master', 'visa']);
  });
});
```

> Los dos últimos casos fijan una decisión de producto en dos direcciones. Pedir tres resúmenes
> viejos de la misma tarjeta es una pared de avisos, y el dato de los anteriores ya no está a
> mano: se pide sólo el último cerrado. Pero pedir uno **en total** dejaría a las demás tarjetas
> sin pedir nunca: se pide uno **por tarjeta**.

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `npx vitest run src/lib/finance/__tests__/recordatorio-ciclo.test.ts`

Expected: FAIL con `ciclosQuePidenDeclaracion is not a function`.

- [ ] **Step 4: Implementar la regla pura**

Agregar a `src/lib/finance/cycles.ts`:

```ts
/**
 * Que resumenes le estan pidiendo al usuario que cargue sus fechas reales.
 *
 * Solo despues del cierre: la Ley 25.065 art. 23 obliga al banco a imprimir el cierre y el
 * vencimiento siguientes en cada resumen, asi que el dato existe recien cuando el resumen se
 * emite. Pedirlo antes seria pedir algo que el usuario no puede tener.
 *
 * UNO POR TARJETA, el ultimo cerrado. Pedir tres resumenes viejos de una es una pared de avisos
 * y el dato de los anteriores ya no esta a mano; pero pedir uno solo en total dejaria a las
 * demas tarjetas sin pedir nunca.
 *
 * Se saltea los que el usuario ya declaro y los que pospuso.
 */
export function ciclosQuePidenDeclaracion(
  ciclos: CreditCardCycle[],
  hoy: string,
): CreditCardCycle[] {
  const candidatos = ciclos
    .filter((c) => c.source === 'generated' && c.closing_date <= hoy && !c.reminder_dismissed_at)
    .sort((a, b) => a.closing_date.localeCompare(b.closing_date));

  const ultimoPorTarjeta = new Map<string, CreditCardCycle>();
  for (const c of candidatos) ultimoPorTarjeta.set(c.payment_method_id, c); // el orden asc deja el ultimo
  return [...ultimoPorTarjeta.values()];
}
```

- [ ] **Step 5: La action de posponer**

En `src/app/medios-pago/actions.ts`:

```ts
export async function posponerRecordatorioDeCiclo(cycleId: string): Promise<ActionResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autorizado' };

  const { error } = await supabase
    .from('credit_card_cycles')
    .update({ reminder_dismissed_at: new Date().toISOString() })
    .eq('id', cycleId)
    .eq('user_id', user.id);
  if (error) return { error: 'No pude guardar' };

  revalidatePath('/compromisos');
  return { success: true };
}
```

- [ ] **Step 6: El componente y su montaje**

Crear `src/components/compromisos/recordatorio-declarar-ciclo.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BannerDS } from '@/components/ui/banner-ds';
import { Button } from '@/components/ui/button';
import { CicloFechasField, type FechasDeCiclo } from '@/components/medios-pago/ciclo-fechas-field';
import { declararCiclo, posponerRecordatorioDeCiclo } from '@/app/medios-pago/actions';
import { useFinanceStore } from '@/lib/store/financeStore';
import type { CreditCardCycle } from '@/lib/finance/cycles';

export function RecordatorioDeclararCiclo({
  ciclo, nombreTarjeta,
}: { ciclo: CreditCardCycle; nombreTarjeta: string }) {
  const store = useFinanceStore();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, setPendiente] = useState(false);
  const [fechas, setFechas] = useState<FechasDeCiclo>({
    closingDate: ciclo.closing_date,
    dueDate: ciclo.due_date,
  });

  async function refrescar() { await store.fetchAllData(); router.refresh(); }

  async function guardar() {
    setPendiente(true);
    const r = await declararCiclo({ paymentMethodId: ciclo.payment_method_id, ...fechas });
    setPendiente(false);
    if (r.error) { toast.error(r.error); return; }
    toast.success('Listo, guardamos las fechas de tu resumen');
    await refrescar();
  }

  async function posponer() {
    setPendiente(true);
    const r = await posponerRecordatorioDeCiclo(ciclo.id);
    setPendiente(false);
    if (r.error) { toast.error(r.error); return; }
    await refrescar();
  }

  return (
    <BannerDS tone="warn">
      <p className="text-sm font-bold text-text">
        Cerró el resumen de {nombreTarjeta}. ¿Tenés las fechas a mano?
      </p>
      {abierto ? (
        <div className="flex flex-col gap-2 mt-2">
          <CicloFechasField value={fechas} onChange={setFechas} disabled={pendiente} />
          <Button variant="accent" className="min-h-[44px]" onClick={guardar} disabled={pendiente}>
            Guardar
          </Button>
        </div>
      ) : (
        <div className="flex gap-2 mt-2">
          <Button variant="soft" className="min-h-[44px]" onClick={() => setAbierto(true)}>
            Cargar fechas
          </Button>
          <Button variant="ghost" className="min-h-[44px]" onClick={posponer} disabled={pendiente}>
            Ahora no
          </Button>
        </div>
      )}
    </BannerDS>
  );
}
```

Verificar contra `src/components/ui/banner-ds.tsx` qué props acepta (`tone`, children) antes de
escribirlo.

En `compromisos-client.tsx`, montarlo **antes** del bloque de cards de tarjeta (hoy L571-578),
dentro del tabpanel `cuotas`:

```tsx
{ciclosQuePidenDeclaracion(store.creditCardCycles, dateToLocalString(new Date())).map((c) => {
  const tarjeta = store.paymentMethods.find((m) => m.id === c.payment_method_id);
  return tarjeta
    ? <RecordatorioDeclararCiclo key={c.id} ciclo={c} nombreTarjeta={tarjeta.name} />
    : null;
})}
```

`ciclosQuePidenDeclaracion` devuelve como máximo **uno por tarjeta**, así que un usuario con dos
tarjetas cerradas el mismo día ve dos avisos. En producción hay 18 tarjetas repartidas entre 20
usuarios, y los cierres caen en días distintos, así que en la práctica es uno por vez.

- [ ] **Step 7: Correr los tests y commitear**

```bash
npm test && npm run lint && npx tsc --noEmit
git add supabase/migrations src/types/database.ts src/lib/finance/cycles.ts src/lib/finance/__tests__/recordatorio-ciclo.test.ts src/components/compromisos/ src/app/compromisos/compromisos-client.tsx src/app/medios-pago/actions.ts
git commit -m "feat(ciclos): pedir las fechas del resumen el dia que cierra"
```

---

## Task 8: La cobertura de mensualidades pasa a ir por resumen

Hoy `computeMissingAutomaticCharges` (`src/lib/finance/recurring.ts:85-129`) decide si una
mensualidad ya está posteada con la clave `(recurring_plan_id, mes de transactions.date)`
(L105-109 y L121). Con resúmenes estimados eso funciona, porque un resumen por mes calendario.
**Con resúmenes declarados deja de funcionar**: un ciclo que cierra el 24-sep y vence el 2-oct
tiene su transacción fechada en octubre, así que el mes de septiembre nunca se ve cubierto y la
mensualidad se postea **dos veces**.

Es un prerrequisito duro: sin esto, declarar un ciclo que cruce de mes duplica cargos.

**Files:**
- Modify: `src/lib/finance/recurring.ts:85-129`
- Modify: `src/app/compromisos/actions.ts:435-439` (el `select` que alimenta esa función)
- Modify: `src/lib/finance/__tests__/recurring.test.ts`

**Interfaces:**
- Consumes: `expectedChargeDatePorCiclo(plan, month, ciclos)` (`recurring.ts:58-66`), que ya devuelve `{ cycleId, date }`.
- Produces: la firma de `computeMissingAutomaticCharges` cambia su tercer parámetro de
  `Pick<Transaction, 'recurring_plan_id' | 'date'>[]` a
  `Pick<Transaction, 'recurring_plan_id' | 'date' | 'cycle_id'>[]`.

- [ ] **Step 1: Escribir el test que falla**

```ts
it('no duplica una mensualidad cuando el resumen cruza de mes', () => {
  // Resumen declarado: cierra 24-sep, vence 2-oct. La transaccion quedo fechada en OCTUBRE.
  const ciclos = [
    { id: 'sep', user_id: 'u', payment_method_id: 'pm', closing_date: '2026-09-24', due_date: '2026-10-02', source: 'declared' as const, created_at: 'x', reminder_dismissed_at: null },
  ];
  const posteada = [{ recurring_plan_id: 'p1', date: '2026-10-02', cycle_id: 'sep' }];
  const faltantes = computeMissingAutomaticCharges([PLAN], [TARJETA], posteada, '2026-09', new Date('2026-09-30T12:00:00'), ciclos);
  // Con la regla vieja (mes de date) septiembre se veia descubierto y se posteaba de nuevo.
  expect(faltantes).toEqual([]);
});

it('sigue cubriendo por mes cuando la transaccion no tiene resumen', () => {
  const posteada = [{ recurring_plan_id: 'p1', date: '2026-09-28', cycle_id: null }];
  const faltantes = computeMissingAutomaticCharges([PLAN], [TARJETA], posteada, '2026-09', new Date('2026-09-30T12:00:00'), []);
  expect(faltantes).toEqual([]);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/lib/finance/__tests__/recurring.test.ts`

Expected: FAIL — el primer caso devuelve una carga faltante.

- [ ] **Step 3: Implementar**

En `recurring.ts`, la cobertura pasa a tener dos claves: por `cycle_id` cuando la transacción lo
tiene, y por mes de `date` como respaldo para las que no (las anteriores a la migración, y las
tarjetas sin resumen):

```ts
const cubiertosPorCiclo = new Set(
  transactions.filter((t) => t.recurring_plan_id === plan.id && t.cycle_id).map((t) => t.cycle_id as string),
);
const cubiertosPorMes = new Set(
  transactions.filter((t) => t.recurring_plan_id === plan.id && !t.cycle_id).map((t) => String(t.date).slice(0, 7)),
);
// ...
const yaEsta = cycleId ? cubiertosPorCiclo.has(cycleId) : cubiertosPorMes.has(date.slice(0, 7));
if (!yaEsta) {
  missing.push({ planId: plan.id, month: cursor, date, cycleId });
}
```

Y en `src/app/compromisos/actions.ts:435-439`, el `select` pasa de
`select('recurring_plan_id, date')` a `select('recurring_plan_id, date, cycle_id')`.

> **El respaldo por mes no es opcional.** Sin él, toda mensualidad posteada antes de que existieran
> los resúmenes se vería descubierta y se postearía de nuevo. En producción hay 54 planes
> recurrentes.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/lib/finance/__tests__/recurring.test.ts`

Expected: PASS.

- [ ] **Step 5: Verificar y commitear**

```bash
npm test && npm run lint && npx tsc --noEmit
git add src/lib/finance/recurring.ts src/lib/finance/__tests__/recurring.test.ts src/app/compromisos/actions.ts
git commit -m "fix(ciclos): la cobertura de mensualidades va por resumen, no por mes"
```

---

## Task 9: La etiqueta «vence D/M» sale del resumen

`compromisos-client.tsx:251-256` arma el texto de una mensualidad automática con
`expectedChargeDate(plan, method, mes)`, que calcula desde los **defaults**. La transacción que se
postea, en cambio, usa el vencimiento del resumen. Con resúmenes declarados que se aparten de los
defaults, la etiqueta y el movimiento dicen fechas distintas.

**Files:**
- Modify: `src/app/compromisos/compromisos-client.tsx:251-256` (dentro de `SubscriptionCard`, definida en L232; el texto se renderiza en L356-358)
- Modify: `src/app/compromisos/__tests__/` (agregar el caso)

**Interfaces:**
- Consumes: `expectedChargeDatePorCiclo(plan, month, ciclos)` de `@/lib/finance/recurring`; `ciclosDeMetodo` de `@/lib/finance/cycles`; `store.creditCardCycles`.
- Produces: nada nuevo.

- [ ] **Step 1: Escribir el test que falla**

La etiqueta se arma con una función pura, así que el test va contra ella y no contra el markup.
Primero extraer el cálculo de `SubscriptionCard` a `etiquetaDeCobro` en `@/lib/finance/recurring.ts`,
y testearla ahí. Agregar a `src/lib/finance/__tests__/recurring.test.ts`:

```ts
describe('etiquetaDeCobro', () => {
  const plan = { id: 'p1', payment_method_id: 'pm', frequency: 'monthly', billing_day: 10, is_active: true } as unknown as RecurringPlan;
  const metodo = { id: 'pm', type: 'credit', name: 'Visa', default_closing_day: 24, default_payment_day: 6 } as unknown as PaymentMethod;

  it('usa el vencimiento del resumen cuando existe', () => {
    // Resumen declarado de septiembre: cierra el 24, vence el 2 de octubre.
    const ciclos = [
      { id: 'sep', user_id: 'u', payment_method_id: 'pm', closing_date: '2026-09-24', due_date: '2026-10-02', source: 'declared' as const, created_at: 'x', reminder_dismissed_at: null },
    ];
    expect(etiquetaDeCobro(plan, metodo, '2026-09', ciclos)).toBe('Visa · vence 2/10');
  });

  it('cae a los defaults de la tarjeta cuando no hay resumen', () => {
    expect(etiquetaDeCobro(plan, metodo, '2026-09', [])).toBe('Visa · vence 6/10');
  });
});
```

Y la implementación, en `recurring.ts`:

```ts
/**
 * El texto "Visa - vence 2/10" de una mensualidad automatica.
 *
 * El resumen manda y los defaults son respaldo: mismo orden de precedencia que
 * computeMissingAutomaticCharges. Antes salia siempre de los defaults, asi que con un resumen
 * declarado la etiqueta y el movimiento posteado decian fechas distintas.
 */
export function etiquetaDeCobro(
  plan: RecurringPlan,
  method: PaymentMethod,
  month: string,
  ciclos: CreditCardCycle[],
): string {
  const porCiclo = expectedChargeDatePorCiclo(plan, month, ciclosDeMetodo(method.id, ciclos));
  const fecha = porCiclo?.date ?? expectedChargeDate(plan, method, month);
  const [, mes, dia] = fecha.split('-');
  return `${method.name} · vence ${Number(dia)}/${Number(mes)}`;
}
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/lib/finance/__tests__/recurring.test.ts`

Expected: FAIL con `etiquetaDeCobro is not a function`.

- [ ] **Step 3: Cablearla en la tarjeta de mensualidad**

En `compromisos-client.tsx`, dentro de `SubscriptionCard` (definida en L232), reemplazar las
líneas 251-256 por la llamada al helper:

```ts
const chargeLabel = isAutomatic
  ? etiquetaDeCobro(plan, method, dateToLocalString(new Date()).slice(0, 7), store.creditCardCycles)
  : null;
```

Imports: entra `etiquetaDeCobro` de `@/lib/finance/recurring`; sale `expectedChargeDate` si no
queda ningún otro uso en el archivo. `store` es el objeto entero del store, nunca un getter
desestructurado.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/lib/finance/__tests__/recurring.test.ts`

Expected: PASS, los dos casos nuevos.

- [ ] **Step 5: Verificar y commitear**

```bash
npm test && npm run lint && npx tsc --noEmit
git add src/app/compromisos/
git commit -m "fix(ciclos): la etiqueta de la mensualidad usa la fecha del resumen"
```

---

## Task 10: Gate visual, documentación y limpieza

El gate visual **no es opcional**: los dos últimos defectos de interfaz del proyecto —el toggle de
28 píxeles y el botón de 40— los encontró el navegador con la suite de tests entera en verde.

**Files:**
- Modify: `scripts/seed-escenarios-tarjeta.mjs`
- Modify: `scripts/verificar-escenarios-tarjeta.mjs`
- Modify: `CLAUDE.md`
- Modify: `docs/features/compromisos.md:27,47`, `docs/features/movimientos.md:56`, `docs/features/medios-de-pago.md:43`

- [ ] **Step 1: Extender el seed**

Agregar a `scripts/seed-escenarios-tarjeta.mjs` una tarjeta con los ciclos irregulares reales de
la Visa de Galicia: cierres **23-jul / 20-ago / 24-sep**, vencimientos **31-jul / 28-ago / 2-oct**,
los tres `declared`. Más un resumen estimado futuro, para tener sobre qué probar el realineado.

El guard duro del seeder ya está y no se toca: el ref de producción está prohibido por constante.

- [ ] **Step 2: Extender el verificador con los cinco flujos**

En `scripts/verificar-escenarios-tarjeta.mjs`, contra el build local y con la sesión del demo:

1. **Declarar desde la ficha.** Corregir el cierre de septiembre de 20 a 24 y el vencimiento al
   2 de octubre. Verificar en la base que la fila quedó `source: 'declared'` y que **ninguna
   transacción cambió de `cycle_id`** (contar antes y después: idéntico).
2. **Cambiar los días de la tarjeta.** Editar el vencimiento y verificar que los resúmenes futuros
   estimados se re-fecharon, que el declarado **no** se movió y que los pasados tampoco.
3. **El paso opcional al pagar.** Abrir el diálogo de pago, confirmar sin tocar el paso, y
   verificar que el resumen siguiente **sigue** `generated`. Este es el assert que prueba el
   requisito del spec: darle «Pagué» de largo nunca convierte una estimación en dato declarado.
4. **Declarar desde el pago.** Repetir abriendo «Lo tengo a mano, lo cargo» y verificar que ahora
   sí quedó `declared`.
5. **El recordatorio.** Con un resumen estimado ya cerrado, verificar que el aviso aparece, que
   «Ahora no» lo hace desaparecer, y que **sigue sin aparecer al recargar** (que es lo que
   `localStorage` no daría).

Cada botón nuevo, medido en el DOM: **≥44 píxeles**. Y ningún `DialogContent` sin descripción
accesible, que fue el otro defecto del popup de novedades.

- [ ] **Step 3: Actualizar la documentación**

- `CLAUDE.md`, sección «Fechas y ciclos de tarjeta»: que declarar existe, dónde se declara, y que
  cambiar los días de la tarjeta re-fecha **sólo** los resúmenes futuros estimados.
- `docs/features/compromisos.md:47`: dice «Guard anti-duplicado: un pago por tarjeta por mes».
  Es por `cycle_id` desde el Plan 1.
- `docs/features/compromisos.md:27`: nombrar `expectedChargeDatePorCiclo` junto a `expectedChargeDate`.
- `docs/features/movimientos.md:56` y `docs/features/medios-de-pago.md:43`: describen el asignador
  de medio default recalculando la fecha; desde el Plan 1 imputa cada fila a su resumen.
- `docs/features/medios-de-pago.md`: la ficha muestra y corrige las fechas del resumen.

- [ ] **Step 4: Correr el gate entero**

```bash
npm test && npm run lint && npx tsc --noEmit && npm run build
node scripts/seed-escenarios-tarjeta.mjs
npx next start -p 3100 &
VERIFY_BASE_URL=http://localhost:3100 node scripts/verificar-escenarios-tarjeta.mjs
```

Expected: los cinco flujos en verde. **Dejar DEV como estaba**: re-purgar y `npm run seed:demo`.

- [ ] **Step 5: Commitear**

```bash
git add scripts/ CLAUDE.md docs/features/
git commit -m "test(ciclos): gate visual de declarar resumenes, y docs al dia"
```

---

## Orden de salida

Distinto del Plan 1, y a propósito: Lauti fijó que producción recibe funcionalidades enteras.

1. Las diez tasks mergeadas a `master`, con el gate visual en verde.
2. La migración de la Task 7 (`reminder_dismissed_at`) a **producción**, antes de publicar.
   Es aditiva y compatible hacia atrás: el deploy vigente ignora la columna.
3. Mover la `fecha` de la versión 1.0.0 en `src/lib/novedades/versiones.ts` al día real del
   release. Quien se registre entre la fecha escrita y la publicación no vería el popup, porque
   la condición pide que la versión sea posterior a su alta.
4. Reescribir el changelog de la 1.0.0: hoy dice «Las tarjetas ahora cuentan bien los dólares»,
   que es el Plan 1. Con esto adentro, lo que el usuario nota es poder cargar las fechas de su
   resumen.
5. `git checkout produccion && git merge master && git push`.
6. Después del deploy, **re-correr los Steps 2-5 del backfill** desde el editor SQL
   (`20260902011311`, idempotentes): barren las filas que el código viejo creó con `cycle_id`
   NULL en la ventana entre la migración y el deploy.

> **Nunca «Promote to Production» un preview** desde el panel de Vercel: se construyó contra DEV y
> los `NEXT_PUBLIC_*` quedan incrustados en el build.

---

## Fuera de alcance

**Las otras dos pantallas del spec**, cada una con su plan:

- **Detalle de la tarjeta agrupado por resumen** (Plan 3). `payment-method-detail-modal.tsx`
  renderiza hoy una lista plana (L149-184) y ni menciona ciclos. El spec pide agrupar por resumen
  con navegación entre ellos, y mostrar «sin fecha de compra» donde no se sabe. Depende de este
  plan: sin resúmenes declarados no hay nada distinto que mostrar.
- **Mover una compra al resumen vecino** (Plan 4), con la regla de que mover una cuota corre el
  plan entero. Es corrección de casos de borde; declarar hacia adelante ya imputa bien.

**El gráfico «¿Llegás a fin de mes?» del inicio.** Medido el 2026-09-02: el Plan 1 lo movió de
$17.589.330,80 a $13.328.640,00 para una cuenta real. La causa es que
`getMonthlySpendingPace` (`financeStore.ts:1713`) acumula por el **día** de `periodDate`, y
`periodDate` pasó de ser el vencimiento a ser el cierre. Ninguna de las dos fechas es «cuándo
gastaste»: el dato correcto es `purchase_date`, que existe desde el Plan 1 pero sólo en 332 de
las transacciones. **Qué mostrar para las otras es una decisión de producto, no de implementación**,
y merece su propio brainstorming. No entra acá porque el cambio actual no es incorrecto, sólo
distinto, y elegir mal deja un número peor que el de hoy.

**Los recargos de compras en dólares** (entre 27% y 47% de desvío contra el resumen del banco) y
la **conciliación contra el total del resumen**, los dos ya fuera de alcance en el spec original.

**Los minors diferidos del Plan 1** que no toca este plan: `asegurar.ts` descarta el `select('*')`
del upsert; keys duplicadas en `balance-card.tsx` con ritmo irregular; el `desde` del sync que
ignora `floorMonth`; el comentario contradictorio en `register-card-payment-dialog.tsx:43`; los
fixtures muertos en `handleCardConfig.test.ts:113`; el cuarto `eslint-disable` de
`asegurar.test.ts`; y alinear `generarCiclos` con `calculateCreditPaymentDate` cuando
`paymentDay === closingDay` (hoy 0 tarjetas en producción caen ahí).

---

## Self-review

**Cobertura del spec.** Las secciones del spec y dónde caen:

| Sección del spec | Task |
|---|---|
| Invariante central, segunda mitad (actualizar futuros `generated`) | 2 (regla), 3 (al declarar), 4 (al editar la tarjeta) |
| `declararCiclo(methodId, closingDate, dueDate)` | 3 |
| Pantalla 1a: paso opcional en el diálogo de pago | 6 |
| Pantalla 1b: recordatorio el día del cierre, con «Ahora no» | 7 |
| Pantalla 1c: fechas en la ficha, marcadas «del resumen» / «estimado» | 5 |
| «Confirmar exige un gesto» | 6 (diseño), 10 (assert 3 del gate visual) |
| Gate visual obligatorio con ciclos irregulares reales | 10 |
| Pantalla 2 (detalle por resumen) | **Plan 3**, declarado arriba |
| Pantalla 3 (mover al resumen vecino) y E15 | **Plan 4**, declarado arriba |
| `reasignarTransaccion(transactionId, cycleId)` | **Plan 4** |

**Consistencia de tipos.** `CreditCardCycle` es `Database['public']['Tables']['credit_card_cycles']['Row']`
(`cycles.ts:14`), así que al sumarle `reminder_dismissed_at` en la Task 7 el tipo se propaga solo.
Los fixtures de las tasks 2, 3 y 6 se escriben **antes** de esa columna, así que quedan sin el
campo: cuando la Task 7 lo agregue, TypeScript va a marcarlos y hay que sumarles
`reminder_dismissed_at: null`. **Está anotado a propósito** en vez de anticiparlo, porque escribir
el campo antes de que la columna exista rompería la compilación de las tasks 2 a 6.

`CambioDeCiclo` (Task 2) se consume sólo dentro de `declarar.ts` (Task 3). `ResolucionDeCiclo`
(Task 1) no lo usa ninguna task posterior.

**Dependencias entre tasks.** 1 es independiente y puede ir primera o última. 2 → 3 → 4. 5 produce
`CicloFechasField`, que consumen 6 y 7. 8 y 9 son independientes de todo el resto. 10 va última.
El orden recomendado es el numérico.
