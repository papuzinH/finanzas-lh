'use client';

import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCurrency, cn } from '@/lib/utils';

const NOMBRE_MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function DetalleCategoria({ categoryId }: { categoryId: string }) {
  // El store entero, no sus getters sueltos (ver store-freshness.test.ts).
  const store = useFinanceStore();
  const historico = store.getHistorico('promedio');
  const fila = historico.filas.find((f) => f.categoryId === categoryId);

  if (!fila) {
    return <p className="text-sm text-muted text-center py-4">Todavía no hay movimientos en esta categoría.</p>;
  }

  const ultimoCerrado = [...fila.puntos].reverse().find((p) => !p.enCurso) ?? fila.puntos[fila.puntos.length - 1];
  const pct = fila.desvio?.pct;
  const max = Math.max(...fila.puntos.map((p) => p.real), 0);

  return (
    <div className="grid gap-3 py-2">
      <div className="text-center">
        <p className="text-xs text-muted uppercase tracking-wider mb-1">
          {fila.emoji} {fila.categoryName} · en pesos de hoy
        </p>
        <p className="font-display tnum text-3xl text-text">{formatCurrency(ultimoCerrado?.real ?? 0)}</p>
        {pct != null && (
          <p className="text-sm text-muted mt-1">
            {pct > 0 ? 'Subió' : 'Bajó'} {Math.abs(pct * 100).toFixed(0)}% contra tu promedio
          </p>
        )}
      </div>

      <div className="flex items-end justify-center gap-2.5 h-28">
        {fila.puntos.map((p) => (
          <div key={p.month} className="flex-1 max-w-[46px] flex flex-col items-center gap-1.5 h-full justify-end">
            {/* Las barras se escalan contra el máximo de LA SERIE, no cada una
                contra sí misma: un <Sparkline> por mes las dibujaría todas del
                mismo alto. */}
            <div
              data-barra
              data-parcial={p.enCurso ? 'true' : undefined}
              className={cn(
                'w-full rounded-t-[5px] border-[1.5px] border-border min-h-[3px]',
                p.enCurso && 'bg-surface-2',
              )}
              style={{
                height: max > 0 ? `${(p.real / max) * 100}%` : '3px',
                // bg-bandera no existe: --bandera nunca se mapea en @theme inline
                // (sólo --shadow-bandera, que es una sombra). Mismo patrón que
                // portfolio-distribution.tsx y sparkline.tsx.
                background: p.enCurso ? undefined : 'var(--bandera)',
              }}
            />
            <span className="text-[10.5px] text-muted">
              {NOMBRE_MES_CORTO[Number(p.month.slice(5, 7)) - 1]}
              {p.enCurso && '*'}
            </span>
          </div>
        ))}
      </div>

      {fila.puntos.some((p) => p.enCurso) && (
        <p className="text-[11px] text-muted text-center">* el mes todavía no cerró</p>
      )}
    </div>
  );
}
