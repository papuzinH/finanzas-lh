'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFinanceStore } from '@/lib/store/financeStore';
import {
  CreditCard,
  AlertCircle,
  CheckCircle2,
  MoreVertical,
  Pencil,
  Trash2,
  Loader2,
  Tag,
  RefreshCw,
  CalendarClock,
  Tv,
  Wifi,
  Zap,
  Home,
  Dumbbell,
  ShieldCheck,
  Plus,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { EditInstallmentPlanDialog } from '@/components/installments/edit-plan-dialog';
import { ConfirmationModal } from '@/components/shared/confirmation-modal';
import { deleteInstallmentPlan } from '@/app/dashboard/installments/actions';
import { deleteSubscription } from '@/app/dashboard/subscriptions/actions';
import { toast } from 'sonner';
import { InstallmentPlan, RecurringPlan } from '@/types/database';
import { CreateInstallmentPlanDialog } from '@/components/installments/create-plan-dialog';
import { EditSubscriptionDialog } from '@/components/subscriptions/edit-subscription-dialog';
import { CreateSubscriptionDialog } from '@/components/subscriptions/create-subscription-dialog';
import { StaggeredList, StaggeredItem } from '@/components/shared/staggered-list';
import { AnimatedPlusButton } from '@/components/shared/animated-plus-button';

// ── Types ──────────────────────────────────────────────────────────────────
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

type ActiveTab = 'cuotas' | 'suscripciones';

// ── Helpers ────────────────────────────────────────────────────────────────
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

// ── InstallmentPlanCard ────────────────────────────────────────────────────
function InstallmentPlanCard({ plan }: { plan: PlanWithStatus }) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();
  const { fetchAllData, categories } = useFinanceStore();

  const category = categories.find(c => c.id === plan.category_id);

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteInstallmentPlan(plan.id.toString());
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Plan de cuotas eliminado');
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
        title="Eliminar plan de cuotas"
        description="ADVERTENCIA: Esto eliminará el plan y TODAS las cuotas futuras y pasadas asociadas. ¿Estás seguro de que quieres continuar?"
        onConfirm={confirmDelete}
        isLoading={isDeleting}
        variant="destructive"
        confirmText="Eliminar Plan"
      />
      <div className="group relative overflow-hidden rounded-xl border border-slate-800 bg-surface-raised/50 p-5 transition-all hover:bg-surface-raised hover:border-slate-700 flex flex-col justify-between">
        <div className="flex items-start justify-between mb-4">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-slate-200 group-hover:text-white transition-colors truncate">
              {plan.description}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
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
                  : 'Finalizado'}
              </p>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Opciones del plan" className="h-6 w-6 min-h-11 min-w-11 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 -mr-2 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950">
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-surface-overlay border-slate-800 text-slate-200">
                  <DropdownMenuItem onClick={() => setIsEditOpen(true)} className="focus:bg-slate-800 focus:text-slate-200 cursor-pointer">
                    <Pencil className="mr-2 h-4 w-4" />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setIsDeleteOpen(true)}
                    disabled={isDeleting}
                    className="text-red-400 focus:bg-red-950/30 focus:text-red-400 cursor-pointer"
                  >
                    {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                    Eliminar Plan
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400">
              {plan.remainingInstallments > 0
                ? `${plan.remainingInstallments} restantes`
                : 'Completado'}
            </p>
          </div>
        </div>

        <div
          className="relative h-2 w-full overflow-hidden rounded-full bg-slate-800 mb-4"
          role="progressbar"
          aria-valuenow={Math.round(plan.progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progreso del plan ${plan.description}: ${Math.round(plan.progress)}%`}
        >
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
            <p className="text-xs text-slate-400 mb-0.5">Te faltan (Futuro)</p>
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

// ── SubscriptionCard ───────────────────────────────────────────────────────
type RecurringPlanWithPayment = RecurringPlan & { paymentMethodName?: string };

function SubscriptionCard({ plan }: { plan: RecurringPlanWithPayment }) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();
  const { fetchAllData, categories } = useFinanceStore();

  const category = categories.find(c => c.id === plan.category_id);

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
          'group relative flex flex-col justify-between rounded-xl border p-4 transition-all',
          plan.is_active
            ? 'border-slate-800 bg-surface-raised/40 hover:bg-surface-raised hover:border-slate-700'
            : 'border-slate-800/50 bg-surface-raised/20 opacity-60 grayscale'
        )}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full border border-slate-800',
              plan.is_active ? 'bg-slate-800 text-slate-300 group-hover:text-white' : 'bg-surface-raised text-slate-400'
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
              <div className={cn('h-1.5 w-1.5 rounded-full', plan.is_active ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]' : 'bg-slate-600')} />
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">
                {plan.is_active ? 'Activo' : 'Inactivo'}
              </p>
            </div>
          </div>
        </div>

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
                onClick={() => setIsDeleteOpen(true)}
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

// ── CompromisosClient ──────────────────────────────────────────────────────
export function CompromisosClient({ initialTab }: { initialTab: ActiveTab }) {
  const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab);
  const [isCreateCuotaOpen, setIsCreateCuotaOpen] = useState(false);
  const [isCreateSuscripcionOpen, setIsCreateSuscripcionOpen] = useState(false);

  const {
    installmentPlans,
    recurringPlans,
    paymentMethods,
    fetchAllData,
    isInitialized,
    getInstallmentStatus,
    getCurrentMonthInstallmentsTotal,
    getMonthlyBurnRate,
  } = useFinanceStore();

  useEffect(() => {
    if (!isInitialized) {
      fetchAllData();
    }
  }, [isInitialized, fetchAllData]);

  // ── Cuotas data ──
  const plansWithProgress: PlanWithStatus[] = installmentPlans
    .map((plan) => {
      const status = getInstallmentStatus(plan.id);
      const paymentMethod = paymentMethods.find(pm => pm.id === plan.payment_method_id);
      if (!status) return null;
      return {
        ...plan,
        ...status,
        paymentMethodName: paymentMethod?.name,
        paymentMethodType: paymentMethod?.type,
      } as PlanWithStatus;
    })
    .filter((p): p is PlanWithStatus => p !== null);

  const totalDebtFuturo = plansWithProgress.reduce((sum, plan) => sum + plan.remaining, 0);
  const currentMonthCuotas = getCurrentMonthInstallmentsTotal();

  // ── Suscripciones data ──
  const plansWithPayment = recurringPlans
    .map(plan => {
      const paymentMethod = paymentMethods.find(pm => pm.id === plan.payment_method_id);
      return { ...plan, paymentMethodName: paymentMethod?.name };
    })
    .sort((a, b) => b.amount - a.amount);

  const totalMonthlyCost = getMonthlyBurnRate();

  // ── Hero totals ──
  const totalCompromisosMes = currentMonthCuotas + totalMonthlyCost;

  return (
    <div className="min-h-screen bg-surface text-slate-50 font-sans selection:bg-emerald-500/30 pb-24">
      <PageHeader
        title="Compromisos"
        subtitle="Cuotas y suscripciones"
        icon={<CalendarClock className="h-5 w-5" />}
        containerClassName="max-w-[1440px]"
      >
        <AnimatedPlusButton
          label={activeTab === 'cuotas' ? 'Crear cuota' : 'Crear suscripción'}
          onClick={activeTab === 'cuotas' 
            ? () => setIsCreateCuotaOpen(true) 
            : () => setIsCreateSuscripcionOpen(true)
          }
          triggerKey={activeTab}
          ariaLabel={activeTab === 'cuotas' ? 'Nueva cuota' : 'Nueva suscripción'}
        />
      </PageHeader>

      <CreateInstallmentPlanDialog open={isCreateCuotaOpen} onOpenChange={setIsCreateCuotaOpen} />
      <CreateSubscriptionDialog open={isCreateSuscripcionOpen} onOpenChange={setIsCreateSuscripcionOpen} />

      <main className="mx-auto max-w-[1440px] px-4 md:px-6 py-6 md:py-8">

        {/* Hero Card */}
        <div className="mb-6 relative overflow-hidden rounded-2xl border border-slate-800 bg-surface-raised/50 p-6 md:p-8 shadow-xl backdrop-blur-sm">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-indigo-500/10 blur-2xl" />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-indigo-300 uppercase tracking-wider mb-1">Total Compromisos del Mes</p>
              <p className="text-3xl md:text-4xl font-bold text-white font-mono tracking-tight">
                {formatCurrency(totalCompromisosMes)}
              </p>
            </div>
            <div className="flex gap-4 sm:gap-6 text-right">
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Cuotas</p>
                <p className="text-lg font-bold text-rose-400 font-mono">{formatCurrency(currentMonthCuotas)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Fijos</p>
                <p className="text-lg font-bold text-purple-400 font-mono">{formatCurrency(totalMonthlyCost)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Segmented Control */}
        <div data-tour="compromisos-tabs" className="flex gap-1 p-1 rounded-xl bg-slate-900/60 border border-slate-800 mb-6 w-full justify-between">
          <button
            onClick={() => setActiveTab('cuotas')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all w-full justify-center',
              activeTab === 'cuotas'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            <CreditCard className="h-4 w-4" />
            Cuotas
            {plansWithProgress.length > 0 && (
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', activeTab === 'cuotas' ? 'bg-white/20' : 'bg-slate-800')}>{plansWithProgress.length}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('suscripciones')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all w-full justify-center',
              activeTab === 'suscripciones'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            <CalendarClock className="h-4 w-4" />
            Suscripciones
            {plansWithPayment.filter(p => p.is_active).length > 0 && (
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', activeTab === 'suscripciones' ? 'bg-white/20' : 'bg-slate-800')}>{plansWithPayment.filter(p => p.is_active).length}</span>
            )}
          </button>
        </div>

        {/* Tab: Cuotas */}
        {activeTab === 'cuotas' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-5 text-center">
                <p className="text-xs font-medium text-indigo-300 uppercase tracking-wider mb-1">Deuda Futura</p>
                <p className="text-xl font-bold text-indigo-400 font-mono">{formatCurrency(totalDebtFuturo)}</p>
                <p className="text-[10px] text-slate-400 mt-1">Pendiente a largo plazo</p>
              </div>
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-5 text-center">
                <p className="text-xs font-medium text-rose-300 uppercase tracking-wider mb-1">Vence este mes</p>
                <p className="text-xl font-bold text-rose-400 font-mono">{formatCurrency(currentMonthCuotas)}</p>
                <p className="text-[10px] text-slate-400 mt-1">A pagar en el ciclo actual</p>
              </div>
            </div>

            {plansWithProgress.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-dashed border-slate-800 bg-surface-raised/20 text-center">
                <CreditCard className="h-16 w-16 text-slate-700 mb-4" />
                <h3 className="text-lg font-semibold text-slate-200 mb-2">Organizá tus pagos en cuotas</h3>
                <p className="text-sm text-slate-400 max-w-xs mb-6">
                  Registrá tus planes de cuotas para saber exactamente cuánto pagás cada mes y cuándo terminás de pagar.
                </p>
                <Button onClick={() => setIsCreateCuotaOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  <Plus className="h-4 w-4 mr-2" />
                  Nuevo Plan de Cuotas
                </Button>
              </div>
            ) : (
              <StaggeredList className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {plansWithProgress.map((plan) => (
                  <StaggeredItem key={plan.id}>
                    <InstallmentPlanCard plan={plan} />
                  </StaggeredItem>
                ))}
              </StaggeredList>
            )}
          </>
        )}

        {/* Tab: Suscripciones */}
        {activeTab === 'suscripciones' && (
          <>
            {plansWithPayment.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-dashed border-slate-800 bg-surface-raised/20 text-center">
                <CalendarClock className="h-16 w-16 text-slate-700 mb-4" />
                <h3 className="text-lg font-semibold text-slate-200 mb-2">Registrá tus gastos fijos y suscripciones</h3>
                <p className="text-sm text-slate-400 max-w-xs mb-6">
                  Netflix, alquiler, gimnasio... sumá tus gastos recurrentes y sabé de antemano cuánto se te va cada mes.
                </p>
                <Button onClick={() => setIsCreateSuscripcionOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva Suscripción
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
          </>
        )}
      </main>
    </div>
  );
}
