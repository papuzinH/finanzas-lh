# Histórico de gastos por categoría, en términos reales — diseño

**Fecha**: 2026-08-29 · **Estado**: aprobado, sin implementar

Ver cómo fue variando el gasto de cada categoría a través de los meses, descontando
la inflación, en la pantalla y en el chat.

## Contexto y decisiones de producto

El pedido original fue "ver el histórico de gastos por categoría, dolarizado al valor
del dólar de ese momento". Al preguntar **por qué** dolarizado, la respuesta fue "para
que la inflación no me engañe": el dólar era el medio, no el fin. Eso cambia la vara.

**Se deflacta por IPC, no por dólar.** El IPC mide exactamente lo que se quiere medir
—si subió el gasto o subieron los precios— mientras que el dólar en Argentina salta por
razones que no son el costo de vida: una corrida dibuja una caída de gasto que no
ocurrió. Con 5 meses de historia, un solo salto deformaría media serie.

**La unidad es "pesos de hoy".** No dólares, no un índice: los mismos pesos en los que
el usuario gasta, ajustados para que sean comparables entre meses.

**Nada de esto necesita datos nuevos.** El relevamiento encontró que las tres piezas ya
existen por separado y sólo falta la intersección:

| Pieza | Dónde está hoy |
|---|---|
| Deflactar por IPC | `getRealAdjustedTrend(months)` — la tab Tendencia ya dice "en términos reales gastaste X% menos" |
| Serie mensual | `getMonthlyTrend(months)` |
| Corte por categoría | `getCategoryComparison()` — pero sólo mes actual vs. anterior, dos puntos |
| **Serie por categoría, deflactada** | **no existe: es lo único que se construye acá** |

`inflationSeries` ya se trae de `api.argentinadatos.com` (últimos 24 meses) en
`fetchAllData()`. No hay proveedor nuevo, ni tabla nueva, ni migración.

### El tamaño real del problema

Medido contra la base el 2026-08-29 sobre el usuario con más datos: **747 movimientos,
pero la historia útil son 5 meses** (abr-2026 a ago-2026, con 101/119/155/145/110
movimientos). Los 7 meses anteriores tienen 1 movimiento cada uno —un plan de cuotas
viejo, no uso real— y hay movimientos fechados hasta 2027-08 (cuotas futuras).

El diseño tiene que verse bien con **5 puntos**, no con 24. La serie crece sola.

## El cálculo

Vive en **`lib/finance/historico.ts`**, función pura, sin Zustand ni Supabase.

No es un getter del store, y la razón es dura: la pantalla corre en el cliente y el chat
en el servidor. La única forma de que los dos digan el mismo número es que los dos
llamen a la misma función. Es lo que el CLAUDE.md ya declara para `lib/finance/`
("fuente única de cálculos para el store y el chatbot").

### Deflactación

Se reusa el mecanismo de `getRealAdjustedTrend`: factor acumulado de
`(1 + ipc_mes/100)` desde el mes de la transacción hasta hoy. Un mes sin IPC publicado
aporta factor 1, que es lo que ya hace el código vigente (`inflByMonth.get(fm) ?? 0`).

⚠️ **El IPC tiene rezago de mes y medio.** Al 2026-08-29 el último publicado es el de
julio. El mes en curso nunca tiene su propio IPC — por eso, entre otras cosas, no entra
al cálculo del desvío (abajo).

### Qué entra y qué no

| Regla | Motivo |
|---|---|
| Sólo `type = 'expense'` | Es un análisis de gasto |
| Se excluyen `card_payment_for` y `is_balance_adjustment` | Es lo que ya hacen las analíticas de hoy; incluirlos cuenta dos veces |
| Se excluye `date > hoy` | Hay cuotas fechadas hasta 2027-08: son compromisos, no historia |
| Ventana de 6 meses, igual que `getRealAdjustedTrend` | Coherencia con la tab donde vive |
| Los meses sin actividad **no se dibujan** | 7 meses viejos con 1 movimiento son 7 puntos casi en cero que no significan nada |

### El mes en curso

**Entra al sparkline, marcado; no entra al cálculo del desvío ni del promedio.**

Agosto tiene 110 movimientos contra los 145 de julio, pero no porque se haya gastado
menos: porque el mes va por la mitad. Compararlo contra meses completos reporta una
caída que es del calendario. En la UI se dibuja con relleno rayado y un asterisco.

### El desvío (el número de cada fila)

Se compara el **último mes cerrado** contra una de dos varas, a elección del usuario:

- **Mi promedio** (default): el promedio de los meses cerrados previos dentro de la
  ventana.
- **El mes pasado**: el mes cerrado inmediatamente anterior.

El default es el promedio porque aguanta mejor un mes raro suelto. Medido sobre datos
reales: con "mes pasado", Supermercado da +88% y con "mi promedio" +97%; la diferencia
es chica en categorías estables y enorme en las irregulares.

**El toggle cambia sólo el divisor.** No toca el agrupado ni el orden de los grupos: si
las filas saltaran de grupo al tocarlo, sería desconcertante.

### "Cambió de nivel" vs. "Fue una vez"

