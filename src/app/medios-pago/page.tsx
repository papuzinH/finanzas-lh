'use client';

import { useEffect } from 'react';
import { useFinanceStore } from '@/lib/store/financeStore';
import { 
  CreditCard, 
  Wallet, 
  Banknote, 
  History, 
  Edit3, 
  CalendarClock 
} from 'lucide-react';
import { format, addMonths, setDate } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { PaymentMethod, Transaction, RecurringPlan } from '@/types/database';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (dateString: string) => {
  const [year, month, day] = dateString.split('-').map(Number);
  const localDate = new Date(year, month - 1, day);
  return format(localDate, 'd MMM', { locale: es });
};

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

  // Preparamos los datos para renderizar
  const methodsWithData = paymentMethods.map(pm => {
    // Obtenemos métricas del store
    const status = getPaymentMethodStatus(pm.id);
    
    // Filtramos las últimas transacciones para este medio
    const history = transactions
      .filter(t => t.payment_method_id === pm.id)
      .slice(0, 3); // Solo las últimas 3

    // Filtramos suscripciones activas vinculadas
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans pb-24">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto max-w-2xl px-6 py-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
            <Wallet className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-slate-100">Billetera</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {methodsWithData.map((pm) => (
            <PaymentCard key={pm.id} data={pm} />
          ))}
        </div>
      </main>
    </div>
  );
}

// Componente Interno de Tarjeta
interface PaymentCardProps {
  data: PaymentMethod & {
    status: {
      currentConsumption: number;
      fixedCosts: number;
      projectedTotal: number;
    };
    history: Transaction[];
    subscriptions: RecurringPlan[];
  };
}

function PaymentCard({ data }: PaymentCardProps) {
  const isCredit = data.type === 'credit';
  const { status, history, subscriptions } = data;

  // Lógica de Fechas de Cierre (Visualización)
  let nextClosingDate: Date | null = null;
  let nextDueDate: Date | null = null;
  const today = new Date();

  if (isCredit && data.default_closing_day) {
    const closingDay = data.default_closing_day;
    
    if (today.getDate() <= closingDay) {
      // Cierra este mes
      nextClosingDate = setDate(today, closingDay);
    } else {
      // Cierra el mes que viene
      nextClosingDate = setDate(addMonths(today, 1), closingDay);
    }

    if (data.default_payment_day && nextClosingDate) {
      // Vence al mes siguiente del cierre (regla general simplificada para visual)
      nextDueDate = addMonths(nextClosingDate, 1);
      nextDueDate.setDate(data.default_payment_day);
    }
  }

  // Estilos dinámicos
  const bgClass = isCredit 
    ? "bg-linear-to-br from-slate-800 to-slate-900 border-slate-700/50" 
    : "bg-slate-900 border-slate-800";
  
  const Icon = isCredit ? CreditCard : (data.type === 'cash' ? Banknote : Wallet);
  const iconColor = isCredit ? "text-purple-400" : "text-emerald-400";
  const iconBg = isCredit ? "bg-purple-500/10" : "bg-emerald-500/10";

  return (
    <div className={cn("rounded-2xl border p-5 relative overflow-hidden group transition-all hover:border-slate-600", bgClass)}>
      
      {/* Glow Effect para tarjetas de crédito */}
      {isCredit && (
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-purple-500/5 blur-3xl group-hover:bg-purple-500/10 transition-all" />
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6 relative z-10">
        <div className="flex items-center gap-3">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", iconBg, iconColor)}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-100">{data.name}</h3>
            <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border", 
              isCredit ? "bg-purple-500/10 border-purple-500/20 text-purple-300" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
            )}>
              {isCredit ? 'Crédito' : 'Efectivo / Débito'}
            </span>
          </div>
        </div>
        {isCredit && (
           <button className="text-slate-500 hover:text-slate-300 transition-colors">
             <Edit3 className="h-4 w-4" />
           </button>
        )}
      </div>

      {/* Body: Montos */}
      <div className="mb-6 relative z-10">
        <p className="text-xs text-slate-400 mb-1">
          {isCredit ? 'Consumo del ciclo' : 'Saldo / Uso'}
        </p>
        <p className="text-2xl font-bold font-mono tracking-tight text-white">
          {formatCurrency(status.currentConsumption)}
        </p>
        
        {/* Fechas para Crédito */}
        {isCredit && nextClosingDate && (
          <div className="mt-4 flex items-center gap-4 text-xs">
            <div className="flex flex-col">
              <span className="text-slate-500">Cierre</span>
              <span className="font-medium text-slate-300">{format(nextClosingDate, 'd MMM', { locale: es })}</span>
            </div>
            {nextDueDate && (
              <>
                <div className="h-6 w-px bg-slate-800" />
                <div className="flex flex-col">
                  <span className="text-slate-500">Vencimiento</span>
                  <span className="font-medium text-amber-400">{format(nextDueDate, 'd MMM', { locale: es })}</span>
                </div>
              </>
            )}
            {status.fixedCosts > 0 && (
              <>
                <div className="h-6 w-px bg-slate-800" />
                <div className="flex flex-col">
                  <span className="text-slate-500">Proyección Total</span>
                  <span className="font-medium text-slate-300">{formatCurrency(status.projectedTotal)}</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Suscripciones (Gastos Fijos) */}
        {subscriptions.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-800/50">
            <div className="group/subs cursor-help relative">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-1.5">
                  <CalendarClock className="h-3 w-3" />
                  <span>{subscriptions.length} suscripciones</span>
                </div>
                <span className="font-medium text-slate-300">{formatCurrency(status.fixedCosts)}</span>
              </div>
              
              {/* Tooltip con detalle al hacer hover */}
              <div className="hidden group-hover/subs:block absolute left-0 right-0 top-full mt-2 p-3 rounded-lg bg-slate-900 border border-slate-800 shadow-xl z-20">
                <p className="text-[10px] font-medium text-slate-500 mb-2 uppercase tracking-wider">Detalle de fijos</p>
                <div className="space-y-1.5">
                  {subscriptions.map((plan: RecurringPlan) => (
                    <div key={plan.id} className="flex justify-between text-xs">
                      <span className="text-slate-300 truncate max-w-[120px]">{plan.description}</span>
                      <span className="text-slate-400 font-mono">{formatCurrency(plan.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Historial Reciente */}
      <div className="space-y-2 relative z-10">
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
          <History className="h-3 w-3" />
          <span>Últimos movimientos</span>
        </div>
        
        {history.length > 0 ? (
          history.map((t: Transaction, i: number) => (
            <div key={i} className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-950/30 border border-slate-800/50">
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="text-slate-500 whitespace-nowrap w-12">{formatDate(t.date)}</span>
                <span className="text-slate-300 truncate">{t.description}</span>
              </div>
              <span className={cn("font-mono whitespace-nowrap", t.amount > 0 ? "text-emerald-400" : "text-slate-200")}>
                {formatCurrency(Math.abs(t.amount))}
              </span>
            </div>
          ))
        ) : (
          <p className="text-xs text-slate-600 italic py-2 text-center">Sin movimientos recientes</p>
        )}
      </div>
    </div>
  );
}