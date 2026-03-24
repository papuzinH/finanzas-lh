'use client';

import { useEffect, useState } from 'react';
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
import { SubscriptionsSkeleton } from '@/components/ui/skeletons';
import { deleteSubscription } from "@/app/dashboard/subscriptions/actions";
import { toast } from "sonner";
import { useRouter } from 'next/navigation';
import { CreateSubscriptionDialog } from "@/components/subscriptions/create-subscription-dialog";
import { Plus } from 'lucide-react';
import { StaggeredList, StaggeredItem } from '@/components/shared/staggered-list';

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
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();
  const { fetchAllData, categories } = useFinanceStore();

  const category = categories.find(c => c.id === plan.category_id);

  const handleDelete = () => {
    setIsDeleteOpen(true);
  };

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteSubscription(plan.id.toString());
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Suscripción eliminada');
        await fetchAllData();
        router.refresh();
      }
      setIsDeleteOpen(false);
    } finally {
      setIsDeleting(false);
    }
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
            ? "border-slate-800 bg-surface-raised/40 hover:bg-surface-raised hover:border-slate-700" 
            : "border-slate-800/50 bg-surface-raised/20 opacity-60 grayscale"
        )}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full border border-slate-800",
              plan.is_active ? "bg-slate-800 text-slate-300 group-hover:text-white" : "bg-surface-raised text-slate-400"
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
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">
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
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 bg-surface-raised/50 px-2 py-1 rounded-md">
              <CreditCard className="h-3 w-3" />
              <span>Sin asignar</span>
            </div>
          )}

          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Opciones de suscripción" className="h-6 w-6 min-h-11 min-w-11 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-surface-overlay border-slate-800 text-slate-200">
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
    return <SubscriptionsSkeleton />;
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
    <div className="min-h-screen bg-surface text-slate-50 font-sans selection:bg-emerald-500/30 pb-24">
      {/* Header */}
      <PageHeader
        title="Suscripciones y Fijos"
        icon={<CalendarClock className="h-5 w-5" />}
        containerClassName="max-w-[1440px]"
      >
        <Button
          onClick={() => setIsCreateOpen(true)}
          size="icon"
          className="h-9 w-9 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </PageHeader>

      <CreateSubscriptionDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

      <main className="mx-auto max-w-[1440px] px-4 md:px-6 py-6 md:py-8">
        {/* Hero Card: Total Monthly Cost */}
        <div className="mb-8 relative overflow-hidden rounded-2xl border border-slate-800 bg-surface-raised/50 p-8 shadow-xl backdrop-blur-sm">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-purple-500/10 blur-2xl"></div>
          
          <div className="relative z-10 text-center">
            <p className="text-sm font-medium text-purple-300 uppercase tracking-wider mb-2">Costo Fijo Mensual</p>
            <h2 className="text-3xl md:text-4xl font-bold text-white font-mono tracking-tight">
              {formatCurrency(totalMonthlyCost)}
            </h2>
            <p className="text-xs text-slate-400 mt-2">
              Suma de {plansWithPayment.filter(p => p.is_active).length} servicios activos
            </p>
          </div>
        </div>

        {/* Services Grid */}
        {plansWithPayment.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-dashed border-slate-800 bg-surface-raised/20 text-center">
            <CalendarClock className="h-16 w-16 text-slate-700 mb-4" />
            <h3 className="text-lg font-semibold text-slate-200 mb-2">Registrá tus gastos fijos y suscripciones</h3>
            <p className="text-sm text-slate-400 max-w-xs mb-6">
              Netflix, alquiler, gimnasio... sumá tus gastos recurrentes y sabé de antemano cuánto se te va cada mes.
            </p>
            <Button
              onClick={() => setIsCreateOpen(true)}
              size="icon"
              className="h-9 w-9 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <StaggeredList className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {plansWithPayment.map((plan) => (
              <StaggeredItem key={plan.id}>
                <SubscriptionCard plan={plan} />
              </StaggeredItem>
            ))}
          </StaggeredList>
        )}
      </main>
    </div>
  );
}
