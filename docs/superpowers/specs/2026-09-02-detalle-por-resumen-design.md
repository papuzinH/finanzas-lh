# El detalle de la tarjeta se agrupa por resumen

Plan 3 de ciclos de tarjeta. Continúa el spec `2026-09-01-ciclos-tarjeta-design.md`, que dedica
seis líneas a esta pantalla (sección «2. El detalle de la tarjeta se agrupa por ciclo»): fija el
qué —agrupar por resumen, navegar entre ellos, admitir lo que no se sabe— y deja abierto el cómo.
Este documento cierra el cómo.

---

## El problema

El Plan 1 construyó la entidad `credit_card_cycles` y el Plan 2 dejó al usuario declarar las
fechas que le imprime el banco. Falta la pantalla donde ese trabajo rinde: **poner el resumen del
banco al lado de la app y ver si coinciden**.

Hoy no se puede, y no por un detalle de presentación:

- `payment-method-detail-modal.tsx` **no agrupa por mes: no agrupa nada**. Es una lista plana de
  un solo período, sin encabezados y sin navegación. El Status del proyecto lo describía como
  «agrupa por mes»; al leerlo, agrupa por nada.
- La lista la arma `page.tsx:61` con `getPaymentMethodTransactionsForCurrentMonth()`, que
  devuelve **sólo el ciclo vigente**. No hay forma de mirar el resumen de agosto: no existe la
  navegación ni el dato llega al componente.
- Cada fila muestra `t.date`, que en crédito es el **vencimiento**. O sea: todas las filas de una
  tarjeta muestran la misma fecha repetida. La fecha de compra existe desde el Plan 1
  (`transactions.purchase_date`) y **no la lee nadie**.
- La lista vive en un `max-h-[300px]` con scroll propio, dentro de un modal de 500px que ya
  scrollea. Doble scroll anidado: alcanza para mirar cuatro movimientos, no para cotejar treinta
  contra un PDF.

Medido en producción al migrar: **443 movimientos de crédito, 341 con fecha de compra
recuperada** — quedan alrededor de un centenar sin ella, concentrados en los resúmenes viejos.
Los ciclos materializados van de septiembre de 2025 a agosto de 2027; los futuros existen porque
las cuotas ya están fechadas ahí.

---

## Decisión

Cuatro decisiones tomadas con el usuario antes de escribir esto:

**1. Conciliar manda.** La pantalla sirve para consultar el historial, pero se optimiza para
tener el papel del banco al lado. Ante cualquier trade-off, gana la conciliación.

**2. Pantalla propia, no modal.** El detalle se muda a una ruta. El modal muere.

**3. Todos los medios van a la pantalla, sin rediseñar los que no son tarjeta.** Cuentas de
débito/efectivo y medios personales se llevan su contenido actual portado tal cual. Se gana
consistencia de navegación —tocar cualquier medio hace lo mismo— sin abrir un rediseño que este
plan no viene a resolver.

**4. La navegación llega a todos los resúmenes, con los futuros marcados.** Hacia atrás hasta el
primero que exista, hacia adelante hasta el último materializado. Los futuros se muestran como
**proyectados**, aclarando que sólo traen lo ya comprometido (cuotas y mensualidades) y no las
compras que todavía no se hicieron. Sin esa marca, un resumen de diciembre se lee como una
predicción de lo que se va a pagar, y es falsa.

---

## Arquitectura

### Ruta

`/ajustes/medios/[id]`, con el resumen en la query: `?resumen=<cycleId>`.

El resumen va en la URL y no en estado local para que «volver donde estabas» funcione de verdad:
recargar, ir atrás, o dejar la pestaña abierta al lado del PDF conservan el resumen que se estaba
mirando. Sin el parámetro, la pantalla abre en el resumen vigente. Un `cycleId` que no exista o
no pertenezca a la tarjeta cae al vigente en vez de romper.

Tocar la card de un medio en `/ajustes/medios` navega. `payment-method-detail-modal.tsx` se
borra.

### Los totales no se recalculan

`computePaymentMethodStatus` (`lib/finance/balances.ts:38`) **ya acepta un `cicloObjetivo`**
opcional como sexto parámetro — lo agregó el Plan 1 para el caso del resumen vencido, y
`computePendingCreditCards` lo usa así. El total de cualquier resumen sale de esa misma función.

Esto no es una comodidad: es el invariante de la pantalla. Escribir una segunda definición de
«cuánto debo en este resumen» produjo el falso «bajaste» del 31 de agosto, cuando el histórico
por categoría filtraba por `t.date` mientras el bucket se armaba con `periodDate`. El detalle no
puede contradecir a Compromisos porque los dos preguntan lo mismo a la misma función.

