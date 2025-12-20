'use client';

import { useEffect, useMemo } from 'react';
import { useFinanceStore } from '@/lib/store/financeStore';
import { Transaction } from '@/types/database';
import { Wallet } from 'lucide-react';
import { InstitutionalCard } from '@/components/medios-pago/institutional-card';
import { PersonalDebtCard } from '@/components/medios-pago/personal-debt-card';
import { PageHeader } from '@/components/shared/page-header';
import { FullPageLoader } from '@/components/shared/loader';

export default function MediosPagoPage() {
  const { 
    paymentMethods, 
    transactions, 
    recurringPlans, 
    fetchAllData, 
    isInitialized, 
    isLoading,
    getPaymentMethodStatus,
    getPaymentMethodTransactionsForCurrentMonth
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
      
      const history = getPaymentMethodTransactionsForCurrentMonth(pm.id);

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
  }, [paymentMethods, transactions, recurringPlans, getPaymentMethodStatus, getPaymentMethodTransactionsForCurrentMonth]);

  if (isLoading && !isInitialized) {
    return <FullPageLoader text="Cargando billetera..." />;
  }


  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans pb-24">
      <PageHeader 
        title="Medios de Pago" 
        icon={<Wallet className="h-5 w-5" />}
        containerClassName="max-w-[1440px]"
      />

      <main className="mx-auto max-w-[1440px] px-6 py-8 space-y-10">
        
        {/* Sección 1: Billetera y Bancos */}
        <section>
          <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4 px-1">
            Billetera y Bancos
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
