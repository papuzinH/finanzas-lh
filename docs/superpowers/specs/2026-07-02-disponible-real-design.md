# Disponible Real (Número Central del Dashboard) — Diseño

**Fecha:** 2026-07-02
**Estado:** Aprobado (brainstorming) — pendiente de plan de implementación

## Problema

El "saldo del mes" que hoy muestra `balance-card.tsx` es una proyección mensual (ingreso del mes - gasto del mes) que resetea cada mes y no responde la pregunta real del usuario: "¿cuánta plata puedo gastar hoy sin cagarla?". Mezcla conceptos (gastos ya pagados, gastos fijos pendientes y deuda de tarjeta) en un solo número, generando ansiedad o falsa sensación de holgura según el momento del mes.

## Objetivo

Reemplazar la hero card del home por un número que refleje el **patrimonio líquido real acumulado**, neto de todo lo que ya está comprometido (gastos fijos sin pagar este mes + tarjeta de crédito sin pagar este ciclo), sin importar cuándo cobra el usuario. Pagar algo pendiente no debe mover el número — solo mueve el monto de "comprometido" a "ya gastado".

## Alcance

**Incluye:**
- Nuevo getter `getRealAvailableBalance()` — Nivel 1 y 2 (número central + desglose).
- Nuevo getter `getPendingFixedExpenses()` — aísla lógica de "mensualidad sin transacción este mes" que hoy vive inline en `getMonthlyBalance`.
- Nuevo getter `getNextMonthCardExposure()` — Nivel 3 (Fondo de Ojo).
- Reemplazo de `balance-card.tsx` (hero card del home) para consumir `getRealAvailableBalance()`.
- Nueva card `next-month-card-exposure-card.tsx` en el home, debajo de la hero card.
- Advertencia en el diálogo "¿Ya pagaste la tarjeta?" (`credit-card-cycle-card.tsx`) cuando se marca pagada antes de que cierre el resumen.
- Nuevo insight en `getInsights()` cuando una tarjeta vence sin marca manual (se asume pagada automáticamente).

**No incluye:**
- Campo de "saldo declarado manualmente" ni cambios de schema/Supabase. Todo se deriva de transacciones existentes.
- Cambios en `getGlobalBalance()` ni en otros getters que la consumen hoy (queda intacto, se usa en otras pantallas).
- Rediseño visual de `installments-real-cost-card.tsx` ni de otras cards de análisis ya en curso (ritmo de gasto, cuotas).
- Tracking histórico por ciclo de "pagado/no pagado" de tarjetas más allá de lo que ya guarda `paidCycles` (un flag por tarjeta, ciclo más reciente).

## Lógica de cálculo

### `getRealAvailableBalance()`

Retorna:
```ts
{
  saldoBruto: number;
  pendingFixedExpenses: number;
  pendingFixedItems: Array<{ id: number; name: string; amount: number }>;
  pendingCardTotal: number;
  pendingCardItems: CreditCardCycleSummary[]; // reusa getPendingCreditCardByCard()
  disponibleReal: number; // saldoBruto - pendingFixedExpenses - pendingCardTotal
}
```

**`saldoBruto`** — histórico acumulado, excluyendo lo que ya se cuenta en los otros dos buckets para no restarlo dos veces:

```
totalIncome                    = Σ transactions (type=income), histórico completo
pendingCardIds                 = Set de methodId con isPending=true (getPendingCreditCardByCard)

gastosVariables                = Σ transactions (type=expense, sin installment_plan_id, sin recurring_plan_id)
                                  EXCLUYENDO transacciones cuyo payment_method_id ∈ pendingCardIds
                                  Y cuyo periodDate cae en el ciclo actual
                                  (los ciclos pasados de esa misma tarjeta SIEMPRE cuentan — ya se facturaron)

cuotas                         = Σ transactions (type=expense, con installment_plan_id)
                                  EXCLUYENDO cuotas del ciclo actual de tarjetas en pendingCardIds
                                  (cuotas de ciclos pasados siempre cuentan)

mensualidadesPagadas           = Σ transactions (type=expense, con recurring_plan_id) — CUALQUIER mes,
                                  representan pago real ya realizado (no el burn rate flat)

transferenciasAhorro           = Σ internalTransfers, histórico completo

saldoBruto = totalIncome - gastosVariables - cuotas - mensualidadesPagadas - transferenciasAhorro
```

**`pendingFixedExpenses`** — nuevo getter `getPendingFixedExpenses()`, extrae el patrón ya usado en `getMonthlyBalance` (líneas ~1497-1510): mensualidad activa cuyo `payment_method_id` no importa, sin transacción vinculada (`recurring_plan_id === plan.id`) en el mes actual.

```
activePlans = recurringPlans.filter(is_active)
pendingFixedItems = activePlans.filter(plan => NO existe transacción este mes con recurring_plan_id === plan.id)
pendingFixedExpenses = Σ pendingFixedItems.amount
```

