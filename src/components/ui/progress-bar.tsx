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
}: {
  value: number;
  tone?: "accent" | "good" | "warn" | "bad";
  height?: number;
}) {
  const w = Math.max(0, Math.min(100, value));
  return (
    <div
      className="rounded-full overflow-hidden border-[1.5px] border-border bg-surface-2"
      style={{ height }}
    >
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${w}%`, background: TONE[tone] }}
      />
    </div>
  );
}
