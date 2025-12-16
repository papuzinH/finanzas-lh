import { z } from 'zod';

export const transactionSchema = z.object({
  description: z.string().min(3, 'La descripción debe tener al menos 3 caracteres'),
  amount: z.number().positive('El monto debe ser positivo'),
  date: z.date({ required_error: 'La fecha es requerida' }),
  category: z.string().min(1, 'La categoría es requerida'),
  type: z.enum(['income', 'expense'], { required_error: 'El tipo es requerido' }),
});

export type TransactionSchema = z.infer<typeof transactionSchema>;
