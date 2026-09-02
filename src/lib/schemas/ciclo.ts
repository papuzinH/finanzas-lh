import { z } from 'zod'

const FECHA = /^\d{4}-\d{2}-\d{2}$/

export const declararCicloSchema = z
  .object({
    paymentMethodId: z.string().uuid(),
    // Strings `yyyy-MM-dd` a proposito: nunca Date. Un round trip por Date corre un dia
    // atras en runtimes con zona horaria negativa.
    closingDate: z.string().regex(FECHA, 'Fecha de cierre invalida'),
    dueDate: z.string().regex(FECHA, 'Fecha de vencimiento invalida'),
  })
  .refine((d) => d.dueDate >= d.closingDate, {
    message: 'El vencimiento no puede ser anterior al cierre',
    path: ['dueDate'],
  })

export type DeclararCicloSchema = z.infer<typeof declararCicloSchema>
