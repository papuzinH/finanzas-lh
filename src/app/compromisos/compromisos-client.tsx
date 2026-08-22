'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFinanceStore } from '@/lib/store/financeStore';
import {
  CreditCard,
  MoreVertical,
  Pencil,
  Trash2,
  Loader2,
  RefreshCw,
  CalendarClock,
  Tv,
  Wifi,
  Zap,
  Home,
  Dumbbell,
  ShieldCheck,
  Plus,
  ChevronDown,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { ScreenHeader } from '@/components/shared/screen-header';
import { EmptyState } from '@/components/shared/empty-state';
import { ProgressBar } from '@/components/ui/progress-bar';
import { TabsDS } from '@/components/ui/tabs-ds';
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
import { expectedChargeDate, isAutomaticPlan } from '@/lib/finance/recurring';
import { dateToLocalString } from '@/lib/utils/dates';
import {
  markRecurringPlanPaid,
  unmarkRecurringPlanPaid,
} from '@/app/compromisos/actions';
import { toast } from 'sonner';
import { InstallmentPlan, RecurringPlan } from '@/types/database';
import { CreateInstallmentPlanDialog } from '@/components/installments/create-plan-dialog';
import { SwipeableRow } from '@/components/shared/swipeable-row';
import { ActionSheet } from '@/components/ui/action-sheet';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { EditSubscriptionDialog } from '@/components/subscriptions/edit-subscription-dialog';
import { CreateSubscriptionDialog } from '@/components/subscriptions/create-subscription-dialog';
import { StaggeredList, StaggeredItem } from '@/components/shared/staggered-list';
import { AnimatedPlusButton } from '@/components/shared/animated-plus-button';
import { CreditCardCycleCard } from '@/components/compromisos/credit-card-cycle-card';
import { CompromisosSkeleton } from '@/components/ui/skeletons';

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

type ActiveTab = 'cuotas' | 'mensualidades';

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
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const router = useRouter();
  const { fetchAllData } = useFinanceStore();
  // Mismo trato que en /movimientos: en mobile se maneja por gesto y tap; en
  // desktop, por el menu de tres puntos.
  const isMobile = useIsMobile();

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
      <SwipeableRow
        enabled={isMobile}
        onSwipeRight={() => setIsEditOpen(true)}
        onSwipeLeft={() => setIsDeleteOpen(true)}
      >
        <div
          className={cn(
            'rounded-2xl border-[1.5px] border-border bg-surface p-3.5 grid gap-2 min-w-0',
            isMobile &&
              'cursor-pointer active:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          )}
          role={isMobile ? 'button' : undefined}
          tabIndex={isMobile ? 0 : undefined}
          aria-label={isMobile ? `${plan.description}. Abrir opciones de editar o eliminar el plan.` : undefined}
          onClick={isMobile ? () => setIsSheetOpen(true) : undefined}
          onKeyDown={
            isMobile
              ? (e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  setIsSheetOpen(true);
                }
              : undefined
          }
        >
          {/* Fila 1: nombre + badge n/m + cuota mensual + menú */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="min-w-0 flex-1 font-sans font-bold text-[13.5px] text-text truncate">{plan.description}</span>
            <span className="flex-none text-[10.5px] font-bold text-muted border-[1.5px] border-border rounded-full px-[7px] py-0.5 leading-none">
              {plan.isFinished ? '✓' : `${plan.installmentsPaid + 1}/${plan.installments_count}`}
            </span>
            <span className="flex-none font-display tnum text-[14px] text-bad whitespace-nowrap">
              − {formatCurrency(Number(plan.total_amount) / plan.installments_count)}
              <span className="font-sans font-semibold text-[11px] text-muted"> /mes</span>
            </span>
            {!isMobile && (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Opciones del plan" className="h-8 w-8 -mr-1 flex-none text-muted hover:text-text hover:bg-surface-2">
                    <MoreVertical className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-surface border-[1.5px] border-border text-text">
                  <DropdownMenuItem onClick={() => setIsEditOpen(true)} className="focus:bg-surface-2 cursor-pointer">
                    <Pencil className="mr-2 h-4 w-4" />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setIsDeleteOpen(true)}
                    disabled={isDeleting}
                    className="text-bad focus:bg-bad/10 focus:text-bad cursor-pointer"
                  >
                    {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                    Eliminar Plan
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Barra de progreso */}
          <ProgressBar
            value={plan.progress}
            tone={plan.isFinished ? 'good' : plan.progress >= 75 ? 'good' : 'warn'}
            height={7}
            label={`Progreso de cuotas: ${plan.installmentsPaid} de ${plan.installments_count} pagadas`}
          />

          {/* Pie: medio + faltan */}
          <div className="flex justify-between gap-2 text-[11.5px] text-muted tnum min-w-0">
            <span className="min-w-0 truncate">{plan.paymentMethodName ?? 'Sin medio asignado'}</span>
            <span className="flex-none">
              {plan.isFinished
                ? 'completado'
                : `faltan ${formatCurrency(plan.remaining)}${plan.remainingInstallments === 1 ? ' · última' : ''}`}
            </span>
          </div>
        </div>
      </SwipeableRow>

      <ActionSheet
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        title={plan.description}
        actions={[
          { label: 'Editar', icon: <Pencil className="h-5 w-5" />, onClick: () => setIsEditOpen(true) },
          {
            label: 'Eliminar plan',
            icon: <Trash2 className="h-5 w-5" />,
            onClick: () => setIsDeleteOpen(true),
            variant: 'destructive' as const,
          },
        ]}
      />

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
  const [isToggling, setIsToggling] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const isMobile = useIsMobile();
  const router = useRouter();
  const { fetchAllData, categories, paymentMethods, getPendingFixedExpenses } = useFinanceStore();

  const category = categories.find(c => c.id === plan.category_id);
  // Pagada este mes = ya no figura entre los gastos fijos pendientes del store.
  const isPaidThisMonth =
    plan.is_active && !getPendingFixedExpenses().items.some((i) => i.id === plan.id);

  // Las de crédito no se pagan: la tarjeta las debita sola cuando cierra el
  // resumen. En vez del toggle, muestran en qué resumen caen.
  const method = paymentMethods.find((m) => m.id === plan.payment_method_id);
  const isAutomatic = isAutomaticPlan(plan, method);
  const chargeLabel = method && isAutomatic
    ? (() => {
        const parts = expectedChargeDate(plan, method, dateToLocalString(new Date()).slice(0, 7)).split('-');
        return `${method.name} · vence ${Number(parts[2])}/${Number(parts[1])}`;
      })()
    : null;

  const togglePaid = async () => {
    setIsToggling(true);
    try {
      const result = isPaidThisMonth
        ? await unmarkRecurringPlanPaid(plan.id)
        : await markRecurringPlanPaid(plan.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(isPaidThisMonth ? 'Pago deshecho' : `${plan.description} marcada como pagada`);
        await fetchAllData();
        router.refresh();
      }
    } finally {
      setIsToggling(false);
    }
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
      <SwipeableRow
        enabled={isMobile}
        onSwipeRight={() => setIsEditOpen(true)}
        onSwipeLeft={() => setIsDeleteOpen(true)}
      >
      <div
        className={cn(
          'flex items-center gap-3 rounded-2xl border-[1.5px] border-border p-3 min-w-0',
          plan.is_active ? 'bg-surface' : 'bg-surface-2 opacity-70',
          isMobile &&
            'cursor-pointer active:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        )}
        role={isMobile ? 'button' : undefined}
        tabIndex={isMobile ? 0 : undefined}
        aria-label={isMobile ? `${plan.description}. Abrir opciones de editar o eliminar.` : undefined}
        onClick={isMobile ? () => setIsSheetOpen(true) : undefined}
        onKeyDown={
          isMobile
            ? (e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                setIsSheetOpen(true);
              }
            : undefined
        }
      >
        <div className="w-[38px] h-[38px] flex-none grid place-items-center bg-surface-2 border-[1.5px] border-border rounded-xl text-[17px]" aria-hidden="true">
          {category?.emoji ? <span>{category.emoji}</span> : getServiceIcon(plan.description, category?.name || null)}
        </div>

        <div className="min-w-0 grid gap-px">
          <span className="font-sans font-bold text-[13.5px] text-text truncate">{plan.description}</span>
          <span className="text-[12px] text-muted truncate">
            {category?.name ?? 'Gasto fijo'}{!plan.is_active && ' · inactiva'}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <div className="grid gap-0.5 justify-items-end">
            {plan.currency === 'USD' && plan.original_amount != null ? (
              <>
                <span className="font-display tnum text-[15px] text-text">
                  US$ {Number(plan.original_amount).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[10.5px] text-muted tnum">≈ {formatCurrency(plan.amount)}</span>
              </>
            ) : (
              <span className="font-display tnum text-[15px] text-text">{formatCurrency(plan.amount)}</span>
            )}
            {plan.is_active && (
              isAutomatic ? (
                <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] leading-none text-muted">
                  {chargeLabel}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    // Tocar el estado no abre el menú de la fila.
                    e.stopPropagation();
                    togglePaid();
                  }}
                  disabled={isToggling}
                  aria-label={isPaidThisMonth ? `Deshacer pago de ${plan.description}` : `Marcar ${plan.description} como pagada`}
                  className={cn(
                    'text-[10.5px] font-extrabold uppercase tracking-[0.08em] leading-none rounded-md px-1 py-0.5 -mx-1 transition-colors cursor-pointer disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    isPaidThisMonth ? 'text-good hover:bg-good/10' : 'text-warn hover:bg-warn/10'
                  )}
                >
                  {isToggling ? '…' : isPaidThisMonth ? 'pagada' : 'pendiente'}
                </button>
              )
            )}
          </div>
          {!isMobile && (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Opciones de suscripción" className="h-8 w-8 text-muted hover:text-text hover:bg-surface-2">
                  <MoreVertical className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-surface border-[1.5px] border-border text-text">
                <DropdownMenuItem onClick={() => setIsEditOpen(true)} className="focus:bg-surface-2 cursor-pointer">
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setIsDeleteOpen(true)}
                  disabled={isDeleting}
                  className="text-bad focus:bg-bad/10 focus:text-bad cursor-pointer"
                >
                  {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      </SwipeableRow>

      <ActionSheet
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        title={plan.description}
        actions={[
          { label: 'Editar', icon: <Pencil className="h-5 w-5" />, onClick: () => setIsEditOpen(true) },
          {
            label: 'Eliminar',
            icon: <Trash2 className="h-5 w-5" />,
            onClick: () => setIsDeleteOpen(true),
            variant: 'destructive' as const,
          },
        ]}
      />

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
  const [showFinished, setShowFinished] = useState(false);

  const {
    installmentPlans,
    recurringPlans,
    paymentMethods,
    fetchAllData,
    isInitialized,
    getInstallmentStatus,
    getCurrentMonthInstallmentsTotal,
    getMonthlyBurnRate,
    getPendingCreditCardByCard,
    getPendingFixedExpenses,
  } = useFinanceStore();

  const creditCards = getPendingCreditCardByCard();

  useEffect(() => {
    if (!isInitialized) {
      fetchAllData();
    }
  }, [isInitialized, fetchAllData]);

  // Skeleton durante la carga inicial → evita el flash del empty-state.
  if (!isInitialized) {
    return <CompromisosSkeleton />;
  }

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
  // Activos primero; finalizados detrás de un toggle para no ensuciar la lista.
  const activeCuotas = plansWithProgress.filter((p) => !p.isFinished);
  const finishedCuotas = plansWithProgress.filter((p) => p.isFinished);

  // ── Mensualidades data ──
  const plansWithPayment = recurringPlans
    .map(plan => {
      const paymentMethod = paymentMethods.find(pm => pm.id === plan.payment_method_id);
      return { ...plan, paymentMethodName: paymentMethod?.name };
    })
    .sort((a, b) => b.amount - a.amount);

  const totalMonthlyCost = getMonthlyBurnRate();
  const pendingSubs = getPendingFixedExpenses();

  // Las de crédito se debitan solas con el resumen; las demás las paga el
  // usuario. Se separan porque se comportan distinto: unas no piden acción.
  const automaticPlans = plansWithPayment.filter((p) =>
    isAutomaticPlan(p, paymentMethods.find((m) => m.id === p.payment_method_id)),
  );
  const manualPlans = plansWithPayment.filter((p) =>
    !isAutomaticPlan(p, paymentMethods.find((m) => m.id === p.payment_method_id)),
  );
  const automaticTotal = automaticPlans
    .filter((p) => p.is_active)
    .reduce((acc, p) => acc + Math.abs(Number(p.amount)), 0);
  const manualTotal = manualPlans
    .filter((p) => p.is_active)
    .reduce((acc, p) => acc + Math.abs(Number(p.amount)), 0);
  // "Por pagar" cuenta sólo lo manual: una mensualidad de crédito nunca está
  // pendiente de acción, aunque su cargo del mes todavía no se haya posteado.
  const manualPendingTotal = pendingSubs.items
    .filter((item) => manualPlans.some((p) => p.id === item.id))
    .reduce((acc, item) => acc + item.amount, 0);

  return (
    <div className="min-h-screen bg-bg text-text font-sans pb-28 md:pb-8">
      <ScreenHeader
        compact
        title="Compromisos"
        right={
          <AnimatedPlusButton
            label={activeTab === 'cuotas' ? 'Crear cuota' : 'Crear suscripción'}
            onClick={activeTab === 'cuotas'
              ? () => setIsCreateCuotaOpen(true)
              : () => setIsCreateSuscripcionOpen(true)
            }
            triggerKey={activeTab}
            ariaLabel={activeTab === 'cuotas' ? 'Nueva cuota' : 'Nueva suscripción'}
          />
        }
      />

      <CreateInstallmentPlanDialog open={isCreateCuotaOpen} onOpenChange={setIsCreateCuotaOpen} />
      <CreateSubscriptionDialog open={isCreateSuscripcionOpen} onOpenChange={setIsCreateSuscripcionOpen} />

      <main className="mx-auto max-w-[1440px] space-y-5 pb-4">

        {/* Segmented Tabs */}
        <div data-tour="compromisos-tabs" className="px-5">
          <TabsDS
            idBase="compromisos"
            ariaLabel="Tipo de compromiso"
            tabs={[
              { id: 'cuotas', label: 'Cuotas', icon: 'credit-card' },
              { id: 'mensualidades', label: 'Mensualidades', icon: 'repeat' },
            ]}
            active={activeTab}
            onChange={(id) => setActiveTab(id as ActiveTab)}
          />
        </div>

        {/* Tab: Cuotas */}
        {activeTab === 'cuotas' && (
          <div
            role="tabpanel"
            id="compromisos-panel-cuotas"
            aria-labelledby="compromisos-tab-cuotas"
            className="px-5 space-y-4"
          >
            <div className="grid grid-cols-2 rounded-[18px] bg-surface border-[1.5px] border-border shadow-card overflow-hidden">
              <div className="grid gap-0.5 px-4 py-3 border-r-[1.5px] border-border">
                <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted">Pendiente este mes</span>
                <span className="font-display tnum text-[17px] text-warn">{formatCurrency(currentMonthCuotas)}</span>
              </div>
              <div className="grid gap-0.5 px-4 py-3">
                <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted">Deuda futura</span>
                <span className="font-display tnum text-[17px] text-text">{formatCurrency(totalDebtFuturo)}</span>
              </div>
            </div>

            {/* Ciclos de tarjeta — las cards hablan solas, sin header de sección */}
            {creditCards.length > 0 && (
              <div className="flex flex-col gap-3">
                {creditCards.map((card) => (
                  <CreditCardCycleCard key={card.methodId} card={card} />
                ))}
              </div>
            )}

            {plansWithProgress.length === 0 ? (
              <EmptyState
                icon={<CreditCard className="h-5 w-5" />}
                title="Organizá tus pagos en cuotas"
                description="Cargá un plan y sabés cuánto pagás por mes y cuándo terminás."
                action={
                  <Button onClick={() => setIsCreateCuotaOpen(true)}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Nuevo plan de cuotas
                  </Button>
                }
              />
            ) : (
              <>
                <div className="flex items-baseline justify-between mt-1">
                  <h2 className="font-display text-text text-[18px]">Planes en curso</h2>
                  <span className="text-[12.5px] font-bold text-muted">{activeCuotas.length} activo{activeCuotas.length !== 1 ? 's' : ''}</span>
                </div>

                {activeCuotas.length > 0 ? (
                  <StaggeredList className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {activeCuotas.map((plan) => (
                      <StaggeredItem key={plan.id}>
                        <InstallmentPlanCard plan={plan} />
                      </StaggeredItem>
                    ))}
                  </StaggeredList>
                ) : (
                  <p className="text-sm text-muted text-center py-4">
                    No tenés cuotas activas.
                  </p>
                )}

                {finishedCuotas.length > 0 && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setShowFinished((v) => !v)}
                      aria-expanded={showFinished}
                      aria-controls="compromisos-cuotas-finalizadas"
                      className="inline-flex items-center gap-1.5 min-h-11 px-3 -ml-3 rounded-full text-[12px] font-bold text-muted hover:text-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                    >
                      <ChevronDown
                        className={cn('h-4 w-4 transition-transform', showFinished && 'rotate-180')}
                        aria-hidden="true"
                      />
                      {showFinished ? 'Ocultar finalizados' : `Ver finalizados (${finishedCuotas.length})`}
                    </button>
                    {showFinished && (
                      <StaggeredList
                        id="compromisos-cuotas-finalizadas"
                        className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                      >
                        {finishedCuotas.map((plan) => (
                          <StaggeredItem key={plan.id}>
                            <InstallmentPlanCard plan={plan} />
                          </StaggeredItem>
                        ))}
                      </StaggeredList>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Tab: Mensualidades */}
        {activeTab === 'mensualidades' && (
          <div
            role="tabpanel"
            id="compromisos-panel-mensualidades"
            aria-labelledby="compromisos-tab-mensualidades"
            className="px-5 space-y-4"
          >
            {plansWithPayment.length === 0 ? (
              <EmptyState
                icon={<CalendarClock className="h-5 w-5" />}
                title="Registrá tus gastos fijos"
                description="Netflix, alquiler, el gimnasio. Sabés de antemano cuánto se te va cada mes."
                action={
                  <Button onClick={() => setIsCreateSuscripcionOpen(true)}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Nueva mensualidad
                  </Button>
                }
              />
            ) : (
              <>
                <div className="grid grid-cols-2 rounded-[18px] bg-surface border-[1.5px] border-border shadow-card overflow-hidden">
                  <div className="grid gap-0.5 px-4 py-3 border-r-[1.5px] border-border">
                    <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted">Total mensual</span>
                    <span className="font-display tnum text-[17px] text-text">{formatCurrency(totalMonthlyCost)}</span>
                  </div>
                  <div className="grid gap-0.5 px-4 py-3">
                    <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted">Por pagar</span>
                    <span className={cn('font-display tnum text-[17px]', manualPendingTotal > 0 ? 'text-warn' : 'text-good')}>{formatCurrency(manualPendingTotal)}</span>
                  </div>
                </div>

                {automaticPlans.length > 0 && (
                  <>
                    <div className="flex items-baseline justify-between mt-1">
                      <h2 className="font-display text-text text-[18px]">Se debitan solas</h2>
                      <span className="text-[12.5px] font-bold text-muted tnum">{formatCurrency(automaticTotal)}</span>
                    </div>

                    <StaggeredList className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                      {automaticPlans.map((plan) => (
                        <StaggeredItem key={plan.id}>
                          <SubscriptionCard plan={plan} />
                        </StaggeredItem>
                      ))}
                    </StaggeredList>
                  </>
                )}

                {manualPlans.length > 0 && (
                  <>
                    <div className="flex items-baseline justify-between mt-1">
                      <h2 className="font-display text-text text-[18px]">Las pagás vos</h2>
                      <span className="text-[12.5px] font-bold text-muted tnum">{formatCurrency(manualTotal)}</span>
                    </div>

                    <StaggeredList className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                      {manualPlans.map((plan) => (
                        <StaggeredItem key={plan.id}>
                          <SubscriptionCard plan={plan} />
                        </StaggeredItem>
                      ))}
                    </StaggeredList>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
