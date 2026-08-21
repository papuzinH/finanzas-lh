# Disponible anclado — Onboarding, conciliación y el número en pantalla · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poner el modelo de bolsillo en manos del usuario: que declare sus saldos y su ritmo de cobro (onboarding y puesta a punto), que pueda reconciliar cuando el número no cierra, y que el disponible que ve en Inicio sea el del bolsillo, con el comprometido del próximo período al lado.

**Architecture:** El motor ya existe (`src/lib/finance/pocket.ts`, Plan 1). Este plan (a) corrige dos bugs del motor que solo aparecen contra datos reales, (b) agrega las funciones puras que faltan —convertir un saldo declarado en ancla, decidir las opciones de conciliación—, (c) escribe los server actions que persisten esas decisiones y (d) recién entonces cambia la UI. Toda lógica sigue viviendo en `lib/finance/`; los componentes solo la muestran. No hay tests de componentes en el repo (no hay testing-library): lo que se testea son las funciones puras y los getters del store, y la UI se valida en el gate visual de Lauti.

**Tech Stack:** TypeScript, Next.js App Router, Zustand, Supabase (PostgreSQL), Vitest, date-fns, Zod, React Hook Form, framer-motion.

**Spec:** `docs/superpowers/specs/2026-08-20-disponible-real-anclado-design.md`
**Plan previo (ya en producción):** `docs/superpowers/plans/2026-08-20-disponible-anclado-fundacion.md`

## Global Constraints

- **Baseline de verificación por task**: `npm run lint` = **24 errores / 11 warnings exactos** · `npx tsc --noEmit` limpio · `npx vitest run` verde (**416 tests / 36 archivos** al arrancar este plan, más los que agregue cada task) · `npm run build` OK.
- **No existe base DEV**: cualquier SQL va a producción. Este plan agrega **una sola** columna, aditiva y con default. Flujo obligatorio del CLAUDE.md: `set -a; . ./.env.local; set +a` → `supabase migration new` → escribir SQL → `supabase db push --linked` → `supabase migration list --linked` (Local y Remote deben coincidir).
- **`amount` se guarda SIEMPRE positivo**: el signo lo lleva `type` (`'income' | 'expense'`). Verificado contra la base el 2026-08-20: 794 gastos, **0** con monto negativo. Ninguna función nueva puede asumir montos con signo.
- **`transactions.category_id` es NOT NULL**: toda transacción que cree este plan necesita una categoría (patrón get-or-create, igual que "Pagos de tarjeta" en `src/app/compromisos/actions.ts`).
- Toda lógica financiera va en `src/lib/finance/`. El store solo envuelve. Nada de cálculo en componentes.
- Tipos de `src/types/database.ts`. Nunca `any`.
- **Tokens semánticos siempre** (`bg-surface`, `text-muted`, `text-good/bad/warn`, `border-[1.5px] border-border`). Prohibido `emerald-*`, `rose-*`, `indigo-*`, `slate-*` y las utilities `dark:`. Tipografía por rol: `font-display` (cifras y títulos, sin `font-bold`), `font-sans` (UI), `tnum` en todo número financiero. Mobile-first: canvas 390px, `px-5`, touch targets ≥44px.
- **Una sola cifra con `--shadow-bandera` por pantalla.** En Inicio ya la lleva el hero del `BalanceCard`: no agregar otra.
- El chancho es `<Chancho>` de `@/components/brand/chancho`, nunca `<img>`.
- **`computeGlobalBalance` y `getGlobalBalance` no se tocan**: quedan congelados como "el cálculo viejo" y se usan **solo** en la pantalla de puesta a punto para explicarle al usuario por qué cambió su número. `getRealAvailableBalance` se retira recién en la Task 14, después del gate visual.
- Los montos de los tests son ficticios. **No usar datos reales de Lauti: el repo es público.**
- Copy en rioplatense, tono natural, sin signos de exclamación de pitch.

---

## Task 1: `computeAccountBalance` dice la verdad contra los datos reales

El motor del Plan 1 tiene dos bugs que sus tests no podían ver, porque fabricaban los datos con una convención que la base no usa.

1. **El signo.** El código dice *"`amount` ya viene con signo (los gastos son negativos), por eso se suma directo"*. Es falso: `createTransactionSchema` exige `amount` positivo y ningún punto del código lo niega. Contra la base real, un gasto de $20.000 **sumaría** $20.000 al saldo.
2. **Las fechas futuras.** El saldo no tiene techo temporal, así que una cuota que vence en febrero de 2027 ya se está restando del saldo de hoy. En la base hay **8 transacciones futuras sobre medios de débito** (hasta 2027-02).

**Files:**
- Modify: `src/lib/finance/pocket.ts`
- Test: `src/lib/finance/__tests__/pocket.test.ts`

**Interfaces:**
- Consumes: `PaymentMethod`, `InternalTransfer` de `@/types/database`; `ProcessedTransaction` de `../types`.
- Produces: `computeAccountBalance(method, transactions, transfers, now?: Date): number` — la firma gana un cuarto parámetro **opcional** (`now`, default `new Date()`), así que ninguna llamada existente rompe.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final del `describe('computeAccountBalance', ...)` en `src/lib/finance/__tests__/pocket.test.ts`:

```ts
  const NOW_T1 = new Date(2026, 7, 20); // 20-ago-2026

  it('resta un gasto guardado con monto POSITIVO: el signo lo lleva `type`, no el monto', () => {
    // Convencion real de la base (verificada 2026-08-20): 794 gastos, 0 con monto negativo.
    const r = computeAccountBalance(method(), [
      tx({ id: 'a', type: 'income', amount: 50000, date: '2026-08-10', periodDate: '2026-08-10' }),
      tx({ id: 'b', type: 'expense', amount: 20000, date: '2026-08-10', periodDate: '2026-08-10' }),
    ], [], NOW_T1);
    expect(r).toBe(30000);
  });

  it('ignora los movimientos futuros: una cuota que vence en 2027 todavia no salio de la cuenta', () => {
    const m = method({ initial_balance: 100000, initial_balance_at: '2026-08-01' });
    const r = computeAccountBalance(m, [
      tx({ id: 'hoy', type: 'expense', amount: 10000, date: '2026-08-20', periodDate: '2026-08-20' }),
      tx({ id: 'futura', type: 'expense', amount: 999999, date: '2027-02-01', periodDate: '2027-02-01' }),
    ], [], NOW_T1);
    expect(r).toBe(90000);
  });

  it('ignora las transferencias con fecha futura', () => {
    const transfers = [
      { id: 'tr1', amount: 20000, from_payment_method_id: 'm1', to_payment_method_id: 'm2', real_transfer_date: '2026-08-05' },
      { id: 'tr2', amount: 777777, from_payment_method_id: 'm1', to_payment_method_id: 'm2', real_transfer_date: '2026-12-01' },
    ] as InternalTransfer[];
    const r = computeAccountBalance(
      method({ initial_balance: 100000, initial_balance_at: '2026-08-01' }),
      [], transfers, NOW_T1,
    );
    expect(r).toBe(80000);
  });

  it('el movimiento de HOY si cuenta (el techo es hoy inclusive)', () => {
    const m = method({ initial_balance: 100000, initial_balance_at: '2026-08-01' });
    const r = computeAccountBalance(m, [
      tx({ id: 'hoy', type: 'expense', amount: 5000, date: '2026-08-20', periodDate: '2026-08-20' }),
    ], [], NOW_T1);
    expect(r).toBe(95000);
  });
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run src/lib/finance/__tests__/pocket.test.ts`
Expected: FAIL. El primero da `70000` (suma el gasto en vez de restarlo); el segundo da `-909999`; el tercero `-697777`. El cuarto pasa desde ya.

- [ ] **Step 3: Implementar**

En `src/lib/finance/pocket.ts`, agregar `startOfDay` al import de `date-fns` y reemplazar el cuerpo de `computeAccountBalance` completo por:

```ts
/**
 * Saldo de una cuenta, al día de `now`.
 *
 * Ventana de cómputo: **desde el ancla (inclusive) hasta hoy (inclusive)**.
 * - Antes del ancla: no se cuenta, ya está representado dentro de `initial_balance`.
 * - Sin `initial_balance_at` no hay piso: suma todo el historial hasta hoy, que es el
 *   comportamiento previo al modelo de bolsillo (cuenta "sin anclar").
 * - Después de hoy: no se cuenta. Una cuota que vence en febrero todavía no salió de
 *   la cuenta; restarla haría que el saldo de hoy mienta hacia abajo.
 *
 * El signo lo lleva `type`, NUNCA el monto: `amount` se guarda siempre positivo
 * (verificado contra la base el 2026-08-20: 794 gastos, 0 con monto negativo).
 *
 * Se usa `t.date` (la fecha real del movimiento) y no `periodDate` (la fecha visual del
 * ciclo de tarjeta): el saldo de una cuenta se mueve cuando la plata se mueve. Para los
 * medios no-crédito —los únicos que tienen saldo— ambas coinciden.
 */
export function computeAccountBalance(
  method: PaymentMethod,
  transactions: ProcessedTransaction[],
  transfers: InternalTransfer[],
  now: Date = new Date(),
): number {
  const anchor = method.initial_balance_at ? startOfDay(parseLocalDate(method.initial_balance_at)) : null;
  const base = anchor ? Number(method.initial_balance) : 0;
  const today = startOfDay(now);

  const inWindow = (dateStr: string | null | undefined) => {
    if (!dateStr) return false;
    const d = startOfDay(parseLocalDate(dateStr));
    if (d > today) return false;
    return anchor ? d >= anchor : true;
  };

  const movements = transactions
    .filter((t) => t.payment_method_id === method.id)
    .filter((t) => inWindow(t.date))
    .reduce((acc, t) => {
      const amount = Math.abs(Number(t.amount));
      return t.type === 'income' ? acc + amount : acc - amount;
    }, 0);

  const transfersDelta = transfers.reduce((acc, tr) => {
    if (!inWindow(tr.real_transfer_date)) return acc;
    const amount = Math.abs(Number(tr.amount));
    if (tr.from_payment_method_id === method.id) return acc - amount;
    if (tr.to_payment_method_id === method.id) return acc + amount;
    return acc;
  }, 0);

  return base + movements + transfersDelta;
}
```

- [ ] **Step 4: Pasarle el `now` desde `computeAvailableToSpend`**

En la misma función `computeAvailableToSpend`, dentro del `.map(...)` que arma `accounts`, cambiar:

```ts
      balance: computeAccountBalance(m, transactions, transfers),
```

por:

```ts
      balance: computeAccountBalance(m, transactions, transfers, now),
```

- [ ] **Step 5: Correr y verificar que pasan**

Run: `npx vitest run src/lib/finance/__tests__/pocket.test.ts src/lib/finance/__tests__/escenarios-disponible.test.ts`
Expected: PASS. Los 6 tests originales de `computeAccountBalance` siguen verdes (usaban montos negativos, y `Math.abs` + `type` da el mismo resultado), los 4 nuevos pasan, y los 8 escenarios siguen verdes.

- [ ] **Step 6: Verificación completa**

Run: `npm run lint && npx tsc --noEmit && npx vitest run`
Expected: lint en baseline exacto (24/11), tsc limpio, **420 tests** verdes.

- [ ] **Step 7: Commitear**

```bash
git checkout master && git pull --ff-only && git checkout -b feat/disponible-anclado-ui
git add src/lib/finance/pocket.ts src/lib/finance/__tests__/pocket.test.ts
git commit -m "fix(finance): el saldo por cuenta usa el signo de type y no cuenta movimientos futuros"
```

---

## Task 2: los ajustes de saldo no ensucian las analíticas de consumo

El spec: *"Se excluyen de las analíticas de consumo por categoría, igual que los pagos de tarjeta."* Sin esto, un ajuste de −$50.000 aparecería como el gasto más grande del mes en el gráfico por categoría, y como "Variables mes" en el KPI de Inicio.

La columna `transactions.is_balance_adjustment` ya existe (Plan 1). Todavía nadie la escribe: esta task prepara el terreno para que cuando la Task 10 empiece a escribirla, no rompa nada.

**Files:**
- Modify: `src/lib/finance/creditCycle.ts:31-33`
- Modify: `src/lib/finance/analysis.ts:29`
- Modify: `src/lib/store/financeStore.ts` (`getGlobalEffectiveExpenses`, `getMonthlyIncome`, `getMonthlyIncomeTransactions`)
- Modify: `src/lib/ai/tools/readTools.ts:178` y `:409`
- Test: `src/lib/finance/__tests__/analysis.test.ts`, `src/lib/finance/__tests__/creditCycle.test.ts`

**Interfaces:**
- Consumes: `ProcessedTransaction.is_balance_adjustment` (columna del Plan 1).
- Produces: nada nuevo — cambia el comportamiento de funciones existentes.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `src/lib/finance/__tests__/creditCycle.test.ts`, dentro del describe de `isExpenseInCurrentMonthScope` (copiar el helper `tx` que ya usa ese archivo; si el helper local no acepta `is_balance_adjustment`, castear el objeto con `as ProcessedTransaction`):

```ts
  it('un ajuste de saldo NO es consumo del mes: no participa de las analiticas', () => {
    const ajuste = {
      id: 'aj', user_id: 'u1', type: 'expense', amount: 50000,
      date: '2026-08-19', periodDate: '2026-08-19', realPaymentDate: '2026-08-19',
      payment_method_id: 'deb', category_id: 'c1',
      installment_plan_id: null, recurring_plan_id: null, card_payment_for: null,
      is_balance_adjustment: true,
    } as unknown as ProcessedTransaction;
    expect(isExpenseInCurrentMonthScope(ajuste, [], new Date(2026, 7, 20))).toBe(false);
  });
```

Agregar a `src/lib/finance/__tests__/analysis.test.ts`, dentro del describe de `computeExpensesByCategory`:

```ts
  it('los ajustes de saldo quedan fuera del desglose por categoria, en gasto y en ingreso', () => {
    const cats = [{ id: 'c1', name: 'Supermercado' }] as unknown as Category[];
    const ajusteGasto = {
      id: 'aj1', user_id: 'u1', type: 'expense', amount: 50000,
      date: '2026-08-19', periodDate: '2026-08-19', realPaymentDate: '2026-08-19',
      payment_method_id: 'deb', category_id: 'c1',
      installment_plan_id: null, recurring_plan_id: null, card_payment_for: null,
      is_balance_adjustment: true,
    } as unknown as ProcessedTransaction;
    const ajusteIngreso = { ...ajusteGasto, id: 'aj2', type: 'income' } as ProcessedTransaction;

    expect(computeExpensesByCategory([ajusteGasto], [], cats, 'global', 'expense', new Date(2026, 7, 20))).toEqual({});
    expect(computeExpensesByCategory([ajusteIngreso], [], cats, 'global', 'income', new Date(2026, 7, 20))).toEqual({});
  });
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run src/lib/finance/__tests__/creditCycle.test.ts src/lib/finance/__tests__/analysis.test.ts`
Expected: FAIL — el de creditCycle devuelve `true`, el de analysis devuelve `{ Supermercado: 50000 }`.

- [ ] **Step 3: Implementar en las funciones puras**

En `src/lib/finance/creditCycle.ts`, dentro de `isExpenseInCurrentMonthScope`, justo debajo de la línea `if (t.card_payment_for) return false;`:

```ts
  // Un ajuste de saldo tampoco es consumo: corrige el saldo declarado, no compra nada.
  if (t.is_balance_adjustment) return false;
```

En `src/lib/finance/analysis.ts`, en `computeExpensesByCategory`, cambiar:

```ts
      if (t.type !== type || t.card_payment_for) return false
```

por:

```ts
      if (t.type !== type || t.card_payment_for || t.is_balance_adjustment) return false
```

Y actualizar el comentario del bloque de arriba (línea ~15) para que diga:

```ts
 * - Excluye siempre pagos de tarjeta (card_payment_for) y ajustes de saldo
 *   (is_balance_adjustment): ninguno de los dos es consumo nuevo.
```

- [ ] **Step 4: Implementar en el store**

En `src/lib/store/financeStore.ts`:

`getGlobalEffectiveExpenses` (≈ línea 963):

```ts
      .filter((t) => t.type === 'expense' && !t.installment_plan_id && !t.card_payment_for && !t.is_balance_adjustment)
```

`getMonthlyIncome` (≈ línea 1141) y `getMonthlyIncomeTransactions` (≈ línea 1152): en ambos, cambiar la primera línea del filtro:

```ts
        if (t.type !== 'income') return false;
```

por:

```ts
        if (t.type !== 'income' || t.is_balance_adjustment) return false;
```

(en `getMonthlyIncomeTransactions` el filtro está escrito como arrow con `return`; el reemplazo es idéntico).