### Lógica nueva

Dos funciones puras. Ninguna calcula totales.

**`listarResumenesDeTarjeta(methodId, cycles, transactions, now)`** → la lista navegable,
ordenada por `closing_date` ascendente. Cada entrada trae su `id`, sus dos fechas, su `source` y
su **estado**, que es una de cuatro:

| estado | cómo se determina |
|---|---|
| `proyectado` | `closing_date` posterior a hoy: el resumen todavía no cerró |
| `pendiente` | ya cerró, el vencimiento no pasó, sin pago imputado |
| `vencido` | el vencimiento ya pasó y no hay pago imputado |
| `pagado` | hay un pago imputado a ese ciclo (`hasCardPaymentInCycle`) |

El estado se deriva; no se persiste ninguna columna nueva. Este plan **no toca el schema**.

**`filasDeResumen(cycleId, transactions)`** → las transacciones del resumen (`t.cycle_id ===
cycleId`, la única regla de pertenencia) partidas en dos grupos: las que tienen `purchase_date`,
ordenadas **ascendente** por esa fecha, y las que no, aparte.

### Store

Un getter `getCardCycleDetail(methodId, cycleId?)`, wrapper fino sobre las dos funciones y sobre
`computePaymentMethodStatus`. Se consume con el objeto entero del store
(`const store = useFinanceStore(); store.getCardCycleDetail(...)`), nunca desestructurado: el
React Compiler congela los getters sacados sueltos, y `store-freshness.test.ts` lo vigila.

**`getPaymentMethodTransactionsForCurrentMonth` queda sin consumidores** — su único uso es el
modal que se borra. Se retira en este plan en vez de quedar huérfano.

---

## La pantalla

### Encabezado y navegación

Nombre del medio, su tipo, y volver. Debajo, flechas `‹ ›` y un pill central con el mes del
resumen que, al tocarse, abre un selector con todos los resúmenes (fechas, total y estado). Es la
forma de `MonthSelector` + `MonthPickerDialog`, que el repo ya usa para navegación temporal.

**El selector lista resúmenes, no meses**, y esa distinción es de fondo: dos resúmenes pueden
vencer en el mismo mes calendario —declarar produce exactamente eso, septiembre venciendo el 2 de
octubre y octubre el 28— así que un picker de meses no puede representarlos. Caso de borde a
resolver en la implementación: si dos resúmenes de la misma tarjeta cerraran en el mismo mes, el
pill desambigua con el día del cierre.

### El bloque del resumen

Lo que se coteja contra el papel, en este orden:

- **Cierre y vencimiento completos**, con la etiqueta **«del resumen» / «estimado»**
  (`EtiquetaProcedencia`, ya existe en `ciclo-fechas-field.tsx`). Con el papel enfrente, saber si
  las fechas de la app son inventadas es la primera pista de por qué no cuadra.
- **El total, grande**, con `--shadow-bandera`: es la cifra de esta pantalla, y va una sola por
  pantalla. ARS y USD por separado, sin mezclar monedas, como en el resto de la app.
- **Chip de estado**: pagado · pendiente · vencido · proyectado.
- **Botón «Corregir fechas»**, que abre el `EditarCicloDialog` existente (toma
  `{open, onOpenChange, methodId, ciclo}`: se enchufa sin modificarlo).

Ese botón no es un extra. **Estar con el resumen del banco enfrente es el mejor momento posible
para declarar las fechas** — mejor que el paso opcional del diálogo de pago, donde el propio
usuario declaró que marca de memoria y sin el papel a mano. La conciliación y la declaración
quieren ocurrir en el mismo instante.

### Las filas

Descripción, monto y **la fecha de compra real**, en lugar del vencimiento repetido. Chips para
«Cuota 3/6» y «Mensualidad». Tocar la fila abre el ActionSheet de siempre (editar, eliminar) — es
donde el Plan 4 va a colgar «Mover a otro resumen»; este plan deja el lugar y no lo implementa.

**Orden ascendente**, del más viejo al más nuevo. Va contra el resto de la app, donde lo nuevo va
arriba, y es deliberado: es el orden en que el banco imprime el resumen, y cotejar dos listas
ordenadas al revés es un suplicio. La decisión sigue de «conciliar manda».

**Las que no tienen fecha de compra van al final**, bajo un encabezado «Sin fecha de compra» que
explica en una línea que son anteriores a que la app guardara ese dato. No se pueden intercalar
—no tienen lugar en un orden cronológico— y esconderlas mentiría sobre el total. En los resúmenes
viejos van a ser mayoría; en los nuevos, ninguna.

