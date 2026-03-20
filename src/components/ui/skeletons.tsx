"use client"

import { cn } from "@/lib/utils"

// Base skeleton shimmer
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-slate-800/60",
        className
      )}
      {...props}
    />
  )
}

// Skeleton para el card de balance principal (card grande full-width)
export function BalanceCardSkeleton() {
  return (
    <div className="col-span-2 lg:col-span-4 rounded-2xl bg-slate-900/50 border border-slate-800 p-6 space-y-4">
      <div className="flex justify-between items-start">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="h-10 w-48" />
      <div className="flex gap-4">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  )
}

// Skeleton para cards de métricas pequeñas (income, expenses, etc.)
export function MetricCardSkeleton() {
  return (
    <div className="rounded-2xl bg-slate-900/50 border border-slate-800 p-4 space-y-3">
      <div className="flex justify-between items-center">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-6 w-6 rounded-full" />
      </div>
      <Skeleton className="h-7 w-28" />
      <Skeleton className="h-2 w-full" />
    </div>
  )
}

// Skeleton para transacciones recientes
export function TransactionItemSkeleton() {
  return (
    <div className="flex items-center gap-3 py-2">
      <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-4 w-16" />
    </div>
  )
}

// Skeleton para el chart de categorías
export function ChartSkeleton() {
  return (
    <div className="rounded-2xl bg-slate-900/30 border border-slate-800 p-4 space-y-3">
      <Skeleton className="h-4 w-32" />
      <div className="flex items-center justify-center h-40">
        <Skeleton className="h-40 w-40 rounded-full" />
      </div>
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-3 w-3 rounded-full" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-12 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}

// Dashboard completo skeleton — lo que se muestra mientras carga
export function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto max-w-[1440px] px-4 md:px-6 py-4 flex justify-between items-center">
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
          </div>
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-[1440px] px-4 md:px-6 py-6 space-y-6 animate-in fade-in duration-200">
        {/* SECCIÓN A: ESTADO PATRIMONIAL (Bento Grid) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <BalanceCardSkeleton />
          <MetricCardSkeleton />
          <MetricCardSkeleton />
          <MetricCardSkeleton />
          <MetricCardSkeleton />
        </div>

        {/* SECCIÓN B: CHARTS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="col-span-1 lg:col-span-2">
            <ChartSkeleton />
          </div>
          <div className="col-span-1 lg:col-span-2">
            <ChartSkeleton />
          </div>
        </div>

        {/* SECCIÓN C: TRANSACCIONES */}
        <div>
          <div className="mb-3">
            <Skeleton className="h-5 w-32" />
          </div>
          <div className="rounded-2xl bg-slate-900/30 border border-slate-800 p-5 space-y-1">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <TransactionItemSkeleton key={i} />
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
