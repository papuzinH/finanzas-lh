# Spec: reconversión de "Consumo tarjeta próximo mes" → "Lo que se viene" (próximos vencimientos)

> Fecha: 2026-07-06 · Branch base: `master`
> Objetivo: transformar la card `NextMonthCardExposureCard` del home, hoy un total
> abstracto ("Ya comprometido $X"), en una **agenda concreta de próximos
> vencimientos de tarjeta** con fecha y monto por tarjeta.

## Contexto y problema

En el home (`src/app/page.tsx`, rail derecho de la sección superior) vive la card
`NextMonthCardExposureCard` ("Consumo tarjeta próximo mes"), alimentada por el getter
`getNextMonthCardExposure()` del store. Hoy muestra un total ("Ya comprometido") con
dos sublíneas ("Compras del próximo cierre" + "Cuotas del próximo mes") y el copy
"No toca tu plata de hoy. Prepara el terreno para el mes que viene."

**Problema (validado con el usuario):** la card se siente vaga y no comunica de dónde
sale el número. Diagnóstico:

1. **Es un número sin acción** — solo informa, no habilita ningún trabajo.
2. **Desconectada del hero** — el hero (`BalanceCard`) ya muestra *"Tarjeta de este
   mes"* (ciclo actual, plata apartada del disponible). Esta card habla del *próximo*
   mes pero sin puente ni relación explícita.
3. **"No toca tu plata de hoy" se autosabotea** — le dice al usuario que no importa
   para hoy → ¿para qué la miro ahora?
4. **Origen abstracto e inconsistente** — `getNextMonthCardExposure()` agrupa por
   **mes calendario** (`nextMonthKey`), mientras el resto de la app razona por
   **ciclo de tarjeta**. El número no se puede anclar a un evento concreto.

## Decisiones tomadas (brainstorming)

- **Trabajo que debe cumplir:** *saber qué se viene, con fechas concretas* (conciencia
  situacional accionable), no un freno ni una herramienta de ahorro.
- **Forma elegida:** *vencimientos por tarjeta* — una fila por tarjeta con su fecha de
  vencimiento y monto. Se descartaron: agenda amplia (tarjetas + fijos, perdía foco),
  timeline 2-3 meses (más abstracto), y eliminar la card (la señal tiene valor si se
  vuelve concreta).
- **Alcance:** *solo lo que aún NO vence* — el resumen del **próximo ciclo**,
  complementario al hero (que cubre el ciclo actual). Sin solapamiento ni doble-conteo.
- **Interacción:** filas **tappeables** → detalle de la tarjeta.
- **Título:** *"Lo que se viene"* · subtítulo *"Próximos resúmenes de tarjeta"*.

---

## Diseño

### 1 · Semántica

La card responde a **una** pregunta nítida:
*"¿Cuándo y cuánto voy a pagar de cada tarjeta en el próximo resumen (el que todavía no vence)?"*

- **Complementaria al hero, sin pisarlo:**
  - Hero → resumen del **ciclo actual** (plata ya apartada de tu disponible real).
  - Esta card → el resumen del **ciclo siguiente** (lo que se viene, no toca tu plata de hoy).
- **Cambio de fondo:** deja de agrupar por *mes calendario* y pasa a agrupar por
  *ciclo de tarjeta* (el `nextPaymentDate` del próximo ciclo). El número ahora es
  literalmente *"el resumen que te va a llegar, con su fecha"*.
- **Honestidad:** el monto es *lo ya cargado* para ese resumen y **va a crecer** a
  medida que se use la tarjeta. El copy lo explicita.

### 2 · Contenido y estados (UI)

```
Lo que se viene
Próximos resúmenes de tarjeta
──────────────────────────────
💳 Visa Galicia
   Vence 15/8            $124.500
💳 Amex
   Vence 20/8             $38.200
──────────────────────────────
Total                    $162.700
Sigue sumando a medida que uses la tarjeta.
```

- **Filas:** una por tarjeta de crédito que tenga consumo cargado para su próximo
  resumen. Cada fila: ícono + nombre + `Vence DD/MM` (fecha real del próximo
  vencimiento) + monto.
- **Moneda sin convertir** (consistente con `getPaymentMethodStatus`): el monto por
  fila se muestra en su moneda. Si hay mezcla ARS/USD entre tarjetas, el pie muestra
  **dos totales separados** (Total ARS / Total USD); si es una sola moneda, un total.
