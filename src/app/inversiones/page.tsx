"use client";

import { useEffect, useMemo, useTransition } from "react";
import { useFinanceStore } from "@/lib/store/financeStore";
import { PortfolioDistribution } from "@/components/inversiones/portfolio-distribution";
import { CreateInvestmentDialog } from "@/components/inversiones/create-investment-dialog";
import { SavingsCard } from "@/components/inversiones/savings-card";
import { PageHeader } from "@/components/shared/page-header";
import { TrendingUp, DollarSign, Wallet, RefreshCw, Loader2, BarChart3 } from "lucide-react";
import { FullPageLoader } from "@/components/shared/loader";
import { Button } from "@/components/ui/button";
import { updateMarketPrices } from "@/app/inversiones/actions";
import { toast } from "sonner";
import { formatTickerCurrency } from "@/lib/utils";

const fmtCurrency = (amount: number, currency: 'ARS' | 'USD' = 'ARS') => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
};

export default function InversionesPage() {
  const {
    isInitialized,
    isLoading,
    fetchAllData,
    getPortfolioStatus,
    savings,
    dolarBlue,
  } = useFinanceStore();
  const [isRefreshing, startRefreshTransition] = useTransition();

  useEffect(() => {
    if (!isInitialized) {
      fetchAllData();
    }
  }, [isInitialized, fetchAllData]);

  const portfolio = useMemo(() => getPortfolioStatus(), [getPortfolioStatus]);

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

  const chartData = useMemo(() => {
    return portfolio.assets
      .map(asset => ({
        name: asset.ticker,
        value: asset.currentValue,
        currency: asset.currency ?? undefined
      }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [portfolio]);

  const hasInvestments = portfolio.assets.length > 0;

  // Total patrimonio: investments + savings
  const savingsARS = savings.filter(s => s.currency === 'ARS').reduce((a, s) => a + Number(s.amount), 0);
  const savingsUSD = savings.filter(s => s.currency === 'USD').reduce((a, s) => a + Number(s.amount), 0);
  const dolarVenta = dolarBlue?.venta ?? 0;

  const totalPatrimonioARS = portfolio.totalBalanceARS + savingsARS + (savingsUSD * dolarVenta) + (portfolio.totalBalanceUSD * dolarVenta);
  const totalPatrimonioUSD = dolarVenta > 0
    ? totalPatrimonioARS / dolarVenta
    : portfolio.totalBalanceUSD + savingsUSD;

  if (isLoading && !isInitialized) {
    return <FullPageLoader text="Analizando mercado..." />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans pb-24">
      <PageHeader
        title="Inversiones"
        icon={<TrendingUp className="h-5 w-5" />}
        containerClassName="max-w-[1440px]"
      >
        <div className="flex items-center gap-2">
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
        </div>
      </PageHeader>

      <main className="mx-auto max-w-[1440px] px-4 md:px-6 py-6 md:py-8 space-y-5 md:space-y-6">

        {/* Total Patrimonio */}
        <div className="rounded-2xl border border-indigo-500/20 bg-linear-to-br from-indigo-500/10 via-violet-500/5 to-slate-950 p-5 md:p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <TrendingUp className="w-16 md:w-20 h-16 md:h-20 text-indigo-400" />
          </div>
          <p className="text-[10px] md:text-xs font-medium text-indigo-300 uppercase tracking-wider mb-1.5">Patrimonio Total</p>
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-baseline gap-1 sm:gap-x-6 sm:gap-y-2">
            <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-white font-mono tracking-tight">
              {fmtCurrency(totalPatrimonioARS)}
            </p>
            {dolarVenta > 0 && (
              <p className="text-lg sm:text-xl font-semibold text-indigo-200/70 font-mono">
                {fmtCurrency(totalPatrimonioUSD, 'USD')}
              </p>
            )}
          </div>
          {dolarVenta > 0 && (
            <p className="text-[10px] md:text-[11px] text-indigo-400/60 mt-1.5">
              Dólar Blue: ${dolarVenta.toLocaleString('es-AR')}
            </p>
          )}
        </div>

        {/* Summary Cards */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${hasInvestments ? 'lg:grid-cols-4' : ''} gap-3 md:gap-4`}>

          {/* Savings Card (always visible) */}
          <SavingsCard />

          {hasInvestments && (
            <>
              {/* Total ARS */}
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

              {/* Total USD */}
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

              {/* Last Update */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 md:p-6 flex flex-col justify-center items-center text-center">
                <RefreshCw className="h-6 w-6 md:h-8 md:w-8 text-slate-600 mb-2" />
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
          <>
            {/* Charts and Details */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 lg:h-[500px]">

              {/* Chart */}
              <div className="lg:col-span-2 h-[280px] sm:h-80 lg:h-full">
                <PortfolioDistribution data={chartData} />
              </div>

              {/* Assets List */}
              <div className="lg:col-span-1 border border-slate-800 bg-slate-900/40 rounded-xl p-3 md:p-4 overflow-y-auto max-h-[350px] sm:max-h-[400px] lg:max-h-none">
                <h3 className="text-xs md:text-sm font-semibold text-slate-300 mb-3 md:mb-4 sticky top-0 bg-slate-900/95 py-2 backdrop-blur-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-slate-500" />
                  Tenencias
                  <span className="text-[10px] font-normal text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded-full ml-auto">
                    {portfolio.assets.length}
                  </span>
                </h3>
                <div className="space-y-2 md:space-y-3">
                  {portfolio.assets.map((asset) => {
                    const assetCurrency = (asset.currency === 'USD' ? 'USD' : 'ARS') as 'ARS' | 'USD';
                    return (
                      <div key={asset.id} className="flex items-center justify-between p-2.5 md:p-3 rounded-lg bg-slate-900 border border-slate-800/60 hover:border-slate-700 transition-colors">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-200">{asset.ticker}</span>
                            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${
                              assetCurrency === 'USD' 
                                ? 'bg-sky-500/10 text-sky-400' 
                                : 'bg-emerald-500/10 text-emerald-400'
                            }`}>
                              {assetCurrency}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">{asset.quantity} × {formatTickerCurrency(asset.lastPrice, asset.ticker, asset.currency)}</div>
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
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-12 md:py-16 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 text-slate-500">
            <TrendingUp className="h-8 w-8 mb-3 opacity-50" />
            <p className="text-sm">No tienes inversiones registradas.</p>
            <p className="text-xs mt-1 mb-4">Agrega tu primer activo para trackear tu portafolio.</p>
            <CreateInvestmentDialog />
          </div>
        )}
      </main>
    </div>
  );
}
