'use client';

import { useEffect } from 'react';
import { useFinanceStore } from '@/lib/store/financeStore';
import { MainNav } from '@/components/layout/main-nav';
import { FullPageLoader } from '@/components/shared/loader';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isInitialized, fetchAllData } = useFinanceStore();

  useEffect(() => {
    if (!isInitialized) {
      fetchAllData();
    }
  }, [isInitialized, fetchAllData]);

  // Mientras no esté inicializado (primera carga), mostramos SOLO el loader.
  // Esto oculta MainNav y el contenido de la página.
  if (!isInitialized) {
    return <FullPageLoader text="Iniciando Chanchito..." />;
  }

  // Una vez inicializado, mostramos la app completa
  return (
    <>
      <MainNav />
      <main className="min-h-screen pb-20 md:pb-0 md:pl-64">
        {children}
      </main>
    </>
  );
}
