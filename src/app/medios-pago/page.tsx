'use client';

import { useEffect, useMemo } from 'react';
import { useFinanceStore } from '@/lib/store/financeStore';
import { Wallet } from 'lucide-react';
import { InstitutionalCard } from '@/components/shared/institutional-card';
import { PersonalDebtCard } from '@/components/shared/personal-debt-card';

export default function MediosPagoPage() {
  const { 
    paymentMethods, 
    transactions, 
    recurringPlans, 
    fetchAllData, 
    isInitialized, 
    getPaymentMethodStatus 
  } = useFinanceStore();

  useEffect(() => {
    if (!isInitialized) {
      fetchAllData();
    }
  }, [isInitialized, fetchAllData]);

  // Optimizamos el cálculo de datos derivados con useMemo
  const { institutionalMethods, personalMethods } = useMemo(() => {
    const methodsWithData = paymentMethods.map(pm => {
      const status = getPaymentMethodStatus(pm.id);
      
      const history = transactions
        .filter(t => t.payment_method_id === pm.id)
        .slice(0, 3);

      const subscriptions = recurringPlans.filter(
          p => p.payment_method_id === pm.id && p.is_active
      );

      return {
        ...pm,
        status,
        history,
        subscriptions
      };
    });

    return {
      institutionalMethods: methodsWithData.filter(m => !m.is_personal),
      personalMethods: methodsWithData.filter(m => m.is_personal)
    };
  }, [paymentMethods, transactions, recurringPlans, getPaymentMethodStatus]);

  console.log('Institutional Methods:', institutionalMethods);
  console.log('Personal Methods:', personalMethods);
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans pb-24">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto max-w-2xl px-6 py-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
            <Wallet className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-slate-100">Medios de Pago</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8 space-y-10">
        
        {/* Sección 1: Billetera y Bancos */}
        <section>
          <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4 px-1">
            Billetera y Bancos
          </h2>
          <div className="grid grid-cols-1 gap-6">
            {institutionalMethods.map((pm) => (
              <InstitutionalCard key={pm.id} data={pm} />
            ))}
            {institutionalMethods.length === 0 && (
              <p className="text-sm text-slate-500 italic px-1">No hay medios de pago registrados.</p>
            )}
          </div>
        </section>

        {/* Sección 2: Compromisos Personales */}
        {personalMethods.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4 px-1">
              Compromisos Personales
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {personalMethods.map((pm) => (
                <PersonalDebtCard key={pm.id} data={pm} />
              ))}
            </div>
          </section>
        )}

      </main>
    </div>
  );
}
