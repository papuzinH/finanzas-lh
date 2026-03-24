---
name: store-getter
description: Agrega un nuevo getter a lib/store/financeStore.ts siguiendo las convenciones del proyecto
argument-hint: "[nombre del getter]"
---

# Agregar getter al store: $ARGUMENTS

Agregá un nuevo getter a `lib/store/financeStore.ts` siguiendo estas reglas.

## Antes de crear
1. Buscá en el store si ya existe algo similar con `grep -n "get" lib/store/financeStore.ts`
2. Revisá los tipos disponibles en `types/database.ts` para la entidad involucrada

## Estructura del getter
```typescript
// Nombre: get[Descripción]()
// Retorno: tipo explícito, nunca `any`
get[NombreDescriptivo](): TipoRetorno {
  const { datos } = get();

  // Toda la lógica va acá — NO en el componente
  // Para fechas: usar parseLocalDate() de lib/utils/dates.ts
  // Para tarjetas: considerar periodDate vs realPaymentDate

  return resultado;
},
```

## Reglas críticas
- El getter debe ser puro: misma entrada → misma salida
- Si necesita la fecha actual, usarla desde `get()` o pasarla como parámetro
- Para cálculos de tarjeta de crédito: revisar `isExpenseInCurrentMonthScope()` antes de reinventar la lógica
- Tipar el retorno explícitamente (sin inferencia implícita en getters complejos)

## Después de crear el getter
Mostrá un ejemplo de uso en un componente cliente:
```typescript
const resultado = useFinanceStore(state => state.get[NombreDescriptivo]());
```