`getMonthlyVariableExpenses` y `getMonthlyVariableExpenseTransactions` **no se tocan**: ya filtran por `isExpenseInCurrentMonthScope`, que quedó cubierto en el Step 3.

- [ ] **Step 5: Implementar en el chat**

En `src/lib/ai/tools/readTools.ts`, línea ≈178:

```ts
        .filter((t) => t.type === 'expense' && !t.card_payment_for && !t.is_balance_adjustment)
```

y línea ≈409:

```ts
          (t) =>
            t.type === 'expense' &&
            !t.card_payment_for &&
            !t.is_balance_adjustment &&
            (t.periodDate || t.date).slice(0, 7) === currentMonth,
```

- [ ] **Step 6: Correr y verificar**

Run: `npm run lint && npx tsc --noEmit && npx vitest run`
Expected: lint en baseline, tsc limpio, **422 tests** verdes.

- [ ] **Step 7: Commitear**

```bash
git add src/lib/finance src/lib/store/financeStore.ts src/lib/ai/tools/readTools.ts
git commit -m "feat(finance): los ajustes de saldo quedan fuera de las analiticas de consumo"
```

---

## Task 3: convertir un saldo declarado en ancla (TDD)

Cuando el usuario dice *"tengo $10.600 ahora"*, no se puede guardar `initial_balance = 10600` con `initial_balance_at = hoy` sin más: `computeAccountBalance` cuenta los movimientos de hoy **inclusive**, así que un gasto ya registrado hoy se restaría dos veces (una dentro del saldo que el usuario leyó del banco, otra por la transacción).

La conversión correcta: `initial_balance` = el saldo **al comienzo** del día del ancla = lo declarado menos lo que ya se movió desde el ancla. Así vale el invariante: *anclar con lo declarado deja el saldo calculado exactamente en lo declarado*.

**Files:**
- Modify: `src/lib/finance/pocket.ts`
- Test: `src/lib/finance/__tests__/pocket.test.ts`

**Interfaces:**
- Consumes: `computeAccountBalance` (Task 1).
- Produces:
  - `anchorValueForDeclaredBalance(declaredBalance: number, method: PaymentMethod, transactions: ProcessedTransaction[], transfers: InternalTransfer[], anchorDate: string, now?: Date): number` — la usan las Tasks 6, 8 y 9.
  - `AccountBalance` gana el campo `anchored: boolean`. Lo usan las Tasks 12 y 13.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `src/lib/finance/__tests__/pocket.test.ts`:

```ts
import { anchorValueForDeclaredBalance } from '../pocket';

describe('anchorValueForDeclaredBalance', () => {
  const NOW_T3 = new Date(2026, 7, 20); // 20-ago-2026
  const HOY = '2026-08-20';

  it('sin movimientos del dia, el ancla ES el saldo declarado', () => {
    const r = anchorValueForDeclaredBalance(10600, method({ id: 'm1' }), [], [], HOY, NOW_T3);
    expect(r).toBe(10600);
  });

  it('INVARIANTE: anclar con lo declarado deja el saldo calculado exactamente en lo declarado', () => {
    const base = method({ id: 'm1' });
    const txs = [
      tx({ id: 'hoy', type: 'expense', amount: 5000, date: HOY, periodDate: HOY }),
      tx({ id: 'ayer', type: 'expense', amount: 7000, date: '2026-08-19', periodDate: '2026-08-19' }),
    ];
    const value = anchorValueForDeclaredBalance(10600, base, txs, [], HOY, NOW_T3);
    const anclado = { ...base, initial_balance: value, initial_balance_at: HOY };
    expect(computeAccountBalance(anclado, txs, [], NOW_T3)).toBe(10600);
  });

  it('un movimiento registrado DESPUES del ancla, el mismo dia, si mueve el saldo', () => {
    const base = method({ id: 'm1' });
    const previos = [tx({ id: 'hoy', type: 'expense', amount: 5000, date: HOY, periodDate: HOY })];
    const value = anchorValueForDeclaredBalance(10600, base, previos, [], HOY, NOW_T3);
    const anclado = { ...base, initial_balance: value, initial_balance_at: HOY };
    const nuevo = tx({ id: 'nuevo', type: 'expense', amount: 1000, date: HOY, periodDate: HOY });
    expect(computeAccountBalance(anclado, [...previos, nuevo], [], NOW_T3)).toBe(9600);
  });

  it('descuenta tambien las transferencias del dia del ancla', () => {
    const base = method({ id: 'm1' });
    const transfers = [
      { id: 'tr', amount: 3000, from_payment_method_id: 'm1', to_payment_method_id: 'm2', real_transfer_date: HOY },
    ] as InternalTransfer[];
    const value = anchorValueForDeclaredBalance(10600, base, [], transfers, HOY, NOW_T3);
    expect(value).toBe(13600);
    const anclado = { ...base, initial_balance: value, initial_balance_at: HOY };
    expect(computeAccountBalance(anclado, [], transfers, NOW_T3)).toBe(10600);
  });

  it('ignora los movimientos de OTRO medio', () => {
    const r = anchorValueForDeclaredBalance(
      10600, method({ id: 'm1' }),
      [tx({ id: 'otro', type: 'expense', amount: 99999, payment_method_id: 'm9', date: HOY, periodDate: HOY })],
      [], HOY, NOW_T3,
    );
    expect(r).toBe(10600);
  });
});

describe('computeAvailableToSpend · anclaje', () => {
  const now = new Date(2026, 7, 20);

  it('cada cuenta dice si esta anclada o no', () => {
    const anclada = method({ id: 'a', initial_balance: 1000, initial_balance_at: '2026-08-01' });
    const suelta = method({ id: 'b', initial_balance: 0, initial_balance_at: null });
    const r = computeAvailableToSpend({
      paymentMethods: [anclada, suelta], transactions: [], transfers: [],
      recurringPlans: [], pendingCards: [], rhythm: 'monthly', now,
    });
    expect(r.accounts.find((a) => a.methodId === 'a')?.anchored).toBe(true);
    expect(r.accounts.find((a) => a.methodId === 'b')?.anchored).toBe(false);
  });

  it('un compromiso personal no es una cuenta con plata: queda afuera del bolsillo', () => {
    // "Le debo a Juan" es un medio is_personal. Sumarlo al bolsillo diria que tenes
    // plata que no tenes (o que te falta plata que no te falta).
    const cuenta = method({ id: 'a', initial_balance: 100000, initial_balance_at: '2026-08-01' });
    const juan = method({ id: 'juan', name: 'Le debo a Juan', is_personal: true });
    const r = computeAvailableToSpend({
      paymentMethods: [cuenta, juan],
      transactions: [tx({ id: 'g', type: 'expense', amount: 30000, payment_method_id: 'juan', date: '2026-08-10', periodDate: '2026-08-10' })],
      transfers: [], recurringPlans: [], pendingCards: [], rhythm: 'monthly', now,
    });
    expect(r.accounts.map((a) => a.methodId)).toEqual(['a']);
    expect(r.pocketTotal).toBe(100000);
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run src/lib/finance/__tests__/pocket.test.ts`
Expected: FAIL — `anchorValueForDeclaredBalance` no existe y `anchored` no está en `AccountBalance`.

- [ ] **Step 3: Implementar**

En `src/lib/finance/pocket.ts`, agregar debajo de `computeAccountBalance`:

```ts
/**
 * Traduce "el saldo que tengo AHORA" al valor que hay que guardar en `initial_balance`.
 *
 * `computeAccountBalance` cuenta los movimientos del día del ancla, así que guardar el
 * saldo declarado tal cual restaría dos veces lo que el usuario ya registró hoy: una
 * dentro del saldo que leyó del banco, otra por la transacción. El ancla que se guarda
 * es entonces el saldo **al comienzo** del día.
 *
 * Invariante: `computeAccountBalance` sobre el medio anclado con este valor devuelve
 * exactamente `declaredBalance`.
 */
export function anchorValueForDeclaredBalance(
  declaredBalance: number,
  method: PaymentMethod,
  transactions: ProcessedTransaction[],
  transfers: InternalTransfer[],
  anchorDate: string,
  now: Date = new Date(),
): number {
  const movimientosDesdeElAncla = computeAccountBalance(
    { ...method, initial_balance: 0, initial_balance_at: anchorDate },
    transactions,
    transfers,
    now,
  );
  return declaredBalance - movimientosDesdeElAncla;
}
```

En la interfaz `AccountBalance`, agregar el campo:

```ts
export interface AccountBalance {
  methodId: string;
  name: string;
  bucket: 'pocket' | 'reserve';
  balance: number;
  /** false = sin saldo declarado: el saldo se suma desde el primer movimiento (el modelo viejo). */
  anchored: boolean;
}
```

Y en `computeAvailableToSpend`, cambiar el filtro y sumar el campo:

```ts
  // Las tarjetas de crédito no tienen saldo propio: su deuda se deriva del ciclo.
  // Los compromisos personales ("le debo a Juan") tampoco son cuentas con plata.
  const accounts: AccountBalance[] = paymentMethods
    .filter((m) => m.type !== 'credit' && !m.is_personal)
    .map((m) => ({
      methodId: m.id,
      name: m.name,
      bucket: m.bucket,
      balance: computeAccountBalance(m, transactions, transfers, now),
      anchored: m.initial_balance_at !== null,
    }));
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npx vitest run src/lib/finance/__tests__/pocket.test.ts`
Expected: PASS (7 nuevos + los anteriores).

- [ ] **Step 5: Verificación y commit**

Run: `npm run lint && npx tsc --noEmit && npx vitest run`
Expected: lint en baseline, tsc limpio, **429 tests** verdes.

```bash
git add src/lib/finance/pocket.ts src/lib/finance/__tests__/pocket.test.ts
git commit -m "feat(finance): ancla derivada del saldo declarado + flag anchored por cuenta"
```

---

## Task 4: los dos invariantes de pago, en el modelo nuevo

El modelo viejo tenía una garantía que la gente usaba sin saberlo: **pagar algo que ya estaba comprometido no mueve el disponible**. Si al pagar la tarjeta el número bajara, el usuario perdería la confianza en él. Antes lo cubría `src/lib/store/__tests__/disponible-real.test.ts`, que se retira en la Task 14; hay que trasladar la garantía al modelo nuevo antes de tocar la UI.

**Files:**
- Modify: `src/lib/finance/__tests__/escenarios-disponible.test.ts`

**Interfaces:**
- Consumes: `computeAvailableToSpend` (Plan 1), helpers `acct`/`fixed`/`summary`/`run` ya definidos en ese archivo.

- [ ] **Step 1: Escribir los tests**

Agregar a `src/lib/finance/__tests__/escenarios-disponible.test.ts`, antes del describe de integración con el store:

```ts
describe('E8 — pagar la tarjeta no mueve el disponible', () => {
  it('el pago baja el saldo del medio financiador y saca la tarjeta de los compromisos: neto cero', () => {
    const cuentas = [
      acct({ initial_balance: 300000 }),
      acct({ id: 'cred', name: 'Tarjeta', type: 'credit', is_default: false }),
    ];
    const resumen = summary({ totalARS: 100000, total: 100000, nextPaymentDate: new Date(2026, 7, 28) });

    const antes = run({ paymentMethods: cuentas, pendingCards: [resumen] });

    // Pagar = una transaccion real en el medio financiador + la tarjeta deja de estar pendiente.
    const pago = {
      id: 'pago', user_id: 'u1', type: 'expense', amount: 100000,
      date: '2026-08-20', periodDate: '2026-08-20', realPaymentDate: '2026-08-20',
      payment_method_id: 'poc', category_id: 'c1', card_payment_for: 'cred',
      installment_plan_id: null, recurring_plan_id: null, is_balance_adjustment: false,
    } as ProcessedTransaction;
    const despues = run({
      paymentMethods: cuentas,
      transactions: [pago],
      pendingCards: [{ ...resumen, isPending: false }],
    });

    expect(antes.available).toBe(200000);
    expect(despues.available).toBe(200000);
    expect(despues.pocketTotal).toBe(200000);
    expect(despues.committed).toBe(0);
  });
});

describe('E9 — marcar una mensualidad como pagada no mueve el disponible', () => {
  it('la transaccion baja el saldo y el fijo deja de estar pendiente: neto cero', () => {
    const cuentas = [acct({ initial_balance: 300000 })];
    const plan = fixed({ id: 'alquiler', description: 'Alquiler', amount: 80000 });

    const antes = run({ paymentMethods: cuentas, recurringPlans: [plan] });

    const pago = {
      id: 'pago-fijo', user_id: 'u1', type: 'expense', amount: 80000,
      date: '2026-08-20', periodDate: '2026-08-20', realPaymentDate: '2026-08-20',
      payment_method_id: 'poc', category_id: 'c1', recurring_plan_id: 'alquiler',
      installment_plan_id: null, card_payment_for: null, is_balance_adjustment: false,
    } as ProcessedTransaction;
    const despues = run({ paymentMethods: cuentas, recurringPlans: [plan], transactions: [pago] });

    expect(antes.available).toBe(220000);
    expect(despues.available).toBe(220000);
    expect(despues.committed).toBe(0);
  });
});
```

- [ ] **Step 2: Correr**

Run: `npx vitest run src/lib/finance/__tests__/escenarios-disponible.test.ts`
Expected: PASS. **Si alguno falla, el modelo tiene un problema real: no ajustar el test para que pase** — volver a `computeCommitments`/`computeAccountBalance` y entender por qué.

- [ ] **Step 3: Verificación y commit**

Run: `npx vitest run`
Expected: **431 tests** verdes.

```bash
git add src/lib/finance/__tests__/escenarios-disponible.test.ts
git commit -m "test(finance): pagar tarjeta o mensualidad no mueve el disponible del bolsillo"
```

---

## Task 5: migración `pocket_setup_completed` + tipos

El usuario existente necesita pasar una vez por la puesta a punto. La señal no se puede derivar de los datos: alguien que **saltea** el flujo queda igual que alguien que no lo vio nunca, y el flujo le aparecería para siempre.

**Files:**
- Create: `supabase/migrations/<timestamp>_add_pocket_setup_flag.sql`
- Modify: `src/types/database.ts`

**Interfaces:**
- Produces: `users.pocket_setup_completed: boolean`. Lo consumen las Tasks 6, 8, 9.

- [ ] **Step 1: Crear el archivo de migración**

```bash
set -a; . ./.env.local; set +a
supabase migration new add_pocket_setup_flag
```

- [ ] **Step 2: Escribir el SQL**

```sql
-- Marca si el usuario ya paso por la puesta a punto del modelo de bolsillo.
-- No se puede derivar de los datos: alguien que SALTEA el flujo queda indistinguible
-- de alguien que nunca lo vio, y el flujo le aparecería para siempre.
-- Aditiva, con default: los usuarios existentes arrancan en false (les toca el flujo);
-- el onboarding de los nuevos la deja en true al terminar.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pocket_setup_completed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN users.pocket_setup_completed IS
  'true = el usuario ya declaro sus saldos, reservas y ritmo (o salteo el flujo). false = el middleware lo manda a /puesta-a-punto.';
```

- [ ] **Step 3: Aplicar y verificar el registro**

```bash
supabase db push --linked
supabase migration list --linked
```
Expected: la versión nueva aparece con Local = Remote. Si el CLI da `403`, el PAT es de la cuenta equivocada; si da `PgClient: Failed to connect`, el password está mal (ver CLAUDE.md: son dos errores distintos).

- [ ] **Step 4: Verificar contra la base**

```bash
supabase db push --linked --dry-run
```
Expected: "Remote database is up to date".

- [ ] **Step 5: Actualizar los tipos**

En `src/types/database.ts`, dentro de `users`, agregar la columna en las tres formas (`Row`, `Insert`, `Update`), respetando el orden alfabético que ya usa el archivo — va entre `onboarding_completed` y `telegram_chat_id`:

```ts
        // Row
          pocket_setup_completed: boolean
        // Insert
          pocket_setup_completed?: boolean
        // Update
          pocket_setup_completed?: boolean
```

- [ ] **Step 6: Verificación y commit**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: tsc limpio, lint en baseline, 431 tests verdes.

```bash
git add supabase/migrations src/types/database.ts
git commit -m "feat(db): flag de puesta a punto del modelo de bolsillo"
```

---

## Task 6: server actions del bolsillo

Un único archivo con las escrituras del modelo: anclar cuentas, guardar el ritmo y cerrar la puesta a punto. Lo consumen el onboarding, la puesta a punto, Ajustes y el diálogo de conciliación.

**El valor del ancla se calcula en el cliente**, no acá: el store ya tiene las transacciones procesadas por el mismo pipeline que el usuario está mirando, así que el número que se guarda es exactamente el que vio. El server valida y persiste. No hay problema de confianza: es el saldo que el propio usuario declara, y la RLS ya lo acota a sus filas.

**Files:**
- Create: `src/app/bolsillo/actions.ts`

