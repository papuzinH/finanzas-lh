"use client"

import { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface MetricItemProps {
  label: string
  value: string
  sublabel?: string
  color?: "emerald" | "rose" | "amber" | "indigo" | "blue"
  icon?: LucideIcon
  onClick?: () => void
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

function MetricCard({ label, value, sublabel, color = "emerald", icon: Icon, onClick }: MetricItemProps) {
  const colorMap = {
    emerald: "text-emerald-400",
    rose: "text-rose-400",
    amber: "text-amber-400",
    indigo: "text-indigo-400",
    blue: "text-blue-400",
  }

  const bgColorMap = {
    emerald: "bg-emerald-500/10",
    rose: "bg-rose-500/10",
    amber: "bg-amber-500/10",
    indigo: "bg-indigo-500/10",
    blue: "bg-blue-500/10",
  }

  const borderColorMap = {
    emerald: "border-emerald-500/20",
    rose: "border-rose-500/20",
    amber: "border-amber-500/20",
    indigo: "border-indigo-500/20",
    blue: "border-blue-500/20",
  }

  return (
    <div
      className={cn(
        "rounded-xl bg-slate-900/50 border border-slate-800 p-3.5 space-y-2",
        onClick && "cursor-pointer hover:bg-slate-800/50 transition-colors"
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">{label}</span>
        {Icon && <Icon className={cn("h-3.5 w-3.5", colorMap[color])} />}
      </div>
      <p className={cn("text-base font-semibold", colorMap[color])}>{value}</p>
      {sublabel && <p className="text-xs text-slate-600">{sublabel}</p>}
    </div>
  )
}
