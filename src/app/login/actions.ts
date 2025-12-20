'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

export async function login(
  prevState: { error: string } | null,
  formData: FormData
) {
  const supabase = await createClient();

  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('telegram_chat_id')
      .eq('id', user.id)
      .single();

    const currentTelegramId = profile?.telegram_chat_id;
    const isValid = currentTelegramId && currentTelegramId.trim().length > 0;

    if (!isValid) {
      revalidatePath('/onboarding', 'layout');
      redirect('/onboarding');
    }
  }

  revalidatePath('/', 'layout');
  redirect('/');
}

// Función helper para obtener la URL base correcta según el entorno
const getURL = () => {
  let url =
    process.env.NEXT_PUBLIC_SITE_URL ?? // Setear esto en Vercel Prod
    process.env.NEXT_PUBLIC_VERCEL_URL ?? // Vercel la pone automáticamente en Previews
    'http://localhost:3000';

  // Asegurarnos de que incluya el protocolo
  url = url.includes('http') ? url : `https://${url}`;

  // Quitar slash final si existe para evitar dobles slashes
  url = url.charAt(url.length - 1) === '/' ? url.slice(0, -1) : url;

  return url;
};

export async function signup(
  prevState: { error: string } | null,
  formData: FormData
) {
  const supabase = await createClient();
  const headersList = await headers();
  const host = headersList.get('host');
  const protocol = headersList.get('x-forwarded-proto') ?? 'http';
  const origin = headersList.get('origin') ?? `${protocol}://${host}`;

  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const firstName = formData.get('firstName') as string;
  const lastName = formData.get('lastName') as string;

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      data: {
        first_name: firstName, // Estos datos activarán tu Trigger en SQL
        last_name: lastName,
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  // El registro siempre redirige a onboarding porque el usuario es nuevo
  revalidatePath('/onboarding', 'layout');
  redirect('/onboarding');
}

export async function resetPasswordForEmail(
  prevState: { error?: string; success?: string } | null,
  formData: FormData
) {
  const supabase = await createClient();
  const email = formData.get('email') as string;
  const headersList = await headers();
  const host = headersList.get('host');
  const protocol = headersList.get('x-forwarded-proto') ?? 'http';
  const origin = headersList.get('origin') ?? `${protocol}://${host}`;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: 'Revisa tu correo para restablecer tu contraseña.' };
}

export async function updatePassword(
  prevState: { error: string } | null,
  formData: FormData
) {
  const supabase = await createClient();
  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;

  if (password !== confirmPassword) {
    return { error: 'Las contraseñas no coinciden' };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/', 'layout');
  redirect('/');
}

export async function signInWithGoogle() {
  const supabase = await createClient();

  // Usamos el helper en lugar de headers() para mayor estabilidad en Vercel
  const origin = getURL();
  const redirectUrl = `${origin}/auth/callback?next=/`;

  console.log('🔐 Iniciando OAuth hacia:', redirectUrl); // Log para debug en Vercel

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });

  if (error) {
    console.error('Error iniciando OAuth:', error);
    redirect('/login?error=oauth_init_failed');
  }

  if (data.url) {
    redirect(data.url);
  }
}
