'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useFinanceStore } from '@/lib/store/financeStore';
import { useOnboardingStore } from '@/lib/store/onboardingStore';
import { MainNav } from '@/components/layout/main-nav';
import { FullPageLoader } from '@/components/shared/loader';
import { ChatWidgetWrapper } from '@/components/chat/ChatWidgetWrapper';

const OnboardingTour = dynamic(
  () => import('@/components/onboarding/onboarding-tour').then(m => m.OnboardingTour),
  { ssr: false }
);

// Rutas sin autenticación (sin shell)
const PUBLIC_ROUTES = ['/login', '/auth'];
// Rutas autenticadas pero sin nav/chat (onboarding en progreso)
const ONBOARDING_ROUTES = ['/onboarding', '/puesta-a-punto'];

export function AppShell({ children, sesionInicial }: { children: React.ReactNode; sesionInicial: boolean }) {
  const { isInitialized, fetchAllData, user } = useFinanceStore();
  const syncTourFromSupabase = useOnboardingStore((s) => s.syncTourFromSupabase);
  const pathname = usePathname();
  const tourSynced = useRef(false);

  const isPublicRoute = PUBLIC_ROUTES.some(route => pathname.startsWith(route));
  const isOnboardingRoute = ONBOARDING_ROUTES.some(route => pathname.startsWith(route));
  // La raíz sin sesión es la landing pública: sin nav, sin chat, sin tour y
  // sin fetchAllData (que sin sesión son 16 queries contra RLS que vuelven
  // vacías). `sesionInicial` viene del server (layout.tsx) porque por
  // pathname solo `/` es ambiguo — la sirven tanto el anónimo como el logueado.
  const esLandingAnonima = pathname === '/' && !sesionInicial;

  // Cookie presente pero sesión revocada (logout en otro dispositivo): page.tsx
  // ya decidió Landing vía getUser, así que si el store terminó de inicializar
  // sin usuario real en /, el chrome también se apaga.
  const sinUsuarioReal = pathname === '/' && isInitialized && !user;

  useEffect(() => {
    if (!isInitialized && !isPublicRoute && !isOnboardingRoute && !esLandingAnonima) {
      fetchAllData();
    }
  }, [isInitialized, fetchAllData, isPublicRoute, isOnboardingRoute, esLandingAnonima]);

  // Sincronizar tour_completed desde Supabase una sola vez al cargar
  useEffect(() => {
    if (user && !tourSynced.current) {
      tourSynced.current = true;
      syncTourFromSupabase(user.id);
    }
  }, [user, syncTourFromSupabase]);

  if (isPublicRoute || isOnboardingRoute || esLandingAnonima || sinUsuarioReal) {
    return <>{children}</>;
  }

  if (!isInitialized) {
    return <FullPageLoader text="Iniciando Chanchito..." />;
  }

  return (
    <>
      <MainNav />
      <main className="min-h-screen pb-20 md:pb-0 md:pl-64">
        {children}
      </main>
      <ChatWidgetWrapper />
      <OnboardingTour />
    </>
  );
}