- **Pie:** total + línea `"Sigue sumando a medida que uses la tarjeta."`
- **Estado vacío:** si ninguna tarjeta tiene consumo futuro cargado (`total <= 0` y sin
  items), la card **no se renderiza** (retorna `null`), igual que hoy → la celda del
  rail colapsa. No se agrega empty-state visible.
- **Tokens y tipografía:** se mantienen los del proyecto (card `rounded-2xl bg-surface
  border-[1.5px] border-border`, montos `font-poster tnum`, labels `font-sans`,
  ícono `lucide-react`). Sin colores hardcodeados.

### 3 · Interacción

- Cada fila es tappeable → abre el detalle de esa tarjeta mediante el modal existente
  `PaymentMethodDetailModal` (que ya muestra movimientos + estado del ciclo).
- **Matiz para el plan:** ese modal hoy muestra el **ciclo actual** de la tarjeta.
  Mostrar específicamente el desglose del **próximo** resumen (los movimientos que
  componen `dueDate`) es un *nice-to-have* a evaluar en la etapa de implementación; no
  bloquea el rediseño. Como mínimo, el tap debe llevar al usuario al detalle de la
  tarjeta correspondiente.

### 4 · Datos / store

Reemplazar `getNextMonthCardExposure()` por un getter nuevo `getUpcomingCardDueDates()`:

```ts
getUpcomingCardDueDates: () => {
  items: Array<{
    methodId: number;
    name: string;
    dueDate: Date;      // nextPaymentDate del PRÓXIMO ciclo
    amountArs: number;  // monto en ARS (parte no-USD del resumen)
    amountUsd: number;  // monto original en USD (sin convertir)
  }>;
  totalArs: number;
  totalUsd: number;
};
```

Lógica por cada tarjeta de crédito con ciclo configurado:

1. **Ciclo actual** = `getCreditCycleDates(method, now)` → `nextClosingDate` actual (es
   el resumen que ya cuenta el hero; se excluye de esta card).
2. **Próximo ciclo** = `getCreditCycleDates(method, <día siguiente al nextClosingDate actual>)`
   → `nextPaymentDate` y `nextClosingDate` del ciclo siguiente. Ese `nextPaymentDate`
   es el `dueDate` de la fila.
3. **Monto del próximo resumen** = misma **regla de pertenencia** que
   `getPaymentMethodStatus`: gastos cuyo `t.date` (que en crédito ya es la fecha de
   vencimiento calculada por `calculateCreditPaymentDate`) cae en el mismo mes/año que
   el `dueDate` del próximo ciclo, − reintegros del mismo ciclo, + mensualidades
   adheridas al medio aún no transaccionadas para ese ciclo. Desglose ARS/USD por
   `original_currency`/`original_amount`, sin convertir. Reutiliza la lógica existente
   de `getPaymentMethodStatus` (idealmente extrayendo un helper compartido para no
   duplicar la regla de pertenencia al ciclo).
4. Si el monto del próximo resumen es `<= 0`, la tarjeta **no** genera fila.

`totalArs` / `totalUsd` = suma de los montos por moneda de todas las filas.

### 5 · Impacto y limpieza

- **Componente:** renombrar/reescribir `src/components/dashboard/next-month-card-exposure-card.tsx`.
  Se puede mantener el nombre de archivo/exported symbol para minimizar el diff de
  imports en `page.tsx`, o renombrar a `upcoming-card-due-dates-card.tsx` (decisión de
  plan). El `className="lg:col-start-3"` y el patrón "hijo directo del grid que colapsa
  si retorna null" se conservan.
- **Store:** eliminar `getNextMonthCardExposure()` de la interfaz y la implementación;
  agregar `getUpcomingCardDueDates()`.
- **Tests:** actualizar `src/lib/store/__tests__/disponible-real.test.ts` (referencia
  al getter viejo). Agregar cobertura del getter nuevo: fechas del próximo ciclo,
  exclusión del ciclo actual, desglose ARS/USD, estado vacío.
- **Docs:** actualizar `CLAUDE.md` (la entrada de `getNextMonthCardExposure()` en la
  lista de getters del store).
- **Invariante preservado:** la card sigue siendo **neutra para el Disponible Real** —
  no altera ningún cálculo del hero ni de las analíticas; es puramente informativa/lectura.

## No-objetivos (YAGNI)

- No se incluyen gastos fijos ni otros compromisos no-tarjeta (se descartó "agenda amplia").
- No se agrega horizonte multi-mes / timeline (se descartó).
- No se agrega planificación de ahorro ni CTA de "apartar plata".
- No se rediseña `PaymentMethodDetailModal` (solo se navega a él; el desglose del
  próximo ciclo es nice-to-have).
