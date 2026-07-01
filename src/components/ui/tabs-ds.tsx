"use client";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";

export function TabsDS({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string; icon?: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 p-1 rounded-full bg-surface-2 border-[1.5px] border-border">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full",
            "text-[12.5px] font-bold transition-colors cursor-pointer",
            active === tab.id ? "bg-accent text-accent-ink" : "text-muted hover:text-text",
          )}
        >
          {tab.icon && <Icon name={tab.icon} size={14} stroke={2.2} />}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
