'use client';

import { useEffect, useState, useMemo, useTransition } from 'react';
import { useFinanceStore } from '@/lib/store/financeStore';
import { SavingsGoalCard } from '@/components/goals/savings-goal-card';
import { CategoryBudgetCard } from '@/components/goals/category-budget-card';
import { CreateSavingsGoalDialog } from '@/components/goals/create-savings-goal-dialog';
import { CreateBudgetDialog } from '@/components/goals/create-budget-dialog';
import { PortfolioDistribution } from '@/components/inversiones/portfolio-distribution';
import { CreateInvestmentDialog } from '@/components/inversiones/create-investment-dialog';
import { SavingsCard } from '@/components/inversiones/savings-card';
import { Button } from '@/components/ui/button';
import { updateMarketPrices } from '@/app/inversiones/actions';
import { toast } from 'sonner';
import { formatTickerCurrency } from '@/lib/utils';
import { StaggeredList, StaggeredItem } from '@/components/shared/staggered-list';
import { cn } from '@/lib/utils';
import {
  Target,
  Wallet,
  PiggyBank,
  TrendingUp,
  DollarSign,
  RefreshCw,
  Loader2,
  BarChart3,
} from 'lucide-react';

type ActiveTab = 'metas' | 'presupuestos' | 'inversiones';

const fmtCurrency = (amount: number, currency: 'ARS' | 'USD' = 'ARS') =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);

