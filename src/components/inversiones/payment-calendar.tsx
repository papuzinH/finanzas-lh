'use client'

import { useMemo } from 'react'
import { Landmark, CircleDollarSign, Clock, Calendar } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { useFinanceStore } from '@/lib/store/financeStore'
import { parseLocalDate } from '@/lib/utils/dates'
import { cn } from '@/lib/utils'

type PaymentType = 'coupon' | 'dividend' | 'maturity'

type PaymentEvent = {
  ticker: string
  assetName: string
  paymentType: PaymentType
  date: string
  estimatedAmount: number
  currency: string
}

const BOND_TYPES = new Set(['bond', 'on', 'bopreal', 'lecap', 'boncap'])
const EQUITY_TYPES = new Set(['stock', 'cedear', 'etf', 'fci'])
const FIXED_TERM_TYPES = new Set(['plazo_fijo', 'money_market'])

function resolvePaymentType(assetType: string): PaymentType {
  if (EQUITY_TYPES.has(assetType)) return 'dividend'
  if (FIXED_TERM_TYPES.has(assetType)) return 'maturity'
  if (BOND_TYPES.has(assetType)) return 'coupon'
  return 'coupon'
}

const PAYMENT_CONFIG: Record<PaymentType, { label: string; icon: React.ElementType; color: string; dot: string }> = {
  coupon:   { label: 'Cupón',       icon: Landmark,          color: 'text-violet-400',  dot: 'bg-violet-500' },
  dividend: { label: 'Dividendo',   icon: CircleDollarSign,  color: 'text-emerald-400', dot: 'bg-emerald-500' },
  maturity: { label: 'Vencimiento', icon: Clock,             color: 'text-amber-400',   dot: 'bg-amber-500' },
}

const fmtCurrency = (n: number, currency = 'ARS') =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: ['ARS', 'USD'].includes(currency) ? currency : 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)

const fmtShortDate = (iso: string) =>
  parseLocalDate(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })

const getMonthLabel = (iso: string) =>
  parseLocalDate(iso).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })

