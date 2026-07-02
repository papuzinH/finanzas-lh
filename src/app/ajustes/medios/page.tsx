'use client';

import { useEffect, useMemo, useState } from 'react';
import { Wallet, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useFinanceStore } from '@/lib/store/financeStore';
import { InstitutionalCard } from '@/components/medios-pago/institutional-card';
import { PersonalDebtCard } from '@/components/medios-pago/personal-debt-card';
import { CreatePaymentMethodDialog } from '@/components/medios-pago/create-payment-method-dialog';
import { RegisterCardPaymentDialog } from '@/components/medios-pago/register-card-payment-dialog';
import { ScreenHeader } from '@/components/shared/screen-header';
import { FullPageLoader } from '@/components/shared/loader';
import { Button } from '@/components/ui/button';
import { assignDefaultToUnassignedTransactions } from '@/app/dashboard/transactions/actions';

export default function AjustesMediosPage() {
  const {
    paymentMethods,
    transactions,
    recurringPlans,
    fetchAllData,
    isInitialized,
    isLoading,
    getPaymentMethodStatus,
    getPaymentMethodTransactionsForCurrentMonth,
    getDefaultPaymentMethod,
    getUnassignedTransactionsCount,
  } = useFinanceStore();

  const [isAssigning, setIsAssigning] = useState(false);

  useEffect(() => {
    if (!isInitialized) {
      fetchAllData();
    }
  }, [isInitialized, fetchAllData]);

  const defaultMethod = getDefaultPaymentMethod();
  const unassignedCount = getUnassignedTransactionsCount();

  async function handleAssignDefault() {
    setIsAssigning(true);
    try {
      const result = await assignDefaultToUnassignedTransactions();
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`${result.updated ?? 0} movimientos asignados a ${defaultMethod?.name}`);
        await fetchAllData();
      }
    } finally {
      setIsAssigning(false);
    }
  }

  const { institutionalMethods, personalMethods } = useMemo(() => {
    const methodsWithData = paymentMethods.map(pm => {
      const status = getPaymentMethodStatus(pm.id);
      const history = getPaymentMethodTransactionsForCurrentMonth(pm.id);
      const subscriptions = recurringPlans.filter(
        p => p.payment_method_id === pm.id && p.is_active
      );
      return { ...pm, status, history, subscriptions };
    });
    return {
      institutionalMethods: methodsWithData.filter(m => !m.is_personal),
      personalMethods: methodsWithData.filter(m => m.is_personal),
    };
  }, [paymentMethods, transactions, recurringPlans, getPaymentMethodStatus, getPaymentMethodTransactionsForCurrentMonth]);

  if (isLoading && !isInitialized) {
    return <FullPageLoader text="Cargando billetera..." />;
  }

  return (
    <div className="min-h-screen bg-bg text-text font-sans pb-24">
      <div className="mx-auto max-w-[1440px]">
        <ScreenHeader
          kicker="Billetera"
          title="Medios de Pago"
          right={
            <>
              <RegisterCardPaymentDialog />
              <CreatePaymentMethodDialog />
            </>
          }
        />
      </div>

      <main className="mx-auto max-w-[1440px] px-4 md:px-6 py-6 md:py-8 space-y-8 md:space-y-10">
        {defaultMethod && unassignedCount > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border-[1.5px] border-warn/40 bg-warn/10 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-warn/15 p-2 shrink-0">
                <Wallet className="h-4 w-4 text-warn" />
              </div>
              <div>
                <p className="text-sm font-medium text-text">
                  {unassignedCount} movimientos sin medio de pago
                </p>
                <p className="text-xs text-muted mt-0.5">
                  Asignarlos a tu predeterminado ({defaultMethod.name}) para que se reflejen bien.
                </p>
              </div>
            </div>
            <Button
              variant="accent"
              onClick={handleAssignDefault}
              disabled={isAssigning}
              className="shrink-0"
            >
              {isAssigning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Asignando...
                </>
              ) : (
                `Asignar a ${defaultMethod.name}`
              )}
            </Button>
          </div>
        )}

        <section>
          <h2 className="text-sm font-medium text-muted uppercase tracking-wider mb-4 px-1">
            Billetera y Bancos
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {institutionalMethods.map((pm) => (
              <InstitutionalCard key={pm.id} data={pm} />
            ))}
            {institutionalMethods.length === 0 && (
              <p className="text-sm text-muted italic px-1">No hay medios de pago registrados.</p>
            )}
          </div>
        </section>

        {personalMethods.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-muted uppercase tracking-wider mb-4 px-1">
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
