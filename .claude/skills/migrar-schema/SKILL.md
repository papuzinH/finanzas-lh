---
name: migrar-schema
description: Checklist completo para aplicar cambios de schema SQL en Chanchito (DEV → PROD antes del merge)
argument-hint: "[descripción del cambio]"
---

# Migración de schema: $ARGUMENTS

## ⚠️ Regla de oro
Los cambios de schema SQL se aplican a PROD **antes** del merge a `master`.
Si el deploy llega antes que la migración, la app se rompe en producción.

## Orden de ejecución

### 1. Escribir la migración SQL
```sql
-- Descripción clara del cambio
ALTER TABLE ...;
CREATE INDEX ...;
```

### 2. Aplicar en DEV primero
- Ejecutar en Supabase DEV (el que apunta `.env.local`)
- Verificar que la app funciona localmente con `npm run dev`

### 3. Actualizar tipos TypeScript
```bash
supabase gen types typescript --local > types/database.ts
```
Si no tenés Supabase CLI, actualizar `types/database.ts` manualmente.

### 4. Actualizar schema Zod si aplica
Revisar `lib/schemas/` — si la entidad modificada tiene schema, actualizarlo.

### 5. Aplicar en PROD
- Ejecutar el mismo SQL en Supabase PROD
- Verificar en el dashboard que la tabla/columna existe

### 6. Hacer merge / deploy
- Recién ahora hacer merge a `master`
- Vercel desplegará automáticamente

## Checklist final
- [ ] Migración aplicada en DEV ✓
- [ ] App funciona localmente ✓
- [ ] `types/database.ts` actualizado ✓
- [ ] Schemas Zod actualizados si aplica ✓
- [ ] Migración aplicada en PROD ✓
- [ ] Merge a `master` ✓
