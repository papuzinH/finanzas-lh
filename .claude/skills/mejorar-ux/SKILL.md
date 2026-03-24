---
name: mejorar-ux
description: Revisa y mejora accesibilidad y UX/UI de un componente o sección de Chanchito (touch targets, contraste, estados hover/focus, loading states)
argument-hint: "[componente o sección a mejorar]"
---

# Mejorar UX/UI: $ARGUMENTS

Revisá y mejorá la experiencia de usuario del componente o sección indicada, siguiendo el design system de Chanchito.

## 1. Diagnóstico primero
Antes de tocar código, listá los problemas encontrados en el archivo objetivo:
- Botones con área de toque < 44x44px (mínimo WCAG para mobile)
- Textos con bajo contraste sobre `bg-slate-950`
- Elementos interactivos sin estado `hover:`, `focus:`, `active:` o `disabled:`
- Formularios sin labels visibles o sin mensajes de error accesibles
- Íconos sin texto alternativo o `aria-label`
- Elementos que se ven bien en desktop pero se rompen en mobile

## 2. Reglas de accesibilidad para Chanchito
- **Touch targets**: mínimo `min-h-[44px] min-w-[44px]` en cualquier elemento clickeable
- **Íconos solos** (sin texto): siempre agregar `aria-label="descripción"`
- **Focus visible**: nunca `outline-none` sin reemplazarlo. Usar `focus-visible:ring-2 focus-visible:ring-indigo-500`
- **Loading states**: botones que disparan async siempre deben tener estado deshabilitado con spinner

## 3. Mejoras por tipo de elemento

### Botones de acción principal
```tsx
// ❌ Antes
<Button size="sm">Guardar</Button>

// ✅ Después
<Button size="sm" className="min-h-[44px] px-6">Guardar</Button>
```

### Botones de ícono
```tsx
// ❌ Antes
<button onClick={onDelete}><Trash2 className="h-4 w-4" /></button>

// ✅ Después
<Button
  variant="ghost"
  size="icon"
  className="h-11 w-11 text-slate-400 hover:text-red-400 hover:bg-red-400/10"
  aria-label="Eliminar"
  onClick={onDelete}
>
  <Trash2 className="h-4 w-4" />
</Button>
```

### Estados de carga en botones
```tsx
<Button disabled={isLoading}>
  {isLoading
    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</>
    : 'Guardar'}
</Button>
```

## 4. Paleta dark mode Chanchito
| Uso | Clase |
|-----|-------|
| Fondo base | `bg-slate-950` |
| Fondo card | `bg-slate-900` |
| Hover sutil | `hover:bg-slate-800` |
| Texto principal | `text-slate-50` |
| Texto secundario | `text-slate-400` |
| Acento primario | `text-indigo-400` / `bg-indigo-500` |
| Acento secundario | `text-violet-400` |
| Destructivo | `text-red-400` / `hover:bg-red-400/10` |
| Éxito | `text-emerald-400` |

## 5. Mobile-first obligatorio
- Layout móvil primero, `md:` para desktop
- Cards: `w-full` → `md:w-auto`
- Texto en botones con ícono: `hidden md:inline` si el espacio es limitado

## 6. Checklist antes de terminar
- [ ] Todos los botones tienen área mínima 44px
- [ ] Íconos sin texto tienen `aria-label`
- [ ] Estados hover/focus/active definidos
- [ ] Formularios con labels y mensajes de error visibles
- [ ] Botones async con estado de carga
- [ ] Se ve bien en mobile (< 375px) y desktop
- [ ] `npm run lint` sin errores