**`pendingCardTotal`** — sin código nuevo, reusa `getPendingCreditCardByCard().filter(c => c.isPending)`, sumado.

### Invariante (verificada por álgebra)

Antes de pagar: `disponibleReal = saldoBruto - pendingFixedExpenses - cardAmount` (cardAmount vive en `pendingCardTotal`, sus transacciones excluidas de `saldoBruto`).

Al marcar la tarjeta pagada: sus transacciones entran a `saldoBruto` (`saldoBruto_nuevo = saldoBruto_viejo - cardAmount`), `pendingCardTotal → 0`. Resultado: `disponibleReal` no cambia. Mismo razonamiento aplica a mensualidades: al pagar una, su monto pasa de `pendingFixedExpenses` a estar dentro de `saldoBruto` (vía `mensualidadesPagadas`), sin cambiar el total.

### `getNextMonthCardExposure()` (Fondo de Ojo)

```ts
{
  nextCyclePurchases: number; // compras de tarjeta ya cargadas con periodDate en el mes siguiente
  futureInstallments: number; // cuotas de planes activos que vencen después de este ciclo
  total: number;
}
```

- `nextCyclePurchases`: transacciones de tarjeta de crédito (sin installment_plan_id) cuyo `periodDate` ya cae en el mes calendario siguiente al actual — no requiere lógica de fechas nueva, `periodDate` ya resuelve el cierre de ciclo.
- `futureInstallments`: por cada plan de cuotas activo, `remaining` (de `getInstallmentStatus`) menos la cuota que vence este mes (si aplica a ese plan).

### Advertencias UX sobre pago de tarjeta

**Marcar pagada antes de tiempo:** en el `AlertDialog` de `credit-card-cycle-card.tsx` ("¿Ya pagaste la tarjeta?"), si `now < nextClosingDate` (el resumen todavía no cerró), se agrega una línea de advertencia dentro de `AlertDialogDescription`:
> ⚠️ El resumen todavía no cerró (cierra el {fecha}). Compras nuevas hasta esa fecha se restarán de tu Disponible Real al instante.

No bloquea la acción — solo informa. El usuario puede confirmar igual.

**Vencimiento sin marca manual:** la transición ya ocurre sola (`isPending = !isPaidManually && now < nextPaymentDate` ya excluye del bucket pendiente apenas pasa el vencimiento). Lo nuevo es el aviso: en `getInsights()`, cuando alguna tarjeta cumple `!isPaidManually && now >= nextPaymentDate`, se agrega:
```ts
{ type: 'info', message: `${card.name} venció el ${fecha} — la asumimos pagada automáticamente`, icon: 'CreditCard' }
```
Se muestra en el `InsightsCarousel` ya existente en el home, sin componente nuevo.

## Estructura en pantalla

**Nivel 1 — Foco principal:** reemplaza `balance-card.tsx` como hero card del home (mismo look `bg-hero text-cream rounded-[26px] shadow-float`, mismo patrón clic-para-expandir y count-up animado ya implementado). Label: "Tu plata libre para hoy". Número grande = `disponibleReal`.

**Nivel 2 — Desglose:** dentro del detalle expandible de la misma hero card, reemplaza el desglose actual (Ingresos/Gastos variables/Cuotas/Mensualidades) por:
```
+ Cuenta total              (saldoBruto)
- Gastos fijos por pagar    (pendingFixedExpenses, con lista de pendingFixedItems si hay)
- Tarjeta de este mes       (pendingCardTotal, reusa el detalle por tarjeta que ya existe hoy)
= Disponible Real
```

**Nivel 3 — Fondo de Ojo:** card nueva y separada (`next-month-card-exposure-card.tsx`), debajo de la hero card en el home, mismo estilo que `installments-real-cost-card.tsx` (`bg-surface border-[1.5px] border-border rounded-2xl`). Muestra `getNextMonthCardExposure().total`. No participa del cálculo de Nivel 1/2.

## Componentes nuevos / modificados

```
src/lib/store/financeStore.ts
  + getRealAvailableBalance()
  + getPendingFixedExpenses()
  + getNextMonthCardExposure()
  ~ getInsights() — nuevo insight de vencimiento automático

src/components/dashboard/balance-card.tsx        (modificado: consume getRealAvailableBalance())
src/components/dashboard/next-month-card-exposure-card.tsx   (nuevo)
src/components/compromisos/credit-card-cycle-card.tsx        (modificado: advertencia pre-cierre)
```

## Edge cases conocidos

- Mensualidad pagada con una tarjeta de crédito cuya cuenta está pendiente: su transacción cuenta en `mensualidadesPagadas` (siempre), pero no se excluye vía `pendingCardIds` como los gastos variables/cuotas. Caso raro, no bloqueante — documentado como limitación conocida, no se resuelve en esta iteración.
- Si el usuario marca "pagada" y luego carga una compra nueva dentro del mismo ciclo (antes del cierre), esa compra entra directo a `saldoBruto` y baja `disponibleReal` al instante — comportamiento esperado, mitigado con la advertencia de pre-cierre.
