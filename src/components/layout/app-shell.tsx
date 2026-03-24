'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useFinanceStore } from '@/lib/store/financeStore';
import { MainNav } from '@/components/layout/main-nav';
import { UserProfileSheet } from '@/components/layout/user-profile-sheet';
import { FullPageLoader } from '@/components/shared/loader';
import { ChatWidgetWrapper } from '@/components/chat/ChatWidgetWrapper';
import { CreateTransactionDialog } from '@/components/transactions/create-transaction-dialog';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isInitialized, fetchAllData } = useFinanceStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const pathname = usePathname();

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

  const showFab = pathname !== '/movimientos';

  // Una vez inicializado, mostramos la app completa
  return (
    <>
      <MainNav />
      <UserProfileSheet />
      <main className="min-h-screen pb-20 md:pb-0 md:pl-64">
        {children}
      </main>
      <ChatWidgetWrapper />
      {showFab && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setDialogOpen(true)}
          className="fixed bottom-20 right-4 md:bottom-8 md:right-8 h-14 w-14 md:h-12 md:w-12 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/25 flex items-center justify-center z-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          aria-label="Nueva transacción"
        >
          <Plus className="h-6 w-6" />
        </motion.button>
      )}
      <CreateTransactionDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
