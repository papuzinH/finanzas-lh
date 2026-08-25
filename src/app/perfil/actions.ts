'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { MAIL_CONTACTO } from '@/lib/contacto';

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

/**
 * Borra la cuenta entera, ahora y sin vuelta atrás. Dos pasos con dueños
 * distintos, en este orden:
 *
 * 1. `delete_my_account()` — SECURITY DEFINER, sin parámetros, resuelve el
 *    usuario de `auth.uid()`: purga las 15 tablas con `user_id` más la fila de
 *    `users` en UNA transacción. Va con el cliente de sesión: ni con la anon
 *    key ni con este server action se puede borrar a otro.
 * 2. `auth.admin.deleteUser` — la identidad de Google y las sesiones. Solo
 *    service_role toca `auth.users`, por eso va con el admin client.
 *
 * Si falla 1, no se tocó nada y se avisa. Si falla 2, los datos ya no están:
 * se cierra la sesión igual (una cuenta sin fila en `users` no puede usar la
 * app) y el mensaje da el mail para cerrarla a mano. Se loguea el uid para eso.
 */
export async function deleteMyAccount(): Promise<{ error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'No hay una sesión activa. Volvé a entrar y probá de nuevo.' };
  }

  const { error: purgeError } = await supabase.rpc('delete_my_account');
  if (purgeError) {
    console.error('deleteMyAccount: la purga falló, no se tocó nada', { userId: user.id, purgeError });
    return { error: 'No pudimos borrar tus datos. No se tocó nada; probá de nuevo en un rato.' };
  }

  const { error: authError } = await createAdminClient().auth.admin.deleteUser(user.id);
  await supabase.auth.signOut();
  if (authError) {
    console.error('deleteMyAccount: datos borrados pero la cuenta de Auth sigue viva', {
      userId: user.id,
      authError,
    });
    return {
      error: `Borramos tus datos, pero no pudimos cerrar la cuenta de acceso. Escribinos a ${MAIL_CONTACTO} y la cerramos a mano.`,
    };
  }

  redirect('/');
}
