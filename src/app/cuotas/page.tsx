'use client';

import { useEffect } from 'react';
import { useFinanceStore } from '@/lib/store/financeStore';
import { CreditCard, AlertCircle, CheckCircle2 } from 'lucide-react';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export default function CuotasPage() {
  const { 
    installmentPlans, 
    paymentMethods, 
    fetchAllData, 
    isInitialized, 
    getInstallmentStatus 
  } = useFinanceStore();

  useEffect(() => {
    if (!isInitialized) {
      fetchAllData();
    }
  }, [isInitialized, fetchAllData]);

  // Prepare data for rendering
  const plansWithProgress = installmentPlans.map((plan) => {
    const status = getInstallmentStatus(plan.id);
    const paymentMethod = paymentMethods.find(pm => pm.id === plan.payment_method_id);

    if (!status) return null;

    return {
      ...plan,
      ...status, // Usamos directamente las propiedades de getInstallmentStatus
      paymentMethodName: paymentMethod?.name,
      paymentMethodType: paymentMethod?.type
    };
  }).filter((p): p is NonNullable<typeof p> => p !== null);

  // Calculate Total Debt (usando la propiedad 'remaining' del nuevo status)
  const totalDebt = plansWithProgress.reduce((sum, plan) => sum + plan.remaining, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-emerald-500/30 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto max-w-2xl px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
              <CreditCard className="h-5 w-5" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-slate-100">Mis Cuotas</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8">
        {/* Total Debt Summary */}
        <div className="mb-8 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-6 text-center">
          <p className="text-sm font-medium text-indigo-300 uppercase tracking-wider mb-1">Deuda Futura Pendiente</p>
          <p className="text-3xl font-bold text-indigo-400 font-mono tracking-tight">
            {formatCurrency(totalDebt)}
          </p>
          <p className="text-xs text-slate-500 mt-2">
            * No incluye la cuota del mes actual (ya vencida)
          </p>
        </div>

        {/* Plans List */}
        <div className="space-y-4">
          {plansWithProgress.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 text-slate-500">
                <CreditCard className="h-8 w-8 mb-3 opacity-50" />
                <p>No tienes planes de cuotas activos.</p>
            </div>
          ) : (
            plansWithProgress.map((plan) => (
              <div 
                key={plan.id} 
                className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50 p-5 transition-all hover:bg-slate-900 hover:border-slate-700"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-slate-200 group-hover:text-white transition-colors">
                      {plan.description}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Total del plan: {formatCurrency(Number(plan.total_amount))}
                    </p>
                    {plan.paymentMethodName && (
                      <div className="flex items-center gap-1.5 mt-2 text-[10px] text-slate-400 bg-slate-800/50 px-2 py-1 rounded-md w-fit">
                        <CreditCard className="h-3 w-3" />
                        <span>{plan.paymentMethodName}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-200 font-mono">
                      {/* Lógica ajustada para mostrar la cuota actual */}
                      {!plan.isFinished
                        ? `Cuota ${plan.installmentsPaid + 1} / ${plan.installments_count}`
                        : 'Finalizado'
                      }
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">
                        {plan.remainingInstallments > 0 
                            ? `${plan.remainingInstallments} restantes` 
                            : 'Completado'}
                    </p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-800 mb-4">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ease-out ${
                        plan.isFinished ? 'bg-emerald-500' : 'bg-indigo-500'
                    }`}
                    style={{ width: `${plan.progress}%` }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {plan.isFinished ? (
                        <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-500">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Pagado
                        </span>
                    ) : (
                        <span className="flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-400">
                            <AlertCircle className="h-3.5 w-3.5" />
                            En curso
                        </span>
                    )}
                  </div>
                  
                  <div className="text-right">
                    <p className="text-xs text-slate-500 mb-0.5">Te faltan (Futuro)</p>
                    <p className="text-lg font-bold text-slate-200 font-mono">
                        {formatCurrency(plan.remaining)}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}