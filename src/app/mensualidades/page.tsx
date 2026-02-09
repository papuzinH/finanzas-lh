'use client';

import { useEffect, useState, useTransition } from 'react';
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
  CreditCard,
  MoreVertical,
  Pencil,
  Trash2,
  Loader2
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { EditSubscriptionDialog } from "@/components/subscriptions/edit-subscription-dialog";
import { ConfirmationModal } from "@/components/shared/confirmation-modal";
import { FullPageLoader } from '@/components/shared/loader';
import { deleteSubscription } from "@/app/dashboard/subscriptions/actions";
import { toast } from "sonner";
import { useRouter } from 'next/navigation';
import { CreateSubscriptionDialog } from "@/components/subscriptions/create-subscription-dialog";
import { Plus } from 'lucide-react';

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

function SubscriptionCard({ plan }: { plan: any }) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();
  const router = useRouter();
  const { fetchAllData, categories } = useFinanceStore();

  const category = categories.find(c => c.id === plan.category_id);

  const handleDelete = () => {
    setIsDeleteOpen(true);
  };

  const confirmDelete = () => {
    startDeleteTransition(async () => {
      const result = await deleteSubscription(plan.id.toString());
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Suscripción eliminada');
        await fetchAllData();
        router.refresh();
      }
      setIsDeleteOpen(false);
    });
  };

  return (
    <>
      <ConfirmationModal
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title="Eliminar suscripción"
        description="¿Estás seguro de que quieres eliminar esta suscripción? Esta acción no se puede deshacer."
        onConfirm={confirmDelete}
        isLoading={isDeleting}
        variant="destructive"
        confirmText="Eliminar"
      />
      <div 
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
              {category?.emoji ? <span className="text-lg">{category.emoji}</span> : getServiceIcon(plan.description, category?.name || null)}
            </div>
            <div>
              <h3 className="font-medium text-sm text-slate-200 group-hover:text-white transition-colors">
                {plan.description}
              </h3>
              {category && (
                  <span className="inline-flex items-center rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 mt-1">
                      {category.name}
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

        {/* Payment Method Badge & Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800/50">
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

          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-500 hover:text-slate-200 hover:bg-slate-800/50">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-slate-900 border-slate-800 text-slate-200">
              <DropdownMenuItem onClick={() => setIsEditOpen(true)} className="focus:bg-slate-800 focus:text-slate-200 cursor-pointer">
                <Pencil className="mr-2 h-4 w-4" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={handleDelete} 
                disabled={isDeleting}
                className="text-red-400 focus:bg-red-950/30 focus:text-red-400 cursor-pointer"
              >
                {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <EditSubscriptionDialog 
        open={isEditOpen} 
        onOpenChange={setIsEditOpen} 
        subscription={plan} 
      />
    </>
  );
}

export default function MensualidadesPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const {
    recurringPlans, 
    paymentMethods,
    fetchAllData, 
    isInitialized,
    isLoading,
    getMonthlyBurnRate
  } = useFinanceStore();

  useEffect(() => {
    if (!isInitialized) {
      fetchAllData();
    }
  }, [isInitialized, fetchAllData]);

  if (isLoading && !isInitialized) {
    return <FullPageLoader text="Cargando suscripciones..." />;
  }

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
      >
        <Button
          onClick={() => setIsCreateOpen(true)}
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          <Plus className="h-4 w-4 mr-1" />
          Nuevo Gasto Fijo
        </Button>
      </PageHeader>

      <CreateSubscriptionDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

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
              <SubscriptionCard key={plan.id} plan={plan} />
            ))
          )}
        </div>
      </main>
    </div>
  );
}
