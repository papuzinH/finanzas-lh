---
name: nueva-feature
description: Scaffold e implementa una nueva feature en Chanchito siguiendo la arquitectura del proyecto (Server/Client, store, Zod, UI)
argument-hint: "[descripción de la feature]"
---

# Nueva feature: $ARGUMENTS

Seguí este flujo exacto para implementar la feature. No te saltees pasos.

## 1. Decisión Server vs. Client
Antes de crear cualquier archivo, determiná si la feature necesita:
- **Solo datos** → Server Component en `app/`
- **Interactividad / estado** → Client Component con `'use client'`
- **Ambos** → Server Component padre + Client Component hijo para la parte interactiva

## 2. ¿Necesita lógica de negocio?
Antes de calcular cualquier cosa en el componente, revisá `lib/store/financeStore.ts`.
- ¿Ya existe un getter que resuelve esto? → usalo.
- ¿No existe? → agregá el getter en el store PRIMERO, luego usalo en el componente.
Nunca pongas lógica de cálculo directamente en el componente.

## 3. ¿Necesita persistencia?
- Revisá `lib/schemas/` para ver si ya hay un schema Zod para la entidad.
- Revisá `types/database.ts` para los tipos de Supabase.
- Si es un formulario: usá React Hook Form + `@hookform/resolvers` + el schema Zod.

## 4. Estructura de archivos a crear
```
app/[ruta]/
  page.tsx          ← Server Component (datos)
  _components/
    [Feature].tsx   ← Client Component (UI interactiva)

lib/store/          ← nuevos getters si aplica
lib/schemas/        ← nuevo schema Zod si aplica
```

## 5. UI checklist
- [ ] Shadcn UI (`Card`, `Button`, `Dialog`, etc.) — nunca `<div>` crudo
- [ ] Dark mode: `bg-surface`, acentos `indigo-*` / `violet-*`
- [ ] Mobile-first: empezá con `w-full`, luego `md:w-auto`
- [ ] Íconos: `lucide-react`, importar solo los necesarios

## 6. Antes de terminar
- [ ] Sin `any` en TypeScript
- [ ] Imports absolutos (`@/lib/...`, `@/components/...`)
- [ ] `parseLocalDate()` para cualquier manipulación de fechas
- [ ] `npm run lint` sin errores