El hallazgo que motiva esta regla: en los datos reales, la categoría con mayor desvío
(**Fernet, +5.039%**) no es un cambio de hábito sino un evento — dos cargas de
"Soberanía fernetera" el 17 de julio, de $297.047 y $277.047. Sin separarlas, esa fila
encabeza la lista durante meses por encima de **Casa**, que subió 87% real *y se quedó
arriba*, que es lo accionable.

**Regla**: una categoría es un evento puntual si **un solo mes concentra más de la mitad
del total de esa categoría en el período** (con al menos 3 meses cerrados con actividad).

El total se calcula sobre los **meses cerrados**, deflactados: el mes en curso queda
fuera también acá, por la misma razón que en el desvío. Un mes parcial no puede decidir
si algo fue un evento.

Verificada contra los datos reales: Fernet 94% → evento · Uso personal 58% → evento ·
Casa 38% → cambió de nivel.

Se explica al usuario en una frase: *"más de la mitad de lo que gastaste ahí fue en un
solo mes"*.

Las filas de eventos **muestran el monto y qué fue**, no el porcentaje: para un pico
único el `%` no significa nada, pero `$768k · «Soberanía fernetera», 17 de julio` sí.

### Categorías nuevas

Una categoría con movimientos en el mes actual pero sin meses previos no tiene promedio
contra qué compararse. **No aparece en "qué se movió"** —no se movió, nació— pero sí es
consultable en el detalle.

## La UI

Dos entradas al mismo dato, cada una donde el usuario ya está haciendo esa pregunta.

### Tendencia → bloque "Qué se movió"

Debajo del gasto real mes a mes que ya vive ahí. Una fila por categoría:

```
Qué se movió
julio contra tu promedio de abril a junio · en pesos de hoy    [?]
[ vs. mi promedio | vs. el mes pasado ]

CAMBIÓ DE NIVEL
🛒  Supermercado      ▁▂▄█      +97%
🏠  Casa              ▅▅▆█      +87%
💡  Servicios         ▆█▇▁      −80%

FUE UNA VEZ
🍷  Fernet            ▁▁▁█      $768k
    «Soberanía fernetera», 17 de julio
```

- «Cambió de nivel» se ordena por **magnitud del desvío** (valor absoluto: lo que más
  subió y lo que más bajó compiten por el tope), no por monto gastado. «Fue una vez» se
  ordena por **monto del pico**, porque ahí el desvío porcentual no es la información.
- El `[?]` abre el `InfoHint` que ya usan las otras tabs, y explica por qué el promedio
  y no el mes pasado.
- Tocar una fila lleva al detalle.

### Categorías → el modal que ya existe

Tocar una categoría ya abre un modal que hoy muestra poco. Ahí va su serie en grande:
la cifra del último mes cerrado, el desvío en palabras, y las barras de los meses con el
mes en curso rayado.

### Piezas

- **`<Sparkline>`** compartido: divs con altura porcentual, sin librería. El precedente
  es Inversiones, que sacó recharts para hacer su barra apilada a mano.
- El bloque de lista y el de detalle, con los tokens de siempre: `border-[1.5px]`,
  `tnum` en todos los números, `font-display` en las cifras.
- **No lleva `--shadow-bandera`**: ya hay una cifra hero por pantalla y en Inicio es el
  disponible.

## El chat

Dos tools nuevas (el registro pasa de 22 a 24), las dos envolviendo la misma función
pura:

| Tool | Contesta |
|---|---|
| `get_historial_categoria` | "¿cómo viene supermercado?" → la serie + el desvío |
| `get_que_se_movio` | "¿en qué gasté más de lo normal?" → el ranking, eventos aparte |

El prompt aprende **una sola cosa nueva**: que los montos vienen en pesos de hoy y que
debe decirlo al responder. Un "en abril gastaste $554.000" sin esa aclaración no coincide
con lo que el usuario ve en Movimientos y se lee como un bug.

Se respeta la regla de oro: ningún número lo genera el modelo.

## Verificación

TDD sobre la función pura. Los casos salen de los datos reales, que ya sirvieron para
encontrar los bordes:

- Fernet → evento (un mes concentra el 94%)
- Casa → cambió de nivel (38%, sube sostenido)
- El mes en curso queda fuera del desvío y del promedio, y dentro del sparkline
- Una categoría sin meses previos no entra al ranking
- Un mes sin movimientos ≠ un mes con cero (no se dibuja)
- Los dos modos del toggle sobre el mismo escenario
- Meses futuros excluidos

Más un test que vale por sí solo: **la tool del chat y el getter del store devuelven el
mismo número** para el mismo escenario. Es barato y es la única garantía real de que el
chat no empiece a contar otra historia que el home.

Gate del repo: `npm test && npm run lint && npx tsc --noEmit && npm run build`. Desde el
2026-08-29 el lint está en **0 errores**; no se admite subirlo.

## Fuera de alcance

- **Dolarizar.** Se descartó con fundamento (arriba), no por costo.
- **Que el chat lo mencione sin que le pregunten.** Es proactividad: ya está en el
  roadmap del spec del chatbot y merece su propio diseño (cuándo avisar, cuándo callarse,
  cómo no volverse pesado).
- Exportar la serie, comparar contra otros usuarios, presupuesto sugerido por categoría.
- Cambiar la ventana de 6 meses desde la UI.