**Interfaces:**
- Consumes: `createClient` de `@/utils/supabase/server`; Zod.
- Produces:
  - `saveAccountAnchors(anchors: AccountAnchorInput[]): Promise<ActionResponse>`
  - `saveIncomeRhythm(rhythm: string): Promise<ActionResponse>` — recibe `string` y valida con Zod contra los cuatro ritmos; los callers le pasan un `IncomeRhythm`, que es asignable
  - `completePocketSetup(): Promise<ActionResponse>`
  - `type AccountAnchorInput = { payment_method_id: string; bucket: 'pocket' | 'reserve'; initial_balance: number; initial_balance_at: string | null }`
  Las usan las Tasks 8, 9 y 11.

- [ ] **Step 1: Escribir el archivo**

```ts
// src/app/bolsillo/actions.ts
'use server'

import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

type ActionResponse = {
  error?: string
  success?: boolean
}

const accountAnchorSchema = z.object({
  payment_method_id: z.string().min(1),
  bucket: z.enum(['pocket', 'reserve']),
  /** Saldo al COMIENZO del día del ancla. Lo calcula el cliente con
   *  `anchorValueForDeclaredBalance` a partir de lo que declaró el usuario. */
  initial_balance: z.number(),
  /** null = el usuario salteó esta cuenta: queda sin anclar (suma desde el primer movimiento). */
  initial_balance_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
})

export type AccountAnchorInput = z.infer<typeof accountAnchorSchema>

const incomeRhythmSchema = z.enum(['monthly', 'biweekly', 'weekly', 'irregular'])

/**
 * Persiste el bucket y el saldo anclado de cada cuenta. Idempotente: se puede
 * volver a correr desde Ajustes cuantas veces haga falta.
 */
export async function saveAccountAnchors(anchors: AccountAnchorInput[]): Promise<ActionResponse> {
  try {
    const parsed = z.array(accountAnchorSchema).safeParse(anchors)
    if (!parsed.success) return { error: 'Datos inválidos' }
    if (parsed.data.length === 0) return { success: true }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    // Una tarjeta de crédito no tiene saldo propio: su deuda sale del ciclo.
    const { data: methods } = await supabase
      .from('payment_methods')
      .select('id, type')
      .eq('user_id', user.id)

    const byId = new Map((methods ?? []).map((m) => [m.id, m.type]))

    for (const a of parsed.data) {
      if (!byId.has(a.payment_method_id)) return { error: 'Ese medio de pago no es tuyo' }
      const esCredito = byId.get(a.payment_method_id) === 'credit'

      const { error } = await supabase
        .from('payment_methods')
        .update({
          bucket: esCredito ? 'pocket' : a.bucket,
          initial_balance: esCredito ? 0 : a.initial_balance,
          initial_balance_at: esCredito ? null : a.initial_balance_at,
        })
        .eq('id', a.payment_method_id)
        .eq('user_id', user.id)

      if (error) {
        console.error('Error guardando el ancla del medio:', error)
        return { error: 'No se pudo guardar el saldo de una de tus cuentas' }
      }
    }

    revalidatePath('/')
    revalidatePath('/ajustes/medios')
    return { success: true }
  } catch (err) {
    console.error('Unexpected error in saveAccountAnchors:', err)
    return { error: 'Ocurrió un error inesperado' }
  }
}

/** Ritmo de cobro declarado. Define qué compromisos entran en el disponible de hoy. */
export async function saveIncomeRhythm(rhythm: string): Promise<ActionResponse> {
  try {
    const parsed = incomeRhythmSchema.safeParse(rhythm)
    if (!parsed.success) return { error: 'Ritmo inválido' }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    const { error } = await supabase
      .from('users')
      .update({ income_rhythm: parsed.data })
      .eq('id', user.id)

    if (error) {
      console.error('Error guardando el ritmo de cobro:', error)
      return { error: 'No se pudo guardar tu ritmo de cobro' }
    }

    revalidatePath('/')
    revalidatePath('/ajustes')
    return { success: true }
  } catch (err) {
    console.error('Unexpected error in saveIncomeRhythm:', err)
    return { error: 'Ocurrió un error inesperado' }
  }
}

/** Cierra la puesta a punto. También la marca el usuario que la saltea. */
export async function completePocketSetup(): Promise<ActionResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    const { error } = await supabase
      .from('users')
      .update({ pocket_setup_completed: true })
      .eq('id', user.id)

    if (error) {
      console.error('Error cerrando la puesta a punto:', error)
      return { error: 'No se pudo cerrar la puesta a punto' }
    }

    revalidatePath('/')
    return { success: true }
  } catch (err) {
    console.error('Unexpected error in completePocketSetup:', err)
    return { error: 'Ocurrió un error inesperado' }
  }
}
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit && npm run lint`
Expected: tsc limpio, lint en baseline exacto (24/11 — el archivo nuevo no agrega violaciones).

- [ ] **Step 3: Commitear**

```bash
git add src/app/bolsillo/actions.ts
git commit -m "feat(bolsillo): actions para anclar cuentas, guardar el ritmo y cerrar la puesta a punto"
```

---

## Task 7: copy del bolsillo (TDD) + los dos componentes compartidos

El onboarding y la puesta a punto piden lo mismo con otras palabras. Los textos salen de helpers puros —igual que `objetivos-copy` y `movimientos-copy` de los slices de layouts— para que se testeen y no se dupliquen.

**Files:**
- Create: `src/lib/utils/pocket-copy.ts`
- Create: `src/lib/utils/__tests__/pocket-copy.test.ts`
- Create: `src/components/pocket/rhythm-picker.tsx`
- Create: `src/components/pocket/account-anchor-fields.tsx`

**Interfaces:**
- Consumes: `IncomeRhythm` de `@/lib/finance/pocket`; `Chip` de `@/components/ui/chip`; `Input` de `@/components/ui/input`.
- Produces:
  - `rhythmLabel(r)`, `rhythmHelp(r)`, `periodLabel(r)`, `nextPeriodLabel(r)`, `BUCKET_HELP`, `RHYTHMS`
  - `<RhythmPicker value onChange />`
  - `<AccountAnchorFields bucket balance onBucketChange onBalanceChange />`
  Los usan las Tasks 8, 9, 11 y 12.

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/lib/utils/__tests__/pocket-copy.test.ts
import { describe, it, expect } from 'vitest';
import { rhythmLabel, periodLabel, nextPeriodLabel, RHYTHMS, BUCKET_HELP } from '../pocket-copy';

