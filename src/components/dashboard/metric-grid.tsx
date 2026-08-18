"use client"

import { LucideIcon } from "lucide-react"
import { AreaChart, Area, ResponsiveContainer } from "recharts"
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

export function MetricGrid({ items, className }: { items: MetricItemProps[]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 lg:grid-cols-4 gap-3", className)}>
      {items.map((item, i) => (
        <MetricCard key={i} {...item} />
      ))}
    </div>
  )
}

const strokeColorMap: Record<string, string> = {
  emerald: "var(--good)",
  rose: "var(--bad)",
  amber: "var(--warn)",
  indigo: "var(--accent)",
  blue: "var(--accent)",
}

function MetricCard({ label, value, sublabel, color = "emerald", icon: Icon, onClick, sparklineType }: MetricItemProps) {
  const colorMap: Record<string, string> = {
    emerald: "text-good",
    rose: "text-bad",
    amber: "text-warn",
    indigo: "text-accent",
    blue: "text-accent",
  }

  const getWeeklySnapshot = useFinanceStore((s) => s.getWeeklySnapshot)
  const rawData = sparklineType ? getWeeklySnapshot(sparklineType) : []
  const hasData = rawData.some((v) => v > 0)
  const chartData = rawData.map((v) => ({ v }))
  const strokeColor = hasData ? strokeColorMap[color] : "var(--muted)"
  const fillColor = hasData ? strokeColorMap[color] : "var(--muted)"

  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      className={cn(
        "rounded-xl bg-surface border-[1.5px] border-border p-4 space-y-1.5 text-left w-full",
        onClick && "cursor-pointer hover:bg-surface-2/60 active:scale-[0.98] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">{label}</span>
        {Icon && <Icon className={cn("h-4 w-4", colorMap[color])} aria-hidden />}
      </div>
      <p className={cn("font-display tnum text-xl leading-tight truncate", colorMap[color])}>{value}</p>
      {sparklineType && (
        <div role="img" aria-label={`Gráfico de ${label}`} className="w-full">
          <ResponsiveContainer width="100%" height={24}>
            <AreaChart
              data={chartData}
              margin={{ top: 2, right: 0, left: 0, bottom: 0 }}
            >
              <Area
                type="monotone"
                dataKey="v"
                stroke={strokeColor}
                strokeWidth={1.5}
                dot={false}
                fill={fillColor}
                fillOpacity={0.12}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {sublabel && <p className="text-xs text-muted">{sublabel}</p>}
    </Tag>
  )
}
