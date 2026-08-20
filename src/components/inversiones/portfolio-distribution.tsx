"use client"

interface PortfolioDistributionProps {
  data: { name: string; value: number; currency?: string }[];
}

const CHART_VARS = [
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
  '--chart-6',
  '--chart-7',
  '--chart-8',
  '--chart-9',
];

export function PortfolioDistribution({ data }: PortfolioDistributionProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return null;

  const items = data.map((d, i) => ({
    ...d,
    pct: (d.value / total) * 100,
    color: `var(${CHART_VARS[i % CHART_VARS.length]})`,
  }));

  return (
    <div className="rounded-[18px] bg-surface border-[1.5px] border-border p-3.5 grid gap-2.5">
      <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted">Composición</span>
      <div
        className="flex h-3 rounded-full overflow-hidden border border-border"
        role="img"
        aria-label={`Composición del portfolio: ${items.map((i) => `${i.name} ${Math.round(i.pct)}%`).join(', ')}`}
      >
        {items.map((it, i) => (
          <div
            key={it.name}
            style={{
              width: `${it.pct}%`,
              background: it.color,
              borderLeft: i > 0 ? '2px solid var(--surface)' : undefined,
            }}
          />
        ))}
      </div>
      <div className="flex gap-3.5 flex-wrap">
        {items.map((it) => (
          <span key={it.name} className="flex items-center gap-1.5 text-[11.5px] text-muted">
            <span className="w-2 h-2 rounded-[3px]" style={{ background: it.color }} aria-hidden="true" />
            {it.name} {Math.round(it.pct)}%
          </span>
        ))}
      </div>
    </div>
  );
}