describe('pocket-copy', () => {
  it('nombra los cuatro ritmos', () => {
    expect(rhythmLabel('monthly')).toBe('Todos los meses');
    expect(rhythmLabel('biweekly')).toBe('Cada quincena');
    expect(rhythmLabel('weekly')).toBe('Todas las semanas');
    expect(rhythmLabel('irregular')).toBe('Cuando cae');
  });

  it('el periodo se nombra distinto segun el ritmo', () => {
    expect(periodLabel('monthly')).toBe('este mes');
    expect(periodLabel('biweekly')).toBe('esta quincena');
    expect(periodLabel('weekly')).toBe('esta semana');
  });

  it('con ritmo irregular no hay periodo: se descuenta todo', () => {
    expect(periodLabel('irregular')).toBe('en total');
    expect(nextPeriodLabel('irregular')).toBeNull();
  });

  it('el proximo periodo se nombra segun el ritmo', () => {
    expect(nextPeriodLabel('monthly')).toBe('del mes que viene');
    expect(nextPeriodLabel('biweekly')).toBe('de la quincena que viene');
    expect(nextPeriodLabel('weekly')).toBe('de la semana que viene');
  });

  it('RHYTHMS lista los cuatro, en el orden de la UI', () => {
    expect(RHYTHMS.map((r) => r.value)).toEqual(['monthly', 'biweekly', 'weekly', 'irregular']);
  });

  it('la distincion bolsillo/reserva se explica en una linea', () => {
    expect(BUCKET_HELP).toBe('El bolsillo es de donde gastás; la reserva es lo que decidiste no gastar.');
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/lib/utils/__tests__/pocket-copy.test.ts`
Expected: FAIL — el módulo `../pocket-copy` no existe.

- [ ] **Step 3: Implementar el copy**

```ts
// src/lib/utils/pocket-copy.ts
// Textos del modelo de bolsillo. Puros, para que los compartan el onboarding, la
// puesta a punto, Ajustes y el hero de Inicio sin duplicar strings.
// Spec: docs/superpowers/specs/2026-08-20-disponible-real-anclado-design.md
import type { IncomeRhythm } from '@/lib/finance/pocket';

export const BUCKET_HELP =
  'El bolsillo es de donde gastás; la reserva es lo que decidiste no gastar.';

export const RHYTHMS: Array<{ value: IncomeRhythm; label: string; help: string }> = [
  { value: 'monthly', label: 'Todos los meses', help: 'Sueldo mensual, honorarios fijos.' },
  { value: 'biweekly', label: 'Cada quincena', help: 'Cobrás dos veces por mes.' },
  { value: 'weekly', label: 'Todas las semanas', help: 'Jornales, changas semanales.' },
  { value: 'irregular', label: 'Cuando cae', help: 'Freelance, ventas: no hay fecha fija.' },
];

export function rhythmLabel(r: IncomeRhythm): string {
  return RHYTHMS.find((x) => x.value === r)?.label ?? 'Todos los meses';
}

export function rhythmHelp(r: IncomeRhythm): string {
  return RHYTHMS.find((x) => x.value === r)?.help ?? '';
}

/** Cómo se nombra el período vigente en el desglose del disponible. */
export function periodLabel(r: IncomeRhythm): string {
  if (r === 'biweekly') return 'esta quincena';
  if (r === 'weekly') return 'esta semana';
  if (r === 'irregular') return 'en total';
  return 'este mes';
}

/**
 * Cómo se nombra lo que vence después del período vigente.
 * `null` con ritmo irregular: sin próximo cobro que asumir, ya está todo descontado.
 */
export function nextPeriodLabel(r: IncomeRhythm): string | null {
  if (r === 'irregular') return null;
  if (r === 'biweekly') return 'de la quincena que viene';
  if (r === 'weekly') return 'de la semana que viene';
  return 'del mes que viene';
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run src/lib/utils/__tests__/pocket-copy.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Escribir `RhythmPicker`**

```tsx
// src/components/pocket/rhythm-picker.tsx
'use client'

import { Chip } from '@/components/ui/chip'
import { RHYTHMS, rhythmHelp } from '@/lib/utils/pocket-copy'
import type { IncomeRhythm } from '@/lib/finance/pocket'

/**
 * Se declara el RITMO, no la fecha: los usuarios cobran el 1°, los últimos días
 * hábiles o el último martes, y algunos normalizan la fecha al cargar. Lo que el
 * cálculo necesita saber es si hay otro cobro antes de que venza el compromiso.
 */
export function RhythmPicker({
  value,
  onChange,
}: {
  value: IncomeRhythm
  onChange: (r: IncomeRhythm) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {RHYTHMS.map((r) => (
          <Chip key={r.value} active={value === r.value} onClick={() => onChange(r.value)}>
            {r.label}
          </Chip>
        ))}
      </div>
      <p className="font-sans text-xs text-muted">{rhythmHelp(value)}</p>
    </div>
  )
}
```

- [ ] **Step 6: Escribir `AccountAnchorFields`**

```tsx
// src/components/pocket/account-anchor-fields.tsx
'use client'

import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
import { BUCKET_HELP } from '@/lib/utils/pocket-copy'

/**
 * Los dos datos que anclan una cuenta: cuánto tiene hoy y si es plata para gastar.
 * `balance` viaja como string para poder distinguir "" (salteado, queda sin anclar)
 * de "0" (declaró que no tiene nada).
 */
export function AccountAnchorFields({
  bucket,
  balance,
  onBucketChange,
  onBalanceChange,
  showBucketHelp = true,
}: {
  bucket: 'pocket' | 'reserve'
  balance: string
  onBucketChange: (b: 'pocket' | 'reserve') => void
  onBalanceChange: (v: string) => void
  showBucketHelp?: boolean
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="font-sans text-xs font-medium text-text">¿Cuánto tenés hoy?</label>
        <Input
          type="number"
          inputMode="decimal"
          value={balance}
          onChange={(e) => onBalanceChange(e.target.value)}
          placeholder="Lo que ves en la app del banco"
          className="bg-surface border-border text-text tnum"
        />
        <p className="font-sans text-[11px] text-faint">
          Si lo dejás vacío arrancamos en cero y te lo preguntamos más adelante.
        </p>
      </div>

      <div className="space-y-2">
        <label className="font-sans text-xs font-medium text-text">¿Esta plata es para gastar?</label>
        <div className="flex gap-2">
          <Chip active={bucket === 'pocket'} onClick={() => onBucketChange('pocket')}>
            Bolsillo
          </Chip>
          <Chip active={bucket === 'reserve'} onClick={() => onBucketChange('reserve')}>
            Reserva
          </Chip>
        </div>
        {showBucketHelp && <p className="font-sans text-[11px] text-faint">{BUCKET_HELP}</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Verificación y commit**

Run: `npm run lint && npx tsc --noEmit && npx vitest run`
Expected: lint en baseline, tsc limpio, **437 tests** verdes.

```bash
git add src/lib/utils/pocket-copy.ts src/lib/utils/__tests__/pocket-copy.test.ts src/components/pocket
git commit -m "feat(bolsillo): copy del modelo y los campos compartidos de saldo y ritmo"
```

---

## Task 8: onboarding — saldo por cuenta y ritmo de cobro

Dos agregados, **ambos salteables** (spec). El saldo se pide donde el dato está a mano: mientras la persona carga la cuenta. El ritmo es una pregunta de una línea al final.

**Files:**
- Modify: `src/app/onboarding/slides/payment-methods-slide.tsx`
- Create: `src/app/onboarding/slides/rhythm-slide.tsx`
- Modify: `src/app/onboarding/onboarding-flow.tsx`
- Modify: `src/app/onboarding/actions.ts`

**Interfaces:**
- Consumes: `AccountAnchorFields`, `RhythmPicker` (Task 7); `saveIncomeRhythm` (Task 6).
- Produces: `OnboardingPaymentMethodInput` gana `bucket` e `initial_balance`; `completeOnboarding` deja `pocket_setup_completed = true`.

- [ ] **Step 1: Extender la action de medios de pago**

En `src/app/onboarding/actions.ts`, agregar el import de fechas arriba:

```ts
import { dateToLocalString } from '@/lib/utils/dates'
```

Cambiar el tipo:

```ts
type OnboardingPaymentMethodInput = {
  name: string
  type: 'credit' | 'debit' | 'cash'
  default_closing_day?: number | null
  default_payment_day?: number | null
  bucket?: 'pocket' | 'reserve'
  /** null = el usuario salteó el saldo: la cuenta queda sin anclar. */
  initial_balance?: number | null
}
```

Y dentro de `saveOnboardingPaymentMethods`, reemplazar el `const rows = ...` por:

```ts
    // En el onboarding no hay movimientos todavía, así que el saldo declarado ES el
    // ancla (no hace falta `anchorValueForDeclaredBalance`, que descuenta lo del día).
    const hoy = dateToLocalString(new Date())

    const rows = methods.map((m) => {
      const esCredito = m.type === 'credit'
      const declarado = esCredito ? null : (m.initial_balance ?? null)
      return {
        user_id: user.id,
        name: m.name.trim(),
        type: m.type,
        default_closing_day: esCredito ? (m.default_closing_day ?? null) : null,
        default_payment_day: esCredito ? (m.default_payment_day ?? null) : null,
        is_personal: false,
        bucket: esCredito ? 'pocket' : (m.bucket ?? 'pocket'),
        initial_balance: declarado ?? 0,
        initial_balance_at: declarado === null ? null : hoy,
      }
    })
```

- [ ] **Step 2: Cerrar también la puesta a punto al terminar el onboarding**

En la misma `actions.ts`, dentro de `completeOnboarding`, cambiar el update:

```ts
      .update({ onboarding_completed: true, pocket_setup_completed: true })
```

y el comentario del bloque para que diga que el onboarding ya cubre saldos y ritmo, así el usuario nuevo no ve la puesta a punto.

- [ ] **Step 3: Pedir el saldo y el bucket en el slide de medios**

En `src/app/onboarding/slides/payment-methods-slide.tsx`:

Importar el componente compartido:

```ts
import { AccountAnchorFields } from '@/components/pocket/account-anchor-fields'
```

Extender el tipo local:

```ts
type PaymentMethod = {
  name: string
  type: PaymentType
  closingDay: number | null
  paymentDay: number | null
  bucket: 'pocket' | 'reserve'
  /** string vacío = salteado */
  balance: string
}
```

En `PaymentMethodForm`, agregar el estado y el bloque de campos (solo para no-crédito), justo después del campo Nombre:

```tsx
  const [bucket, setBucket] = useState<'pocket' | 'reserve'>(initial?.bucket ?? 'pocket')
  const [balance, setBalance] = useState<string>(initial?.balance ?? '')
```

```tsx
      {!isCredit && (
        <AccountAnchorFields
          bucket={bucket}
          balance={balance}
          onBucketChange={setBucket}
          onBalanceChange={setBalance}
        />
      )}
```

y en `onSave({...})` del `handleSubmit`, agregar los dos campos:

```tsx
    onSave({
      name: trimmedName,
      type,
      closingDay: cd,
      paymentDay: pd,
      bucket: isCredit ? 'pocket' : bucket,
      balance: isCredit ? '' : balance.trim(),
    })
```

En la lista de medios agregados, mostrar el dato para que se pueda revisar antes de guardar — dentro del bloque que hoy solo renderiza la línea de crédito, agregar:

```tsx
                  {m.type !== 'credit' && (
                    <p className="text-xs text-muted">
                      {m.balance === '' ? 'Sin saldo declarado' : `$${m.balance}`}
                      {m.bucket === 'reserve' ? ' · Reserva' : ''}
                    </p>
                  )}
```

En `handleFinish`, mandar los campos nuevos:

```tsx
        methods.map((m) => ({
          name: m.name,
          type: m.type,
          default_closing_day: m.closingDay,
          default_payment_day: m.paymentDay,
          bucket: m.bucket,
          initial_balance: m.balance === '' ? null : Number(m.balance),
        })),
```

Y cambiar el texto del botón final de `Finalizar setup` a `Continuar` (ahora sigue el slide de ritmo).

- [ ] **Step 4: Crear el slide de ritmo**

```tsx
// src/app/onboarding/slides/rhythm-slide.tsx
'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Loader2, CalendarClock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { RhythmPicker } from '@/components/pocket/rhythm-picker'
import { saveIncomeRhythm } from '@/app/bolsillo/actions'
import type { IncomeRhythm } from '@/lib/finance/pocket'

interface RhythmSlideProps {
  onComplete: (rhythm: IncomeRhythm | null) => void
}

export function RhythmSlide({ onComplete }: RhythmSlideProps) {
  const [rhythm, setRhythm] = useState<IncomeRhythm>('monthly')
  const [isPending, setIsPending] = useState(false)

  const handleSave = async () => {
    setIsPending(true)
    try {
      const res = await saveIncomeRhythm(rhythm)
      if (res.error) {
        toast.error(res.error)
        return
      }
      onComplete(rhythm)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-5"
    >
      <div className="text-center space-y-2">
        <CalendarClock className="mx-auto mb-3 h-11 w-11 text-accent-deep" aria-hidden />
        <h2 className="font-display text-2xl text-text">¿Cada cuánto entra plata?</h2>
        <p className="font-sans text-sm text-muted">
          No hace falta la fecha exacta. Con el ritmo alcanza para saber qué te toca pagar
          antes del próximo cobro.
        </p>
      </div>

      <RhythmPicker value={rhythm} onChange={setRhythm} />

      <Button
        type="button"
        size="lg"
        onClick={handleSave}
        disabled={isPending}
        className="w-full bg-accent hover:bg-accent-deep text-accent-ink h-12 text-base font-medium"
      >
        {isPending ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>
            Finalizar setup
            <ArrowRight className="ml-2 h-5 w-5" />
          </>
        )}
      </Button>

      <button
        type="button"
        onClick={() => onComplete(null)}
        disabled={isPending}
        className="w-full font-sans text-xs text-muted hover:text-text transition-colors py-2"
      >
        Ahora no, lo configuro después
      </button>
    </motion.div>
  )
}
```

- [ ] **Step 5: Sumar el slide al flujo**

En `src/app/onboarding/onboarding-flow.tsx`:

```ts
type Slide = 'welcome' | 'features' | 'name' | 'categories' | 'payment' | 'rhythm' | 'complete'
const SETUP_SLIDES: Slide[] = ['name', 'categories', 'payment', 'rhythm']
```

Importar el slide y agregar el estado del ritmo:

```ts
import { RhythmSlide } from './slides/rhythm-slide'
import { rhythmLabel } from '@/lib/utils/pocket-copy'
import type { IncomeRhythm } from '@/lib/finance/pocket'
```

```ts
  const [rhythm, setRhythm] = useState<IncomeRhythm | null>(null)
```

Cambiar el `onComplete` del slide de pagos para que vaya a `rhythm` en vez de a `complete`:

```tsx
              {slide === 'payment' && (
                <PaymentMethodsSlide
                  onComplete={(count) => {
                    setPaymentMethodsCount(count)
                    setSlide('rhythm')
                  }}
                />
              )}

              {slide === 'rhythm' && (
                <RhythmSlide
                  onComplete={(r) => {
                    setRhythm(r)
                    setSlide('complete')
                  }}
                />
              )}
```

Y en el resumen del slide `complete`, agregar una línea más debajo de la de medios de pago:

```tsx
                {rhythm && (
                  <SummaryItem Icon={CalendarClock} label="Cobrás" value={rhythmLabel(rhythm)} />
                )}
```

(agregar `CalendarClock` al import de `lucide-react` de ese archivo).

- [ ] **Step 6: Verificación**

Run: `npm run lint && npx tsc --noEmit && npx vitest run && npm run build`
Expected: lint en baseline exacto, tsc limpio, 437 tests verdes, build OK.

- [ ] **Step 7: Commitear**

```bash
git add src/app/onboarding src/app/bolsillo
git commit -m "feat(onboarding): saldo y bucket por cuenta + pregunta de ritmo de cobro"
```

---

## Task 9: puesta a punto para los usuarios que ya están

Sin esto el número sigue mintiendo: los medios existentes están todos sin anclar, así que el saldo se sigue sumando desde el primer movimiento. Y hay un riesgo explícito en el spec: **el número va a caer fuerte**. Si la migración no lo explica, se lee como que la app se rompió. Por eso el flujo termina mostrando el número viejo y el nuevo, uno al lado del otro.

**Files:**
- Create: `src/app/puesta-a-punto/page.tsx`
- Create: `src/app/puesta-a-punto/puesta-a-punto-flow.tsx`
- Modify: `src/utils/supabase/middleware.ts`

**Interfaces:**
- Consumes: `saveAccountAnchors`, `saveIncomeRhythm`, `completePocketSetup` (Task 6); `anchorValueForDeclaredBalance` (Task 3); `AccountAnchorFields`, `RhythmPicker` (Task 7); `getAvailableToSpend`, `getGlobalBalance` del store.
- Produces: la ruta `/puesta-a-punto`.

- [ ] **Step 1: Mandar al flujo desde el middleware**

En `src/utils/supabase/middleware.ts`:

Extender la exclusión del bloque 4 y la query. Reemplazar `if (!pathname.startsWith('/onboarding')) {` por:

```ts
  if (!pathname.startsWith('/onboarding') && !pathname.startsWith('/puesta-a-punto')) {
```

Cambiar el select:

```ts
        .select('onboarding_completed, pocket_setup_completed')
```

Y justo después del bloque que redirige a `/onboarding` (dentro del mismo `try`, después del `if (!isOnboarded) { ... }`), agregar:

```ts
      // Modelo de bolsillo: el usuario que ya venía usando la app tiene todos sus
      // medios sin anclar, así que su disponible sigue siendo el flujo acumulado.
      // Una sola vez, se lo manda a declarar saldos, reservas y ritmo.
      if (profile?.pocket_setup_completed !== true) {
        const url = request.nextUrl.clone()
        url.pathname = '/puesta-a-punto'

        const redirectResponse = NextResponse.redirect(url)
        supabaseResponse.cookies.getAll().forEach((cookie) => {
          redirectResponse.cookies.set(cookie.name, cookie.value, {
            path: cookie.path,
            domain: cookie.domain,
            maxAge: cookie.maxAge,
            expires: cookie.expires,
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            sameSite: cookie.sameSite,
          })
        })

        return redirectResponse
      }
```

- [ ] **Step 2: La página (Server Component)**

```tsx
// src/app/puesta-a-punto/page.tsx
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { PuestaAPuntoFlow } from './puesta-a-punto-flow'

export default async function PuestaAPuntoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('onboarding_completed, pocket_setup_completed')
    .eq('id', user.id)
    .single()

  if (!profile?.onboarding_completed) redirect('/onboarding')
  if (profile?.pocket_setup_completed) redirect('/')

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <PuestaAPuntoFlow />
    </div>
  )
}
```

- [ ] **Step 3: El flujo (Client Component)**

```tsx
// src/app/puesta-a-punto/puesta-a-punto-flow.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Chancho } from '@/components/brand/chancho'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AccountAnchorFields } from '@/components/pocket/account-anchor-fields'
import { RhythmPicker } from '@/components/pocket/rhythm-picker'
import { FullPageLoader } from '@/components/shared/loader'
import { useFinanceStore } from '@/lib/store/financeStore'
import { anchorValueForDeclaredBalance } from '@/lib/finance/pocket'
import { dateToLocalString } from '@/lib/utils/dates'
import { formatCurrency } from '@/lib/utils'
import { periodLabel } from '@/lib/utils/pocket-copy'
import { saveAccountAnchors, saveIncomeRhythm, completePocketSetup } from '@/app/bolsillo/actions'
import type { IncomeRhythm } from '@/lib/finance/pocket'

type Paso = 'intro' | 'cuentas' | 'ritmo' | 'cambio'

/** Estado editable por cuenta. `balance: ''` = salteada, queda sin anclar. */
type FilaCuenta = { id: string; name: string; bucket: 'pocket' | 'reserve'; balance: string }

export function PuestaAPuntoFlow() {
  const router = useRouter()
  const {
    paymentMethods, transactions, internalTransfers,
    isInitialized, isLoading, fetchAllData,
    getGlobalBalance, getAvailableToSpend,
  } = useFinanceStore()

  const [paso, setPaso] = useState<Paso>('intro')
  const [filas, setFilas] = useState<FilaCuenta[]>([])
  const [rhythm, setRhythm] = useState<IncomeRhythm>('monthly')
  const [guardando, setGuardando] = useState(false)
  // El número viejo se congela ANTES de anclar: después de guardar ya no se puede recuperar.
  const [numeroViejo, setNumeroViejo] = useState<number | null>(null)

  useEffect(() => {
    if (!isInitialized) fetchAllData()
  }, [isInitialized, fetchAllData])

  const cuentas = useMemo(
    () => paymentMethods.filter((m) => m.type !== 'credit' && !m.is_personal),
    [paymentMethods],
  )

  useEffect(() => {
    if (!isInitialized || filas.length > 0) return
    setFilas(cuentas.map((m) => ({ id: m.id, name: m.name, bucket: m.bucket, balance: '' })))
    setNumeroViejo(getGlobalBalance())
  }, [isInitialized, cuentas, filas.length, getGlobalBalance])

  if (isLoading && !isInitialized) return <FullPageLoader text="Cargando tus cuentas..." />

  const setFila = (id: string, patch: Partial<FilaCuenta>) =>
    setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)))

  const guardarCuentas = async () => {
    setGuardando(true)
    try {
      const hoy = dateToLocalString(new Date())
      const anchors = filas.flatMap((f) => {
        const method = paymentMethods.find((m) => m.id === f.id)
        if (!method) return []
        const declarado = f.balance.trim() === '' ? null : Number(f.balance)
        return [{
          payment_method_id: f.id,
          bucket: f.bucket,
          initial_balance:
            declarado === null
              ? 0
              : anchorValueForDeclaredBalance(declarado, method, transactions, internalTransfers, hoy),
          initial_balance_at: declarado === null ? null : hoy,
        }]
      })
      const res = await saveAccountAnchors(anchors)
      if (res.error) {
        toast.error(res.error)
        return
      }
      setPaso('ritmo')
    } finally {
      setGuardando(false)
    }
  }

  const guardarRitmo = async () => {
    setGuardando(true)
    try {
      const res = await saveIncomeRhythm(rhythm)
      if (res.error) {
        toast.error(res.error)
        return
      }
      await fetchAllData()
      setPaso('cambio')
    } finally {
      setGuardando(false)
    }
  }

  const terminar = async () => {
    setGuardando(true)
    try {
      const res = await completePocketSetup()
      if (res.error) {
        toast.error(res.error)
        return
      }
      router.push('/')
      router.refresh()
    } finally {
      setGuardando(false)
    }
  }

  const saltear = async () => {
    setGuardando(true)
    try {
      await completePocketSetup()
      router.push('/')
      router.refresh()
    } finally {
      setGuardando(false)
    }
  }

  const nuevo = getAvailableToSpend()

  return (
    <div className="w-full max-w-lg mx-auto">
      <AnimatePresence mode="wait">
        {paso === 'intro' && (
          <Wrapper key="intro">
            <div className="text-center space-y-6">
              <Chancho className="mx-auto w-20 text-text" title="Chanchito" />
              <div className="space-y-3">
                <h1 className="font-display text-[26px] leading-[var(--leading-display)] text-text">
                  Cambiamos cómo se calcula tu plata
                </h1>
                <p className="font-sans text-sm text-muted">
                  Antes sumábamos todo lo que registraste desde el día uno. Si alguna vez te
                  olvidaste de anotar una salida, el número quedaba inflado para siempre.
                </p>
                <p className="font-sans text-sm text-muted">
                  Ahora arrancamos de lo que tenés hoy en cada cuenta. Son dos minutos y
                  el número vuelve a significar algo.
                </p>
              </div>
              <Button variant="accent" size="lg" className="w-full h-12" onClick={() => setPaso('cuentas')}>
                Dale, empecemos
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <button
                type="button"
                onClick={saltear}
                disabled={guardando}
                className="w-full font-sans text-xs text-muted hover:text-text transition-colors py-2"
              >
                Ahora no
              </button>
            </div>
          </Wrapper>
        )}

        {paso === 'cuentas' && (
          <Wrapper key="cuentas">
            <div className="space-y-5">
              <div className="space-y-2">
                <h2 className="font-display text-2xl text-text">¿Cuánto tenés en cada cuenta?</h2>
                <p className="font-sans text-sm text-muted">
                  Abrí la app del banco y copiá el saldo. La que no sepas, dejala vacía.
                </p>
              </div>

              <div className="space-y-3 max-h-[46vh] overflow-y-auto pr-1">
                {filas.map((f) => (
                  <Card key={f.id}>
                    <CardContent className="p-4 space-y-3">
                      <p className="font-sans font-bold text-text">{f.name}</p>
                      <AccountAnchorFields
                        bucket={f.bucket}
                        balance={f.balance}
                        onBucketChange={(b) => setFila(f.id, { bucket: b })}
                        onBalanceChange={(v) => setFila(f.id, { balance: v })}
                      />
                    </CardContent>
                  </Card>
                ))}
                {filas.length === 0 && (
                  <p className="font-sans text-sm text-muted italic">
                    No tenés cuentas de débito ni efectivo cargadas.
                  </p>
                )}
              </div>

              <Button variant="accent" size="lg" className="w-full h-12" onClick={guardarCuentas} disabled={guardando}>
                {guardando ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Seguir<ArrowRight className="ml-2 h-5 w-5" /></>}
              </Button>
            </div>
          </Wrapper>
        )}

        {paso === 'ritmo' && (
          <Wrapper key="ritmo">
            <div className="space-y-5">
              <div className="space-y-2">
                <h2 className="font-display text-2xl text-text">¿Cada cuánto entra plata?</h2>
                <p className="font-sans text-sm text-muted">
                  Define qué compromisos te descontamos hoy y cuáles quedan para el próximo cobro.
                </p>
              </div>
              <RhythmPicker value={rhythm} onChange={setRhythm} />
              <Button variant="accent" size="lg" className="w-full h-12" onClick={guardarRitmo} disabled={guardando}>
                {guardando ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Seguir<ArrowRight className="ml-2 h-5 w-5" /></>}
              </Button>
            </div>
          </Wrapper>
        )}

        {paso === 'cambio' && (
          <Wrapper key="cambio">
            <div className="space-y-5">
              <div className="space-y-2">
                <h2 className="font-display text-2xl text-text">Así queda tu número</h2>
                <p className="font-sans text-sm text-muted">
                  No perdiste plata: cambió lo que la app estaba midiendo.
                </p>
              </div>

              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between items-baseline">
                    <span className="font-sans text-[13px] text-muted">Antes decía</span>
                    <span className="font-display tnum text-[15px] text-faint line-through">
                      {formatCurrency(numeroViejo ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="font-sans text-[13px] text-muted">En tus cuentas hoy</span>
                    <span className="font-display tnum text-[15px] text-text">
                      {formatCurrency(nuevo.pocketTotal)}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="font-sans text-[13px] text-muted">
                      Comprometido {periodLabel(rhythm)}
                    </span>
                    <span className="font-display tnum text-[15px] text-warn">
                      -{formatCurrency(nuevo.committed)}
                    </span>
                  </div>
                  <div className="pt-3 border-t border-border flex justify-between items-baseline">
                    <span className="font-sans text-[13px] font-bold text-text">Tu plata libre</span>
                    <span className="font-display tnum text-[20px] text-text">
                      {formatCurrency(nuevo.available)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <p className="font-sans text-xs text-muted">
                Si el número te sorprende, revisá los saldos que cargaste desde Ajustes → Medios de pago.
                Cuando algo no cierre, Chanchito te va a preguntar si te falta anotar algo.
              </p>

              <Button variant="accent" size="lg" className="w-full h-12" onClick={terminar} disabled={guardando}>
                {guardando ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Listo, vamos<ArrowRight className="ml-2 h-5 w-5" /></>}
              </Button>
            </div>
          </Wrapper>
        )}
      </AnimatePresence>
    </div>
  )
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.div>
  )
}
```

- [ ] **Step 4: Verificación**

Run: `npm run lint && npx tsc --noEmit && npx vitest run && npm run build`
Expected: lint en baseline exacto, tsc limpio, 437 tests verdes, build OK con la ruta `/puesta-a-punto` en el listado.

- [ ] **Step 5: Commitear**

```bash
git add src/app/puesta-a-punto src/utils/supabase/middleware.ts
git commit -m "feat(bolsillo): puesta a punto para usuarios existentes, con la explicacion del cambio de numero"
```

---

## Task 10: conciliación — las reglas puras y la escritura

El orden que fija el spec: **primero recuperar el dato, después ajustar el número.** El ajuste es la red de contención, no la herramienta principal, porque un gasto anotado conserva monto, categoría y medio; un ajuste borra esa información.

**Files:**
- Create: `src/lib/finance/reconcile.ts`
- Create: `src/lib/finance/__tests__/reconcile.test.ts`
- Modify: `src/app/bolsillo/actions.ts`
- Modify: `src/lib/store/financeStore.ts`

**Interfaces:**
- Consumes: `ProcessedTransaction` de `./types`.
- Produces:
  - `daysSinceLastRegistration(transactions: ProcessedTransaction[], now: Date): number | null`
  - `reconcileOptionsFor(difference: number): ReconcileOption[]` con `type ReconcileOption = 'transfer' | 'expense' | 'income' | 'adjustment'`
  - `reconcileHeadline(difference: number): string`
  - store: `getDaysSinceLastRegistration(): number | null`
  - action: `reconcileAccount(input: ReconcileInput): Promise<ActionResponse>`
  Los usa la Task 11.

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/lib/finance/__tests__/reconcile.test.ts
import { describe, it, expect } from 'vitest';
import { daysSinceLastRegistration, reconcileOptionsFor, reconcileHeadline } from '../reconcile';
import type { ProcessedTransaction } from '../types';

const NOW = new Date(2026, 7, 20, 12, 0, 0); // 20-ago-2026

const tx = (createdAt: string): ProcessedTransaction => ({
  id: createdAt, user_id: 'u1', type: 'expense', amount: 1000,
  date: '2026-08-01', periodDate: '2026-08-01', realPaymentDate: '2026-08-01',
  payment_method_id: 'm1', category_id: 'c1', created_at: createdAt,
  installment_plan_id: null, recurring_plan_id: null, card_payment_for: null,
  is_balance_adjustment: false,
} as unknown as ProcessedTransaction);

describe('daysSinceLastRegistration', () => {
  it('sin transacciones no hay dato', () => {
    expect(daysSinceLastRegistration([], NOW)).toBeNull();
  });

  it('cuenta desde created_at, no desde la fecha del movimiento', () => {
    // Un gasto con fecha de hace un mes pero registrado hoy NO dispara el recordatorio.
    expect(daysSinceLastRegistration([tx('2026-08-20T09:00:00Z')], NOW)).toBe(0);
  });

  it('toma el registro mas reciente', () => {
    const r = daysSinceLastRegistration(
      [tx('2026-08-10T09:00:00Z'), tx('2026-08-18T09:00:00Z'), tx('2026-08-12T09:00:00Z')],
      NOW,
    );
    expect(r).toBe(2);
  });

  it('una cuota con fecha futura no cuenta como registro de hoy', () => {
    expect(daysSinceLastRegistration([tx('2026-08-15T09:00:00Z')], NOW)).toBe(5);
  });
});

describe('reconcileOptionsFor', () => {
  it('si falta plata, pudo irse al ahorro, ser un gasto, o quedar como ajuste', () => {
    expect(reconcileOptionsFor(-50000)).toEqual(['transfer', 'expense', 'adjustment']);
  });

  it('si sobra plata, fue un ingreso o queda como ajuste: no se puede "mandar al ahorro" lo que aparecio', () => {
    expect(reconcileOptionsFor(50000)).toEqual(['income', 'adjustment']);
  });

  it('si el saldo coincide no hay nada que clasificar', () => {
    expect(reconcileOptionsFor(0)).toEqual([]);
  });

  it('una diferencia menor a un peso se trata como coincidencia (redondeo)', () => {
    expect(reconcileOptionsFor(-0.4)).toEqual([]);
  });
});

describe('reconcileHeadline', () => {
  it('nombra la diferencia en la direccion correcta', () => {
    expect(reconcileHeadline(-50000)).toBe('Te falta anotar una salida');
    expect(reconcileHeadline(50000)).toBe('Te falta anotar una entrada');
    expect(reconcileHeadline(0)).toBe('El saldo coincide');
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/lib/finance/__tests__/reconcile.test.ts`
Expected: FAIL — el módulo `../reconcile` no existe.

- [ ] **Step 3: Implementar**

```ts
// src/lib/finance/reconcile.ts
// Conciliación: cuándo preguntarle al usuario si le falta anotar algo, y qué puede
// haber pasado cuando el saldo declarado no coincide con el calculado.
// Puro: sin Zustand ni Supabase.
// Spec: docs/superpowers/specs/2026-08-20-disponible-real-anclado-design.md
import { differenceInCalendarDays, startOfDay } from 'date-fns';
import type { ProcessedTransaction } from './types';

/** Por debajo de un peso la diferencia es redondeo, no un movimiento sin anotar. */
const EPSILON = 1;

/**
 * Días desde la última vez que el usuario REGISTRÓ algo.
 *
 * Se mide con `created_at` (cuándo lo cargó) y no con `date` (cuándo pasó): un gasto
 * del mes pasado anotado hoy es actividad de hoy, y una cuota con fecha futura no es
 * actividad de nadie. `null` = todavía no registró nada.
 */
export function daysSinceLastRegistration(
  transactions: ProcessedTransaction[],
  now: Date,
): number | null {
  let ultimo: number | null = null;
  for (const t of transactions) {
    if (!t.created_at) continue;
    const ts = new Date(t.created_at).getTime();
    if (Number.isNaN(ts)) continue;
    if (ultimo === null || ts > ultimo) ultimo = ts;
  }
  if (ultimo === null) return null;
  return Math.max(0, differenceInCalendarDays(startOfDay(now), startOfDay(new Date(ultimo))));
}

export type ReconcileOption = 'transfer' | 'expense' | 'income' | 'adjustment';

/**
 * Qué pudo haber pasado, según hacia dónde no cierra.
 * `difference` = saldo declarado − saldo calculado.
 * - Negativa: la app cree que tenés más de lo que tenés → salió plata sin anotar.
 * - Positiva: entró plata sin anotar. "Mandarlo al ahorro" no aplica: nada salió.
 */
export function reconcileOptionsFor(difference: number): ReconcileOption[] {
  if (Math.abs(difference) < EPSILON) return [];
  return difference < 0 ? ['transfer', 'expense', 'adjustment'] : ['income', 'adjustment'];
}

export function reconcileHeadline(difference: number): string {
  if (Math.abs(difference) < EPSILON) return 'El saldo coincide';
  return difference < 0 ? 'Te falta anotar una salida' : 'Te falta anotar una entrada';
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run src/lib/finance/__tests__/reconcile.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Envolver en el store**

En `src/lib/store/financeStore.ts`, agregar el import:

```ts
import { daysSinceLastRegistration } from '@/lib/finance/reconcile';
```

En la interfaz `FinanceState`, junto a `getRegistrationStreak` (≈ línea 398):

```ts
  /** Días desde el último registro. null = nunca registró nada. */
  getDaysSinceLastRegistration: () => number | null;
```

Y en la implementación, junto a `getRegistrationStreak` (≈ línea 2188):

```ts
  getDaysSinceLastRegistration: () => {
    const { transactions } = get();
    return daysSinceLastRegistration(transactions, new Date());
  },
```

- [ ] **Step 6: Escribir `reconcileAccount`**

Agregar al final de `src/app/bolsillo/actions.ts` (el import de `z` y `createClient` ya está arriba):

```ts
const reconcileSchema = z.object({
  payment_method_id: z.string().min(1),
  /** Saldo declarado − saldo calculado. El signo importa. */
  difference: z.number(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  classification: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('adjustment') }),
    z.object({ kind: z.literal('expense'), category_id: z.string().min(1), description: z.string().min(1).max(120) }),
    z.object({ kind: z.literal('income'), category_id: z.string().min(1), description: z.string().min(1).max(120) }),
    z.object({ kind: z.literal('transfer'), to_payment_method_id: z.string().min(1) }),
  ]),
})

export type ReconcileInput = z.infer<typeof reconcileSchema>

const ADJUSTMENT_CATEGORY = 'Ajustes de saldo'

/** category_id es NOT NULL: los ajustes usan una categoría propia (get-or-create), y
 *  quedan fuera de las analíticas por el marcador `is_balance_adjustment`. */
async function getOrCreateAdjustmentCategory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  type: 'expense' | 'income',
): Promise<string | null> {
  const { data: cats } = await supabase
    .from('categories')
    .select('id')
    .eq('user_id', userId)
    .eq('name', ADJUSTMENT_CATEGORY)
    .eq('type', type)
    .limit(1)

  if (cats && cats.length > 0) return cats[0].id

  const { data: nueva, error } = await supabase
    .from('categories')
    .insert({ user_id: userId, name: ADJUSTMENT_CATEGORY, emoji: '⚖️', is_system: true, type })
    .select('id')
    .single()

  if (error || !nueva) {
    console.error('Error creando la categoría de ajustes:', error)
    return null
  }
  return nueva.id
}

