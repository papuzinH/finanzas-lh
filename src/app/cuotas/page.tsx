'use client';

import { useEffect, useState, useTransition } from 'react';
import { useFinanceStore } from '@/lib/store/financeStore';
import { 
  CreditCard, 
  AlertCircle, 
  CheckCircle2,
  MoreVertical,
  Pencil,
  Trash2,
  Loader2,
  Tag
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { EditInstallmentPlanDialog } from "@/components/installments/edit-plan-dialog";
import { ConfirmationModal } from "@/components/shared/confirmation-modal";
import { deleteInstallmentPlan } from "@/app/dashboard/installments/actions";
import { toast } from "sonner";
import { useRouter } from 'next/navigation';
import { FullPageLoader } from '@/components/shared/loader';
import { InstallmentPlan } from '@/types/database';
import { CreateInstallmentPlanDialog } from "@/components/installments/create-plan-dialog";
import { Plus } from 'lucide-react';

interface PlanWithStatus extends InstallmentPlan {
  paid: number;
  remaining: number;
  progress: number;
  installmentsPaid: number;
  remainingInstallments: number;
  isFinished: boolean;
  paymentMethodName?: string;
  paymentMethodType?: string;
}

function InstallmentPlanCard({ plan }: { plan: PlanWithStatus }) {
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
      const result = await deleteInstallmentPlan(plan.id.toString());
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Plan de cuotas eliminado');
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
        title="Eliminar plan de cuotas"
        description="ADVERTENCIA: Esto eliminará el plan y TODAS las cuotas futuras y pasadas asociadas. ¿Estás seguro de que quieres continuar?"
        onConfirm={confirmDelete}
        isLoading={isDeleting}
        variant="destructive"
        confirmText="Eliminar Plan"
      />
      <div 
        className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50 p-5 transition-all hover:bg-slate-900 hover:border-slate-700 flex flex-col justify-between"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-slate-200 group-hover:text-white transition-colors truncate">
              {plan.description}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Total del plan: {formatCurrency(Number(plan.total_amount))}
            </p>
            <p className="text-xs text-slate-400 mt-0.5 font-medium">
              Valor cuota: {formatCurrency(Number(plan.total_amount) / plan.installments_count)}
            </p>
            
            <div className="flex flex-wrap gap-2 mt-3">
              {plan.paymentMethodName && (
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 bg-slate-800/50 px-2 py-1 rounded-md w-fit">
                  <CreditCard className="h-3 w-3" />
                  <span>{plan.paymentMethodName}</span>
                </div>
              )}
              {category && (
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 bg-slate-800/50 px-2 py-1 rounded-md w-fit">
                  {category.emoji ? <span>{category.emoji}</span> : <Tag className="h-3 w-3" />}
                  <span>{category.name}</span>
                </div>
              )}
            </div>
          </div>
          <div className="text-right flex flex-col items-end ml-4">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-bold text-slate-200 font-mono">
                {!plan.isFinished
                  ? `Cuota ${plan.installmentsPaid + 1} / ${plan.installments_count}`
                  : 'Finalizado'
                }
              </p>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-500 hover:text-slate-200 hover:bg-slate-800/50 -mr-2">
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
                    Eliminar Plan
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
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
                <StatusBadge variant="success" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
                    Pagado
                </StatusBadge>
            ) : (
                <StatusBadge variant="info" icon={<AlertCircle className="h-3.5 w-3.5" />}>
                    En curso
                </StatusBadge>
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

      <EditInstallmentPlanDialog 
        open={isEditOpen} 
        onOpenChange={setIsEditOpen} 
        plan={plan} 
      />
    </>
  );
}

export default function CuotasPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const {
    installmentPlans, 
    paymentMethods, 
    fetchAllData, 
    isInitialized, 
    isLoading,
    getInstallmentStatus,
    getCurrentMonthInstallmentsTotal
  } = useFinanceStore();

  useEffect(() => {
    if (!isInitialized) {
      fetchAllData();
    }
  }, [isInitialized, fetchAllData]);

  if (isLoading && !isInitialized) {
    return <FullPageLoader text="Cargando cuotas..." />;
  }

  // Prepare data for rendering
  const plansWithProgress: PlanWithStatus[] = installmentPlans.map((plan) => {
    const status = getInstallmentStatus(plan.id);
    const paymentMethod = paymentMethods.find(pm => pm.id === plan.payment_method_id);

    if (!status) return null;

    return {
      ...plan,
      ...status, // Usamos directamente las propiedades de getInstallmentStatus
      paymentMethodName: paymentMethod?.name,
      paymentMethodType: paymentMethod?.type
    } as PlanWithStatus;
  }).filter((p): p is PlanWithStatus => p !== null);

  // Calculate Total Debt (usando la propiedad 'remaining' del nuevo status)
  const totalDebt = plansWithProgress.reduce((sum, plan) => sum + plan.remaining, 0);
  const currentMonthDebt = getCurrentMonthInstallmentsTotal();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-emerald-500/30 pb-24">
      {/* Header */}
      <PageHeader
        title="Mis Cuotas"
        icon={<CreditCard className="h-5 w-5" />}
        containerClassName="max-w-[1440px]"
      >
        <Button
          onClick={() => setIsCreateOpen(true)}
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          <Plus className="h-4 w-4 mr-1" />
          Nuevo Plan
        </Button>
      </PageHeader>

      <CreateInstallmentPlanDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

      <main className="mx-auto max-w-[1440px] px-4 md:px-6 py-6 md:py-8">
        {/* Total Debt Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
          <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-6 text-center">
            <p className="text-xs font-medium text-indigo-300 uppercase tracking-wider mb-1">Deuda Futura</p>
            <p className="text-xl md:text-2xl font-bold text-indigo-400 font-mono tracking-tight">
              {formatCurrency(totalDebt)}
            </p>
            <p className="text-[10px] text-slate-500 mt-2">
              Pendiente a largo plazo
            </p>
          </div>
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-6 text-center">
            <p className="text-xs font-medium text-rose-300 uppercase tracking-wider mb-1">Vence este mes</p>
            <p className="text-xl md:text-2xl font-bold text-rose-400 font-mono tracking-tight">
              {formatCurrency(currentMonthDebt)}
            </p>
            <p className="text-[10px] text-slate-500 mt-2">
              A pagar en el ciclo actual
            </p>
          </div>
        </div>

        {/* Plans List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plansWithProgress.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 text-slate-500">
                <CreditCard className="h-8 w-8 mb-3 opacity-50" />
                <p>No tienes planes de cuotas activos.</p>
            </div>
          ) : (
            plansWithProgress.map((plan) => (
              <InstallmentPlanCard key={plan.id} plan={plan} />
            ))
          )}
        </div>
      </main>
    </div>
  );
}
