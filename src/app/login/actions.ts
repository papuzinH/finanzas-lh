'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { origenCanonico } from '@/lib/security/dominio-canonico';
import { permiteLoginPorEmail } from '@/lib/entorno';
import { loginEmailSchema } from '@/lib/schemas/login-email';

export async function signInWithGoogle() {
  const supabase = await createClient();

  // El origen NO sale crudo del header `host`: se acepta sólo si es uno de los
  // que Supabase tiene en su allow-list de redirects, y si no se cae al de
  // producción. Derivarlo de la request es lo que rompía el login desde
  // www.michanchito.net — Supabase descartaba el destino y mandaba al site_url,
  // dejando al usuario en `/` sin sesión. Ver `lib/security/dominio-canonico.ts`.
  const headersList = await headers();
  const origin = origenCanonico(
    headersList.get('host'),
    headersList.get('x-forwarded-proto'),
  );

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // Sin `prompt: 'consent'`: le ordenaba a Google mostrar la pantalla de
      // permisos en CADA login, aunque el usuario ya la hubiera aceptado — un
      // usuario de la beta lo reportó como "me pide confirmar todo el tiempo"
      // (2026-09-01). Tampoco va `access_type: 'offline'`: pedía un refresh token
      // de Google que la app no usa, porque la sesión la maneja Supabase.
      redirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    redirect('/login?error=oauth_init_failed');
  }

  if (data.url) {
    redirect(data.url);
  }
}

/**
 * Login por email/contraseña, SOLO fuera de producción (previews y local
 * contra DEV, que no tiene Google configurado — ver `lib/entorno.ts`).
 *
 * La UI ya condiciona el render con `permiteLoginPorEmail()`, pero el server
 * decide de nuevo acá: es defensa en profundidad, no confianza en que el
 * cliente mandó el formulario correcto. En producción el provider de email
 * está apagado en Supabase, así que esto ni siquiera hace falta para que
 * nadie entre — pero la UI tampoco debe mostrarse ahí.
 */
export async function signInWithEmailPassword(formData: FormData) {
  if (!permiteLoginPorEmail()) {
    redirect('/login?error=email_login_disabled');
  }

  const parsed = loginEmailSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    redirect('/login?error=invalid_credentials');
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    redirect('/login?error=invalid_credentials');
  }

  redirect('/');
}
