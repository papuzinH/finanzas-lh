'use client';

import { useEffect } from 'react';
import { useFinanceStore } from '@/lib/store/financeStore';
import { 
  RefreshCw, 
  CalendarClock, 
  Tv, 
  Wifi, 
  Zap, 
  Home, 
  Dumbbell, 
  ShieldCheck,
  CreditCard
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';

const getServiceIcon = (description: string, category: string | null) => {
  const text = (description + ' ' + (category || '')).toLowerCase();
  
  if (text.includes('netflix') || text.includes('disney') || text.includes('hbo') || text.includes('prime') || text.includes('spotify') || text.includes('youtube')) return <Tv className="h-5 w-5" />;
  if (text.includes('internet') || text.includes('wifi') || text.includes('fibra')) return <Wifi className="h-5 w-5" />;
  if (text.includes('luz') || text.includes('gas') || text.includes('agua') || text.includes('electricidad')) return <Zap className="h-5 w-5" />;
  if (text.includes('alquiler') || text.includes('expensas')) return <Home className="h-5 w-5" />;
  if (text.includes('gimnasio') || text.includes('gym') || text.includes('club')) return <Dumbbell className="h-5 w-5" />;
  if (text.includes('seguro')) return <ShieldCheck className="h-5 w-5" />;
  
  return <RefreshCw className="h-5 w-5" />;
};

export default function MensualidadesPage() {
  const { 
    recurringPlans, 
    paymentMethods,
    fetchAllData, 
    isInitialized,
    getMonthlyBurnRate
  } = useFinanceStore();

  useEffect(() => {
    if (!isInitialized) {
      fetchAllData();
    }
  }, [isInitialized, fetchAllData]);

  // Preparamos los datos combinando planes con sus medios de pago
  const plansWithPayment = recurringPlans.map(plan => {
    const paymentMethod = paymentMethods.find(pm => pm.id === plan.payment_method_id);
    return {
      ...plan,
      paymentMethodName: paymentMethod?.name
    };
  }).sort((a, b) => b.amount - a.amount); // Ordenar por monto descendente

  const totalMonthlyCost = getMonthlyBurnRate();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-emerald-500/30 pb-24">
      {/* Header */}
      <PageHeader 
        title="Suscripciones y Fijos" 
        icon={<CalendarClock className="h-5 w-5" />}
        containerClassName="max-w-[1440px]"
      />

      <main className="mx-auto max-w-[1440px] px-6 py-8">
        {/* Hero Card: Total Monthly Cost */}
        <div className="mb-8 relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 p-8 shadow-xl backdrop-blur-sm">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-purple-500/10 blur-2xl"></div>
          
          <div className="relative z-10 text-center">
            <p className="text-sm font-medium text-purple-300 uppercase tracking-wider mb-2">Costo Fijo Mensual</p>
            <h2 className="text-4xl font-bold text-white font-mono tracking-tight">
              {formatCurrency(totalMonthlyCost)}
            </h2>
            <p className="text-xs text-slate-500 mt-2">
              Suma de {plansWithPayment.filter(p => p.is_active).length} servicios activos
            </p>
          </div>
        </div>

        {/* Services Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {plansWithPayment.length === 0 ? (
             <div className="col-span-full flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 text-slate-500">
                <RefreshCw className="h-8 w-8 mb-3 opacity-50" />
                <p>No tienes gastos fijos registrados.</p>
            </div>
          ) : (
            plansWithPayment.map((plan) => (
              <div 
                key={plan.id} 
                className={cn(
                  "group relative flex flex-col justify-between rounded-xl border p-4 transition-all",
                  plan.is_active 
                    ? "border-slate-800 bg-slate-900/40 hover:bg-slate-900 hover:border-slate-700" 
                    : "border-slate-800/50 bg-slate-900/20 opacity-60 grayscale"
                )}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full border border-slate-800",
                      plan.is_active ? "bg-slate-800 text-slate-300 group-hover:text-white" : "bg-slate-900 text-slate-600"
                    )}>
                      {getServiceIcon(plan.description, plan.category)}
                    </div>
                    <div>
                      <h3 className="font-medium text-sm text-slate-200 group-hover:text-white transition-colors">
                        {plan.description}
                      </h3>
                      {plan.category && (
                          <span className="inline-flex items-center rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 mt-1">
                              {plan.category}
                          </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <p className="font-bold text-sm font-mono text-slate-200">
                      {formatCurrency(plan.amount)}
                    </p>
                    <div className="flex items-center justify-end gap-1.5 mt-1">
                      <div className={cn("h-1.5 w-1.5 rounded-full", plan.is_active ? "bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" : "bg-slate-600")} />
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                          {plan.is_active ? 'Activo' : 'Inactivo'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Payment Method Badge */}
                <div className="flex items-center gap-2 pt-3 border-t border-slate-800/50">
                  {plan.paymentMethodName ? (
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 bg-slate-800/50 px-2 py-1 rounded-md">
                      <CreditCard className="h-3 w-3" />
                      <span>{plan.paymentMethodName}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-600 bg-slate-900/50 px-2 py-1 rounded-md">
                      <CreditCard className="h-3 w-3" />
                      <span>Sin asignar</span>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}