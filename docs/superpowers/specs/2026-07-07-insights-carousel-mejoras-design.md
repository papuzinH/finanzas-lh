# Mejoras al carrusel de insights del dashboard

**Fecha:** 2026-07-07
**Componente:** `src/components/dashboard/insights-carousel.tsx`
**Store:** `src/lib/store/financeStore.ts` (`getInsights`)

## Objetivo

Mejorar el display de los mensajes de notificación (insights) del dashboard:

1. Sumar nuevos datos como insights (racha de registro, progreso de objetivos, rendimiento del portafolio).
2. Permitir **swipe** para pasar de un mensaje a otro (carrusel táctil).
3. **Eliminar los dots** indicadores.
4. Que los mensajes avancen **de derecha a izquierda** (animación horizontal en vez de vertical).
5. Darle a todos los mensajes la voz de Chanchito: copado, argentino, sin exagerar.
6. Mantener accesibilidad completa (rama `feat/movimientos-a11y-ux`).

## Alcance

**Incluye:**
- 3 generadores de insight nuevos en `getInsights()`.
- Reescritura de tono de los 5 mensajes existentes + los 3 nuevos (8 en total).
- Tope suave de 6 insights.
- Refactor del componente: animación horizontal, swipe/drag, sin dots.
- Capa de accesibilidad (aria-live, teclado, pausa, reduced-motion).
- Test del getter.

**No incluye:**
- Cambios en el layout del dashboard (`page.tsx`).
- Indicador de progreso alternativo (el usuario eligió **sin indicador**).
- Nuevos getters en el store (se reutilizan `getRegistrationStreak`, `getSavingsGoalsOverview`, `getPortfolioStatus`, ya existentes).

---

## 1. Cambios en el store: `getInsights()`

### 1.1 Nuevos generadores

Se agregan al final del arreglo `insights`, reutilizando getters existentes vía `get()`:

**Racha de registro** — `getRegistrationStreak()` → `{ days, isActiveToday }`
- Condición: `days >= 3` (evita ruido con rachas cortas).
- Tipo: `positive`, ícono `Flame`.
- Mensaje: `` `Venís ${days} días seguidos anotando todo. ¡Así se hace! 🔥` ``

**Progreso de objetivo** — `getSavingsGoalsOverview()` → `{ goals: [{ id, name, percent, currency, status }], ... }`
- Condición: entre los objetivos `status === 'active'`, tomar el de mayor `percent`; mostrar solo si `percent >= 50`.
- Tipo: `info`, ícono `Target`.
- Mensaje: `` `Ya llevás ${Math.round(percent)}% de ${name}. ¡Se viene! 🎯` ``

**Rendimiento del portafolio** — `getPortfolioStatus()` → incluye `totalInvested`, `totalPLPercent`
- Condición: `totalInvested > 0` y `Math.abs(totalPLPercent) >= 3`.
- Si `totalPLPercent > 0`: tipo `positive`, ícono `TrendingUp`, mensaje `` `Tu portafolio viene +${pct}% arriba. ¡Joya! 📈` ``
- Si `totalPLPercent < 0`: tipo `warning`, ícono `TrendingDown`, mensaje `` `Tu portafolio cayó ${pct}%. Tranqui, es parte del juego 📉` ``
- `pct = Math.abs(totalPLPercent).toFixed(0)`

### 1.2 Reescritura de tono de los 5 existentes

| # | Antes | Después |
|---|---|---|
| Ahorro (positive) | `Gastaste un {saved}% menos que el mes pasado 🎉` | `Gastaste un {saved}% menos que el mes pasado. ¡Bien ahí! 🎉` |
| Gasto subió (warning) | `Tu gasto subió un {increase}% respecto al mes pasado` | `Ojo que tu gasto subió un {increase}% contra el mes pasado 👀` |
| Categoría suba (warning) | `Tu gasto en {emoji}{category} subió un {pct}% este mes` | `Ojo con {emoji}{category}: subió un {pct}% este mes 👀` |
| Cuotas (info) | `Tenés {n} cuota(s) este mes por {total}` | `Este mes se vienen {n} cuota(s) por {total} 💳` |
| Presupuesto (info/warning) | `Vas al {pct}% del presupuesto de {emoji}{name} con {daysRemaining} días restantes` | `Ya vas al {pct}% del presupuesto de {emoji}{name}, con {daysRemaining} días por delante` |
| Actualizar tarjeta (warning) | `Actualizá el cierre y vencimiento de {card.name} para el nuevo ciclo 📅` | `Che, actualizá el cierre y vencimiento de {card.name} para el nuevo ciclo 📅` |

> El ícono de la cuota pasa a poder usar `CreditCard` (ya en el mapa). La pluralización `cuota${n > 1 ? 's' : ''}` se mantiene.

### 1.3 Orden y tope

Orden de push (alertas accionables primero, refuerzo positivo después):
1. Gasto vs mes anterior
2. Categoría con mayor suba
3. Cuotas del mes
4. Presupuesto cerca del límite
5. Actualizar tarjeta
6. Objetivo
7. Racha
8. Portafolio

Al final: `return insights.slice(0, 6);` — tope suave para que un ciclo completo del carrusel no se eternice. Se documenta el orden en el JSDoc del getter.

### 1.4 Íconos

Agregar `Flame` (de `lucide-react`) al `ICON_MAP` del componente. El resto ya existen.

---

## 2. Cambios en el componente: `insights-carousel.tsx`

### 2.1 Animación derecha → izquierda

