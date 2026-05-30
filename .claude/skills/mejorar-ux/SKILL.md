---
name: mejorar-ux
description: Revisa, audita y optimiza exhaustivamente la UX/UI, accesibilidad, performance percibida y transiciones mobile-first de un componente o vista de Chanchito.
argument-hint: "[ruta del componente, vista o sección a mejorar]"
---

# Mejorar UX/UI y Accesibilidad Mobile-First: $ARGUMENTS

Actúa como un Diseñador de Interacción y Desarrollador Frontend Senior experto en PWAs Mobile. Tu objetivo es auditar el archivo indicado y refactorizar su capa visual para garantizar una experiencia fluida, accesible (WCAG 2.2) y con rendimiento percibido instantáneo, respetando estrictamente la arquitectura de Chanchito.

## 1. Protocolo de Diagnóstico Obligatorio
Antes de modificar el código, analiza el archivo objetivo y genera un reporte breve estructurado en:
- **Fricción en Mobile:** Áreas de toque, inputs incómodos, modales invasivos en viewports chicos.
- **Accesibilidad (a11y):** Deficiencias en contraste, jerarquía de fuentes, tags de lectura (`aria-label`) o focus traps.
- **Rendimiento Percibido:** Layout shifts potenciales, ausencia de Skeletons o micro-animaciones de feedback.

## 2. Estándares UX/UI Mobile-First para Chanchito

### A. Elementos Interactivos y Touch Targets
- **Tamaño mínimo:** Todo elemento clickeable (botones, links, tarjetas interactivas) debe garantizar un área de toque mínima de `min-h-[44px] min-w-[44px]` o usar padding compensatorio (`p-3`).
- **Feedback Activo (Micro-interacciones):** Elementos interactivos principales deben reaccionar al toque. Implementar transiciones suaves y reducción sutil de escala: `transition-all duration-200 active:scale-[0.98]`.
- **Focus Ring Seguro:** Prohibido usar `outline-none` a secas. Reemplazar siempre por: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface`.

### B. Optimización Extrema de Formularios (Mobile Inputs)
Las pantallas móviles requieren minimizar la fricción al escribir. Aplica estas propiedades según el caso:
- **Inputs de Montos/Moneda:** Añadir `inputMode="decimal"`, `pattern="[0-9]*"`, `autoComplete="off"`, `autoCorrect="off"`, `autoCapitalize="none"`.
- **Inputs de Texto General:** Evitar que el teclado móvil auto-capitalice si son identificadores o etiquetas: `autoCapitalize="none"`.
- **Mensajes de Error:** Deben estar vinculados al input de forma accesible. Utilizar la estructura de `Form` de shadcn/ui que implementa `aria-describedby` automáticamente.

### C. Navegación y Contenedores (Viewports < 640px)
- **Bottom Sheets sobre Modals:** Para menús de acción, formularios de carga rápida o selectores en mobile, prioriza el uso de hojas inferiores (`Drawer` / Bottom Sheet de shadcn) en lugar de modales centrados (`Dialog`), los cuales quedan reservados para desktop (`md:crypto-modal`).
- **Scroll Containers:** Asegura que los listados largos (como el historial de movimientos) usen scroll inercial nativo: `overflow-y-auto scrolling-touch`.

### D. Percepción de Carga y Skeletons (Anti-CLS)
- **Evitar Layout Shifts:** Los Skeletons deben calzar exactamente con el alto y ancho del componente final para mitigar el Cumulative Layout Shift.
- **Botones Asíncronos:** Al mutar datos, el botón debe pasar a `disabled`, mantener su ancho exacto mediante layouts estables y mostrar un spinner centrado sutilmente.

## 3. Guía de Refactorización de Código (Ejemplos Patrón)

### Optimización de Inputs para Finanzas
```tsx
// ❌ Antes
<Input type="number" placeholder="0.00" />

// ✅ Después
<div className="relative rounded-md shadow-sm">
  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">$</span>
  <Input
    type="text"
    inputMode="decimal"
    pattern="[0-9]*"
    placeholder="0.00"
    className="pl-7 min-h-[44px] focus-visible:ring-indigo-500"
    autoComplete="off"
    autoCorrect="off"
    autoCapitalize="none"
  />
</div>

```

### Modales adaptativos (Drawer en Mobile, Dialog en Desktop)

```tsx
// ✅ Estructura recomendada para formularios de transiciones o ajustes
import { useMediaQuery } from "@/hooks/use-media-query"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Drawer, DrawerContent } from "@/components/ui/drawer"

export function AdaptableModal({ isOpen, setIsOpen, children }) {
  const isDesktop = useMediaQuery("(min-w: 768px)")

  if (isDesktop) {
    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[425px] bg-surface-raised">{children}</DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer open={isOpen} onOpenChange={setIsOpen}>
      <DrawerContent className="bg-surface-raised px-4 pb-6">{children}</DrawerContent>
    </Drawer>
  )
}

```

### Micro-interacciones en Botones de Íconos

```tsx
// ❌ Antes
<button onClick={onAction}><Plus className="h-5 w-5" /></button>

// ✅ Después
<Button
  variant="ghost"
  size="icon"
  className="h-11 w-11 rounded-full text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 active:scale-95 transition-all duration-150"
  aria-label="Agregar nuevo registro"
  onClick={onAction}
>
  <Plus className="h-5 w-5 transition-transform duration-200 group-hover:rotate-90" />
</Button>

```

## 4. Paleta dark mode Chanchito

| Uso | Clase |
| --- | --- |
| Fondo base | `bg-surface` |
| Fondo card | `bg-surface-raised` |
| Hover sutil | `hover:bg-slate-800` |
| Texto principal | `text-slate-50` |
| Texto secundario | `text-slate-400` |
| Acento primario | `text-indigo-400` / `bg-indigo-500` |
| Acento secundario | `text-violet-400` |
| Destructivo | `text-red-400` / `hover:bg-red-400/10` |
| Éxito | `text-emerald-400` |

## 5. Recordatorio Arquitectónico: Prohibido Desacoplar Lógica

* **No inyectar fetching local:** Toda la información reactiva y lógica matemática de balance debe consumirse exclusivamente mediante los getters de `useFinanceStore`.
* **No romper el Design System:** Chanchito corre en modo oscuro estricto. Mantén las clases semánticas (`bg-surface`, `bg-surface-raised`, `text-slate-50`, `text-slate-400`).

## 6. Checklist de Verificación de Claude Code

El cambio se considerará exitoso si cumple al 100% con los siguientes puntos:

* [ ] Los inputs numéricos tienen `inputMode` y deshabilitan el auto-corrector.
* [ ] Todo elemento interactivo tiene un área táctil mínima de 44px.
* [ ] Se incluyeron clases de transición (`transition-*`) y escala al presionar (`active:scale-*`).
* [ ] El componente fue testeado visualmente o estructurado para no romperse en dispositivos de ancho 320px (iPhone SE).
* [ ] Todos los iconos decorativos tienen `aria-hidden="true"` y los interactivos tienen `aria-label`.
* [ ] El linter (`npm run lint`) compila en limpio.