### Lo que desaparece, para crédito

Los dos bloques que hoy muestra el modal, **«Costos Fijos» y «Mensualidades Activas», se van en
las tarjetas**. Con el modelo del Plan 1, las mensualidades de crédito **se postean solas como
transacciones con `cycle_id`**: ya son filas del resumen. Mostrarlas otra vez abajo, y su total
al lado del total del resumen, invita a sumar dos veces lo mismo — que es la clase de error que
esta pantalla existe para detectar.

En débito y efectivo se conservan, porque ahí las mensualidades no se postean solas
(`syncAutomaticRecurringCharges` sólo aplica a planes mensuales sobre tarjetas con ciclo).

### Cuentas y medios personales

Portados tal cual: saldo, costos fijos y los movimientos del mes, con el mismo encabezado y la
misma ruta. Sin rediseño. `personal-debt-card` conserva su línea «Se transfiere el día N».

### Estados vacíos

Con `<EmptyState>`, la pieza compartida. Tres casos: una tarjeta sin ningún resumen materializado
(las dos de producción sin `default_closing_day`/`default_payment_day` no pueden tenerlos), un
resumen sin movimientos, y una cuenta sin movimientos en el mes.

---

## Tests

- **Paridad, el que importa**: el total que muestra el detalle de un resumen es idéntico al que
  Compromisos muestra para ese mismo resumen. Es la garantía estructural de la sección
  «Los totales no se recalculan», y el equivalente al test de paridad chat/pantalla del histórico.
- `listarResumenesDeTarjeta`: orden, y los cuatro estados, incluido un resumen futuro marcado
  `proyectado` y uno vencido impago.
- `filasDeResumen`: orden ascendente por `purchase_date`; las sin fecha al final y no mezcladas;
  la pertenencia sale de `cycle_id` y nunca del mes de `t.date`.
- **Fixtures desparejos, obligatorio.** Un fixture con `closing_date` y `due_date` derivados de
  un mismo día del mes no puede detectar los bugs que esta pantalla toca. El plan de ciclos ya
  encontró tres tasks con ese vicio; acá se usan las fechas reales medidas del Galicia (cierres
  23-jul / 20-ago / 24-sep, vencimientos 31-jul / 28-ago / 2-oct).
- Estructural: `payment-method-detail-modal.tsx` no existe y nadie lo importa; la ruta
  `/ajustes/medios/[id]` tiene su `page.tsx` (mismo guard que la nav ya usa desde el 404 del
  18-ago).
- **`empty-state-adoption.test.ts` hay que actualizarlo**: lista a
  `payment-method-detail-modal.tsx` como una de sus dos excepciones documentadas. Borrado el
  archivo, la excepción apunta a algo que no existe.

## Gate visual, obligatorio

Contra DEV, con datos sembrados, porque ninguna de estas cosas la puede ver un test de markup:

1. Navegar de un resumen al anterior y al siguiente, y saltar lejos con el selector.
2. Un resumen viejo con movimientos **sin** fecha de compra: que el bloque aparezca y el total
   los incluya.
3. Un resumen futuro: que diga **proyectado** y se entienda que está incompleto.
4. Corregir las fechas desde la pantalla y ver la etiqueta pasar de «estimado» a «del resumen».
5. Que el total de la pantalla sea **el mismo** que el de Compromisos para ese resumen, leído en
   las dos pantallas.
6. Una cuenta de débito y un medio personal: que el portado no rompió nada.
7. 390px, día y noche, touch targets ≥44px.

---

## Fuera de alcance

**Mover una compra al resumen vecino.** Es el Plan 4 y el único escenario del spec de ciclos
(E15) todavía sin implementar. Esta pantalla le deja el lugar en el ActionSheet.

**Conciliar contra el total declarado del banco.** La columna `declared_total` y la vista de
diferencias. Se pospone por la razón que ya fijó el spec de ciclos: al comparar contra el papel,
lo que más aparece no son ciclos mal asignados sino **movimientos no anotados**, y mezclarlo haría
que la feature se lea como un reproche. Nace junto a su respuesta (fase 3.1). Esta pantalla es su
prerrequisito.

**Rediseñar el detalle de cuentas de débito y medios personales.** Se portan, no se mejoran.

**Recargos de compras en dólares.** Entre 27% y 47% de desvío contra el resumen, por convertir al
blue en vez del oficial y no modelar percepciones ni IVA. Es la otra causa grande de que la app y
el papel no coincidan, y tiene spec propio pendiente. Conviene saber que esta pantalla **va a
exhibir ese desvío** sin poder explicarlo todavía.

**Cambios de schema.** Ninguno. Los cuatro estados se derivan.
