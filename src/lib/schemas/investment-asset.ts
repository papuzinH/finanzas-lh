import { z } from 'zod'

export const ASSET_TYPES = [
  'stock',
  'cedear',
  'bond',
  'on',
  'bopreal',
  'lecap',
  'boncap',
  'plazo_fijo',
  'money_market',
  'crypto',
  'stablecoin',
  'fci',
  'etf',
] as const

export const investmentAssetSchema = z.object({
  ticker: z.string().min(1, 'El ticker es obligatorio').max(20),
  name: z.string().min(1, 'El nombre es obligatorio').max(100),
  asset_type: z.enum(ASSET_TYPES, { error: 'Tipo de activo inválido' }),
  currency: z.enum(['ARS', 'USD']).optional(),
  data_source_url: z.string().url('URL inválida').optional().or(z.literal('')),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type InvestmentAssetSchema = z.infer<typeof investmentAssetSchema>