Reemplazar el eje vertical (`y`) por horizontal (`x`) en el `motion.div`:
- `initial={{ opacity: 0, x: direction * 40 }}`
- `animate={{ opacity: 1, x: 0 }}`
- `exit={{ opacity: 0, x: direction * -40 }}`

Con `direction = 1` (auto-avance), el mensaje nuevo entra desde la derecha (`x: +40 → 0`) y el viejo sale por la izquierda (`x: 0 → -40`). Se mantiene `AnimatePresence mode="wait"` y el auto-rotado cada 5s (`ROTATION_INTERVAL`).

### 2.2 Swipe / drag

El `motion.div` del insight actual pasa a ser draggable:
- `drag="x"`, `dragConstraints={{ left: 0, right: 0 }}`, `dragElastic={0.2}`.
- `onDragEnd`: si `offset.x < -threshold || velocity.x < -v` → avanzar (`next()`); si `offset.x > threshold || velocity.x > v` → retroceder (`prev()`). Umbrales: `threshold ≈ 60px`, `v ≈ 300`.
- `next()` usa `direction = 1`; `prev()` usa `direction = -1`.
- Al navegar manualmente (swipe o teclado) se **reinicia el timer** de auto-rotado (ver 2.4).
- `cursor-grab active:cursor-grabbing` y `touch-action` adecuado para no romper el scroll vertical de la página (el drag horizontal no debe secuestrar el scroll).

### 2.3 Eliminar dots

- Borrar el bloque `insights.length > 1 && (...)` con los botones-dot (actual líneas 98–121).
- Quitar las claves `dot` y `dotInactive` de cada entrada de `STYLE_MAP` (quedan `card` e `icon`).
- Quitar la función `goTo` (reemplazada por `next`/`prev`).

### 2.4 Auto-rotado con reinicio y pausa

- El intervalo de 5s se reinicia cada vez que cambia `current` por acción del usuario. Implementación: `useEffect` dependiente de `[current, paused, insights.length, reducedMotion]` que crea el `setInterval` y lo limpia; al avanzar manualmente, `current` cambia y el efecto reprograma el timer.
- Estado `paused` (bool): `true` on `mouseenter`/`focuswithin` y mientras se arrastra; `false` al salir. Con `paused`, no se programa el intervalo.

---

## 3. Accesibilidad

- **Región viva:** un `<p>` (o span) con `aria-live="polite"` y `aria-atomic="true"` que contiene el mensaje del insight actual, para que lectores de pantalla anuncien el cambio. El contenedor lleva `role="group"` y `aria-roledescription="carrusel"` + `aria-label="Novedades de tus finanzas"`.
- **Teclado:** el contenedor de la tarjeta es `tabIndex={0}`; `onKeyDown` mapea `ArrowRight → next()`, `ArrowLeft → prev()`. Foco visible con `focus-visible:outline` acorde a tokens.
- **Pausa on hover/focus:** el auto-rotado se detiene mientras `paused` (patrón APG para carruseles auto-rotantes), evitando que el contenido cambie mientras el usuario lee o navega.
- **`prefers-reduced-motion`:** vía `useReducedMotion()` de framer-motion:
  - Sin deslizamiento horizontal: transición de solo `opacity` (o instantánea).
  - Sin auto-avance: no se programa el intervalo (el usuario navega manualmente con swipe/teclado).

---

## 4. Testing

Archivo: `src/lib/store/__tests__/insights.test.ts` (nuevo), siguiendo el patrón de los tests del store (`useFinanceStore.setState` para sembrar estado).

Casos:
- **Racha:** con `getRegistrationStreak` devolviendo `days = 5` aparece el insight de racha; con `days = 2` no aparece.
- **Objetivo:** con un objetivo activo al 60% aparece el insight; al 40% no; objetivo `completed` no dispara este insight.
- **Portafolio:** con `totalInvested > 0` y `totalPLPercent = +8` aparece mensaje positivo; con `-8` aparece warning; con `+1` (por debajo del umbral 3) no aparece; con `totalInvested = 0` no aparece.
- **Tope:** sembrando condiciones que generen >6 insights, `getInsights().length === 6`.

> Nota: los getters reutilizados (`getRegistrationStreak`, `getSavingsGoalsOverview`, `getPortfolioStatus`) se controlan sembrando el estado base del store (`transactions`, `savingsGoals`, `assets`, precios) o, si resulta más simple y aislado, stubeando esos getters con `setState` para fijar sus salidas. Se prioriza sembrar estado real cuando el costo es bajo.

---

## 5. Archivos afectados

- `src/lib/store/financeStore.ts` — `getInsights()`: 3 generadores nuevos, reescritura de copy, tope de 6, JSDoc actualizado.
- `src/components/dashboard/insights-carousel.tsx` — animación X, swipe, sin dots, a11y, pausa, reduced-motion, `Flame` en `ICON_MAP`, limpieza de `STYLE_MAP`.
- `src/lib/store/__tests__/insights.test.ts` — nuevo test del getter.

## 6. Riesgos / consideraciones

- **Drag vs scroll de página:** el `drag="x"` no debe bloquear el scroll vertical en mobile. Verificar en dispositivo/emulación que un swipe vertical siga scrolleando la página.
- **Live region + auto-rotado:** para no spamear al lector de pantalla, el anuncio `polite` combinado con la pausa on focus mantiene el ruido bajo. No se usa `assertive`.
- **Tokens semánticos:** mantener `bg-*/8`, `border-*/25`, `text-*` ya presentes; no introducir colores hardcodeados.
