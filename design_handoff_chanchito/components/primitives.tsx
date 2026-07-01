"use client";
/* Chanchito · Card, Chip, Progress, Toggle, Banner, Tabs — primitivas base. */
import { cn } from "./cn";
import { Icon } from "./Icon";

/* ---------- Card ---------- */
export function Card({
  children, className, ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-surface border-[1.5px] border-border shadow-card",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ---------- Chip (filtro) ---------- */
export function Chip({
  active, children, onClick, icon,
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
        "text-[12.5px] font-bold border-[1.5px] transition-colors",
        active
          ? "bg-accent text-accent-ink border-[var(--accent-deep)]"
          : "bg-surface text-muted border-border",
      )}
    >
      {icon && <Icon name={icon} size={14} stroke={2.2} />}
      {children}
    </button>
  );
}

/* ---------- Progress ---------- */
const TONE: Record<string, string> = {
  accent: "var(--accent)", good: "var(--good)", warn: "var(--warn)", bad: "var(--bad)",
};
export function Progress({
  value, tone = "accent", height = 8,
}: { value: number; tone?: "accent" | "good" | "warn" | "bad"; height?: number }) {
  const w = Math.max(0, Math.min(100, value));
  return (
    <div
      className="rounded-full overflow-hidden border border-border bg-surface-2"
      style={{ height }}
    >
      <div className="h-full rounded-full transition-all"
        style={{ width: `${w}%`, background: TONE[tone] }} />
    </div>
  );
}

/* ---------- Toggle ---------- */
export function Toggle({ on, onClick }: { on?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative w-[44px] h-[26px] rounded-full border-[1.5px] transition-colors shrink-0",
        on ? "bg-accent border-[var(--accent-deep)]" : "bg-surface-2 border-border",
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

/* ---------- Tabs (segmented) ---------- */
export function Tabs({
  tabs, active, onChange,
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
            "text-[12.5px] font-bold transition-colors",
            active === tab.id ? "bg-accent text-accent-ink" : "text-muted",
          )}
        >
          {tab.icon && <Icon name={tab.icon} size={14} stroke={2.2} />}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Banner (aviso) ---------- */
const BANNER: Record<string, { bg: string; bd: string }> = {
  accent: { bg: "var(--accent-soft)", bd: "var(--accent-deep)" },
  warn:   { bg: "#F7E4B6", bd: "#B97E16" },
  info:   { bg: "#CBE2EE", bd: "#3C708F" },
};
export function Banner({
  icon, tone = "accent", title, body, cta, onClose,
}: {
  icon: string;
  tone?: "accent" | "warn" | "info";
  title: string;
  body: string;
  cta?: string;
  onClose?: () => void;
}) {
  const tn = BANNER[tone];
  return (
    <div
      className="relative rounded-2xl p-3.5 pr-9 border-[1.5px] overflow-hidden"
      style={{ background: tn.bg, borderColor: tn.bd }}
    >
      <div className="flex items-start gap-3">
        <div className="grid place-items-center w-9 h-9 rounded-xl shrink-0 bg-white/60 border border-navy/15"
          style={{ color: tn.bd }}>
          <Icon name={icon} size={18} />
        </div>
        <div className="min-w-0">
          <p className="font-sans font-extrabold text-navy text-[13px] leading-tight">{title}</p>
          <p className="font-sans text-[12px] text-navy/70 leading-snug mt-0.5">{body}</p>
          {cta && (
            <button className="mt-2 font-sans text-[12px] font-extrabold text-navy underline decoration-2 underline-offset-2">
              {cta}
            </button>
          )}
        </div>
      </div>
      {onClose && (
        <button onClick={onClose} className="absolute top-2.5 right-2.5 text-navy/40">
          <Icon name="x" size={15} />
        </button>
      )}
    </div>
  );
}
