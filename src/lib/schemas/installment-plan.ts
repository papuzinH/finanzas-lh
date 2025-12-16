import { z } from 'zod';

export const installmentPlanSchema = z.object({
  description: z.string().min(3, 'La descripción debe tener al menos 3 caracteres'),
  category: z.string().optional(),
});

export type InstallmentPlanSchema = z.infer<typeof installmentPlanSchema>;
