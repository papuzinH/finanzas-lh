import { z } from 'zod'

export const categorySchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(50, 'El nombre es muy largo'),
  emoji: z.string().min(1, 'El emoji es obligatorio'),
  description: z.string().max(300, 'La descripción es muy larga').optional(),
})

export type CategoryFormValues = z.infer<typeof categorySchema>
