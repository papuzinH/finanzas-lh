import { createClient } from '@/utils/supabase/server';
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
import { RecurringPlan } from '@/types/database';

export const revalidate = 0;

// Extended type for the join
interface RecurringPlanWithPayment extends RecurringPlan {
  payment_methods: {
    name: string;
    type: string;
  } | null;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

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

export default async function MensualidadesPage() {
  const supabase = await createClient();

  const { data: plansData } = await supabase
    .from('recurring_plans')
    .select('*, payment_methods!payment_method_id (name, type)')
    .eq('user_id', 1)
    .order('amount', { ascending: false });

  const plans: RecurringPlanWithPayment[] = (plansData as any) || [];

  // Calculate Total Monthly Cost (only active plans)
  const totalMonthlyCost = plans
    .filter(p => p.is_active)
    .reduce((acc, curr) => acc + curr.amount, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-emerald-500/30 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto max-w-2xl px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/10 text-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.2)]">
              <CalendarClock className="h-5 w-5" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-slate-100">Suscripciones y Fijos</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8">
        {/* Hero Card: Total Monthly Cost */}
        <div className="mb-8 relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 p-8 shadow-xl backdrop-blur-sm">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-purple-500/10 blur-2xl"></div>
          
          <div className="relative z-10 text-center">
            <p className="text-sm font-medium text-purple-300 uppercase tracking-wider mb-2">Costo Fijo Mensual</p>
            <h2 className="text-4xl font-bold text-white font-mono tracking-tight">
              {formatCurrency(totalMonthlyCost)}
            </h2>
            <p className="text-xs text-slate-500 mt-2">
              Suma de {plans.filter(p => p.is_active).length} servicios activos
            </p>
          </div>
        </div>

        {/* Services Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plans.length === 0 ? (
             <div className="col-span-full flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 text-slate-500">
                <RefreshCw className="h-8 w-8 mb-3 opacity-50" />
                <p>No tienes gastos fijos registrados.</p>
            </div>
          ) : (
            plans.map((plan) => (
              <div 
                key={plan.id} 
                className={`group relative flex flex-col justify-between rounded-xl border p-4 transition-all ${
                    plan.is_active 
                        ? 'border-slate-800 bg-slate-900/40 hover:bg-slate-900 hover:border-slate-700' 
                        : 'border-slate-800/50 bg-slate-900/20 opacity-60 grayscale'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full border border-slate-800 ${
                        plan.is_active ? 'bg-slate-800 text-slate-300 group-hover:text-white' : 'bg-slate-900 text-slate-600'
                    }`}>
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
                      <div className={`h-1.5 w-1.5 rounded-full ${plan.is_active ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]' : 'bg-slate-600'}`} />
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                          {plan.is_active ? 'Activo' : 'Inactivo'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Payment Method Badge */}
                <div className="flex items-center gap-2 pt-3 border-t border-slate-800/50">
                  {plan.payment_methods ? (
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 bg-slate-800/50 px-2 py-1 rounded-md">
                      <CreditCard className="h-3 w-3" />
                      <span>{plan.payment_methods.name}</span>
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
