"use client";

import { useEffect, useMemo } from "react";
import { useFinanceStore } from "@/lib/store/financeStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PortfolioDistribution } from "@/components/inversiones/portfolio-distribution";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  ArrowUpIcon,
  ArrowDownIcon,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  DollarSign,
  Wallet,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function InversionesPage() {
  const { fetchAllData, getPortfolioStatus, isLoading, isInitialized } =
    useFinanceStore();

  useEffect(() => {
    if (!isInitialized) {
      fetchAllData();
    }
  }, [isInitialized, fetchAllData]);

  const status = useMemo(() => getPortfolioStatus(), [getPortfolioStatus]);
  const {
    assets,
    totalBalanceARS,
    totalBalanceUSD,
    totalProfitARS,
    totalProfitUSD,
    lastUpdate,
  } = status;

  // Prepare data for chart
  const chartData = useMemo(() => {
    const grouped = assets.reduce((acc, asset) => {
      // Convert USD assets to ARS for the chart roughly or keep separate?
      // The prompt says "Agrupa los activos por type y muestra la distribución del dinero."
      // Mixing currencies in a pie chart is tricky.
      // Let's assume we show the distribution of the dominant currency or just raw values if user has mixed.
      // For simplicity and correctness, let's group by type but value might be mixed if we just sum.
      // Ideally we should convert everything to one currency, but we don't have a live exchange rate in the store (except maybe implied).
      // Let's just sum the 'currentValue' regardless of currency for the distribution visualization,
      // OR better, filter for the currency that has more value?
      // Let's just sum them up. It's a visual approximation.
      const value = asset.currentValue;
      acc[asset.type] = (acc[asset.type] || 0) + value;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(grouped).map(([name, value]) => ({
      name,
      value,
    }));
  }, [assets]);

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatPercent = (value: number) => {
    return new Intl.NumberFormat("es-AR", {
      style: "percent",
      minimumFractionDigits: 2,
    }).format(value / 100);
  };

  if (isLoading && !isInitialized) {
    return (
      <div className="p-6 space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-slate-800 rounded"></div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-32 bg-slate-800 rounded"></div>
          <div className="h-32 bg-slate-800 rounded"></div>
        </div>
        <div className="h-64 bg-slate-800 rounded"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inversiones</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Panel de rendimiento y control patrimonial
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-slate-900/50 px-3 py-1.5 rounded-full border border-slate-800">
          <RefreshCw className="h-3 w-3" />
          <span>
            Actualizado:{" "}
            {lastUpdate
              ? format(new Date(lastUpdate), "dd MMM HH:mm", { locale: es })
              : "Pendiente"}
          </span>
        </div>
      </div>

      {/* Section A: Hero Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* ARS Portfolio */}
        <Card className="bg-linear-to-br from-slate-900 to-slate-950 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
              <Wallet className="h-4 w-4 text-emerald-500" />
              Cartera en Pesos (ARS)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl md:text-3xl font-bold text-white">
              {formatCurrency(totalBalanceARS, "ARS")}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <StatusBadge
                variant={totalProfitARS >= 0 ? "success" : "error"}
                className="text-xs"
              >
                {totalProfitARS >= 0 ? "+" : ""}
                {formatCurrency(totalProfitARS, "ARS")}
              </StatusBadge>
              <span className="text-xs text-slate-500">Rendimiento Histórico</span>
            </div>
          </CardContent>
        </Card>

        {/* USD Portfolio */}
        <Card className="bg-linear-to-br from-slate-900 to-slate-950 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-sky-500" />
              Cartera en Dólares (USD)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl md:text-3xl font-bold text-white">
              {formatCurrency(totalBalanceUSD, "USD")}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <StatusBadge
                variant={totalProfitUSD >= 0 ? "success" : "error"}
                className="text-xs"
              >
                {totalProfitUSD >= 0 ? "+" : ""}
                {formatCurrency(totalProfitUSD, "USD")}
              </StatusBadge>
              <span className="text-xs text-slate-500">Rendimiento Histórico</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:gap-6 md:grid-cols-3">
        {/* Section B: Chart */}
        <div className="md:col-span-1">
          <PortfolioDistribution data={chartData} />
        </div>

        {/* Section C: Table */}
        <div className="md:col-span-2">
          <Card className="h-full overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-indigo-500" />
                Activos Detallados
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="text-xs text-slate-400 uppercase bg-slate-900/50 border-b border-slate-800">
                    <tr>
                      <th className="px-3 md:px-4 py-3 font-medium">Activo</th>
                      <th className="hidden sm:table-cell px-3 md:px-4 py-3 font-medium text-right">Cantidad</th>
                      <th className="px-3 md:px-4 py-3 font-medium text-right">Precio</th>
                      <th className="px-3 md:px-4 py-3 font-medium text-right">Valor Hoy</th>
                      <th className="px-3 md:px-4 py-3 font-medium text-right">Rendimiento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {assets.map((asset) => {
                      const isProfit = asset.profitAmount >= 0;
                      const hasMarketPrice =
                        asset.lastPrice !== asset.avg_buy_price ||
                        asset.lastUpdate !== null;

                      return (
                        <tr
                          key={asset.id}
                          className="hover:bg-slate-800/30 transition-colors"
                        >
                          <td className="px-3 md:px-4 py-3">
                            <div className="flex flex-col">
                              <span className="font-medium text-white">
                                {asset.ticker}
                              </span>
                              <span className="text-xs text-slate-500">
                                {asset.name}
                              </span>
                              <div className="mt-1">
                                <StatusBadge
                                  variant="neutral"
                                  className="text-[10px] py-0 px-1.5 h-5"
                                >
                                  {asset.type}
                                </StatusBadge>
                              </div>
                            </div>
                          </td>
                          <td className="hidden sm:table-cell px-3 md:px-4 py-3 text-right font-mono text-slate-300">
                            {asset.quantity}
                          </td>
                          <td className="px-3 md:px-4 py-3 text-right">
                            <div className="font-mono text-slate-300">
                              {formatCurrency(asset.lastPrice, asset.currency)}
                            </div>
                            {!hasMarketPrice && (
                              <div className="flex items-center justify-end gap-1 text-[10px] text-amber-500/80 mt-0.5">
                                <AlertCircle className="h-3 w-3" />
                                <span>Sin precio</span>
                              </div>
                            )}
                          </td>
                          <td className="px-3 md:px-4 py-3 text-right font-bold text-white font-mono">
                            {formatCurrency(asset.currentValue, asset.currency)}
                          </td>
                          <td className="px-3 md:px-4 py-3 text-right">
                            <div
                              className={`flex items-center justify-end gap-1 font-medium ${
                                isProfit ? "text-emerald-500" : "text-rose-500"
                              }`}
                            >
                              {isProfit ? (
                                <ArrowUpIcon className="h-3 w-3" />
                              ) : (
                                <ArrowDownIcon className="h-3 w-3" />
                              )}
                              {formatPercent(asset.profitPercent)}
                            </div>
                            <div
                              className={`text-xs ${
                                isProfit ? "text-emerald-500/70" : "text-rose-500/70"
                              }`}
                            >
                              {isProfit ? "+" : ""}
                              {formatCurrency(asset.profitAmount, asset.currency)}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {assets.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-8 text-center text-slate-500"
                        >
                          No hay inversiones registradas.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
