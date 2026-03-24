"use client"

import { LucideIcon } from "lucide-react"
import { AreaChart, Area } from "recharts"
import { cn } from "@/lib/utils"
import { useFinanceStore } from "@/lib/store/financeStore"

type SparklineType = 'income' | 'variable' | 'installments' | 'fixed'

interface MetricItemProps {
  label: string
  value: string
  sublabel?: string
  color?: "emerald" | "rose" | "amber" | "indigo" | "blue"
  icon?: LucideIcon
  onClick?: () => void
  sparklineType?: SparklineType
}

export function MetricRow({ items }: { items: [MetricItemProps, MetricItemProps] }) {
  return (
    <div className="col-span-2 grid grid-cols-2 gap-3">
      {items.map((item, i) => (
        <MetricCard key={i} {...item} />
      ))}
    </div>
  )
}

const strokeColorMap: Record<string, string> = {
  emerald: "#34d399",
  rose: "#fb7185",
  amber: "#fbbf24",
  indigo: "#818cf8",
  blue: "#60a5fa",
}

function MetricCard({ label, value, sublabel, color = "emerald", icon: Icon, onClick, sparklineType }: MetricItemProps) {
  const colorMap = {
    emerald: "text-emerald-400",
    rose: "text-rose-400",
    amber: "text-amber-400",
    indigo: "text-indigo-400",
    blue: "text-blue-400",
  }

  const getWeeklySnapshot = useFinanceStore((s) => s.getWeeklySnapshot)
  const rawData = sparklineType ? getWeeklySnapshot(sparklineType) : []
  const hasData = rawData.some((v) => v > 0)
  const chartData = rawData.map((v) => ({ v }))
  const strokeColor = hasData ? strokeColorMap[color] : "#475569"
  const fillColor = hasData ? strokeColorMap[color] : "#475569"

  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      className={cn(
        "rounded-xl bg-[var(--surface-raised)]/50 border border-slate-800 p-3.5 space-y-2 text-left w-full",
        onClick && "cursor-pointer hover:bg-slate-800/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{label}</span>
        {Icon && <Icon className={cn("h-3.5 w-3.5", colorMap[color])} aria-hidden />}
      </div>
      <p className={cn("text-base font-semibold", colorMap[color])}>{value}</p>
      {sparklineType && (
        <div role="img" aria-label={`Gráfico de ${label}`}>
          <AreaChart
            width={60}
            height={24}
            data={chartData}
            margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
          >
            <Area
              type="monotone"
              dataKey="v"
              stroke={strokeColor}
              strokeWidth={1.5}
              dot={false}
              fill={fillColor}
              fillOpacity={0.1}
              isAnimationActive={false}
            />
          </AreaChart>
        </div>
      )}
      {sublabel && <p className="text-xs text-slate-400">{sublabel}</p>}
    </Tag>
  )
}
