/**
 * @deprecated Usar investment-asset.ts (InvestmentAsset) e investment-transaction.ts (InvestmentTransaction).
 * Este schema se mantiene para backward compatibility mientras se migra la UI.
 */
import { z } from 'zod'

export const investmentSchema = z.object({
  ticker: z.string().min(1, 'El ticker es obligatorio').max(20),
  name: z.string().min(1, 'El nombre es obligatorio').max(100),
  type: z.enum(['stock', 'cedear', 'bond', 'on', 'crypto', 'fci']),
  quantity: z.number().positive('La cantidad debe ser positiva'),
  avg_buy_price: z.number().nonnegative().optional(),
  currency: z.string().optional(),
  data_source_url: z.string().url().optional().or(z.literal('')),
})

export type InvestmentSchema = z.infer<typeof investmentSchema>

// Re-exports desde los nuevos schemas
export { investmentAssetSchema, ASSET_TYPES } from './investment-asset'
export type { InvestmentAssetSchema } from './investment-asset'
export { investmentTransactionSchema, TRANSACTION_TYPES } from './investment-transaction'
export type { InvestmentTransactionSchema } from './investment-transaction'
