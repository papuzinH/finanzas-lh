"use client";
import { cn } from "@/lib/utils";

export function ToggleDS({ on, onClick }: { on?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      className={cn(
        "relative w-[44px] h-[26px] rounded-full border-[1.5px] transition-colors shrink-0 cursor-pointer",
        on ? "bg-accent border-accent-deep" : "bg-surface-2 border-border",
      )}
    >
      <span
        className={cn(
          "absolute top-1/2 -translate-y-1/2 w-[18px] h-[18px] rounded-full bg-white",
          "border border-black/20 transition-all",
          on ? "left-[22px]" : "left-[3px]",
        )}
        style={{ boxShadow: "0 1px 2px rgba(0,0,0,.2)" }}
      />
    </button>
  );
}
