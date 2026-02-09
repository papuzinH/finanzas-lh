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
