# Mover una compra al resumen vecino

Plan 4 de ciclos de tarjeta, y el último. Cierra **E15**, el único escenario del spec
`2026-09-01-ciclos-tarjeta-design.md` que quedó sin implementar. Aquel le dedica ocho líneas
(sección «3. Mover una compra al resumen vecino»): fija el qué y deja el cómo. Este documento
cierra el cómo.

---

## El problema

Los tres planes anteriores construyeron el resumen como entidad, dejaron declarar las fechas
reales del banco, y dieron una pantalla donde la tarjeta se lee resumen por resumen. Con eso el
usuario **puede descubrir** que una compra quedó en el resumen equivocado. No puede corregirlo.

La app imputa cada compra con `resolverCicloDeCompra`, que elige el resumen según la fecha de
compra y las fechas del ciclo. Cuando esas fechas son estimadas —y lo son hasta que el usuario
declara el resumen— la predicción puede errar: el cierre real de una Visa Galicia se mueve hasta
cuatro días entre meses, porque está anclado al jueves y no a un día del mes. Una compra hecha
cerca del cierre cae de un lado o del otro según una fecha que la app adivinó.

Medido en su momento sobre la Mastercard de Lauti: **15 de 97 movimientos** se cargaron en la
ventana de riesgo alrededor del cierre. No es un caso de borde.

**Lo que NO es este problema**, y conviene descartarlo de entrada: cargar hoy una compra con
fecha vieja ya cae bien sola, porque `resolverCicloDeCompra` la imputa por su `purchase_date` y
no por cuándo se cargó. El caso que queda es uno solo: **la app predijo un resumen y el banco
usó el otro**.

---

## Decisión

Cuatro decisiones tomadas con el usuario antes de escribir esto:

**1. La acción vive sólo en el detalle por resumen.** No en `/movimientos`. Ahí es donde el
usuario está cotejando contra el papel y donde descubre el error; corregirlo en el mismo gesto
es la razón de ser de la feature. En `/movimientos` no tiene el resumen a la vista y mover sería
a ciegas.

**2. Se mueven compras y cuotas. Nada más.** Las mensualidades ya posteadas y los reintegros no
ofrecen la acción. El motivo de excluir las mensualidades es concreto: el sync que las postea
decide si ya cubrió un mes mirando a qué resumen pertenecen, así que mover una a mano puede
hacer que **la vuelva a postear** en el resumen original — el cargo duplicado que la review del
Plan 2 encontró, visto desde el otro lado. Los reintegros quedan afuera por simetría y por YAGNI:
no hay caso reportado.

**3. Sólo al resumen anterior y al siguiente.** El drift del cierre corre una compra un resumen,
nunca tres. Limitar el destino acota el daño de un error: mover a un resumen lejano cambia dos
totales que el usuario quizá ni está mirando.

**4. Corre desde la cuota tocada hacia adelante, no el plan completo hacia atrás.** Ver «Cuotas».

---

## Arquitectura

### La action

```ts
moverTransaccionAlResumenVecino(
  transactionId: string,
  destino: 'anterior' | 'siguiente',
): Promise<ActionResponse>
```

**El cliente manda la dirección, no un `cycleId`.** El servidor resuelve el destino desde el
ciclo actual de la transacción, con `cicloAnterior` y su simétrico por `closing_date`. Así no
hay forma de mandarle un resumen arbitrario, ni de otra tarjeta, ni de otro usuario. Es la misma
postura que la auditoría de 2026-08-27 (M4) dejó como regla: un id que llega del cliente se
valida contra su tabla con `.eq('user_id', user.id)` antes de guardarse — acá directamente no
llega ningún id de destino.

⚠️ `cicloAnterior` ya existe en `lib/finance/cycles.ts`; **`cicloSiguiente` no**. Hay que
escribirla ahí, junto a su hermana y con la misma precondición documentada: recibe los ciclos ya
filtrados por tarjeta y ordenados ascendente por `closing_date`, como los produce
`ciclosDeMetodo`.

Guards, en orden:

1. La transacción existe y es del usuario (`.eq('user_id', user.id)`).
2. Su medio de pago es de tipo `credit` y tiene `cycle_id`.
3. No es una mensualidad posteada (`recurring_plan_id`) ni un reintegro (`type === 'income'`)
   ni un pago de tarjeta (`card_payment_for`).
4. El resumen vecino en esa dirección existe. Si no, se rechaza — no se inventa un ciclo.

### Qué cambia en una compra suelta

| campo | qué pasa |
|---|---|
| `cycle_id` | al resumen destino |
| `date` | al `due_date` del destino — en crédito `date` es el vencimiento |
| `purchase_date` | **no se toca** |

Lo último es el punto fino del diseño. Mover no cambia *cuándo compraste*, cambia *en qué
resumen te lo cobraron*. Son datos distintos, y que existan dos columnas es precisamente para
poder separarlos. Tocar `purchase_date` al mover haría que la fila mienta sobre la compra y
rompería el orden cronológico contra el que se cotea el papel.

### Cuotas

Mover una cuota **corre el plan desde esa cuota hacia adelante**. La cuota tocada va al resumen
vecino, y cada cuota posterior avanza un resumen, usando `cicloNEsimo` — la misma función con la
que el alta fecha las cuotas (`installments/actions.ts:111`). No hay aritmética de fechas nueva.

