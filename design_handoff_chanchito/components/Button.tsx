"use client";
/* Chanchito · Button — pill con sombra-offset sólida. */
import { cn } from "./cn";

type Variant = "accent" | "navy" | "soft" | "ghost";
type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, string> = {
  sm: "px-3.5 py-2 text-[12.5px]",
  md: "px-5 py-2.5 text-[13.5px]",
  lg: "px-6 py-3 text-[15px]",
};

const VARIANTS: Record<Variant, string> = {
  accent:
    "bg-accent text-accent-ink border-[var(--accent-deep)] shadow-offset " +
    "active:translate-y-[2px] active:shadow-none",
  navy:
    "bg-navy text-cream-light border-navy shadow-offset active:translate-y-[2px]",
  ghost: "bg-transparent text-text border-border",
  soft: "bg-surface-2 text-text border-border",
};

export function Button({
  children,
  variant = "accent",
  size = "md",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-sans font-bold",
        "tracking-tight border-[1.5px] transition-transform select-none",
        SIZES[size],
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
