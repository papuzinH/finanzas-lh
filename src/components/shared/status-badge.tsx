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
  success: "bg-good/10 text-good border-good/20",
  warning: "bg-warn/10 text-warn border-warn/20",
  error: "bg-bad/10 text-bad border-bad/20",
  neutral: "bg-surface-2 text-muted border-border",
  info: "bg-accent/10 text-accent-deep border-accent/20",
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
