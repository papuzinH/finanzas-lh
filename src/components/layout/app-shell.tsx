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

const PUBLIC_ROUTES = ['/login', '/auth'];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isInitialized, fetchAllData } = useFinanceStore();
  const [profileOpen, setProfileOpen] = useState(false);
  const pathname = usePathname();

  const isPublicRoute = PUBLIC_ROUTES.some(route => pathname.startsWith(route));

  useEffect(() => {
    if (!isInitialized && !isPublicRoute) {
      fetchAllData();
    }
  }, [isInitialized, fetchAllData, isPublicRoute]);

  if (isPublicRoute) {
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
