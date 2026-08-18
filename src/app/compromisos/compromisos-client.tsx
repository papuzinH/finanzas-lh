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
  Check,
  Clock,
  Undo2,
  ChevronDown,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { ScreenHeader } from '@/components/shared/screen-header';
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
import {
  markRecurringPlanPaid,
  unmarkRecurringPlanPaid,
} from '@/app/compromisos/actions';
import { toast } from 'sonner';
import { InstallmentPlan, RecurringPlan } from '@/types/database';
import { CreateInstallmentPlanDialog } from '@/components/installments/create-plan-dialog';
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
      <div className="group rounded-2xl border-[1.5px] border-border bg-surface p-5 flex flex-col justify-between gap-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="font-sans font-bold text-text truncate">
              {plan.description}
            </h3>
            <p className="text-xs text-muted mt-1">
              Total del plan: {formatCurrency(Number(plan.total_amount))}
            </p>
            <p className="text-xs text-muted mt-0.5">
              Valor cuota: {formatCurrency(Number(plan.total_amount) / plan.installments_count)}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              {plan.paymentMethodName && (
                <div className="flex items-center gap-1.5 text-[10px] text-muted bg-surface-2 border border-border px-2 py-1 rounded-full w-fit">
                  <CreditCard className="h-3 w-3" aria-hidden="true" />
                  <span>{plan.paymentMethodName}</span>
                </div>
              )}
              {category && (
                <div className="flex items-center gap-1.5 text-[10px] text-muted bg-surface-2 border border-border px-2 py-1 rounded-full w-fit">
                  {category.emoji ? <span aria-hidden="true">{category.emoji}</span> : <Tag className="h-3 w-3" aria-hidden="true" />}
                  <span>{category.name}</span>
                </div>
              )}
            </div>
          </div>
          <div className="text-right flex flex-col items-end ml-4">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-bold text-text">
                {!plan.isFinished
                  ? `Cuota ${plan.installmentsPaid + 1} / ${plan.installments_count}`
                  : 'Finalizado'}
              </p>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Opciones del plan" className="h-6 w-6 min-h-11 min-w-11 text-muted hover:text-text hover:bg-surface-2 -mr-2">
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
            </div>
            <p className="text-[10px] uppercase tracking-wider text-muted">
              {plan.remainingInstallments > 0
                ? `${plan.remainingInstallments} restantes`
                : 'Completado'}
            </p>
          </div>
        </div>

        <ProgressBar
          value={plan.progress}
          tone={plan.isFinished ? 'good' : 'bad'}
          label={`Progreso de cuotas: ${plan.installmentsPaid} de ${plan.installments_count} pagadas`}
        />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {plan.isFinished ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-good/10 text-good border border-good/20">
                <Check className="h-3 w-3" aria-hidden="true" />
                Pagado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-accent-soft text-accent-deep border border-accent/20">
                <span className="h-1.5 w-1.5 rounded-full bg-accent-deep" aria-hidden="true" />
                En curso
              </span>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-muted mb-0.5">Te faltan (Futuro)</p>
            <p className="font-display tnum text-[17px] text-bad">
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
  const [isToggling, setIsToggling] = useState(false);
  const router = useRouter();
  const { fetchAllData, categories, getPendingFixedExpenses } = useFinanceStore();

  const category = categories.find(c => c.id === plan.category_id);
  // Pagada este mes = ya no figura entre los gastos fijos pendientes del store.
  const isPaidThisMonth =
    plan.is_active && !getPendingFixedExpenses().items.some((i) => i.id === plan.id);

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
      <div
        className={cn(
          'group rounded-2xl border-[1.5px] p-4 flex flex-col justify-between gap-4 transition-all',
          plan.is_active
            ? 'border-border bg-surface'
            : 'border-border bg-surface-2'
        )}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 border-[1.5px] border-border text-text shrink-0" aria-hidden="true">
              {category?.emoji ? <span className="text-lg">{category.emoji}</span> : getServiceIcon(plan.description, category?.name || null)}
            </div>
            <div>
              <h3 className="font-sans font-bold text-sm text-text">
                {plan.description}
              </h3>
              {category && (
                <span className="inline-flex items-center rounded-full bg-surface-2 border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted mt-1">
                  {category.name}
                </span>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            {plan.currency === 'USD' && plan.original_amount != null ? (
              <div className="flex flex-col items-end leading-tight">
                <span className="font-display tnum text-[15px] text-text">
                  US$ {Number(plan.original_amount).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[10px] text-muted">≈ {formatCurrency(plan.amount)}</span>
              </div>
            ) : (
              <span className="font-display tnum text-[15px] text-text">{formatCurrency(plan.amount)}</span>
            )}
            <div className="flex items-center justify-end gap-1.5 mt-1">
              <div className={cn('h-1.5 w-1.5 rounded-full', plan.is_active ? 'bg-good' : 'bg-muted')} aria-hidden="true" />
              <p className="text-[10px] text-muted uppercase tracking-wider">
                {plan.is_active ? 'Activo' : 'Inactivo'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-border">
          {plan.paymentMethodName ? (
            <div className="flex items-center gap-1.5 text-[10px] text-muted bg-surface-2 border border-border px-2 py-1 rounded-full">
              <CreditCard className="h-3 w-3" />
              <span>{plan.paymentMethodName}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[10px] text-muted bg-surface-2 border border-border px-2 py-1 rounded-full">
              <CreditCard className="h-3 w-3" aria-hidden="true" />
              <span>Sin asignar</span>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            {plan.is_active && (
              <button
                type="button"
                onClick={togglePaid}
                disabled={isToggling}
                aria-label={isPaidThisMonth ? `Deshacer pago de ${plan.description}` : `Marcar ${plan.description} como pagada`}
                className={cn(
                  'inline-flex items-center gap-1 min-h-11 px-3 rounded-full text-[11px] font-bold border cursor-pointer select-none transition-all active:scale-[0.97] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                  isPaidThisMonth
                    ? 'bg-good/10 text-good border-good/20 hover:bg-good/15'
                    : 'bg-warn/10 text-warn border-warn/20 hover:bg-warn/15'
                )}
              >
                {isToggling ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                ) : isPaidThisMonth ? (
                  <>
                    <Check className="h-3 w-3" aria-hidden="true" />
                    Pagada
                    <Undo2 className="h-3 w-3 opacity-60" aria-hidden="true" />
                  </>
                ) : (
                  <>
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    Pendiente
                  </>
                )}
              </button>
            )}
            <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Opciones de suscripción" className="h-6 w-6 min-h-11 min-w-11 text-muted hover:text-text hover:bg-surface-2">
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
          </div>
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
  const activeSubsCount = plansWithPayment.filter((p) => p.is_active).length;
  const pendingSubs = getPendingFixedExpenses();

  // ── Hero totals ──
  const totalCompromisosMes = currentMonthCuotas + totalMonthlyCost;

  return (
    <div className="min-h-screen bg-bg text-text font-sans pb-28 md:pb-8">
      <ScreenHeader
        kicker="compromisos"
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

        {/* Hero Card */}
        <div
          className="mx-5 rounded-2xl border-[1.5px] border-border bg-surface text-text shadow-card p-5"
          style={{ boxShadow: '0 18px 36px -18px rgba(28,42,71,0.70)' }}
        >
          <p className="font-sans text-[11px] uppercase tracking-[0.2em] text-accent-deep">
            Compromisos del mes
          </p>
          <p className="font-display tnum text-[36px] leading-[var(--leading-display)] mt-1 text-text [text-shadow:var(--shadow-bandera)] pr-1.5 pb-1">
            {formatCurrency(totalCompromisosMes)}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-surface-2 border-[1.5px] border-border px-3 py-2">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-accent-deep">Cuotas</p>
              <p className="font-display tnum text-[15px] mt-0.5 text-text">{formatCurrency(currentMonthCuotas)}</p>
            </div>
            <div className="rounded-xl bg-surface-2 border-[1.5px] border-border px-3 py-2">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-accent-deep">Mensualidades</p>
              <p className="font-display tnum text-[15px] mt-0.5 text-text">{formatCurrency(totalMonthlyCost)}</p>
            </div>
          </div>
        </div>

        {/* Tarjetas de crédito */}
        {creditCards.length > 0 && (
          <section className="px-5">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard className="h-4 w-4 text-muted" aria-hidden="true" />
              <h2 className="text-[11px] font-extrabold text-muted uppercase tracking-[0.15em]">
                Tarjetas de crédito
              </h2>
            </div>
            <div className="flex flex-col gap-3">
              {creditCards.map((card) => (
                <CreditCardCycleCard key={card.methodId} card={card} />
              ))}
            </div>
          </section>
        )}

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
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-surface border-[1.5px] border-border p-5 text-center">
                <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Deuda Futura</p>
                <p className="font-display tnum text-[20px] text-text">{formatCurrency(totalDebtFuturo)}</p>
                <p className="text-[10px] text-muted mt-1">Pendiente a largo plazo</p>
              </div>
              <div className="rounded-2xl bg-surface border-[1.5px] border-border p-5 text-center">
                <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Cuotas activas</p>
                <p className="font-display tnum text-[20px] text-text">{activeCuotas.length}</p>
                <p className="text-[10px] text-muted mt-1">Planes en curso</p>
              </div>
            </div>

            {plansWithProgress.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 rounded-2xl border-[1.5px] border-dashed border-border bg-surface text-center">
                <CreditCard className="h-14 w-14 text-faint mb-4" aria-hidden="true" />
                <h3 className="font-sans font-bold text-text text-lg mb-2">Organizá tus pagos en cuotas</h3>
                <p className="text-sm text-muted max-w-xs mb-6">
                  Registrá tus planes de cuotas para saber exactamente cuánto pagás cada mes y cuándo terminás de pagar.
                </p>
                <Button onClick={() => setIsCreateCuotaOpen(true)}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Nuevo Plan de Cuotas
                </Button>
              </div>
            ) : (
              <>
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
              <div className="flex flex-col items-center justify-center py-16 rounded-2xl border-[1.5px] border-dashed border-border bg-surface text-center">
                <CalendarClock className="h-14 w-14 text-faint mb-4" aria-hidden="true" />
                <h3 className="font-sans font-bold text-text text-lg mb-2">Registrá tus gastos fijos y mensualidades</h3>
                <p className="text-sm text-muted max-w-xs mb-6">
                  Netflix, alquiler, gimnasio... sumá tus gastos recurrentes y sabé de antemano cuánto se te va cada mes.
                </p>
                <Button onClick={() => setIsCreateSuscripcionOpen(true)}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Nueva Suscripción
                </Button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-surface border-[1.5px] border-border p-5 text-center">
                    <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Pendiente este mes</p>
                    <p className={cn('font-display tnum text-[20px]', pendingSubs.total > 0 ? 'text-bad' : 'text-good')}>
                      {formatCurrency(pendingSubs.total)}
                    </p>
                    <p className="text-[10px] text-muted mt-1">
                      {pendingSubs.total > 0 ? 'Sin registrar aún' : 'Todo al día'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-surface border-[1.5px] border-border p-5 text-center">
                    <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Activas</p>
                    <p className="font-display tnum text-[20px] text-text">{activeSubsCount}</p>
                    <p className="text-[10px] text-muted mt-1">Mensualidades en curso</p>
                  </div>
                </div>

                <StaggeredList className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {plansWithPayment.map((plan) => (
                    <StaggeredItem key={plan.id}>
                      <SubscriptionCard plan={plan} />
                    </StaggeredItem>
                  ))}
                </StaggeredList>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
