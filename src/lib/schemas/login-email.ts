import { z } from 'zod'

/**
 * Login por email/contraseña. Solo se usa fuera de producción (ver
 * `lib/entorno.ts`) — la validación es la mínima para llegar a
 * `signInWithPassword`, que es quien realmente decide si las credenciales
 * sirven.
 */
export const loginEmailSchema = z.object({
  email: z.email('Mail inválido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
})

export type LoginEmailSchema = z.infer<typeof loginEmailSchema>
