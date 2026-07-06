"use client"

import { cn } from "@/lib/utils"

/* -- Base ------------------------------------------------ */

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("skeleton-shimmer rounded-md", className)}
      {...props}
    />
  )
}

/* -- Shared pieces --------------------------------------- */

function PageHeaderSkeleton({ titleWidth = "w-32" }: { titleWidth?: string }) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-bg/80 backdrop-blur-md">
      <div className="mx-auto max-w-[1440px] pl-4 pr-14 md:pl-6 md:pr-14 py-3 md:py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className={cn("h-6", titleWidth)} />
        </div>
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>
    </header>
  )
}

/* -- Dashboard Skeleton ---------------------------------- */

function BalanceCardSkeleton() {
  return (
    <div className="col-span-2 lg:col-span-4 rounded-2xl bg-surface border border-border p-6">
      <div className="flex justify-between items-start">
        <div className="space-y-4 flex-1">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-4" />
          </div>
          <Skeleton className="h-10 w-52" />
          <div className="flex items-center gap-3 mt-3">
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-[72px] w-[72px] rounded-full flex-shrink-0" />
      </div>
      <Skeleton className="h-1 w-full rounded-full mt-4" />
    </div>
  )
}

function InsightsCarouselSkeleton() {
  return (
    <div className="col-span-2 lg:col-span-4 flex flex-col gap-2">
      <div className="rounded-2xl border border-border bg-surface/50 px-4 py-3 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <div className="flex items-center justify-center gap-1.5">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-1.5 w-1.5 rounded-full" />
        ))}
      </div>
    </div>
  )
}

function MetricCardSkeleton() {
  return (
    <div className="rounded-xl bg-surface/50 border border-border p-3.5 space-y-2">
      <Skeleton className="h-3 w-20" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-3.5 w-3.5 rounded-sm" />
      </div>
      <Skeleton className="h-6 w-[60px] rounded-sm" />
      <Skeleton className="h-3 w-16" />
    </div>
  )
}

function TrendChartSkeleton() {
  return (
    <div className="col-span-full rounded-2xl border border-border bg-surface/30 p-5 space-y-3">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-[200px] w-full rounded-lg" />
    </div>
  )
}

function PieChartSkeleton() {
  return (
    <div className="rounded-2xl bg-surface/30 border border-border p-5 space-y-3">
      <Skeleton className="h-4 w-32" />
      <div className="flex items-center h-40">
        <div className="w-1/2 flex justify-center">
          <Skeleton className="h-[100px] w-[100px] rounded-full" />
        </div>
        <div className="w-1/2 pl-2 space-y-1.5">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-3 w-3 rounded-full" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-10 ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function TransactionItemSkeleton() {
  return (
    <div className="rounded-xl border border-border/40 bg-surface/20 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 overflow-hidden flex-1">
          <Skeleton className="h-10 w-10 min-w-[2.5rem] rounded-full flex-shrink-0" />
          <div className="flex flex-col min-w-0 gap-1.5 flex-1">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 pl-2">
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-2.5 w-12" />
        </div>
      </div>
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-bg text-text pb-24">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/80 backdrop-blur-md">
        <div className="mx-auto max-w-[1440px] px-4 md:px-6 py-4 flex justify-between items-center">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 md:px-6 py-6 space-y-6">
        {/* SECCION A: Bento Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <BalanceCardSkeleton />
          <InsightsCarouselSkeleton />
          <div className="col-span-2 grid grid-cols-2 gap-3">
            <MetricCardSkeleton />
            <MetricCardSkeleton />
          </div>
          <div className="col-span-2 grid grid-cols-2 gap-3">
            <MetricCardSkeleton />
            <MetricCardSkeleton />
          </div>
        </div>

        {/* SECCION C: Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <TrendChartSkeleton />
          <div className="col-span-1 lg:col-span-2">
            <PieChartSkeleton />
          </div>
          <div className="col-span-1 lg:col-span-2">
            <PieChartSkeleton />
          </div>
        </div>

        {/* SECCION D: Transacciones recientes */}
        <div>
          <Skeleton className="h-5 w-32 mb-3" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <TransactionItemSkeleton key={i} />
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}

/* -- Transactions List Skeleton -------------------------- */

export function TransactionListSkeleton() {
  return (
    <div className="min-h-screen bg-bg text-text font-sans pb-24">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur-md">
        <div className="mx-auto max-w-[1440px] px-4">
          <div className="py-2 flex flex-col md:flex-row justify-between items-center gap-2 md:gap-0">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-6 w-36" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-9 w-24 rounded-lg" />
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pt-2 pb-1 scrollbar-hide">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-7 w-24 rounded-full flex-shrink-0" />
            ))}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-7 w-20 rounded-full flex-shrink-0" />
            ))}
          </div>

          <div className="pb-3">
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-6">
        <div className="flex items-center gap-2 mb-3 px-1">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-8 rounded-full" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <TransactionItemSkeleton key={i} />
          ))}
        </div>

        <div className="flex items-center gap-2 mb-3 mt-6 px-1">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-5 w-6 rounded-full" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map(i => (
            <TransactionItemSkeleton key={i} />
          ))}
        </div>
      </main>
    </div>
  )
}