/**
 * Concilia una cuenta: registra la diferencia entre lo declarado y lo calculado,
 * clasificada como el usuario la explicó. NUNCA borra ni edita movimientos previos.
 */
export async function reconcileAccount(input: ReconcileInput): Promise<ActionResponse> {
  try {
    const parsed = reconcileSchema.safeParse(input)
    if (!parsed.success) return { error: 'Datos inválidos' }

    const { payment_method_id, difference, date, classification } = parsed.data
    if (Math.abs(difference) < 1) return { success: true } // redondeo: nada que registrar

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    const { data: method } = await supabase
      .from('payment_methods')
      .select('id, type')
      .eq('id', payment_method_id)
      .eq('user_id', user.id)
      .single()

    if (!method) return { error: 'Ese medio de pago no es tuyo' }
    if (method.type === 'credit') {
      return { error: 'Una tarjeta de crédito no tiene saldo: su deuda sale del resumen' }
    }

    const monto = Math.abs(difference)

    if (classification.kind === 'transfer') {
      if (difference > 0) return { error: 'No se puede mandar al ahorro plata que apareció' }
      const { error } = await supabase.from('internal_transfers').insert({
        user_id: user.id,
        amount: monto,
        currency: 'ARS' as const,
        period_date: date,
        real_transfer_date: date,
        transfer_type: 'manual' as const,
        from_payment_method_id: payment_method_id,
        to_payment_method_id: classification.to_payment_method_id,
        description: 'Movida a reserva (conciliación)',
      })
      if (error) {
        console.error('Error registrando la transferencia de conciliación:', error)
        return { error: 'No se pudo registrar el movimiento a la reserva' }
      }
    } else {
      const esAjuste = classification.kind === 'adjustment'
      const type: 'expense' | 'income' = difference < 0 ? 'expense' : 'income'

      const categoryId = esAjuste
        ? await getOrCreateAdjustmentCategory(supabase, user.id, type)
        : classification.category_id

      if (!categoryId) return { error: 'No se pudo preparar la categoría del ajuste' }

      const { error } = await supabase.from('transactions').insert({
        user_id: user.id,
        description: esAjuste ? 'Ajuste de saldo' : classification.description,
        amount: monto,
        date,
        type,
        category_id: categoryId,
        payment_method_id,
        is_balance_adjustment: esAjuste,
        original_currency: 'ARS',
        original_amount: monto,
        rate_pair: null,
        exchange_rate: null,
      })
      if (error) {
        console.error('Error registrando la conciliación:', error)
        return { error: 'No se pudo registrar el movimiento' }
      }
    }

    revalidatePath('/')
    revalidatePath('/movimientos')
    return { success: true }
  } catch (err) {
    console.error('Unexpected error in reconcileAccount:', err)
    return { error: 'Ocurrió un error inesperado' }
  }
}
```

- [ ] **Step 7: Verificación y commit**

Run: `npm run lint && npx tsc --noEmit && npx vitest run`
Expected: lint en baseline exacto, tsc limpio, **446 tests** verdes.

```bash
git add src/lib/finance/reconcile.ts src/lib/finance/__tests__/reconcile.test.ts src/lib/store/financeStore.ts src/app/bolsillo/actions.ts
git commit -m "feat(bolsillo): reglas de conciliacion y registro del ajuste de saldo"
```

---

## Task 11: conciliación — el recordatorio y el diálogo

**Files:**
- Create: `src/components/pocket/adjust-balance-dialog.tsx`
- Create: `src/components/pocket/reconcile-reminder-card.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/ajustes/page.tsx`

**Interfaces:**
- Consumes: `reconcileOptionsFor`, `reconcileHeadline` (Task 10); `reconcileAccount` (Task 10); `getAvailableToSpend`, `getDaysSinceLastRegistration` del store; `CreateTransactionDialog`.
- Produces: `<AdjustBalanceDialog open onOpenChange />`, `<ReconcileReminderCard />`.

- [ ] **Step 1: El diálogo de ajuste**

```tsx
// src/components/pocket/adjust-balance-dialog.tsx
'use client'

import { useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Chip } from '@/components/ui/chip'
import { useFinanceStore } from '@/lib/store/financeStore'
import { reconcileOptionsFor, reconcileHeadline, type ReconcileOption } from '@/lib/finance/reconcile'
import { reconcileAccount } from '@/app/bolsillo/actions'
import { dateToLocalString } from '@/lib/utils/dates'
import { formatCurrency } from '@/lib/utils'

const OPTION_LABEL: Record<ReconcileOption, string> = {
  transfer: 'Lo mandé a una reserva',
  expense: 'Fue un gasto',
  income: 'Fue un ingreso',
  adjustment: 'Solo ajustar el saldo',
}

/**
 * Red de contención de la conciliación: se usa cuando el usuario dice que ya anotó
 * todo y el saldo sigue sin coincidir. Registra la diferencia clasificada; nunca
 * borra ni edita un movimiento previo.
 */