export function PaymentCalendar() {
  const { getUpcomingPayments, investmentAssets, investmentTransactions } = useFinanceStore()

  const events = useMemo<PaymentEvent[]>(() => {
    const now = new Date()
    const cutoff = new Date(now.getTime() + 90 * 86400000)

    // 1. Coupons / dividends from market_prices (next_coupon_date)
    const fromMarket: PaymentEvent[] = getUpcomingPayments(90).map((p) => ({
      ticker: p.ticker,
      assetName: p.assetName,
      paymentType: resolvePaymentType(p.type),
      date: p.date,
      estimatedAmount: p.estimatedAmount,
      currency: p.currency,
    }))

    // 2. Plazo fijo / money_market vencimientos from asset metadata
    const maturities: PaymentEvent[] = investmentAssets
      .filter((a) => FIXED_TERM_TYPES.has(a.asset_type) && a.is_active)
      .flatMap((a) => {
        const meta = a.metadata as Record<string, unknown>
        const endDateStr = typeof meta.end_date === 'string' ? meta.end_date : null
        if (!endDateStr) return []

        const endDate = parseLocalDate(endDateStr)
        if (endDate < now || endDate > cutoff) return []

        const txs = investmentTransactions.filter((t) => t.asset_id === a.id)
        const buys = txs.filter((t) => t.type === 'buy')
        const sells = txs.filter((t) => t.type === 'sell')
        const totalBuyQty = buys.reduce((s, t) => s + Number(t.quantity), 0)
        const totalSellQty = sells.reduce((s, t) => s + Number(t.quantity), 0)
        const position = Math.max(totalBuyQty - totalSellQty, 0)
        const totalBuyCost = buys.reduce((s, t) => s + Number(t.quantity) * Number(t.price_per_unit), 0)
        const ppc = totalBuyQty > 0 ? totalBuyCost / totalBuyQty : 0

        const tna = typeof meta.tna === 'number' ? meta.tna : 0
        const startStr = typeof meta.start_date === 'string' ? meta.start_date : null
        let estimatedAmount = position * ppc

        if (tna > 0 && startStr) {
          const startD = parseLocalDate(startStr)
          const days = (endDate.getTime() - startD.getTime()) / 86400000
          estimatedAmount = totalBuyCost * (1 + tna * (days / 365))
        }

        return [{
          ticker: a.ticker,
          assetName: a.name,
          paymentType: 'maturity' as const,
          date: endDateStr,
          estimatedAmount,
          currency: a.currency ?? 'ARS',
        }]
      })

    return [...fromMarket, ...maturities].sort((a, b) => a.date.localeCompare(b.date))
  }, [getUpcomingPayments, investmentAssets, investmentTransactions])

  const grouped = useMemo(() => {
    const map = new Map<string, PaymentEvent[]>()
    for (const e of events) {
      const key = getMonthLabel(e.date)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e)
    }
    return map
  }, [events])

  const now = new Date()
  const thisMonthKey = getMonthLabel(now.toISOString().slice(0, 10))
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const nextMonthKey = getMonthLabel(nextMonth.toISOString().slice(0, 10))
  const thisMonthTotal = (grouped.get(thisMonthKey) ?? []).reduce((s, e) => s + e.estimatedAmount, 0)
  const nextMonthTotal = (grouped.get(nextMonthKey) ?? []).reduce((s, e) => s + e.estimatedAmount, 0)

  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-800 py-16 text-center flex flex-col items-center gap-3">
        <Calendar className="h-16 w-16 text-slate-700" />
        <h3 className="text-base font-semibold text-slate-400">No tenés cobros programados</h3>
        <p className="text-slate-500 text-sm max-w-xs">
          Cargá bonos o plazos fijos para verlos acá.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <Card className="bg-slate-900/40 border-slate-800 p-4">
        <p className="text-[10px] uppercase font-medium text-slate-500 tracking-wider mb-3">Próximos cobros</p>
        <div className="flex gap-6 flex-wrap">
          {thisMonthTotal > 0 && (
            <div>
              <p className="text-[10px] text-slate-500 mb-0.5">Este mes</p>
              <p className="text-lg font-bold text-emerald-400 font-mono">{fmtCurrency(thisMonthTotal)}</p>
            </div>
          )}
          {nextMonthTotal > 0 && (
            <div>
              <p className="text-[10px] text-slate-500 mb-0.5">Próximo mes</p>
              <p className="text-lg font-bold text-slate-200 font-mono">{fmtCurrency(nextMonthTotal)}</p>
            </div>
          )}
          {thisMonthTotal === 0 && nextMonthTotal === 0 && (
            <p className="text-sm text-slate-500">Los cobros están programados en meses posteriores</p>
          )}
        </div>
      </Card>

      {/* Mobile: list grouped by month */}
      <div className="md:hidden space-y-5">
        {Array.from(grouped.entries()).map(([month, monthEvents]) => (
          <div key={month}>
            <p className="text-[10px] font-semibold uppercase text-slate-500 tracking-widest mb-2 px-1 capitalize">{month}</p>
            <div className="space-y-2">
              {monthEvents.map((event, i) => {
                const cfg = PAYMENT_CONFIG[event.paymentType]
                const Icon = cfg.icon
                return (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/40 border border-slate-800">
                    <div className={cn('p-2 rounded-lg bg-slate-800 shrink-0', cfg.color)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-100">{event.ticker}</span>
                        <span className={cn('text-[10px] font-medium', cfg.color)}>{cfg.label}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">{event.assetName}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-mono font-bold text-slate-100">{fmtCurrency(event.estimatedAmount, event.currency)}</p>
                      <p className="text-[10px] text-slate-500">{fmtShortDate(event.date)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: timeline vertical */}
      <div className="hidden md:block space-y-6">
        {Array.from(grouped.entries()).map(([month, monthEvents]) => (
          <div key={month}>
            <p className="text-[10px] font-semibold uppercase text-slate-500 tracking-widest mb-3 capitalize">{month}</p>
            <div className="relative pl-6 border-l border-slate-800 space-y-3">
              {monthEvents.map((event, i) => {
                const cfg = PAYMENT_CONFIG[event.paymentType]
                const Icon = cfg.icon
                return (
                  <div key={i} className="relative flex items-center gap-4">
                    <div className={cn('absolute -left-[25px] h-3 w-3 rounded-full border-2 border-slate-950 shrink-0', cfg.dot)} />
                    <div className="flex items-center gap-4 p-3 rounded-xl bg-slate-900/40 border border-slate-800 flex-1">
                      <div className={cn('p-2 rounded-lg bg-slate-800 shrink-0', cfg.color)}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-100">{event.ticker}</span>
                          <span className={cn('text-[10px] font-medium', cfg.color)}>{cfg.label}</span>
                          <span className="text-[11px] text-slate-500 truncate">{event.assetName}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-mono font-bold text-slate-100">{fmtCurrency(event.estimatedAmount, event.currency)}</p>
                        <p className="text-[10px] text-slate-500">{fmtShortDate(event.date)}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
