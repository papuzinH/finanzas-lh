import { z } from 'zod'

export const createPaymentMethodSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(50),
  type: z.enum(['credit', 'debit', 'cash']),
  default_closing_day: z.number().min(1).max(31).nullable().optional(),
  default_payment_day: z.number().min(1).max(31).nullable().optional(),
  is_personal: z.boolean().optional(),
})

export type CreatePaymentMethodSchema = z.infer<typeof createPaymentMethodSchema>
