"use client";
import { Icon } from "@/components/ui/icon";

const BANNER: Record<string, { bg: string; bd: string }> = {
  accent: { bg: "var(--banner-accent-bg)", bd: "var(--banner-accent-border)" },
  warn:   { bg: "var(--banner-warn-bg)",   bd: "var(--banner-warn-border)" },
  info:   { bg: "var(--banner-info-bg)",   bd: "var(--banner-info-border)" },
};

export function BannerDS({
  icon,
  tone = "accent",
  title,
  body,
  cta,
  onClose,
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
        <div
          className="grid place-items-center w-9 h-9 rounded-xl shrink-0 bg-surface border-[1.5px] border-border"
          style={{ color: tn.bd }}
        >
          <Icon name={icon} size={18} />
        </div>
        <div className="min-w-0">
          <p className="font-sans font-extrabold text-text text-[13px] leading-tight">{title}</p>
          <p className="font-sans text-[12px] text-muted leading-snug mt-0.5">{body}</p>
          {cta && (
            <button className="mt-2 font-sans text-[12px] font-extrabold text-text underline decoration-2 underline-offset-2 cursor-pointer">
              {cta}
            </button>
          )}
        </div>
      </div>
      {onClose && (
        <button onClick={onClose} className="absolute top-2.5 right-2.5 text-faint cursor-pointer">
          <Icon name="x" size={15} />
        </button>
      )}
    </div>
  );
}
