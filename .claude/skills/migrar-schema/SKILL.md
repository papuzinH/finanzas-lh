---
name: migrar-schema
description: Checklist completo para aplicar cambios de schema SQL en Chanchito (DEV → PROD antes del merge)
argument-hint: "[descripción del cambio]"
---

# Migración de schema: $ARGUMENTS

## ⚠️ Regla de oro
Los cambios de schema SQL se aplican a PROD **antes** del merge a `master`.
Si el deploy llega antes que la migración, la app se rompe en producción.
Y si el cambio rompe la firma de algo que el deploy vigente ya usa, hacerlo
compatible hacia atrás (wrappers) — ver CLAUDE.md → Deploy.

## Las dos bases (desde 2026-08-26)

| | ref | cuenta | credenciales en `.env.local` |
|---|---|---|---|
| **DEV** (default, linkeada al CLI) | `hgxuxoqyrooaariimqmg` | B (org STUDIO) | `SUPABASE_ACCESS_TOKEN` + `SUPABASE_DB_PASSWORD` |
| **PROD** | `mkkgdjxaotgimqwhyesx` | A | `SUPABASE_DB_PASSWORD_PROD` (el push directo no necesita PAT) |

## Orden de ejecución

### 1. Escribir la migración
```bash
set -a; . ./.env.local; set +a      # ⚠️ passwords con comillas simples en el archivo
supabase migration new <nombre>      # crea el archivo con timestamp de 14 dígitos
# escribir el SQL en el archivo generado
```

### 2. Aplicar en DEV (el link del repo)
```bash
supabase db push --linked
supabase migration list --linked     # DEV: Local = Remote
```

### 3. Verificar la app contra DEV
`npm run build && npx next start -p 3100` (⚠️ `next dev` está roto por el
favicon desde el 22-ago) — la app local ya apunta a DEV.

### 4. Actualizar tipos y Zod si aplica
- `src/types/database.ts` (regenerar o mantener a mano, ver CLAUDE.md)
- `lib/schemas/` si la entidad modificada tiene schema Zod

### 5. Aplicar en PROD — paso explícito, a propósito
```bash
supabase db push --db-url "postgresql://postgres.mkkgdjxaotgimqwhyesx:${SUPABASE_DB_PASSWORD_PROD}@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"
```
Verificar contra la base (`pg_policies`, `information_schema`), nunca contra
un comentario de commit.

### 6. Merge / deploy
Recién ahora mergear a `master`; Vercel despliega automáticamente.

## Checklist final
- [ ] Migración aplicada en DEV (`migration list --linked`: Local = Remote) ✓
- [ ] App verificada contra DEV ✓
- [ ] `types/database.ts` y Zod actualizados si aplica ✓
- [ ] Migración aplicada en PROD (verificada contra la base) ✓
- [ ] Merge a `master` ✓
