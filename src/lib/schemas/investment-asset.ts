import { z } from 'zod'
import { esFuentePermitida } from '@/lib/investments/prices/fuente-permitida'

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

export const investmentAssetSchema = z
  .object({
    ticker: z.string().min(1, 'El ticker es obligatorio').max(20),
    name: z.string().min(1, 'El nombre es obligatorio').max(100),
    asset_type: z.enum(ASSET_TYPES, { error: 'Tipo de activo inválido' }),
    currency: z.enum(['ARS', 'USD']).optional(),
    data_source_url: z.string().url('URL inválida').optional().or(z.literal('')),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  // El server fetchea esta URL y el precio va a una tabla global (auditoría
  // 2026-08-26): sólo la página de IOL del propio ticker.
  .superRefine((v, ctx) => {
    if (v.data_source_url && !esFuentePermitida(v.data_source_url, v.ticker)) {
      ctx.addIssue({
        code: 'custom',
        path: ['data_source_url'],
        message: 'Sólo se acepta la página de cotización de IOL de este ticker',
      })
    }
  })

export type InvestmentAssetSchema = z.infer<typeof investmentAssetSchema>
