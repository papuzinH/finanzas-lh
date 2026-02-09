import { z } from 'zod';

export const installmentPlanSchema = z.object({
  description: z.string().min(3, 'La descripción debe tener al menos 3 caracteres'),
  category_id: z.string().optional(),
});

export type InstallmentPlanSchema = z.infer<typeof installmentPlanSchema>;

export const createInstallmentPlanSchema = z.object({
  description: z.string().min(3, 'La descripción debe tener al menos 3 caracteres'),
  total_amount: z.number().positive('El monto total debe ser positivo'),
  installments_count: z.number().int().min(1, 'Debe tener al menos 1 cuota'),
  purchase_date: z.date({ message: 'La fecha de compra es requerida' }),
  category_id: z.string().min(1, 'La categoría es requerida'),
  payment_method_id: z.string().nullable().optional(),
});

export type CreateInstallmentPlanSchema = z.infer<typeof createInstallmentPlanSchema>;
