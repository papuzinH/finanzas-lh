import { z } from 'zod'

export const createPaymentMethodSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(50),
  type: z.enum(['credit', 'debit', 'cash']),
  default_closing_day: z.number()
    .min(1, 'El día de cierre debe ser entre 1 y 31')
    .max(31, 'El día de cierre debe ser entre 1 y 31')
    .nullable()
    .optional(),
  default_payment_day: z.number()
    .min(1, 'El día de vencimiento debe ser entre 1 y 31')
    .max(31, 'El día de vencimiento debe ser entre 1 y 31')
    .nullable()
    .optional(),
  is_personal: z.boolean().optional(),
  is_default: z.boolean().optional(),
}).refine(
  (data) => {
    // Solo validar si ambos están presentes y el tipo es credit
    if (data.type === 'credit' && data.default_closing_day && data.default_payment_day) {
      return data.default_closing_day !== data.default_payment_day
    }
    return true
  },
  {
    message: 'El día de cierre y vencimiento no pueden ser iguales',
    path: ['default_payment_day'],
  }
)

export type CreatePaymentMethodSchema = z.infer<typeof createPaymentMethodSchema>

export const updatePaymentMethodSchema = createPaymentMethodSchema
export type UpdatePaymentMethodSchema = CreatePaymentMethodSchema
