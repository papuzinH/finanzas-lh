'use client';

import { useFinanceStore } from '@/lib/store/financeStore';

const MONTH_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function cellColor(count: number, max: number): string {
  if (count === 0 || max === 0) return 'var(--surface-2)';
  const t = count / max;
  if (t < 0.25) return 'rgba(46,125,91,0.20)';
  if (t < 0.5) return 'rgba(46,125,91,0.40)';
  if (t < 0.75) return 'rgba(46,125,91,0.65)';
  return 'rgba(46,125,91,0.95)';
}

export function FrequencyHeatmap() {
  const getCategoryFrequency = useFinanceStore((s) => s.getCategoryFrequency);
  const { months, rows } = getCategoryFrequency(6);
  const top = rows.slice(0, 6);

  if (top.length === 0) {
    return <div className="h-24 flex items-center justify-center text-xs text-muted italic">Sin datos de frecuencia</div>;
  }

  const labels = months.map((m) => MONTH_SHORT[parseInt(m.slice(5, 7), 10) - 1]);

  return (
    <div role="img" aria-label="Frecuencia de gasto por categoría e histórico mensual">
      <div className="space-y-1.5">
        {top.map((row) => (
          <div key={row.category} className="grid items-center gap-1.5" style={{ gridTemplateColumns: '70px repeat(6, 1fr)' }}>
            <span className="text-[10px] text-text truncate">{row.emoji} {row.category}</span>
            {row.counts.map((c, i) => (
              <div key={i} className="h-4 rounded grid place-items-center text-[8px] font-bold text-text"
                style={{ backgroundColor: cellColor(c, Math.max(...top.map((r) => r.max), 1)) }}
                title={`${row.category}: ${c} gastos`}>
                {c > 0 ? c : ''}
              </div>
            ))}
          </div>
        ))}
        <div className="grid gap-1.5 pt-1" style={{ gridTemplateColumns: '70px repeat(6, 1fr)' }}>
          <span />
          {labels.map((l, i) => <span key={i} className="text-[8px] text-muted text-center">{l}</span>)}
        </div>
      </div>
    </div>
  );
}
