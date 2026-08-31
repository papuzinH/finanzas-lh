'use client';

import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCurrency, cn } from '@/lib/utils';
import type { Vara } from '@/lib/finance/historico';

const NOMBRE_MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * Fix round 1 — Hallazgo 1: a este componente sólo se llega desde una fila de
 * `<QueSeMovio>`, que tiene su propio toggle de vara. Si el porcentaje de la
 * fila se calculó "vs. el mes pasado" y acá seguíamos llamando
 * `getHistorico('promedio')` fijo, el modal podía mostrar la dirección
 * CONTRARIA (subió/bajó) para la misma categoría en la misma sesión. `vara`
 * es opcional con default 'promedio' porque `tab-categorias.tsx` no tiene
 * ese toggle: siempre quiere la lectura por defecto.
 */
const VARA_LABEL: Record<Vara, string> = {
  promedio: 'tu promedio',
  mes_anterior: 'el mes pasado',
};

export function DetalleCategoria({ categoryId, vara = 'promedio' }: { categoryId: string; vara?: Vara }) {
  // El store entero, no sus getters sueltos (ver store-freshness.test.ts).
  const store = useFinanceStore();
  const historico = store.getHistorico(vara);
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
        <p className="font-display tnum text-3xl text-text">
          {formatCurrency(ultimoCerrado?.real ?? 0)}
          {/* Fix round 1 — Hallazgo 2: si el único punto disponible es el mes en
              curso (categoría nueva, o primer mes de uso), la cifra hero es un
              total que todavía corre. Misma convención de asterisco que ya usan
              las etiquetas de mes del gráfico, pero pegada al número. */}
          {ultimoCerrado?.enCurso && '*'}
        </p>
        {pct != null && (
          <p className="text-sm text-muted mt-1">
            {pct > 0 ? 'Subió' : 'Bajó'} {Math.abs(pct * 100).toFixed(0)}% contra {VARA_LABEL[vara]}
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
