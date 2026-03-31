import { z } from 'zod'

export const TRANSACTION_TYPES = ['buy', 'sell', 'dividend', 'coupon', 'interest'] as const

export const investmentTransactionSchema = z.object({
  asset_id: z.string().uuid('ID de activo inválido'),
  type: z.enum(TRANSACTION_TYPES, { error: 'Tipo de transacción inválido' }),
  quantity: z.number().positive('La cantidad debe ser positiva'),
  price_per_unit: z.number().nonnegative('El precio no puede ser negativo'),
  fees: z.number().nonnegative('Las comisiones no pueden ser negativas').optional(),
  currency: z.enum(['ARS', 'USD']),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
  notes: z.string().max(500, 'Las notas no pueden superar 500 caracteres').optional(),
})

export type InvestmentTransactionSchema = z.infer<typeof investmentTransactionSchema>
