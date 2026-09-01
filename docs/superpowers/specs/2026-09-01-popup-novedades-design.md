# Popup de novedades por versión — diseño

**Fecha**: 2026-09-01
**Estado**: aprobado, pendiente de plan de implementación

> Nota de privacidad: este repo es público. No se nombran usuarios reales ni se incluyen
> cifras de nadie; los escenarios de prueba usan datos ficticios.

## El problema

Desde el 2026-09-01 Chanchito dejó de mergear de a un cambio: las versiones se agrupan y
`produccion` es la rama que despliega (CLAUDE.md, sección Deploy). Eso resuelve el lado del
repo y deja abierto el del usuario: **hoy una versión sale y nadie se entera**.

Con gente real adentro —los tres del 24-ago más quien llegue por el post de LinkedIn— un
deploy es invisible. La app cambia debajo de los pies sin decir qué mejoró, y el trabajo que
sí se nota (un número que ahora dice la verdad, una pantalla nueva) no se le atribuye a nada.
Ese es el agujero que este popup viene a tapar: no es marketing, es que el producto avise
cuando cambia.

## Qué se decidió

Las cuatro decisiones son de Lauti, tomadas en la sesión del 2026-09-01:

1. **Es un changelog corto.** Dos a cuatro líneas, se lee y se cierra. No es un tour, no es
   una novedad destacada con botón a una pantalla, y no es una marca discreta en Ajustes.
2. **Se muestra sólo la versión más reciente**, nunca un acumulado. La primera versión del
   diseño acumulaba todo lo que el usuario se hubiera salteado; se descartó al verlo escrito:
   un popup con cuatro versiones apiladas es una pared de texto, que es exactamente lo que
   «changelog corto» venía a evitar.
3. **El recién registrado no ve nada.** Para él todo es nuevo, y ya tuvo su onboarding y su
   tour.
4. **El «ya lo vio» vive en la base**, no en `localStorage`.

## El modelo

### La regla, en una línea

Se muestra la versión más reciente si —y sólo si— **el usuario no la vio** y **su fecha de
publicación es posterior al día de alta del usuario**.

La segunda mitad es la que resuelve al recién registrado sin agregar ningún flag «es nuevo»
ni escribir nada durante el onboarding: si la última versión salió antes de que él existiera,
no hay nada que contarle. Una regla cubre los dos casos.

### Lo que se pierde, dicho explícitamente

Quien se saltea versiones **nunca ve las intermedias**, y no hay dónde recuperarlas. Es una
consecuencia aceptada de la decisión 2, no un descuido. Tiene un corolario que es de
redacción y no de código, y está abajo en «Contenido»: cada release tiene que poder leerse
solo.

### Dónde vive el «ya lo vio»

Columna nueva **`users.last_seen_version`** (`text`, nullable, default `NULL`).

Por qué la base y no `localStorage`:

- Chanchito es una PWA que el mismo usuario abre en el teléfono y en la computadora. Con
  `localStorage` el popup aparece una vez **por dispositivo**, y el usuario lee dos veces lo
  mismo sin entender por qué.
- El tour ya dejó la lección. `syncTourFromSupabase` es unidireccional —sólo sube el flag a
  `true`, nunca lo baja—, y por eso reactivarlo exige dos pasos manuales: un `UPDATE` en la
  base **y** un `localStorage.removeItem` en el navegador (registrado en el Status el
  2026-08-29). Repetir el patrón híbrido repetiría esa fricción.
- El costo es una migración de una columna, y el cliente la recibe gratis: `fetchAllData` lee
  `users` con `select('*')` y `User = Tables<'users'>`, así que basta agregarla a
  `types/database.ts` para que llegue tipada al store.

`NULL` significa «nunca vio ninguna». Es el estado en el que quedan los usuarios que ya
existen, y para ellos la primera versión publicada sí aparece — que es lo correcto: se la
perdieron.

### Qué es una «versión»

Un string dentro de una lista ordenada en el repo. **No** sale de `package.json`, que sigue
en `0.1.0` desde que nació el proyecto y no lo lee nadie: sincronizarlo sería un segundo
lugar donde equivocarse sin comprar nada. La lista es la única fuente de verdad.

## Arquitectura

### Contenido — `src/lib/novedades/versiones.ts` (nuevo)

```ts
export type Version = {
  version: string   // '1.0.0' — el string que se guarda en users.last_seen_version
  fecha: string     // 'YYYY-MM-DD', el día que se publicó
  titulo: string    // una línea, rioplatense, sin jerga técnica
  items: string[]   // 2 a 4 líneas
}

// La más reciente primero.
export const VERSIONES: Version[] = [ /* ... */ ]
```

**Regla de redacción**: cada release tiene que poder leerse solo. Como se muestra únicamente
la última, un item no puede dar por sentado que el usuario vio el anterior («ahora además
también…» está prohibido). El texto lo redacta Pancho por release y lo aprueba Lauti, como el
resto del producto.