**Las cuotas anteriores no se mueven.** El spec de ciclos dice «el banco no parte un plan entre
dos resúmenes», y es cierto hacia adelante: si la cuota 3 se corrió, la 4, 5 y 6 se corrieron con
ella. Hacia atrás no aplica: las cuotas 1 y 2 ya están en resúmenes cerrados que el usuario
probablemente ya pagó y conció, y moverlas reescribiría plata que ya dio por buena. Si además
estuvieran mal, se corrigen desde su propio resumen con la misma acción.

Si correr el plan estira más allá del último resumen materializado, se materializan los que
falten con `asegurarCiclos`, igual que hace el alta.

### Sin cambios de schema

Ninguno. `transactions.cycle_id` es reasignable por diseño: el spec de ciclos lo definió como
«FK reasignable» y esta es la feature para la que se creó.

---

## La pantalla

### El menú de la fila

`Fila` (`components/medios-pago/filas-del-resumen.tsx`) gana su propio `<ActionSheet>`: tocar
una fila en mobile lo abre, kebab en desktop. Es el patrón del repo, ya usado por
`TransactionItem`, `savings-goal-card` y `compromisos-client`.

**No se reemplaza `Fila` por `TransactionItem`**: aquella está armada para `/movimientos` y
muestra otra información (la fecha del movimiento, no la de compra).

Acciones: **Editar · Mover a otro resumen · Eliminar**. Editar y eliminar son reuso de lo que ya
existe; lo único nuevo es mover.

> **Costo declarado**: el diálogo de edición de transacciones es pesado (form con Zod, medios,
> categorías). Si al implementarlo arrastra más de lo previsto, la salida acordada es dejar sólo
> «Mover a otro resumen» en el ActionSheet y postergar editar/eliminar. Se decide durante la
> implementación, no se descubre al final.

### El diálogo

Ofrece los dos vecinos con sus fechas reales, no «anterior» y «siguiente» a secas — el usuario
está mirando un papel que tiene fechas impresas, y son esas las que reconoce:

```
¿A qué resumen lo movés?
  ○ El que cerró el 23 jul · vence 3 ago
  ○ El que cierra el 24 sep · vence 5 oct
```

Un vecino que no existe simplemente no aparece. Si no existe ninguno, la acción no se ofrece.

**Si la fila es una cuota**, el diálogo dice qué arrastra antes de confirmar:

> Movés las cuotas 3 a 6. La última pasa de marzo a abril.

Sin ese aviso, mover una cuota parece mover una fila y mueve cuatro.

**Si el destino es un resumen ya pagado**, el diálogo lo advierte: estás cambiando el total de
algo que ya saldaste. Se permite igual — puede ser exactamente lo que hay que corregir.

### Deshacer

No hay undo propio. La acción es simétrica: se mueve de vuelta con el mismo gesto. Un undo
separado sería una segunda forma de hacer lo mismo, con su propio estado y sus propios bordes.

---

## Tests

- **E15**: mover una cuota corre el plan desde ahí y estira la última. Con los ciclos reales
  desparejos del Galicia (cierres `2026-07-23` / `2026-08-20` / `2026-09-24`, vencimientos
  `2026-08-03` / `2026-09-01` / `2026-10-05`), nunca con un fixture donde cierre y vencimiento
  salgan del mismo día del mes.
- **`purchase_date` no se toca nunca**, en ninguno de los dos caminos.
- **Las cuotas anteriores a la tocada no se mueven.**
- El destino se resuelve en el servidor: una llamada que intente pasar un `cycleId` no tiene
  dónde hacerlo, y mover sin vecino se rechaza.
- Los cuatro guards, incluido el de dueño (patrón `payment-method-dueno.test.ts`).
- Una mensualidad posteada, un reintegro y un pago de tarjeta **no ofrecen** la acción.
- Paridad: después de mover, el total del resumen origen y el del destino siguen coincidiendo
  con lo que muestra Compromisos — el invariante que el Plan 3 dejó fijado.

## Gate visual, obligatorio

Contra DEV, verificando en el DOM:

1. Mover una compra al resumen anterior: la fila desaparece de un resumen y aparece en el otro,
   y **los dos totales cambian en consecuencia**.
2. La fecha de compra de esa fila **no cambió**.
3. Mover una cuota: el diálogo avisa cuántas mueve, y después de confirmar las posteriores se
   corrieron y las anteriores no.
4. Una mensualidad posteada y un reintegro no ofrecen «Mover a otro resumen».
5. En el primer resumen de la tarjeta no se ofrece «anterior»; en el último, no se ofrece
   «siguiente».
6. Mover de vuelta deja todo como estaba.
7. 390px, día y noche, touch targets ≥44px.

---

## Fuera de alcance

**Mover mensualidades posteadas.** Exige que la regla de cobertura del sync respete el
movimiento manual. Tiene precedente de haber salido mal y no hay caso reportado que lo pida.

**Mover a un resumen no vecino.** Si aparece un caso real que los vecinos no cubran, se amplía
el diálogo; hoy no hay ninguno identificado.

**Un undo dedicado.** La acción es su propia inversa.

**Las mensualidades que el modelo inyecta en resúmenes ya cerrados.** Es el hallazgo que dejó
abierto el Plan 3: `computePaymentMethodStatus` suma los planes activos a todos los resúmenes de
una tarjeta, también los que ya cerraron. Acotarlo mueve plata en pantalla para usuarios reales
y merece su propia decisión.
