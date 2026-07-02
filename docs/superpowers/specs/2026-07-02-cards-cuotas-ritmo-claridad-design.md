# Claridad de cards "Costo real de tus cuotas" y "Ritmo de gasto"

Fecha: 2026-07-02
Rama: feat/dashboard-analisis

## Problema

Dos cards del dashboard de análisis (tab "Este mes") comunican mal su valor:

1. **"Costo real de tus cuotas"** (`cards/installments-real-cost-card.tsx`): apoya el
   mensaje en una frase explicativa ("La inflación licúa esta deuda mes a mes 👍").
   Tras usar la app un tiempo, esa frase se vuelve ruido que ocupa espacio y ya no se lee.

2. **"Ritmo de gasto"** (`tab-este-mes.tsx` + `charts/spending-pace-chart.tsx`):
   - El título es vago (no dice para qué sirve).
   - El chart no aclara qué es cada línea (gasto real, proyección, ingreso).
   - El veredicto ("vas OK" / "te pasás") está en texto chico abajo y se pierde.

## Objetivo

Que cada card comunique **a qué refiere y en qué beneficia** de un vistazo, **sin
ninguna frase-disclaimer ni explicación explícita** que envejezca y ocupe espacio.
El mensaje sale del **título + jerarquía visual + labels de 1-2 palabras**, no de un párrafo.

## Enfoque elegido (A)

El título deja de ser una etiqueta neutra y pasa a ser el beneficio/pregunta. Ocupa el
mismo espacio pero comunica, y como es el nombre de la card no se percibe como disclaimer
descartable. El veredicto se jerarquiza y micro-labels reemplazan cualquier leyenda textual.

## Diseño

### Card 1 — Cuotas (`installments-real-cost-card.tsx`)

Foco: **estás ganando con inflación** (lo que debés vale cada vez menos en plata real).

```
La inflación licúa tus cuotas          🇦🇷
Debés        $XXX.XXX
Hoy valen    USD Y ↓
```

- **Título**: `La inflación licúa tus cuotas` — el beneficio es el nombre de la card.
- **Fila 1** `Debés $XXX.XXX`: deuda nominal restante en ARS (`remainingARS`),
  `font-poster tnum text-text`. Es la parte fija.
- **Fila 2** `Hoy valen USD Y ↓`: valor real hoy (`remainingUSD`, redondeado),
  `tnum text-good` + flecha `↓` (icono lucide `TrendingDown` o `ArrowDown`) que
  implica "cada mes vale menos" sin explicarlo.
- **Badge** `🇦🇷 AR`: se mantiene (señala que es específico de ARS).
- Se **elimina** el `<p>` con la frase de inflación.
- Card conserva `border-warn/40` actual o pasa a `border-border` — decisión menor en
  implementación; mantener el look de "atención suave" salvo que rompa jerarquía.
- Datos: sin cambios en el store. `getInstallmentsRealCost()` ya devuelve
  `{ remainingARS, remainingUSD, hasData }`.

### Card 2 — Ritmo (`tab-este-mes.tsx` + `spending-pace-chart.tsx`)

Foco: **responder si llegás bien a fin de mes**.

```
¿Llegás a fin de mes?
[✓ Vas bien]   Proyectás  $X
┌──────────────────────────────┐
│         (line chart)         │
└──────────────────────────────┘
● Gasto   ● Proyección   ● Ingreso
```

- **Título**: `¿Llegás a fin de mes?` — la pregunta que responde la card.
- **Veredicto (chip, jerarquizado arriba del chart)**:
  - `ok === true` → `✓ Vas bien`, tono good (`bg-good/10 text-good`).
  - `ok === false` → `⚠ Te pasás`, tono bad (`bg-bad/10 text-bad`).
  - `ok === null` (sin ingreso registrado) → sin chip, solo `Proyectás $X`.
  - Al lado del chip: `Proyectás $X` con el monto proyectado
    (`toDisplay(pace.projectedTotal)`, `tnum`).
  - La lógica `ok` ya existe en `tab-este-mes.tsx`
    (`pace.projectedTotal <= pace.income`); se mantiene el cálculo en ARS crudo.
- **Chart**: sin cambios estructurales (líneas real/proyección/ingreso siguen igual).
- **Micro-leyenda** (fila debajo del chart): 3 puntitos de color + label de 1 palabra,
  con el color que matchea cada línea:
  - `● Gasto` → color línea real (`var(--text)`, sólida).
  - `● Proyección` → color proyección (`var(--warn)`, punteada).
  - `● Ingreso` → color línea de ingreso (`var(--bad)`, punteada). Solo se muestra si
    `pace.income > 0` (la línea de ingreso solo se dibuja en ese caso).
- Se **elimina** el `<p>` `A este ritmo terminás en ~X · vas OK/ojo te pasás`.
- **Empty state**: se mantiene ("Todavía no registraste gastos este mes").

## Tokens / estilo (CLAUDE.md)

- Chip good: `bg-good/10 text-good`; chip bad: `bg-bad/10 text-bad`.
- Bordes `border-[1.5px]`. Números financieros con `tnum`. Montos display `font-poster`.
- Íconos lucide-react directos (`Check`, `AlertTriangle`, `TrendingDown`).
- Nada de colores hardcodeados fuera de tokens semánticos.

## Fuera de alcance (YAGNI)

- No se agrega una métrica de "cuánto se licuó / ahorraste" en cuotas (requeriría
  proyección de inflación / histórico de cotización que no está en el store). El beneficio
  se comunica por framing (título + `↓` + tono good), no por un número calculado nuevo.
- No se cambia la lógica de negocio ni los getters del store.
- No se toca el chart más allá de la micro-leyenda.

## Archivos afectados

- `src/components/dashboard/analysis/cards/installments-real-cost-card.tsx`
- `src/components/dashboard/analysis/tab-este-mes.tsx`
- `src/components/dashboard/analysis/charts/spending-pace-chart.tsx` (posible, si la
  micro-leyenda se arma junto al chart en vez de en el tab)
