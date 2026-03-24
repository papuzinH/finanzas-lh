'use client';

import { useEffect, useState } from 'react';
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

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isInitialized, fetchAllData } = useFinanceStore();
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    if (!isInitialized) {
      fetchAllData();
    }
  }, [isInitialized, fetchAllData]);

  if (!isInitialized) {
    return <FullPageLoader text="Iniciando Chanchito..." />;
  }

  return (
    <>
      <MainNav onOpenProfile={() => setProfileOpen(true)} />
      <UserProfileSheet open={profileOpen} onOpenChange={setProfileOpen} />
      <main className="min-h-screen pb-20 md:pb-0 md:pl-64">
        {children}
      </main>
      <ChatWidgetWrapper />
      <OnboardingTour />
    </>
  );
}