export function ObjetivosClient({ initialTab }: { initialTab: ActiveTab }) {
  const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab);
  const [isRefreshing, startRefreshTransition] = useTransition();

  const {
    isInitialized,
    fetchAllData,
    savingsGoals,
    categoryBudgets,
    categories,
    getAllBudgetStatuses,
    getPortfolioStatus,
    savings,
    dolarBlue,
  } = useFinanceStore();

  useEffect(() => {
    if (!isInitialized) fetchAllData();
  }, [isInitialized, fetchAllData]);

  // ── Goals & Budgets ───────────────────────────────────────────────────────
  const activeGoals = savingsGoals.filter(g => g.is_active);
  const completedGoals = savingsGoals.filter(g => !g.is_active);
  const activeBudgets = categoryBudgets.filter(b => b.is_active);
  const budgetStatuses = getAllBudgetStatuses();
  const exceededCount = budgetStatuses.filter(s => s.status === 'exceeded').length;
  const warningCount = budgetStatuses.filter(s => s.status === 'warning').length;

  // ── Inversiones ───────────────────────────────────────────────────────────
  const portfolio = useMemo(() => getPortfolioStatus(), [getPortfolioStatus]);
  const dolarVenta = dolarBlue?.venta ?? 0;

  const savingsARS = savings.filter(s => s.currency === 'ARS').reduce((a, s) => a + Number(s.amount), 0);
  const savingsUSD = savings.filter(s => s.currency === 'USD').reduce((a, s) => a + Number(s.amount), 0);
  const totalPatrimonioARS = portfolio.totalBalanceARS + savingsARS + (savingsUSD * dolarVenta) + (portfolio.totalBalanceUSD * dolarVenta);

  const chartData = useMemo(() =>
    portfolio.assets
      .map(asset => ({ name: asset.ticker, value: asset.currentValue, currency: asset.currency ?? undefined }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value),
    [portfolio]
  );
  const hasInvestments = portfolio.assets.length > 0;

  // ── Hero: patrimonio total ─────────────────────────────────────────────────
  const totalMetasARS = activeGoals.reduce((sum, g) => sum + Number(g.current_amount ?? 0), 0);
  const totalHeroARS = totalPatrimonioARS + totalMetasARS;

  const handleRefreshPrices = () => {
    startRefreshTransition(async () => {
      const result = await updateMarketPrices();
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`Precios actualizados: ${result.updated ?? 0} activos`);
        await fetchAllData();
      }
    });
  };

  return (
    <div className="min-h-screen bg-surface text-slate-50 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-surface/80 backdrop-blur-md">
        <div className="mx-auto max-w-[1440px] px-4 md:px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">Objetivos</h1>
            <p className="text-sm text-slate-400 mt-0.5">Metas, presupuestos e inversiones</p>
          </div>
          {/* Header actions by tab */}
          <div className="flex items-center gap-2">
            {activeTab === 'metas' && <CreateSavingsGoalDialog />}
            {activeTab === 'presupuestos' && <CreateBudgetDialog categories={categories} />}
            {activeTab === 'inversiones' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshPrices}
                  disabled={isRefreshing}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  {isRefreshing ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1 md:mr-2" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-1 md:mr-2" />
                  )}
                  <span className="hidden sm:inline">{isRefreshing ? 'Actualizando...' : 'Cotizaciones'}</span>
                </Button>
                <CreateInvestmentDialog />
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 md:px-6 py-6 space-y-6">

        {/* Hero Card: Patrimonio Total */}
        <div className="rounded-2xl border border-indigo-500/20 bg-linear-to-br from-indigo-500/10 via-violet-500/5 to-slate-950 p-5 md:p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Target className="w-16 md:w-20 h-16 md:h-20 text-indigo-400" />
          </div>
          <p className="text-[10px] md:text-xs font-medium text-indigo-300 uppercase tracking-wider mb-1.5">Patrimonio Total</p>
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-baseline gap-1 sm:gap-x-6 sm:gap-y-2">
            <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-white font-mono tracking-tight">
              {fmtCurrency(totalHeroARS)}
            </p>
            {dolarVenta > 0 && (
              <p className="text-lg sm:text-xl font-semibold text-indigo-200/70 font-mono">
                {fmtCurrency(dolarVenta > 0 ? totalHeroARS / dolarVenta : 0, 'USD')}
              </p>
            )}
          </div>
          {dolarVenta > 0 && (
            <p className="text-[10px] md:text-[11px] text-indigo-400/60 mt-1.5">
              Dólar Blue: ${dolarVenta.toLocaleString('es-AR')}
            </p>
          )}
        </div>

        {/* Segmented Control */}
        <div className="flex gap-1 p-1 rounded-xl bg-slate-900/60 border border-slate-800 w-fit">
          {([
            { value: 'metas', label: 'Metas', icon: PiggyBank, color: 'bg-emerald-600' },
            { value: 'presupuestos', label: 'Presupuestos', icon: Wallet, color: 'bg-indigo-600' },
            { value: 'inversiones', label: 'Inversiones', icon: TrendingUp, color: 'bg-sky-600' },
          ] as const).map(({ value, label, icon: Icon, color }) => (
            <button
              key={value}
              onClick={() => setActiveTab(value)}
              className={cn(
                'flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-medium transition-all',
                activeTab === value
                  ? `${color} text-white shadow-sm`
                  : 'text-slate-400 hover:text-slate-200'
              )}
            >
              <Icon className="h-3.5 w-3.5 md:h-4 md:w-4" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* ── TAB: METAS ── */}
        {activeTab === 'metas' && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-emerald-500/10">
                <PiggyBank className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-100">Metas de Ahorro</h2>
                <p className="text-xs text-slate-500">
                  {activeGoals.length === 0
                    ? 'Sin metas activas'
                    : `${activeGoals.length} meta${activeGoals.length > 1 ? 's' : ''} activa${activeGoals.length > 1 ? 's' : ''}`}
                </p>
              </div>
            </div>

            {activeGoals.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-800 bg-surface-raised/20 py-16 text-center">
                <PiggyBank className="h-16 w-16 text-slate-700 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-200 mb-2">Ponele un objetivo a tu ahorro</h3>
                <p className="text-slate-500 text-sm max-w-xs mx-auto mb-6">
                  Definí metas concretas — un viaje, un fondo de emergencia, lo que sea — y seguí tu progreso mes a mes.
                </p>
                <CreateSavingsGoalDialog />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeGoals.map(goal => <SavingsGoalCard key={goal.id} goal={goal} />)}
              </div>
            )}

            {completedGoals.length > 0 && (
              <details className="group">
                <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-300 transition-colors select-none">
                  {completedGoals.length} meta{completedGoals.length > 1 ? 's' : ''} inactiva{completedGoals.length > 1 ? 's' : ''} →
                </summary>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-60">
                  {completedGoals.map(goal => <SavingsGoalCard key={goal.id} goal={goal} />)}
                </div>
              </details>
            )}
          </section>
        )}

        {/* ── TAB: PRESUPUESTOS ── */}
        {activeTab === 'presupuestos' && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-indigo-500/10">
                <Wallet className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-100">Presupuestos Mensuales</h2>
                <p className="text-xs text-slate-500">
                  {activeBudgets.length === 0 ? (
                    'Sin presupuestos activos'
                  ) : (
                    <>
                      {activeBudgets.length} categoría{activeBudgets.length > 1 ? 's' : ''}
                      {exceededCount > 0 && (
                        <span className="text-rose-400 ml-1">· {exceededCount} superado{exceededCount > 1 ? 's' : ''}</span>
                      )}
                      {warningCount > 0 && (
                        <span className="text-amber-400 ml-1">· {warningCount} en alerta</span>
                      )}
                    </>
                  )}
                </p>
              </div>
            </div>

            {activeBudgets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-800 bg-surface-raised/20 py-16 text-center">
                <Wallet className="h-16 w-16 text-slate-700 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-200 mb-2">Controlá en qué gastás tu plata</h3>
                <p className="text-slate-500 text-sm max-w-xs mx-auto mb-6">
                  Establecé límites de gasto mensual por categoría y recibí alertas antes de pasarte del presupuesto.
                </p>
                <CreateBudgetDialog categories={categories} />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeBudgets.map(budget => <CategoryBudgetCard key={budget.id} budget={budget} />)}
              </div>
            )}
          </section>
        )}

        {/* ── TAB: INVERSIONES ── */}
        {activeTab === 'inversiones' && (
          <section className="space-y-5">
            {/* Summary Cards */}
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${hasInvestments ? 'lg:grid-cols-4' : ''} gap-3 md:gap-4`}>
              <SavingsCard />

              {hasInvestments && (
                <>
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 md:p-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-3 opacity-10">
                      <DollarSign className="w-12 md:w-16 h-12 md:h-16 text-emerald-500" />
                    </div>
                    <p className="text-[10px] md:text-xs font-medium text-emerald-300 uppercase tracking-wider mb-1">Total en Pesos</p>
                    <p className="text-xl md:text-3xl font-bold text-white font-mono tracking-tight">
                      {fmtCurrency(portfolio.totalBalanceARS)}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${portfolio.totalProfitARS >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'}`}>
                        {portfolio.totalProfitARS >= 0 ? '+' : ''}{fmtCurrency(portfolio.totalProfitARS)}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 md:p-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-3 opacity-10">
                      <Wallet className="w-12 md:w-16 h-12 md:h-16 text-sky-500" />
                    </div>
                    <p className="text-[10px] md:text-xs font-medium text-sky-300 uppercase tracking-wider mb-1">Total en Dólares</p>
                    <p className="text-xl md:text-3xl font-bold text-white font-mono tracking-tight">
                      {fmtCurrency(portfolio.totalBalanceUSD, 'USD')}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${portfolio.totalProfitUSD >= 0 ? 'text-sky-400 bg-sky-500/10' : 'text-red-400 bg-red-500/10'}`}>
                        {portfolio.totalProfitUSD >= 0 ? '+' : ''}{fmtCurrency(portfolio.totalProfitUSD, 'USD')}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-surface-raised/50 p-4 md:p-6 flex flex-col justify-center items-center text-center">
                    <RefreshCw className="h-6 w-6 md:h-8 md:w-8 text-slate-400 mb-2" />
                    <p className="text-slate-400 text-xs md:text-sm">Última cotización</p>
                    <p className="text-slate-200 font-mono text-xs md:text-sm mt-1">
                      {portfolio.lastUpdate
                        ? new Date(portfolio.lastUpdate).toLocaleString('es-AR')
                        : 'Esperando mercado...'}
                    </p>
                  </div>
                </>
              )}
            </div>

            {hasInvestments ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 lg:h-[500px]">
                <div className="lg:col-span-2 h-[280px] sm:h-80 lg:h-full">
                  <PortfolioDistribution data={chartData} />
                </div>
                <div className="lg:col-span-1 border border-slate-800 bg-surface-raised/40 rounded-xl p-3 md:p-4 overflow-y-auto max-h-[350px] sm:max-h-[400px] lg:max-h-none">
                  <h3 className="text-xs md:text-sm font-semibold text-slate-300 mb-3 md:mb-4 sticky top-0 bg-surface-raised/95 py-2 backdrop-blur-sm flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-slate-400" />
                    Tenencias
                    <span className="text-[10px] font-normal text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded-full ml-auto">
                      {portfolio.assets.length}
                    </span>
                  </h3>
                  <StaggeredList className="space-y-2 md:space-y-3">
                    {portfolio.assets.map(asset => {
                      const assetCurrency = (asset.currency === 'USD' ? 'USD' : 'ARS') as 'ARS' | 'USD';
                      return (
                        <StaggeredItem key={asset.id}>
                          <div className="flex items-center justify-between p-2.5 md:p-3 rounded-lg bg-surface-raised border border-slate-800/60 hover:border-slate-700 transition-colors">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-slate-200">{asset.ticker}</span>
                                <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${assetCurrency === 'USD' ? 'bg-sky-500/10 text-sky-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                                  {assetCurrency}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400 truncate">{asset.quantity} × {formatTickerCurrency(asset.lastPrice, asset.ticker, asset.currency)}</div>
                            </div>
                            <div className="text-right shrink-0 ml-2">
                              <div className="font-mono text-sm font-medium text-slate-200">
                                {formatTickerCurrency(asset.currentValue, asset.ticker, asset.currency)}
                              </div>
                              <div className={`text-[10px] font-mono ${asset.profitPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {asset.profitPercent >= 0 ? '+' : ''}{asset.profitPercent.toFixed(2)}%
                              </div>
                            </div>
                          </div>
                        </StaggeredItem>
                      );
                    })}
                  </StaggeredList>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-dashed border-slate-800 bg-surface-raised/20 text-center">
                <TrendingUp className="h-16 w-16 text-slate-700 mb-4" />
                <h3 className="text-lg font-semibold text-slate-200 mb-2">Empezá a hacer crecer tu plata</h3>
                <p className="text-sm text-slate-400 max-w-xs mb-6">
                  Registrá tus activos — acciones, CEDEARs, crypto — y seguí el valor de tu portafolio en tiempo real.
                </p>
                <CreateInvestmentDialog />
              </div>
            )}
          </section>
        )}

      </main>
    </div>
  );
}