### Decisión — `src/lib/novedades/decidir.ts` (nuevo)

```ts
novedadParaMostrar(versiones: Version[], lastSeenVersion: string | null, createdAt: string): Version | null
```

Función **pura**: sin React, sin Supabase, sin reloj propio. Es el patrón de `lib/finance/` y
la razón es la misma — la decisión se prueba directo, y el componente queda sin lógica.

Comparación de fechas: **por día y estrictamente posterior**. Se toma el día del alta
(`createdAt.slice(0, 10)`) y se muestra sólo si `version.fecha > diaDeAlta`. Un usuario que se
registró el mismo día que salió la versión **no** la ve; ante la duda, se elige no molestar.

### UI — `src/components/novedades/novedades-modal.tsx` (nuevo)

Montado en `AppShell` al lado de `<OnboardingTour />`, con `dynamic(..., { ssr: false })`.

Ese lugar no es casual: el shell devuelve `children` pelado en las rutas públicas, `/login`,
`/auth`, `/onboarding`, `/puesta-a-punto` y la landing anónima, y no renderiza nada hasta
`isInitialized`. Montarlo ahí hereda gratis que el popup **no** aparezca en ninguno de esos
casos, sin escribir una sola condición nueva.

- Card con el `<Chancho>`, título en `font-display`, los items como lista, y **un solo botón**
  («Listo»). Es un changelog, no una decisión: no lleva «después», ni «no mostrar más», ni
  una cruz que signifique algo distinto del botón.
- **El número de versión no se muestra.** `1.0.0` es una llave interna para el flag, no
  información para alguien que vino a mirar cuánta plata le queda. Lo que el usuario lee es el
  `titulo` y los `items`.
- Tokens semánticos del sistema, borde `border-[1.5px] border-border`, touch target ≥44px.
- No se muestra si el tour está activo: un usuario sin movimientos tiene el tour, y dos
  overlays encima del mismo home compiten.

### Escritura — `src/app/actions/novedades.ts` (nuevo)

Server action `marcarNovedadVista(version: string)`: `update({ last_seen_version })` sobre
`users` con `.eq('id', user.id)`, el patrón de dueño que ya usa el resto del repo. Va en
`src/app/actions/` porque es la carpeta que el repo ya tiene para actions sin página asociada
(`ai.ts`).

Si la escritura falla, el modal se cierra igual y el popup reaparece en la próxima carga.
Molesta un poco y no pierde nada, que es el trade-off correcto: no se le muestra un error al
usuario porque no hay nada que pueda hacer al respecto.

## Escenarios de prueba

Sobre la función pura, con datos ficticios:

| # | Situación | Espera |
|---|---|---|
| 1 | Usuario que ya existía (`last_seen_version: null`, alta vieja) | la más reciente |
| 2 | Usuario al día (`last_seen_version` = la más reciente) | `null` |
| 3 | Usuario que se salteó dos versiones | la más reciente, **y sólo esa** |
| 4 | Recién registrado (alta posterior a la última versión) | `null` |
| 5 | Alta el mismo día que la versión | `null` |
| 6 | Lista de versiones vacía | `null` |
| 7 | `last_seen_version` con un string que ya no está en la lista | la más reciente |

El caso 3 es el que fija la decisión de producto: si alguien lo «arregla» acumulando, ese test
se pone rojo.

Además: un test de markup del modal (título, items y botón presentes) y uno estructural de que
`AppShell` lo monta — el mismo tipo de guard que ya existe para otras piezas del shell.

## Alternativas evaluadas

- **`localStorage` en vez de la base**: descartada por multi-dispositivo y por la fricción que
  ya generó el patrón híbrido del tour.
- **Acumular las versiones que el usuario se salteó**: era el diseño original; lo descartó
  Lauti — contradice el propósito de «changelog corto».
- **Banner discreto en el home o punto en Ajustes**: descartado, casi nadie se entera.
- **Una novedad destacada con botón a la pantalla donde se usa**: descartado; obliga a elegir
  «la principal» en cada release y es más caro de escribir y de diseñar.
- **Versión leída de `package.json`**: descartada, segundo lugar donde equivocarse.

## Fuera de alcance

- Pantalla o sección de historial de novedades. Es la salida natural si la pérdida de las
  versiones intermedias llega a molestar, pero hoy no se pidió y suma pantalla.
- Push notifications.
- Segmentar el contenido según lo que cada usuario usa.
- Traducciones: la app es sólo en rioplatense.
- Tocar `package.json`.

## Docs relacionados

- `CLAUDE.md`, sección **Deploy** — el ciclo de versiones y por qué `produccion` es la rama
  que publica.
- `docs/features/onboarding-auth.md` — el tour y su sincronización, que es el antipatrón que
  este diseño evita.
