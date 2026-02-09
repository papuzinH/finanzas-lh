"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useFinanceStore } from "@/lib/store/financeStore";
import { PortfolioDistribution } from "@/components/inversiones/portfolio-distribution";
import { CreateInvestmentDialog } from "@/components/inversiones/create-investment-dialog";
import { SavingsCard } from "@/components/inversiones/savings-card";
import { PageHeader } from "@/components/shared/page-header";
import { TrendingUp, DollarSign, Wallet, RefreshCw, Loader2 } from "lucide-react";
import { FullPageLoader } from "@/components/shared/loader";
import { Button } from "@/components/ui/button";
import { updateMarketPrices } from "@/app/inversiones/actions";
import { toast } from "sonner";

const formatCurrency = (amount: number, currency: 'ARS' | 'USD' = 'ARS') => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
  }).format(amount);
};

export default function InversionesPage() {
  const {
    isInitialized,
    isLoading,
    fetchAllData,
    getPortfolioStatus
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
        currency: asset.currency
      }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [portfolio]);

  const hasInvestments = portfolio.assets.length > 0;

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
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefreshPrices}
          disabled={isRefreshing}
          className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          {isRefreshing ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          {isRefreshing ? 'Actualizando...' : 'Cotizaciones'}
        </Button>
        <CreateInvestmentDialog />
      </PageHeader>

      <main className="mx-auto max-w-[1440px] px-6 py-8 space-y-6">

        {/* Summary Cards */}
        <div className={`grid grid-cols-1 ${hasInvestments ? 'md:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-2'} gap-4`}>

          {/* Savings Card (always visible) */}
          <SavingsCard />

          {hasInvestments && (
            <>
              {/* Total ARS */}
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <DollarSign className="w-16 h-16 text-emerald-500" />
                </div>
                <p className="text-xs font-medium text-emerald-300 uppercase tracking-wider mb-1">Total en Pesos</p>
                <p className="text-3xl font-bold text-white font-mono tracking-tight">
                  {formatCurrency(portfolio.totalBalanceARS)}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                    +{formatCurrency(portfolio.totalProfitARS)} Ganancia
                  </span>
                </div>
              </div>

              {/* Total USD */}
              <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <Wallet className="w-16 h-16 text-sky-500" />
                </div>
                <p className="text-xs font-medium text-sky-300 uppercase tracking-wider mb-1">Total en Dólares</p>
                <p className="text-3xl font-bold text-white font-mono tracking-tight">
                  {formatCurrency(portfolio.totalBalanceUSD, 'USD')}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full">
                    +{formatCurrency(portfolio.totalProfitUSD, 'USD')} Ganancia
                  </span>
                </div>
              </div>

              {/* Last Update */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 flex flex-col justify-center items-center text-center">
                <RefreshCw className="h-8 w-8 text-slate-600 mb-2" />
                <p className="text-slate-400 text-sm">Última cotización</p>
                <p className="text-slate-200 font-mono text-sm mt-1">
                  {portfolio.lastUpdate
                    ? new Date(portfolio.lastUpdate).toLocaleString('es-AR')
                    : 'Esperando mercado...'}
                </p>
              </div>
            </>
          )}
        </div>

        {hasInvestments ? (
          /* Charts and Details */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[500px]">

            {/* Chart */}
            <div className="lg:col-span-2 h-full">
              <PortfolioDistribution data={chartData} />
            </div>

            {/* Assets List */}
            <div className="lg:col-span-1 border border-slate-800 bg-slate-900/40 rounded-xl p-4 overflow-y-auto">
              <h3 className="text-sm font-semibold text-slate-300 mb-4 sticky top-0 bg-slate-900/95 py-2 backdrop-blur-sm">
                Tenencias
              </h3>
              <div className="space-y-3">
                {portfolio.assets.map((asset) => (
                  <div key={asset.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-800/60 hover:border-slate-700 transition-colors">
                    <div>
                      <div className="font-bold text-sm text-slate-200">{asset.ticker}</div>
                      <div className="text-[10px] text-slate-500">{asset.quantity} nominales</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm font-medium text-slate-200">
                        {formatCurrency(asset.currentValue, asset.currency === 'USD' ? 'USD' : 'ARS')}
                      </div>
                      <div className={`text-[10px] ${asset.profitPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {asset.profitPercent >= 0 ? '+' : ''}{asset.profitPercent.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 text-slate-500">
            <TrendingUp className="h-8 w-8 mb-3 opacity-50" />
            <p>No tienes inversiones registradas.</p>
            <p className="text-xs mt-1 mb-4">Agrega tu primer activo para trackear tu portafolio.</p>
            <CreateInvestmentDialog />
          </div>
        )}
      </main>
    </div>
  );
}
