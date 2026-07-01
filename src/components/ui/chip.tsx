"use client";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";

export function Chip({
  active,
  children,
  onClick,
  icon,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  icon?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2",
        "text-[12.5px] font-bold border-[1.5px] transition-colors cursor-pointer",
        active
          ? "bg-accent text-accent-ink border-accent-deep"
          : "bg-surface text-muted border-border hover:border-accent-soft",
      )}
    >
      {icon && <Icon name={icon} size={14} stroke={2.2} />}
      {children}
    </button>
  );
}
