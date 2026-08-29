'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { origenCanonico } from '@/lib/security/dominio-canonico';

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
      redirectTo: `${origin}/auth/callback`,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });

  if (error) {
    redirect('/login?error=oauth_init_failed');
  }

  if (data.url) {
    redirect(data.url);
  }
}