export function AdjustBalanceDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const { getAvailableToSpend, categories, fetchAllData } = useFinanceStore()
  const { accounts } = getAvailableToSpend()

  const cuentas = accounts
  const [methodId, setMethodId] = useState<string>('')
  const [declarado, setDeclarado] = useState('')
  const [opcion, setOpcion] = useState<ReconcileOption | null>(null)
  const [categoriaId, setCategoriaId] = useState('')
  const [destinoId, setDestinoId] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cuenta = cuentas.find((a) => a.methodId === methodId) ?? null
  const diferencia = cuenta && declarado.trim() !== '' ? Number(declarado) - cuenta.balance : 0
  const opciones = useMemo(() => reconcileOptionsFor(diferencia), [diferencia])
  const reservas = cuentas.filter((a) => a.bucket === 'reserve' && a.methodId !== methodId)

  const tipoCategoria = diferencia < 0 ? 'expense' : 'income'
  const categoriasDisponibles = categories.filter((c) => c.type === tipoCategoria)

  const puedeGuardar =
    !!cuenta &&
    opciones.length > 0 &&
    !!opcion &&
    (opcion !== 'transfer' || !!destinoId) &&
    (opcion === 'transfer' || opcion === 'adjustment' || (!!categoriaId && descripcion.trim().length > 0))

  const guardar = async () => {
    if (!cuenta || !opcion) return
    setGuardando(true)
    try {
      const classification =
        opcion === 'transfer'
          ? { kind: 'transfer' as const, to_payment_method_id: destinoId }
          : opcion === 'adjustment'
            ? { kind: 'adjustment' as const }
            : { kind: opcion, category_id: categoriaId, description: descripcion.trim() }

      const res = await reconcileAccount({
        payment_method_id: cuenta.methodId,
        difference: diferencia,
        date: dateToLocalString(new Date()),
        classification,
      })
      if (res.error) {
        toast.error(res.error)
        return
      }
      await fetchAllData()
      toast.success('Listo, el saldo quedó al día')
      onOpenChange(false)
      setDeclarado('')
      setOpcion(null)
      setCategoriaId('')
      setDestinoId('')
      setDescripcion('')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-surface border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-text">Poner el saldo al día</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="font-sans text-xs font-medium text-text">¿Qué cuenta?</label>
            <div className="flex flex-wrap gap-2">
              {cuentas.map((a) => (
                <Chip key={a.methodId} active={methodId === a.methodId} onClick={() => setMethodId(a.methodId)}>
                  {a.name}
                </Chip>
              ))}
            </div>
          </div>

          {cuenta && (
            <>
              <div className="flex justify-between items-baseline">
                <span className="font-sans text-[13px] text-muted">Chanchito dice que tenés</span>
                <span className="font-display tnum text-[15px] text-text">{formatCurrency(cuenta.balance)}</span>
              </div>

              <div className="space-y-1.5">
                <label className="font-sans text-xs font-medium text-text">¿Cuánto tenés en realidad?</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={declarado}
                  onChange={(e) => setDeclarado(e.target.value)}
                  placeholder="El saldo de la app del banco"
                  className="bg-surface-2 border-border text-text tnum"
                />
              </div>
            </>
          )}

          {cuenta && declarado.trim() !== '' && (
            <div className="rounded-xl border-[1.5px] border-border bg-surface-2 p-3 space-y-3">
              <div className="flex justify-between items-baseline">
                <span className="font-sans text-[13px] text-text">{reconcileHeadline(diferencia)}</span>
                <span className={`font-display tnum text-[15px] ${diferencia < 0 ? 'text-bad' : 'text-good'}`}>
                  {diferencia < 0 ? '-' : '+'}{formatCurrency(diferencia)}
                </span>
              </div>

              {opciones.length > 0 && (
                <div className="space-y-2">
                  <p className="font-sans text-xs text-muted">¿Qué pasó?</p>
                  <div className="flex flex-wrap gap-2">
                    {opciones.map((o) => (
                      <Chip key={o} active={opcion === o} onClick={() => setOpcion(o)}>
                        {OPTION_LABEL[o]}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}

              {opcion === 'transfer' && (
                <div className="space-y-2">
                  <p className="font-sans text-xs text-muted">¿A cuál?</p>
                  <div className="flex flex-wrap gap-2">
                    {reservas.map((r) => (
                      <Chip key={r.methodId} active={destinoId === r.methodId} onClick={() => setDestinoId(r.methodId)}>
                        {r.name}
                      </Chip>
                    ))}
                  </div>
                  {reservas.length === 0 && (
                    <p className="font-sans text-xs text-warn">
                      No tenés ninguna cuenta marcada como reserva. Marcá una en Ajustes → Medios de pago.
                    </p>
                  )}
                </div>
              )}

              {(opcion === 'expense' || opcion === 'income') && (
                <div className="space-y-2">
                  <Input
                    type="text"
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    placeholder="¿Qué fue?"
                    maxLength={120}
                    className="bg-surface border-border text-text"
                  />
                  <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
                    {categoriasDisponibles.map((c) => (
                      <Chip key={c.id} active={categoriaId === c.id} onClick={() => setCategoriaId(c.id)}>
                        {c.emoji} {c.name}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <Button variant="accent" className="w-full h-11" onClick={guardar} disabled={!puedeGuardar || guardando}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: El recordatorio en Inicio**

```tsx
// src/components/pocket/reconcile-reminder-card.tsx
'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { X, PencilLine } from 'lucide-react'
import { useFinanceStore } from '@/lib/store/financeStore'
import { CreateTransactionDialog } from '@/components/transactions/create-transaction-dialog'
import { AdjustBalanceDialog } from '@/components/pocket/adjust-balance-dialog'

const STORAGE_KEY = 'chanchito.reconcileReminderSnoozedUntil'
/** Dos días es agresivo a propósito, pero tiene que poder silenciarse. */
const DAYS_WITHOUT_REGISTERING = 2
const SNOOZE_MS = 2 * 24 * 60 * 60 * 1000

/**
 * Camino principal de la conciliación: recuperar el dato antes de tocar el número.
 * Un gasto anotado conserva monto, categoría y medio; un ajuste borra esa información,
 * por eso "Ya anoté todo" es la opción secundaria.
 */
export function ReconcileReminderCard() {
  const days = useFinanceStore((s) => s.getDaysSinceLastRegistration())
  const [snoozed, setSnoozed] = useState(() => {
    if (typeof window === 'undefined') return false
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const until = Number(raw)
    return !isNaN(until) && Date.now() < until
  })
  const [anotando, setAnotando] = useState(false)
  const [ajustando, setAjustando] = useState(false)

  if (snoozed || days === null || days < DAYS_WITHOUT_REGISTERING) return null

  const posponer = () => {
    localStorage.setItem(STORAGE_KEY, String(Date.now() + SNOOZE_MS))
    setSnoozed(true)
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="relative flex items-start gap-3 rounded-2xl border-[1.5px] border-border bg-surface p-4 pr-9"
      >
        <div className="rounded-lg bg-accent-soft/30 p-2 shrink-0 text-accent-deep">
          <PencilLine className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-sans text-sm font-bold text-text">¿Te falta anotar algo?</p>
          <p className="font-sans text-xs text-muted mt-0.5">
            Hace {days} días que no registrás nada. Si gastaste y no lo anotaste, tu plata libre
            está diciendo de más.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setAnotando(true)}
              className="font-sans text-xs font-bold text-text underline decoration-2 underline-offset-2"
            >
              Anotar ahora
            </button>
            <button
              type="button"
              onClick={() => setAjustando(true)}
              className="font-sans text-xs text-muted hover:text-text transition-colors"
            >
              Ya está todo anotado
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={posponer}
          className="absolute top-2.5 right-2.5 p-1 text-faint hover:text-text transition-colors"
          aria-label="Recordarme en 2 días"
          title="Recordarme en 2 días"
        >
          <X className="h-4 w-4" />
        </button>
      </motion.div>

      <CreateTransactionDialog open={anotando} onOpenChange={setAnotando} />
      <AdjustBalanceDialog open={ajustando} onOpenChange={setAjustando} />
    </>
  )
}
```

- [ ] **Step 3: Montarlo en Inicio**

En `src/app/page.tsx`, importar:

```ts
import { ReconcileReminderCard } from '@/components/pocket/reconcile-reminder-card'
```

y renderizarlo justo debajo de `<IncompleteCreditCardsBanner />`:

```tsx
        <ReconcileReminderCard />
```

- [ ] **Step 4: Entradas desde Ajustes**

En `src/app/ajustes/page.tsx` — que hoy es un Server Component sin estado — convertirlo a `'use client'` (agregando la directiva en la primera línea) y sumar dos bloques debajo del de Tema:

Imports nuevos:

```ts
import { useState } from 'react'
import { CalendarClock, Scale } from 'lucide-react'
import { toast } from 'sonner'
import { useFinanceStore } from '@/lib/store/financeStore'
import { RhythmPicker } from '@/components/pocket/rhythm-picker'
import { AdjustBalanceDialog } from '@/components/pocket/adjust-balance-dialog'
import { saveIncomeRhythm } from '@/app/bolsillo/actions'
import type { IncomeRhythm } from '@/lib/finance/pocket'
```

Dentro del componente:

```tsx
  const { incomeRhythm, fetchAllData } = useFinanceStore()
  const [rhythm, setRhythm] = useState<IncomeRhythm>(incomeRhythm)
  const [ajustando, setAjustando] = useState(false)

  const cambiarRitmo = async (r: IncomeRhythm) => {
    setRhythm(r)
    const res = await saveIncomeRhythm(r)
    if (res.error) {
      toast.error(res.error)
      return
    }
    await fetchAllData()
  }
```

Y el markup, después del bloque de Tema:

```tsx
          {/* Ritmo de cobro. Cambia con la vida —de relación de dependencia a
              freelance, un laburo quincenal que se suma—, por eso es editable. */}
          <div className="rounded-2xl border-[1.5px] border-border bg-surface p-5 space-y-3">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft/30 text-accent-deep">
                <CalendarClock className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-sans font-bold text-text">Cada cuánto cobrás</p>
                <p className="mt-0.5 text-xs text-muted">Define qué te descontamos hoy</p>
              </div>
            </div>
            <RhythmPicker value={rhythm} onChange={cambiarRitmo} />
          </div>

          <button
            type="button"
            onClick={() => setAjustando(true)}
            className="group flex items-center gap-4 rounded-2xl border-[1.5px] border-border bg-surface p-5 text-left transition-all hover:bg-surface-2/50 active:scale-[0.99]"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft/30 text-accent-deep">
              <Scale className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-sans font-bold text-text">Poner el saldo al día</p>
              <p className="mt-0.5 truncate text-xs text-muted">Cuando la cuenta no te cierra</p>
            </div>
          </button>

          <AdjustBalanceDialog open={ajustando} onOpenChange={setAjustando} />
```

- [ ] **Step 5: Verificación**

Run: `npm run lint && npx tsc --noEmit && npx vitest run && npm run build`
Expected: lint en baseline exacto, tsc limpio, 446 tests verdes, build OK.

- [ ] **Step 6: Commitear**

```bash
git add src/components/pocket src/app/page.tsx src/app/ajustes/page.tsx
git commit -m "feat(bolsillo): recordatorio de anotar a los 2 dias y dialogo de ajuste de saldo"
```

---

## Task 12: el número nuevo en Inicio

El cambio que se ve. El hero pasa a `getAvailableToSpend()` y el desglose cuenta la historia nueva: lo que hay en las cuentas, lo comprometido del período, y aparte lo del próximo período, que no baja el disponible de hoy pero el usuario tiene que verlo para saber cuánto va a poder ahorrar al cierre.

**Files:**
- Modify: `src/lib/finance/pocket.ts` (los ítems de tarjeta llevan vencimiento y estado)
- Modify: `src/lib/finance/__tests__/pocket.test.ts`
- Modify: `src/components/dashboard/balance-card.tsx`

**Interfaces:**
- Consumes: `getAvailableToSpend()`, `periodLabel`/`nextPeriodLabel` (Task 7).
- Produces: `CommitmentBreakdown['items']` gana `dueDate?: Date` e `isCycleClosed?: boolean`.

- [ ] **Step 1: Escribir el test que falla**

Agregar al `describe('computeCommitments', ...)` de `src/lib/finance/__tests__/pocket.test.ts`:

```ts
  it('el item de tarjeta lleva su vencimiento y si el ciclo esta cerrado', () => {
    const vence = new Date(2026, 7, 25);
    const r = computeCommitments([], [card({ nextPaymentDate: vence, isCycleClosed: true })], methods, [], 'monthly', now);
    const item = r.items.find((i) => i.kind === 'card');
    expect(item?.dueDate).toEqual(vence);
    expect(item?.isCycleClosed).toBe(true);
  });

  it('el item de un fijo no lleva vencimiento: el modelo no guarda esa fecha', () => {
    const r = computeCommitments([plan({ amount: 25000 })], [], methods, [], 'monthly', now);
    expect(r.items.find((i) => i.kind === 'fixed')?.dueDate).toBeUndefined();
  });
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/lib/finance/__tests__/pocket.test.ts`
Expected: FAIL — `dueDate` no existe en el tipo del ítem.

- [ ] **Step 3: Implementar**

En `src/lib/finance/pocket.ts`, cambiar el tipo de los ítems dentro de `CommitmentBreakdown`:

```ts
export interface CommitmentBreakdown {
  /** Lo que vence dentro del período actual y sale del bolsillo. */
  total: number;
  items: Array<{
    id: string;
    name: string;
    amount: number;
    kind: 'card' | 'fixed';
    /** Solo las tarjetas: el modelo no guarda fecha de vencimiento de las mensualidades. */
    dueDate?: Date;
    isCycleClosed?: boolean;
  }>;
  /** Lo que vence después del período: no baja el disponible de hoy, pero el usuario tiene que verlo. */
  nextPeriod: number;
}
```

Y en `computeCommitments`, en el push de la tarjeta:

```ts
      items.push({
        id: card.methodId,
        name: card.name,
        amount: card.totalARS,
        kind: 'card',
        dueDate: card.nextPaymentDate,
        isCycleClosed: card.isCycleClosed,
      });
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run src/lib/finance/__tests__/pocket.test.ts`
Expected: PASS.

- [ ] **Step 5: Reescribir el `BalanceCard`**

Reemplazar el cuerpo del componente `BalanceCard` en `src/components/dashboard/balance-card.tsx` (el helper `HintStop` y el hook `useCountUp` de arriba quedan igual):

```tsx
export function BalanceCard() {
  const [expanded, setExpanded] = useState(false)
  const getAvailableToSpend = useFinanceStore((s) => s.getAvailableToSpend)
  const incomeRhythm = useFinanceStore((s) => s.incomeRhythm)
  const {
    available,
    pocketTotal,
    reserveTotal,
    committed,
    committedNextPeriod,
    commitmentItems,
    accounts,
  } = getAvailableToSpend()

  const animatedBalance = useCountUp(available)
  const isNegative = available < 0
  const sinAnclar = accounts.length > 0 && accounts.every((a) => !a.anchored)
  const proximo = nextPeriodLabel(incomeRhythm)

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.abs(amount))

  return (
    <div>
      <motion.div
        className="rounded-2xl border-[1.5px] border-border bg-surface text-text shadow-card overflow-hidden cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded); } }}
        whileTap={{ scale: 0.99 }}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label="Ver desglose de tu plata disponible"
      >
        <div className="p-5 lg:p-6">
          <div className="flex items-center gap-1.5 mb-1">
            <p className="font-sans text-[11px] uppercase tracking-[0.2em] text-accent-deep">
              Tu plata libre para hoy
            </p>
            <HintStop>
              <InfoHint label="Qué es tu plata libre para hoy" className="text-faint hover:text-text">
                Lo que hay hoy en tus cuentas de gastar, menos lo que ya tiene dueño {periodLabel(incomeRhythm)}
                {' '}(mensualidades sin pagar y resúmenes de tarjeta que vencen antes de tu próximo cobro).
                Lo que guardaste en reservas no cuenta: decidiste no gastarlo.
              </InfoHint>
            </HintStop>
            <motion.div
              className="ml-auto"
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="h-4 w-4 text-faint" aria-hidden="true" />
            </motion.div>
          </div>

          <div className="flex items-baseline gap-2 mt-1 overflow-hidden">
            <span className="font-display tnum text-[44px] lg:text-[46px] leading-[var(--leading-display)] text-text [text-shadow:var(--shadow-bandera)] min-w-0 truncate pr-1.5 pb-1">
              {isNegative ? "-" : ""}
              {formatCurrency(animatedBalance)}
            </span>
          </div>

          {committedNextPeriod > 0 && proximo && (
            <p className="font-sans text-[12px] text-muted mt-1">
              <span className="font-display tnum">-{formatCurrency(committedNextPeriod)}</span>
              {' '}{proximo}, todavía sin descontar
            </p>
          )}

          {sinAnclar && (
            <p className="font-sans text-[11px] text-warn mt-2">
              Ninguna cuenta tiene saldo declarado: este número se calcula sumando desde tu primer
              movimiento. Cargá los saldos en Ajustes → Medios de pago.
            </p>
          )}
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="border-t border-border px-5 py-4 space-y-3">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
                      En tus cuentas
                      <HintStop>
                        <InfoHint label="Qué hay en tus cuentas" className="text-faint hover:text-text">
                          La suma de lo que declaraste en cada cuenta de gastar, más los movimientos
                          que registraste desde entonces. Las compras con tarjeta todavía no la
                          tocaron: por eso el resumen se descuenta aparte.
                        </InfoHint>
                      </HintStop>
                    </span>
                    <span className="font-display tnum text-[13px] text-good">
                      +{formatCurrency(pocketTotal)}
                    </span>
                  </div>
                  <ul className="pl-[18px] space-y-1">
                    {accounts.filter((a) => a.bucket === 'pocket').map((a) => (
                      <li key={a.methodId} className="flex justify-between items-baseline gap-2">
                        <span className="min-w-0 truncate text-[11px] text-faint">
                          {a.name}{a.anchored ? '' : ' · sin saldo declarado'}
                        </span>
                        <span className="shrink-0 font-display tnum text-[11px] text-muted">
                          {formatCurrency(a.balance)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {committed > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[13px] text-muted flex items-center gap-1.5">
                        <CreditCard className="h-3 w-3" />
                        Comprometido {periodLabel(incomeRhythm)}
                        <HintStop>
                          <InfoHint label="Qué es lo comprometido" className="text-faint hover:text-text">
                            Plata que está en la cuenta pero ya tiene dueño: mensualidades sin pagar
                            y resúmenes de tarjeta que vencen antes de tu próximo cobro. Al pagarlos,
                            este número no cambia: ya estaban apartados.
                          </InfoHint>
                        </HintStop>
                      </span>
                      <span className="font-display tnum text-[13px] text-bad">
                        -{formatCurrency(committed)}
                      </span>
                    </div>
                    <ul className="pl-[18px] space-y-1">
                      {commitmentItems.map((item) => (
                        <li key={`${item.kind}-${item.id}`} className="flex justify-between items-baseline gap-2">
                          <span className="min-w-0 truncate text-[11px] text-faint">
                            {item.name}
                            {item.dueDate && ` · ${item.isCycleClosed ? 'cerrado' : 'en curso'} · vence ${format(item.dueDate, "d MMM", { locale: es })}`}
                          </span>
                          <span className="shrink-0 font-display tnum text-[11px] text-muted">
                            -{formatCurrency(item.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="pt-2 border-t border-border space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] font-bold text-muted">Tu plata libre</span>
                    <span className={cn("font-display tnum text-[15px]", isNegative ? "text-bad" : "text-good")}>
                      {isNegative ? "-" : "+"}{formatCurrency(available)}
                    </span>
                  </div>

                  {reserveTotal > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
                        Guardado en reservas
                        <HintStop>
                          <InfoHint label="Qué son las reservas" className="text-faint hover:text-text">
                            Lo que decidiste no gastar: ahorro, dólares, plazo fijo, broker. No entra
                            en tu plata libre, así la app no te invita a romper tu propio ahorro.
                          </InfoHint>
                        </HintStop>
                      </span>
                      <span className="font-display tnum text-[13px] text-text">
                        {formatCurrency(reserveTotal)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
```

Y agregar al bloque de imports del archivo:

```ts
import { periodLabel, nextPeriodLabel } from "@/lib/utils/pocket-copy"
```

- [ ] **Step 6: Verificación**

Run: `npm run lint && npx tsc --noEmit && npx vitest run && npm run build`
Expected: lint en baseline exacto, tsc limpio, **448 tests** verdes, build OK.

- [ ] **Step 7: Commitear**

```bash
git add src/lib/finance/pocket.ts src/lib/finance/__tests__/pocket.test.ts src/components/dashboard/balance-card.tsx
git commit -m "feat(inicio): el hero pasa al disponible del bolsillo, con el comprometido del proximo periodo"
```

---

## Task 13: que el chat y la pantalla de medios digan el mismo número

El CLAUDE.md lo pone como garantía estructural: *"el chat y el home dicen el mismo número"*. Si Inicio muestra el disponible del bolsillo y el chat sigue contestando el flujo acumulado, la garantía se rompe. Y si `/ajustes/medios` muestra el saldo histórico de una cuenta anclada, el usuario ve dos verdades sobre la misma cuenta.

**Files:**
- Modify: `src/lib/ai/tools/dataLoader.ts`
- Modify: `src/lib/ai/tools/__tests__/dataLoader.test.ts`
- Modify: `src/lib/ai/tools/readTools.ts`
- Modify: `src/lib/ai/tools/__tests__/readTools.test.ts`
- Modify: `src/lib/ai/tools/__tests__/readToolsB.test.ts`
- Modify: `src/lib/ai/tools/appHelp.ts`
- Modify: `src/app/ajustes/medios/page.tsx`
- Modify: `src/components/medios-pago/institutional-card.tsx`

**Interfaces:**
- Consumes: `computeAvailableToSpend`, `computeAccountBalance` (Tasks 1 y 3).
- Produces: `FinanceData` gana `incomeRhythm: IncomeRhythm`.

- [ ] **Step 1: Traer el ritmo en el snapshot del chat**

En `src/lib/ai/tools/dataLoader.ts`:

Agregar al import de tipos `import type { IncomeRhythm } from '@/lib/finance/pocket'` y sumar el campo a la interfaz:

```ts
export interface FinanceData {
  transactions: ProcessedTransaction[]
  paymentMethods: PaymentMethod[]
  recurringPlans: RecurringPlan[]
  internalTransfers: InternalTransfer[]
  categories: Category[]
  installmentPlans: InstallmentPlan[]
  /** Ritmo de cobro declarado: define qué compromisos descuenta el disponible. */
  incomeRhythm: IncomeRhythm
}
```

En `loadFinanceDataUncached`, sumar la query al `Promise.all` (la fila del usuario vive en `users.id` = UUID de auth, igual que `categories`) y su assert:

```ts
  const [tx, pm, rp, it, cat, ip, er, usr, blue] = await Promise.all([
    supabase.from('transactions').select('*').eq('user_id', userId),
    supabase.from('payment_methods').select('*').eq('user_id', userId),
    supabase.from('recurring_plans').select('*').eq('user_id', userId),
    supabase.from('internal_transfers').select('*').eq('user_id', authUserId),
    supabase.from('categories').select('*').or(`user_id.eq.${authUserId},is_system.eq.true`),
    supabase.from('installment_plans').select('*').eq('user_id', userId),
    supabase.from('exchange_rates').select('*'),
    supabase.from('users').select('income_rhythm').eq('id', authUserId),
    fetchDolarBlue(),
  ])
```

```ts
  assertNoQueryError(usr, 'users')
```

y en el return:

```ts
    incomeRhythm: ((usr.data ?? [])[0]?.income_rhythm as IncomeRhythm) ?? 'monthly',
```

Actualizar también el comentario de "criterio de `user_id` por tabla" agregando la línea de `users`.

- [ ] **Step 2: Actualizar el test del dataLoader**

En `src/lib/ai/tools/__tests__/dataLoader.test.ts`, agregar la tabla al fixture:

```ts
const allTables = {
  transactions: [tx],
  payment_methods: [visa],
  recurring_plans: [netflix],
  internal_transfers: [transfer],
  categories: [category],
  installment_plans: [installment],
  exchange_rates: [] as ExchangeRate[],
  users: [{ income_rhythm: 'monthly' }],
}
```

sumar `'users'` a la lista del `it.each` de propagación de errores, y agregar un test propio:

```ts
  it('trae el ritmo de cobro del usuario; sin fila cae a mensual', async () => {
    const conRitmo = await loadFinanceData(ctxWithTables({ ...allTables, users: [{ income_rhythm: 'irregular' }] }))
    expect(conRitmo.incomeRhythm).toBe('irregular')

    const sinFila = await loadFinanceData(ctxWithTables({ ...allTables, users: [] }))
    expect(sinFila.incomeRhythm).toBe('monthly')
  })
```

Nota: el builder mockeado solo encadena `select`/`eq`/`or`/`order` — **no** tiene `limit` ni `single`. Por eso la query de `users` usa `.eq(...)` a secas y se lee `[0]`.

- [ ] **Step 2b: Completar los fixtures tipados de las tools**

`FinanceData` gana un campo **requerido**, así que los dos fixtures anotados con ese tipo dejan de compilar. Agregarles la propiedad:

- `src/lib/ai/tools/__tests__/readTools.test.ts` línea ≈122, dentro de `const financeData: FinanceData = { ... }`:

```ts
  incomeRhythm: 'monthly',
```

- `src/lib/ai/tools/__tests__/readToolsB.test.ts` línea ≈125, dentro del objeto que devuelve `baseFinanceData`, antes del spread de `overrides`:

```ts
    incomeRhythm: 'monthly',
```

Run: `npx tsc --noEmit`
Expected: limpio. Si aparece el error en otro archivo de tests, agregarle el campo también.

- [ ] **Step 3: Migrar `get_balance_snapshot`**

En `src/lib/ai/tools/readTools.ts`, reemplazar el `execute` de `get_balance_snapshot` por:

```ts
    execute: async (_args, ctx) => {
      const data = await loadFinanceData(ctx)
      const now = new Date()
      const pendingCards = computePendingCreditCards(
        data.paymentMethods,
        data.transactions,
        data.recurringPlans,
        now,
      )
      const r = computeAvailableToSpend({
        paymentMethods: data.paymentMethods,
        transactions: data.transactions,
        transfers: data.internalTransfers,
        recurringPlans: data.recurringPlans,
        pendingCards,
        rhythm: data.incomeRhythm,
        now,
      })
      return {
        ok: true,
        data: {
          disponible: Math.round(r.available),
          enTusCuentas: Math.round(r.pocketTotal),
          guardadoEnReservas: Math.round(r.reserveTotal),
          comprometido: Math.round(r.committed),
          comprometidoProximoPeriodo: Math.round(r.committedNextPeriod),
          detalleComprometido: r.commitmentItems.map((i) => ({
            concepto: i.name,
            monto: Math.round(i.amount),
            tipo: i.kind === 'card' ? 'tarjeta' : 'mensualidad',
            vence: i.dueDate ? formatLocalDate(i.dueDate) : null,
          })),
          cuentas: r.accounts.map((a) => ({
            medio: a.name,
            saldo: Math.round(a.balance),
            tipo: a.bucket === 'reserve' ? 'reserva' : 'bolsillo',
            saldoDeclarado: a.anchored,
          })),
        },
      }
    },
```

Actualizar su `description` para que el modelo sepa qué está pidiendo:

```ts
    description:
      'Plata disponible del usuario: lo que tiene hoy en sus cuentas de gastar menos lo que ya está comprometido en el período (mensualidades y resúmenes de tarjeta). Incluye el saldo por cuenta y lo guardado en reservas. Usar para "cuánta plata tengo".',
```

Y ajustar los imports del archivo: sacar `computeGlobalBalance` (ya no se usa acá) y agregar `import { computeAvailableToSpend, computeAccountBalance } from '@/lib/finance/pocket'`. **Verificar con `npm run lint` que `computePendingFixedExpenses` siga usándose en el archivo antes de sacarlo del import** — si quedó huérfano, sacarlo también.

Los dos tests de `get_balance_snapshot` en `src/lib/ai/tools/__tests__/readTools.test.ts` (líneas ≈143-170) assertan el contrato viejo. Reemplazar el `describe` entero por:

```ts
  describe('get_balance_snapshot', () => {
    it('devuelve el disponible del bolsillo, con las cuentas y lo comprometido', async () => {
      const r = await executeToolWith(readTools, 'get_balance_snapshot', {}, ctx)
      expect(r.ok).toBe(true)
      const d = r.data as Record<string, unknown>
      expect(d).toHaveProperty('disponible')
      expect(d).toHaveProperty('enTusCuentas')
      expect(d).toHaveProperty('comprometido')
      expect(d).toHaveProperty('cuentas')
    })

    it('calcula los valores exactos a partir del dataset (a mano)', async () => {
      const r = await executeToolWith(readTools, 'get_balance_snapshot', {}, ctx)
      expect(r.ok).toBe(true)
      const d = r.data as Record<string, number>
      // El debito no esta anclado: suma su historial (200000 ingresos - 30000 gasto = 170000).
      // La Visa no tiene saldo: su resumen (15000) vence el 10-jul, dentro del mes → comprometido.
      // Netflix (5000) no tiene medio asignado, asi que no es un fijo de credito: tambien comprometido.
      expect(d.enTusCuentas).toBe(170000)
      expect(d.comprometido).toBe(20000)
      expect(d.disponible).toBe(150000)
    })
  })
```

⚠️ Los montos de arriba salen de leer el dataset del archivo (`pmVisa`, `pmDebito`, `planNetflix` y las transacciones que definen). **Correr el test y confirmar los números contra el dataset real antes de darlos por buenos**: si no coinciden, verificar cuál de los dos está mal —el cálculo o la cuenta a mano— y recién ahí ajustar. No cambiar el expected para que pase sin entender por qué.

- [ ] **Step 4: Migrar el saldo de débito en `get_payment_method_status`**

En el mismo archivo, dentro de `summarize`, la rama sin `nextPaymentDate` (débito/efectivo) devuelve `projectedTotal`, que es el saldo histórico sin ancla. Cambiar el objeto que devuelve esa rama por:

```ts
        return {
          medio: method.name,
          tipo: method.type,
          saldo: Math.round(computeAccountBalance(method, data.transactions, data.internalTransfers, now)),
          bolsillo: method.bucket === 'pocket',
          saldoDeclarado: method.initial_balance_at !== null,
        }
```

Se conserva la clave `saldo` (el contrato que el modelo ya conoce) y se suman dos flags para que el chat pueda decir "esa es una reserva" o "todavía no me dijiste cuánto tenés ahí".

En `src/lib/ai/tools/__tests__/readTools.test.ts`, los tres tests de `get_payment_method_status` que tocan el débito esperan `{ medio: 'Débito Galicia', tipo: 'debit', saldo: 170000 }`. Agregarles los dos campos nuevos en las tres expectativas:

```ts
        {
          medio: 'Débito Galicia',
          tipo: 'debit',
          saldo: 170000,
          bolsillo: true,
          saldoDeclarado: false,
        },
```

(el fixture `pmDebito` no tiene `bucket` ni `initial_balance_at`, así que llegan `undefined`; agregarle al fixture `bucket: 'pocket'` e `initial_balance_at: null` para que el test refleje una fila real de la base).

- [ ] **Step 4b: El diccionario del chat deja de describir el modelo viejo**

`appHelp.ts` es el diccionario estático que el chat usa para "¿qué significa X?", y el CLAUDE.md manda mantenerlo fiel. Sus dos primeras entradas describen el modelo de flujo acumulado.

En `src/lib/ai/tools/appHelp.ts`, reemplazar la entrada `'disponible-real'`:

```ts
  'disponible-real': {
    titulo: 'Tu plata libre (disponible)',
    explicacion:
      'Es el número grande del inicio: lo que hay hoy en tus cuentas de gastar, menos lo que ya tiene dueño en este período (mensualidades sin pagar y resúmenes de tarjeta que vencen antes de tu próximo cobro). Arranca del saldo que vos declaraste en cada cuenta, no de sumar tus movimientos desde el día uno. Lo que guardaste en reservas no cuenta: decidiste no gastarlo. Y ojo con esto: cuando pagás una mensualidad o el resumen de una tarjeta, este número NO se mueve — esa plata ya estaba apartada; lo que baja es el saldo de la cuenta con la que pagaste.',
  },
```

Y reemplazar la entrada `'saldo-bruto'` (el concepto ya no existe en el modelo) por:

```ts
  'bolsillo-y-reserva': {
    titulo: 'Bolsillo y reserva',
    explicacion:
      'Cada cuenta tuya es una de dos cosas: bolsillo, de donde gastás, o reserva, lo que decidiste no gastar (ahorro, dólares, plazo fijo, un broker). Solo el bolsillo entra en tu plata libre. Si contara la reserva, la app te estaría invitando a romper tu propio ahorro sin decírtelo. Podés cambiar qué es cada cuenta desde Ajustes → Medios de pago.',
  },
  'ritmo-de-cobro': {
    titulo: 'Ritmo de cobro',
    explicacion:
      'Le decís a Chanchito cada cuánto entra plata (todos los meses, cada quincena, todas las semanas, o cuando cae), no qué día exacto cobrás. Con eso alcanza para saber qué compromisos te toca cubrir antes del próximo cobro: esos se descuentan de tu plata libre, y los que vencen después se muestran aparte. Si elegís "cuando cae" no hay próximo cobro que asumir, así que se descuenta todo lo comprometido: es la lectura conservadora.',
  },
```

El test `appHelp.test.ts` solo exige que el título de `disponible-real` contenga "disponible" y que la lista de temas tenga más de 5 entradas: ambas se siguen cumpliendo. Correr `npx vitest run src/lib/ai/tools/__tests__/appHelp.test.ts` para confirmarlo.

- [ ] **Step 5: El saldo anclado en `/ajustes/medios`**

En `src/app/ajustes/medios/page.tsx`, sumar el getter nuevo al destructuring del store y pasarle el saldo a la card:

```ts
    getAvailableToSpend,
```

```ts
  const { institutionalMethods, personalMethods } = useMemo(() => {
    const cuentas = getAvailableToSpend().accounts
    const methodsWithData = paymentMethods.map(pm => {
      const status = getPaymentMethodStatus(pm.id);
      const history = getPaymentMethodTransactionsForCurrentMonth(pm.id);
      const subscriptions = recurringPlans.filter(
        p => p.payment_method_id === pm.id && p.is_active
      );
      const cuenta = cuentas.find((a) => a.methodId === pm.id) ?? null;
      return { ...pm, status, history, subscriptions, cuenta };
    });
    return {
      institutionalMethods: methodsWithData.filter(m => !m.is_personal),
      personalMethods: methodsWithData.filter(m => m.is_personal),
    };
  }, [paymentMethods, transactions, recurringPlans, getPaymentMethodStatus, getPaymentMethodTransactionsForCurrentMonth, getAvailableToSpend]);
```

En `src/components/medios-pago/institutional-card.tsx`:

Agregar el import del tipo y el campo a las props:

```ts
import type { AccountBalance } from '@/lib/finance/pocket';
```

```ts
export interface PaymentCardProps {
  data: PaymentMethod & {
    status: { /* ...sin cambios... */ };
    history: Transaction[];
    subscriptions: RecurringPlan[];
    /** Saldo del modelo de bolsillo. null para las tarjetas de crédito, que no tienen saldo propio. */
    cuenta: AccountBalance | null;
  };
}
```

En el cuerpo, después de `const { status, history, subscriptions } = data;`, agregar:

```ts
  const cuenta = data.cuenta;
  // El saldo de una cuenta sale del modelo de bolsillo (anclado); el de una tarjeta,
  // de su ciclo. `status.projectedTotal` para débito es el histórico sin ancla: no se usa.
  const saldo = cuenta ? cuenta.balance : status.projectedTotal;
  const balanceIsNegative = saldo < 0;
```

y **borrar** la línea vieja `const balanceIsNegative = status.projectedTotal < 0;`.

En el header, junto al `<h3>` del nombre, agregar el chip de reserva:

```tsx
              <div className="flex items-center gap-2">
                <h3 className="font-sans font-bold text-text">{data.name}</h3>
                {cuenta?.bucket === 'reserve' && (
                  <span className="rounded-full border-[1.5px] border-border px-2 py-0.5 text-[10px] font-bold text-muted">
                    Reserva
                  </span>
                )}
              </div>
```

En el bloque del monto principal, la rama no-crédito pasa a:

```tsx
              <>
                <p
                  className={cn(
                    'font-display tnum text-2xl leading-none',
                    balanceIsNegative ? 'text-bad' : 'text-good'
                  )}
                >
                  {formatCurrency(saldo)}
                </p>
                {cuenta && !cuenta.anchored && (
                  <p className="mt-1 text-[11px] text-faint">Sin saldo declarado</p>
                )}
              </>
```

Y la etiqueta de arriba, para que no diga "disponible" cuando es una reserva:

```tsx
            <p className="text-xs text-muted mb-1">
              {isCredit ? 'A pagar este ciclo' : cuenta?.bucket === 'reserve' ? 'Guardado' : 'Saldo disponible'}
            </p>
```

`PaymentMethodDetailModal` recibe `data` entero: como el campo nuevo es aditivo, no hay que tocarlo. Si `tsc` se queja de su prop, ampliarle el tipo igual que acá.

- [ ] **Step 6: Verificación**

Run: `npm run lint && npx tsc --noEmit && npx vitest run && npm run build`
Expected: lint en baseline exacto, tsc limpio, **450 tests** verdes (448 + el del ritmo en `dataLoader.test.ts` + el caso `users` del `it.each`), build OK.

- [ ] **Step 7: Commitear**

```bash
git add src/lib/ai src/app/ajustes/medios src/components/medios-pago
git commit -m "feat(bolsillo): el chat y la pantalla de medios hablan del saldo anclado"
```

---

## Task 14: editar el saldo y el bucket de una cuenta desde Ajustes

El spec cierra con *"Después: todo editable desde Ajustes"*. El ritmo ya quedó editable (Task 11) y los saldos se ven (Task 13), pero falta poder corregirlos: el saldo declarado envejece, una cuenta pasa de bolsillo a reserva, y un medio creado después del onboarding nace sin anclar.

No hace falta tocar `createPaymentMethodSchema` ni las actions de medios de pago: `saveAccountAnchors` (Task 6) ya hace exactamente esto, y el cálculo del ancla necesita el store, que vive en el cliente.

**Files:**
- Create: `src/components/pocket/edit-anchor-dialog.tsx`
- Modify: `src/components/medios-pago/institutional-card.tsx`

**Interfaces:**
- Consumes: `anchorValueForDeclaredBalance` (Task 3), `AccountAnchorFields` (Task 7), `saveAccountAnchors` (Task 6).
- Produces: `<EditAnchorDialog method open onOpenChange />`.

- [ ] **Step 1: El diálogo**

```tsx
// src/components/pocket/edit-anchor-dialog.tsx
'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AccountAnchorFields } from '@/components/pocket/account-anchor-fields'
import { useFinanceStore } from '@/lib/store/financeStore'
import { anchorValueForDeclaredBalance } from '@/lib/finance/pocket'
import { saveAccountAnchors } from '@/app/bolsillo/actions'
import { dateToLocalString } from '@/lib/utils/dates'
import type { PaymentMethod } from '@/types/database'

/**
 * Corrige el ancla de una cuenta: el saldo declarado envejece, y una cuenta puede
 * pasar de bolsillo a reserva. Lo que se guarda no es lo declarado sino el saldo al
 * comienzo del día (`anchorValueForDeclaredBalance`), para no restar dos veces lo que
 * el usuario ya registró hoy.
 */
export function EditAnchorDialog({
  method,
  open,
  onOpenChange,
}: {
  method: PaymentMethod
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const { transactions, internalTransfers, fetchAllData } = useFinanceStore()
  const [bucket, setBucket] = useState<'pocket' | 'reserve'>(method.bucket)
  const [balance, setBalance] = useState('')
  const [guardando, setGuardando] = useState(false)

  const guardar = async () => {
    setGuardando(true)
    try {
      const hoy = dateToLocalString(new Date())
      const declarado = balance.trim() === '' ? null : Number(balance)
      const res = await saveAccountAnchors([
        {
          payment_method_id: method.id,
          bucket,
          initial_balance:
            declarado === null
              ? 0
              : anchorValueForDeclaredBalance(declarado, method, transactions, internalTransfers, hoy),
          initial_balance_at: declarado === null ? null : hoy,
        },
      ])
      if (res.error) {
        toast.error(res.error)
        return
      }
      await fetchAllData()
      toast.success('Saldo actualizado')
      onOpenChange(false)
      setBalance('')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-surface border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-text">Saldo de {method.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <AccountAnchorFields
            bucket={bucket}
            balance={balance}
            onBucketChange={setBucket}
            onBalanceChange={setBalance}
          />
          <p className="font-sans text-[11px] text-faint">
            Desde acá, Chanchito cuenta los movimientos que registres. Los anteriores ya están
            adentro de este número.
          </p>
          <Button variant="accent" className="w-full h-11" onClick={guardar} disabled={guardando}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Entrada desde la card**

En `src/components/medios-pago/institutional-card.tsx`, importar el diálogo, agregar su estado y sumar un ítem al `DropdownMenuContent`, solo para medios no-crédito:

```ts
import { EditAnchorDialog } from '@/components/pocket/edit-anchor-dialog';
import { Scale } from 'lucide-react';
```

```ts
  const [isAnchorOpen, setIsAnchorOpen] = useState(false);
```

Dentro del `<DropdownMenuContent>`, antes del ítem "Editar":

```tsx
              {!isCredit && (
                <DropdownMenuItem
                  onClick={() => setIsAnchorOpen(true)}
                  className="gap-2 cursor-pointer focus:bg-surface-2 focus:text-text"
                >
                  <Scale className="h-4 w-4" />
                  Saldo y tipo
                </DropdownMenuItem>
              )}
```

Y junto a los otros diálogos del final:

```tsx
      {!isCredit && (
        <EditAnchorDialog method={data} open={isAnchorOpen} onOpenChange={setIsAnchorOpen} />
      )}
```

- [ ] **Step 3: Verificación**

Run: `npm run lint && npx tsc --noEmit && npx vitest run && npm run build`
Expected: lint en baseline exacto, tsc limpio, tests verdes, build OK.

- [ ] **Step 4: Commitear**

```bash
git add src/components/pocket/edit-anchor-dialog.tsx src/components/medios-pago/institutional-card.tsx
git commit -m "feat(bolsillo): editar el saldo declarado y el tipo de cada cuenta desde Ajustes"
```

---

## Task 15: cierre — documentación, retiro del modelo viejo y gate

**Files:**
- Modify: `CLAUDE.md`
- Modify: `src/lib/store/financeStore.ts`
- Delete: `src/lib/store/__tests__/disponible-real.test.ts`

- [ ] **Step 1: Verificación completa antes del gate**

Run: `npm run lint && npx tsc --noEmit && npx vitest run && npm run build`
Expected: lint = 24 errores / 11 warnings exactos, tsc limpio, todos los tests verdes, build OK.

- [ ] **Step 2: Gate visual con Lauti**

Abrir en el navegador a 390px, en tema día y noche. Confirmar uno por uno:

1. `/puesta-a-punto` — los cuatro pasos, la comparación "antes decía / ahora dice" con números que se entienden.
2. `/` — el hero con el número nuevo, la línea del próximo período, el desglose expandido (cuentas, comprometido con vencimientos, reservas).
3. `/` con el recordatorio visible (si hace menos de 2 días que se registró algo, no aparece: forzarlo con `localStorage.removeItem('chanchito.reconcileReminderSnoozedUntil')` y verificando `getDaysSinceLastRegistration()` desde la consola).
4. El diálogo de ajuste: elegir cuenta, declarar un saldo distinto, ver la diferencia y las tres opciones.
5. `/ajustes` — el selector de ritmo y el acceso al ajuste.
6. `/ajustes/medios` — los saldos anclados, el chip de Reserva, y el menú "Saldo y tipo" corrigiendo el saldo de una cuenta.
7. Onboarding completo en una cuenta de prueba, si es viable.
8. El chat: preguntarle "¿cuánta plata tengo?" y confirmar que dice **el mismo número** que el hero de Inicio.

**No seguir sin el OK de Lauti.** Si algo no cierra, se corrige antes de tocar el Step 3.

- [ ] **Step 3: Retirar el getter viejo**

Con el gate aprobado, ya no queda ninguna pantalla sobre el modelo de flujo acumulado. `getRealAvailableBalance` es el envoltorio que servía al `BalanceCard` viejo: se va, con su archivo de tests (sus dos invariantes ya viven en E8/E9, Task 4).

En `src/lib/store/financeStore.ts`, borrar la firma de la interfaz (≈ líneas 193-201) y su implementación (≈ líneas 1055-1080).

```bash
rm src/lib/store/__tests__/disponible-real.test.ts
```

`getGlobalBalance` y `computeGlobalBalance` **se quedan**: son "el cálculo viejo" que la puesta a punto muestra para explicar el cambio. Agregarle a `getGlobalBalance` en la interfaz del store el comentario:

```ts
  /**
   * El cálculo viejo: flujo acumulado desde el primer movimiento. NO es el disponible.
   * Se muestra únicamente en /puesta-a-punto, para explicarle al usuario por qué su
   * número cambió. Para el disponible, usar getAvailableToSpend().
   */
  getGlobalBalance: () => number;
```

- [ ] **Step 4: Actualizar el CLAUDE.md**

En la sección "Store", reemplazar la entrada de `getRealAvailableBalance` por:

```markdown
- `getAvailableToSpend()` – **el número central**: el disponible del bolsillo. `available = Σ saldo(cuentas con bucket 'pocket') − compromisos del período`. Expone `pocketTotal`, `reserveTotal`, `committed`, `committedNextPeriod`, `commitmentItems` y `accounts` (saldo y `anchored` por cuenta). Wrapper fino de `computeAvailableToSpend` (`lib/finance/pocket.ts`). El ritmo sale de `users.income_rhythm`. Invariantes: pagar una tarjeta o una mensualidad NO mueve `available` (tests E8/E9 en `lib/finance/__tests__/escenarios-disponible.test.ts`).
- `getGlobalBalance()` – **el cálculo viejo** (flujo acumulado desde el primer movimiento). NO es el disponible: se usa solo en `/puesta-a-punto` para explicar el cambio de número.
- `getDaysSinceLastRegistration()` – días desde el último registro (por `created_at`, no por `date`). Dispara el recordatorio de conciliación a los 2 días.
```

Agregar una sección propia después de "Lógica financiera compartida":

```markdown
## Modelo de bolsillo (`lib/finance/pocket.ts`)

El disponible sale **solo del bolsillo**: `payment_methods.bucket` decide si una cuenta cuenta (`'pocket'`) o no (`'reserve'`). Es ortogonal a `type`: una reserva puede ser una caja de ahorro, un broker o un plazo fijo.

- **Saldo anclado**: `initial_balance` + `initial_balance_at`. Sin fecha, la cuenta está "sin anclar" y suma desde el primer movimiento (el modelo viejo). Con fecha, se computan solo los movimientos entre el ancla y **hoy** — una cuota que vence en febrero todavía no salió de la cuenta.
- **`amount` se guarda SIEMPRE positivo**: el signo lo lleva `type`. Nunca asumir montos con signo.
- **Convertir un saldo declarado en ancla**: `anchorValueForDeclaredBalance()`. Guardar el declarado tal cual restaría dos veces lo ya registrado hoy.
- **Compromisos del período** (`computeCommitments`): un fijo se descuenta si sale del bolsillo y vence dentro del período. Los fijos de **crédito NO se descuentan**: ya viajan dentro del resumen de su tarjeta. Los resúmenes que vencen después del período van a `committedNextPeriod`, que se muestra pero no baja el disponible.
- **Ritmo de cobro** (`users.income_rhythm`): se declara el ritmo, no la fecha. `irregular` = sin período: se descuenta todo lo comprometido, que es la lectura conservadora cuando no hay próximo cobro que asumir.
- **Conciliación** (`lib/finance/reconcile.ts` + `src/app/bolsillo/actions.ts`): primero se recupera el dato (recordatorio de anotar a los 2 días), y solo si el usuario afirma que ya anotó todo se ofrece el ajuste. Un ajuste es una transacción con `is_balance_adjustment = true`: queda visible en el historial, **nunca** reescribe el pasado, y se excluye de las analíticas de consumo igual que `card_payment_for`.
- **Limitación conocida**: el pago parcial de tarjeta queda fuera de alcance. `isCreditCardCyclePaid` da el ciclo por saldado con cualquier pago en el mes del vencimiento; quien paga el mínimo queda con deuda viva e intereses y la app le dice que está al día.
- Spec: `docs/superpowers/specs/2026-08-20-disponible-real-anclado-design.md`.
```

En la sección "Fechas y ciclos de tarjeta", agregar al final:

```markdown
- Los **ajustes de saldo** (`is_balance_adjustment`) quedan fuera de las analíticas de consumo, igual que los pagos de tarjeta: `isExpenseInCurrentMonthScope`, `computeExpensesByCategory`, `getGlobalEffectiveExpenses` y `getMonthlyIncome` los excluyen. **Sí** se ven en `/movimientos`: el spec pide que el ajuste sea visible.
```

- [ ] **Step 5: Verificación final**

Run: `npm run lint && npx tsc --noEmit && npx vitest run && npm run build`
Expected: lint en baseline exacto, tsc limpio, **432 tests** verdes (450 menos los 18 del archivo borrado), build OK.

- [ ] **Step 6: Commitear y cerrar el slice**

```bash
git add CLAUDE.md src/lib/store
git commit -m "docs: modelo de bolsillo al CLAUDE.md + retiro del disponible viejo"
```

- [ ] **Step 7: Merge y deploy**

Con el OK del Step 2 ya dado: merge ff de `feat/disponible-anclado-ui` a `master`, push, borrar la rama, verificar que el deploy de Vercel quede READY.

- [ ] **Step 8: Verificar en producción**

Abrir la app logueado: el middleware tiene que mandar a `/puesta-a-punto` la primera vez. Completar el flujo con los saldos reales y confirmar que el número de Inicio queda cerca de lo que hay en la cuenta.

- [ ] **Step 9: Actualizar el vault**

`40-PROYECTOS/Chanchito/Chanchito - Status & Roadmap` y la Bitácora: el modelo de bolsillo quedó en producción, con los dos bugs del motor que solo aparecían contra datos reales y cómo se encontraron.

---

## Fuera de alcance de este plan (deliberado)

- **Pago parcial de tarjeta.** Documentado como limitación conocida en el CLAUDE.md (Task 14). Arrastra saldo refinanciado, intereses y punitorios: es un proyecto propio.
- **Pantalla de "mover plata entre cuentas".** Las columnas `from/to_payment_method_id` quedan escritas por la conciliación (clasificación "lo mandé a una reserva"), que el spec deja disponible siempre a pedido. Una pantalla dedicada de transferencias no está en el spec y no se agrega.
- **Valuación de reservas en moneda extranjera.** Las reservas se muestran en pesos, con su saldo tal como se declaró. Valuarlas queda para cuando exista la vista de patrimonio.
- **Gasto pagado desde una reserva** (E5) no necesita UI nueva: registrar un gasto eligiendo la reserva como medio de pago ya hace exactamente lo que el spec describe —baja la reserva, no toca el disponible, suma a su categoría— y está cubierto por el test E5 del Plan 1.
