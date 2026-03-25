'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useFinanceStore } from '@/lib/store/financeStore';
import { MainNav } from '@/components/layout/main-nav';
import { UserProfileSheet } from '@/components/layout/user-profile-sheet';
import { FullPageLoader } from '@/components/shared/loader';
import { ChatWidgetWrapper } from '@/components/chat/ChatWidgetWrapper';

const OnboardingTour = dynamic(
  () => import('@/components/onboarding/onboarding-tour').then(m => m.OnboardingTour),
  { ssr: false }
);

// Rutas sin autenticación (sin shell)
const PUBLIC_ROUTES = ['/login', '/auth'];
// Rutas autenticadas pero sin nav/chat (onboarding en progreso)
const ONBOARDING_ROUTES = ['/onboarding'];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isInitialized, fetchAllData } = useFinanceStore();
  const [profileOpen, setProfileOpen] = useState(false);
  const pathname = usePathname();

  const isPublicRoute = PUBLIC_ROUTES.some(route => pathname.startsWith(route));
  const isOnboardingRoute = ONBOARDING_ROUTES.some(route => pathname.startsWith(route));

  useEffect(() => {
    if (!isInitialized && !isPublicRoute && !isOnboardingRoute) {
      fetchAllData();
    }
  }, [isInitialized, fetchAllData, isPublicRoute, isOnboardingRoute]);

  if (isPublicRoute || isOnboardingRoute) {
    return <>{children}</>;
  }

  if (!isInitialized) {
    return <FullPageLoader text="Iniciando Chanchito..." />;
  }

  return (
    <>
      <MainNav />
      <UserProfileSheet open={profileOpen} onOpenChange={setProfileOpen} />
      <main className="min-h-screen pb-20 md:pb-0 md:pl-64">
        {children}
      </main>
      <ChatWidgetWrapper />
      <OnboardingTour />
    </>
  );
}
