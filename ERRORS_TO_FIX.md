# Errores TypeScript a Corregir

## Archivo: src/lib/store/__tests__/financeStore.test.ts

### Problema

65 errores de tipo `TS2322: Type 'string' is not assignable to type 'number'`

### Causa Raíz

El archivo de tests anterior está usando tipos de `Transaction` con tipos incorrectos en los mocks:

```typescript
// INCORRECTO - user_id como string
const transactions: Transaction[] = [
  {
    id: 1,
    user_id: 'user1',        // ❌ Debe ser number
    type: 'income',
    amount: 1000,            // ❌ Debe ser number, es number OK
    date: '2024-03-15',
    description: 'Salary',
    payment_method_id: 1,    // ❌ Debe ser number si existe
    category_id: 1,          // ❌ Debe ser number si existe
    // ...
  }
]
```

### Líneas Afectadas

Todos los errores están en el archivo `src/lib/store/__tests__/financeStore.test.ts`:

- Líneas 59, 65, 72, 78, 93, 99, 106, 112, 119, 125, 140, 146, 153, 159, 180, 186, 193, 199, 214, 220, 227, 233, 251, 261, 271, 289, 299, 309, 333, 343, 361, 383, 389, 396, 402, 417, 423, 430, 436, 451, 457, 464, 470, 485, 491, 498, 504, 519, 525, 532, 538, 553, 559, 566, 572, 587, 593, 608, 614

### Solución

Necesitas verificar el tipo `Transaction` en `src/types/database.ts` y hacer una de estas opciones:

#### Opción A: Usar valores correctos en los tests

```typescript
// CORRECTO - tipos numéricos
const transactions: Transaction[] = [
  {
    id: 1,
    user_id: 1,              // ✅ number
    type: 'income',
    amount: 1000,            // ✅ number
    date: '2024-03-15',
    description: 'Salary',
    payment_method_id: 1,    // ✅ number
    category_id: 1,          // ✅ number
    installment_plan_id: null,
    recurring_plan_id: null,
    created_at: '2024-03-15',
  }
]
```

#### Opción B: Usar type assertion (si los tipos son realmente strings)

```typescript
const transactions: Transaction[] = [
  {
    id: 1,
    user_id: 1 as any,       // Type assertion como último recurso
    // ...
  } as Transaction
]
```

#### Opción C: Revisar el tipo en types/database.ts

El tipo `Transaction` probablemente se ve así:

```typescript
export interface Transaction {
  id: number
  user_id: number          // ← Verificar si es number o string
  type: 'income' | 'expense'
  amount: number
  date: string
  description: string
  payment_method_id: number | null
  category_id: number | null
  installment_plan_id: number | null
  recurring_plan_id: number | null
  created_at: string
}
```

Si en la base de datos `user_id` es un UUID (string), entonces el tipo debe ser:

```typescript
export interface Transaction {
  id: number
  user_id: string          // ← UUID de Supabase Auth
  type: 'income' | 'expense'
  // ...
}
```

### Verificación

Una vez corregido, ejecutar:

```bash
# Verificar que se eliminen los 65 errores
npx tsc --noEmit 2>&1 | grep "financeStore.test.ts" | wc -l
# Debe retornar: 0
```

### Nota

Este error NO fue causado por los tests del pipeline de IA (intentParser, chatPrompt). Los nuevos tests tienen:
- ✅ 0 errores TypeScript
- ✅ 33/33 tests PASSING

Solo requiere corrección el archivo anterior `financeStore.test.ts`.