/* -- Installments (Cuotas) Skeleton ---------------------- */

function InstallmentPlanCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface/50 p-5 flex flex-col justify-between">
      <div className="flex items-start justify-between mb-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
          <div className="flex flex-wrap gap-2 mt-3">
            <Skeleton className="h-6 w-20 rounded-md" />
            <Skeleton className="h-6 w-20 rounded-md" />
          </div>
        </div>
        <div className="flex flex-col items-end ml-4 gap-1">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-6 w-6 rounded-md" />
        </div>
      </div>

      <Skeleton className="h-2 w-full rounded-full mb-4" />

      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-24 rounded-full" />
        <div className="text-right space-y-1">
          <Skeleton className="h-3 w-20 ml-auto" />
          <Skeleton className="h-6 w-24 ml-auto" />
        </div>
      </div>
    </div>
  )
}

export function InstallmentsSkeleton() {
  return (
    <div className="min-h-screen bg-bg text-text font-sans pb-24">
      <PageHeaderSkeleton titleWidth="w-28" />

      <main className="mx-auto max-w-[1440px] px-4 md:px-6 py-6 md:py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
          {[1, 2].map(i => (
            <div key={i} className="rounded-xl border border-accent/20 bg-accent/5 p-6 flex flex-col items-center gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4].map(i => (
            <InstallmentPlanCardSkeleton key={i} />
          ))}
        </div>
      </main>
    </div>
  )
}

/* -- Subscriptions (Mensualidades) Skeleton -------------- */

function SubscriptionCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface/40 p-4 flex flex-col justify-between">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-16 rounded-full" />
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Skeleton className="h-4 w-16" />
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-1.5 w-1.5 rounded-full" />
            <Skeleton className="h-2.5 w-10" />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-border/50">
        <Skeleton className="h-5 w-24 rounded-md" />
        <Skeleton className="h-6 w-6 rounded-md" />
      </div>
    </div>
  )
}

export function SubscriptionsSkeleton() {
  return (
    <div className="min-h-screen bg-bg text-text font-sans pb-24">
      <PageHeaderSkeleton titleWidth="w-36" />

      <main className="mx-auto max-w-[1440px] px-4 md:px-6 py-6 md:py-8">
        <div className="mb-8 rounded-2xl border border-border bg-surface/50 p-8">
          <div className="text-center space-y-3">
            <Skeleton className="h-4 w-40 mx-auto" />
            <Skeleton className="h-10 w-48 mx-auto" />
            <Skeleton className="h-3 w-32 mx-auto" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <SubscriptionCardSkeleton key={i} />
          ))}
        </div>
      </main>
    </div>
  )
}