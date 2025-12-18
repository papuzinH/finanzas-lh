'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useFinanceStore } from '@/lib/store/financeStore';
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  Wallet, 
  CreditCard, 
  CalendarClock, 
  TrendingUp,
  PieChart as PieChartIcon,
  Info
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatCurrency } from '@/lib/utils';
import { TransactionItem } from '@/components/shared/transaction-item';
import { Modal } from '@/components/shared/modal';
import { FullPageLoader } from '@/components/shared/loader';

const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1'];

export default function DashboardPage() {
  const [isInstallmentsModalOpen, setIsInstallmentsModalOpen] = useState(false);
  const [isFixedCostsModalOpen, setIsFixedCostsModalOpen] = useState(false);

  // Conectamos con el Store Global
  const { 
    transactions, 
    paymentMethods,
    isLoading, 
    isInitialized, 
    fetchAllData,
    getGlobalBalance,
    getMonthlyBurnRate,
    getCurrentMonthInstallmentsTotal,
    getCurrentMonthInstallments,
    getActiveRecurringPlans,
    getGlobalIncome,
    getGlobalEffectiveExpenses,
    getExpensesByCategory,
    user
  } = useFinanceStore();

  // Fetch inicial si no hay datos
  useEffect(() => {
    if (!isInitialized) {
      fetchAllData();
    }
  }, [isInitialized, fetchAllData]);

  // --- CÁLCULOS PARA LA VISTA ---
  
  const globalBalance = getGlobalBalance();
  const monthlyBurnRate = getMonthlyBurnRate();
  const currentMonthInstallments = getCurrentMonthInstallmentsTotal();
  const currentMonthInstallmentsList = getCurrentMonthInstallments();
  const activeRecurringPlans = getActiveRecurringPlans();
  const totalIncome = getGlobalIncome();
  const totalExpense = getGlobalEffectiveExpenses();

  // Datos para el Gráfico 1: Gastos Globales por Categoría
  const globalExpenses = getExpensesByCategory('global');
  const globalChartData = Object.entries(globalExpenses)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  // Datos para el Gráfico 2: Gastos del Mes Actual por Categoría
  const currentMonthExpenses = getExpensesByCategory('current_month');
  const currentMonthChartData = Object.entries(currentMonthExpenses)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  if (isLoading && !isInitialized) {
    return <FullPageLoader text="Cargando finanzas..." />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto max-w-[1440px] px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">Hola, {user?.first_name || 'Usuario'} 👋</h1>
       
          </div>
          <div className="h-8 w-8 rounded-full bg-slate-800 border border-slate-700" />
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-6 py-6 space-y-6">
        
        {/* SECCIÓN A: ESTADO PATRIMONIAL (Bento Grid) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 1: Balance Principal (Ocupa 2 columnas) */}
          <div className="col-span-2 rounded-2xl bg-linear-to-br from-slate-900 to-slate-950 border border-slate-800 p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Wallet className="w-24 h-24 text-emerald-500" />
            </div>
            
            <div className="flex items-center gap-2 mb-1 relative z-10">
              <p className="text-sm text-slate-400 font-medium">Balance Actual</p>
              <div className="group/tooltip relative">
                <Info className="w-4 h-4 text-slate-500 cursor-help hover:text-slate-300 transition-colors" />
                <div className="absolute left-0 top-6 w-64 p-3 bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-xl shadow-2xl opacity-0 group-hover/tooltip:opacity-100 transition-all duration-200 pointer-events-none z-50 text-xs text-slate-300 translate-y-2 group-hover/tooltip:translate-y-0">
                  <p className="font-bold text-slate-100 mb-2 border-b border-slate-700 pb-1">Cálculo del Balance</p>
                  <div className="space-y-1 font-mono">
                    <div className="flex justify-between">
                      <span>Ingresos Totales</span>
                      <span className="text-emerald-400">+</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Gastos Efectivos</span>
                      <span className="text-red-400">-</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cuotas este mes</span>
                      <span className="text-red-400">-</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Fijos Mensuales</span>
                      <span className="text-red-400">-</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <h2 className={`text-4xl font-bold font-mono tracking-tighter relative z-10 ${globalBalance >= 0 ? 'text-white' : 'text-red-400'}`}>
              {formatCurrency(globalBalance)}
            </h2>
            <div className="flex gap-4 mt-4">
              <div className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-md">
                <ArrowUpRight className="w-3 h-3" />
                <span>Ingresos {formatCurrency(totalIncome)}</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded-md">
                <ArrowDownRight className="w-3 h-3" />
                <span>Gastos {formatCurrency(totalExpense)}</span>
              </div>
            </div>
          </div>

          {/* Card 2: Deuda Cuotas (Solo Mes Actual) */}
          <div 
            onClick={() => setIsInstallmentsModalOpen(true)}
            className="col-span-1 rounded-2xl bg-slate-900/50 border border-slate-800 p-4 flex flex-col justify-between cursor-pointer hover:bg-slate-800/50 transition-colors"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
                <CreditCard className="w-4 h-4" />
              </div>
              <span className="text-xs font-medium text-slate-300">Cuotas este mes</span>
            </div>
            <div>
              <p className="text-lg font-bold font-mono text-slate-100">{formatCurrency(currentMonthInstallments)}</p>
              <p className="text-[10px] text-slate-500">A pagar en el ciclo actual</p>
            </div>
          </div>

          {/* Card 3: Costo Fijo (Burn Rate) */}
          <div 
            onClick={() => setIsFixedCostsModalOpen(true)}
            className="col-span-1 rounded-2xl bg-slate-900/50 border border-slate-800 p-4 flex flex-col justify-between cursor-pointer hover:bg-slate-800/50 transition-colors"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                <CalendarClock className="w-4 h-4" />
              </div>
              <span className="text-xs font-medium text-slate-300">Fijos Mensuales</span>
            </div>
            <div>
              <p className="text-lg font-bold font-mono text-slate-100">{formatCurrency(monthlyBurnRate)}</p>
              <p className="text-[10px] text-slate-500">Suscripciones activas</p>
            </div>
          </div>
        </div>

        {/* SECCIÓN B: ANÁLISIS VISUAL (Charts) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Gráfico 1: Gastos Globales */}
          <div className="col-span-1 lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/30 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-slate-500" />
                Gastos Globales
              </h3>
            </div>
            <div className="h-40 w-full flex items-center">
              <div className="w-1/2 h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={globalChartData}
                      innerRadius={30}
                      outerRadius={50}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {globalChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', fontSize: '12px' }}
                      itemStyle={{ color: '#e2e8f0' }}
                      formatter={(value: number) => formatCurrency(value)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-1/2 pl-2 space-y-1.5">
                {globalChartData.map((item, index) => (
                  <div key={item.name} className="flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="text-slate-400 truncate max-w-[60px]">{item.name}</span>
                    </div>
                    <span className="font-mono text-slate-300">{formatCurrency(item.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Gráfico 2: Gastos del Mes */}
          <div className="col-span-1 lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/30 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-slate-500" />
                Gastos este Mes
              </h3>
            </div>
            {currentMonthChartData.length > 0 ? (
              <div className="h-40 w-full flex items-center">
                <div className="w-1/2 h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={currentMonthChartData}
                        innerRadius={30}
                        outerRadius={50}
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                      >
                        {currentMonthChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', fontSize: '12px' }}
                        itemStyle={{ color: '#e2e8f0' }}
                        formatter={(value: number) => formatCurrency(value)}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-1/2 pl-2 space-y-1.5">
                  {currentMonthChartData.map((item, index) => (
                    <div key={item.name} className="flex items-center justify-between text-[10px]">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                        <span className="text-slate-400 truncate max-w-[60px]">{item.name}</span>
                      </div>
                      <span className="font-mono text-slate-300">{formatCurrency(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center text-xs text-slate-500 italic">
                Sin gastos este mes
              </div>
            )}
          </div>

        </div>

        {/* SECCIÓN C: ÚLTIMOS MOVIMIENTOS */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-200">Últimos movimientos</h3>
            <Link href="/movimientos" className="text-xs text-indigo-400 cursor-pointer hover:text-indigo-300 transition-colors">Ver todos</Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {transactions
              .filter(t => !t.installment_plan_id)
              .slice(0, 6)
              .map((t) => {
              const paymentMethod = paymentMethods.find(pm => pm.id === t.payment_method_id);
              return (
                <TransactionItem 
                  key={t.id} 
                  transaction={t} 
                  paymentMethodName={paymentMethod?.name}
                  paymentMethodType={paymentMethod?.type}
                  showDate={true}
                />
              );
            })}
          </div>
        </div>

      </main>

      <Modal
        isOpen={isInstallmentsModalOpen}
        onClose={() => setIsInstallmentsModalOpen(false)}
        title="Cuotas a pagar este mes"
      >
        <div className="space-y-3">
          {currentMonthInstallmentsList.length > 0 ? (
            currentMonthInstallmentsList.map((t) => {
              const paymentMethod = paymentMethods.find(pm => pm.id === t.payment_method_id);
              return (
                <TransactionItem 
                  key={t.id} 
                  transaction={t} 
                  paymentMethodName={paymentMethod?.name}
                  paymentMethodType={paymentMethod?.type}
                  showDate={true}
                />
              );
            })
          ) : (
            <p className="text-slate-500 text-center py-4">No hay cuotas para este mes.</p>
          )}
        </div>
      </Modal>
      <Modal
        isOpen={isFixedCostsModalOpen}
        onClose={() => setIsFixedCostsModalOpen(false)}
        title="Gastos Fijos Mensuales"
      >
        <div className="space-y-3">
          {activeRecurringPlans.length > 0 ? (
            activeRecurringPlans.map((plan) => {
              const paymentMethod = paymentMethods.find(pm => pm.id === plan.payment_method_id);
              // Adaptamos el plan a la estructura de TransactionItem
              const adaptedTransaction = {
                id: plan.id,
                amount: plan.amount,
                description: plan.description,
                date: new Date().toISOString(), // Fecha dummy, no se muestra
                category_id: plan.category_id,
                type: 'expense' as const,
                payment_method_id: plan.payment_method_id
              };

              return (
                <TransactionItem 
                  key={plan.id} 
                  transaction={adaptedTransaction} 
                  paymentMethodName={paymentMethod?.name}
                  paymentMethodType={paymentMethod?.type}
                  showDate={false}
                />
              );
            })
          ) : (
            <p className="text-slate-500 text-center py-4">No hay gastos fijos activos.</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
