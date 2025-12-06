import { cn } from "@/lib/utils";
import { ReactNode } from "react";

type StatusVariant = 'success' | 'warning' | 'error' | 'neutral' | 'info';

interface StatusBadgeProps {
  variant?: StatusVariant;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}

const variants = {
  success: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  warning: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  error: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  neutral: "bg-slate-800/50 text-slate-400 border-slate-700/50",
  info: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
};

export function StatusBadge({ variant = 'neutral', children, icon, className }: StatusBadgeProps) {
  return (
    <span className={cn(
      "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border",
      variants[variant],
      className
    )}>
      {icon && <span className="h-3.5 w-3.5 flex items-center justify-center">{icon}</span>}
      {children}
    </span>
  );
}
