"use client";

const TONE: Record<string, string> = {
  accent: "var(--accent)",
  good:   "var(--good)",
  warn:   "var(--warn)",
  bad:    "var(--bad)",
};

export function ProgressBar({
  value,
  tone = "accent",
  height = 8,
  label,
}: {
  value: number;
  tone?: "accent" | "good" | "warn" | "bad";
  height?: number;
  /** Etiqueta accesible; por defecto anuncia el porcentaje. */
  label?: string;
}) {
  const w = Math.max(0, Math.min(100, value));
  const rounded = Math.round(w);
  return (
    <div
      role="progressbar"
      aria-valuenow={rounded}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? `Progreso ${rounded}%`}
      className="rounded-full overflow-hidden border-[1.5px] border-border bg-surface-2"
      style={{ height }}
    >
      <div
        aria-hidden="true"
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${w}%`, background: TONE[tone] }}
      />
    </div>
  );
}
