'use client';

import { useState } from 'react';
import { Sparkline } from '@/components/shared/sparkline';
import { InfoHint } from '@/components/ui/info-hint';
import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { FilaHistorico, Vara } from '@/lib/finance/historico';

const NOMBRE_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const mesLargo = (yyyymm: string) => NOMBRE_MES[Number(yyyymm.slice(5, 7)) - 1];

/**
 * Contra qué se compara, en una frase corta para no tener que abrir el InfoHint.
 *
 * `mesesDeReferencia` es la ventana ESTRUCTURAL (todos los meses del rango,
 * `mesAncla` hacia atrás), pero el promedio de cada categoría corre sólo sobre
 * SUS meses con actividad (`mesesConActividad` en `computeDesvioPorTramo`) —
 * una fila puede promediar sólo sobre 2 de esos 5 meses. Por eso acá no se dice
 * "promediamos de X a Y" (afirmaría más de lo que el cálculo garantiza para
 * cada fila): se dice "según lo que tengas cargado entre X y Y", cierto sea
 * cual sea la fila. Con `mes_anterior` no hay ventana: la comparación es
 * siempre contra un único mes exacto (`mesesDeReferencia[0]`, el inmediato
 * anterior a `mesAncla`), así que nombrarlo tal cual es preciso, no una
 * aproximación.
 */
export function textoReferencia(vara: Vara, mesesDeReferencia: string[]): string | null {
  if (mesesDeReferencia.length === 0) return null;
  const masNuevo = mesesDeReferencia[0];
  if (vara === 'mes_anterior') return `contra ${mesLargo(masNuevo)}`;
  const masViejo = mesesDeReferencia[mesesDeReferencia.length - 1];
  return masViejo === masNuevo
    ? `según lo que tengas cargado en ${mesLargo(masViejo)}`
    : `según lo que tengas cargado entre ${mesLargo(masViejo)} y ${mesLargo(masNuevo)}`;
}

export function QueSeMovio({
  onSelect,
  onVaraChange,
}: {
  onSelect: (categoryId: string) => void;
  /**
   * Fix round 1 — Hallazgo 1: el toggle de vara vive acá, pero el modal de
   * detalle lo monta `TabTendencia`, más arriba. Este callback opcional deja
   * que el padre se entere de la vara activa sin volver a este componente
   * controlado (el estado sigue siendo interno, para no tocar los tests
   * existentes que lo montan sin esta prop).
   */
  onVaraChange?: (vara: Vara) => void;
}) {
  const [vara, setVaraInterna] = useState<Vara>('promedio');
  const setVara = (v: Vara) => {
    setVaraInterna(v);
    onVaraChange?.(v);
  };
  // El store entero, no sus getters sueltos (ver store-freshness.test.ts).
  const store = useFinanceStore();
  const historico = store.getHistorico(vara);

  const conDesvio = historico.filas.filter((f) => f.desvio?.pct != null);
  const nivel = conDesvio
    .filter((f) => f.clasificacion === 'nivel')
    .sort((a, b) => Math.abs(b.desvio!.pct!) - Math.abs(a.desvio!.pct!));
  const eventos = historico.filas
    .filter((f) => f.clasificacion === 'evento')
    .sort((a, b) => (b.pico?.monto ?? 0) - (a.pico?.monto ?? 0));

  if (nivel.length === 0 && eventos.length === 0) return null;

  const contraQueCompara = textoReferencia(vara, historico.mesesDeReferencia);
  const tramo = historico.usaMesCerrado
    ? `${mesLargo(historico.mesAncla)}, el último mes cerrado`
    : `lo que va de ${mesLargo(historico.mesAncla)}, contra lo que llevabas a esta altura`;

  return (
    <div className="grid gap-3">
      <div>
        <div className="flex items-center gap-1.5">
          <h3 className="font-display text-[19px] text-text">Qué se movió</h3>
          <InfoHint label="Qué muestra">
            Compara {tramo} en <b>{historico.deflactado ? 'pesos de hoy' : 'pesos corrientes'}</b>
            {historico.deflactado
              ? ': cada mes se ajusta por inflación para que sean comparables.'
              : ': no hay datos de inflación disponibles ahora mismo, así que los montos NO están ajustados.'}{' '}
            La vara por defecto es tu promedio y no el mes pasado porque un mes raro suelto
            mueve menos el promedio.
          </InfoHint>
        </div>
        <p className="text-[12px] text-muted">
          {tramo}
          {contraQueCompara && ` · ${contraQueCompara}`}
          {historico.deflactado ? ' · en pesos de hoy' : ' · en pesos corrientes'}
        </p>
      </div>

      <div className="flex border-[1.5px] border-border rounded-full overflow-hidden w-fit">
        {(['promedio', 'mes_anterior'] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={vara === v}
            onClick={() => setVara(v)}
            className={cn(
              'min-h-11 flex items-center justify-center px-3 text-[11.5px] font-sans transition-colors',
              vara === v ? 'bg-text text-surface font-bold' : 'bg-surface text-muted',
            )}
          >
            {v === 'promedio' ? 'vs. mi promedio' : 'vs. el mes pasado'}
          </button>
        ))}
      </div>

      {nivel.length > 0 && (
        <Grupo titulo="Cambió de nivel" filas={nivel} onSelect={onSelect} deflactado={historico.deflactado} />
      )}
      {eventos.length > 0 && (
        <Grupo titulo="Fue una vez" filas={eventos} onSelect={onSelect} deflactado={historico.deflactado} esEvento />
      )}
    </div>
  );
}

function Grupo({
  titulo, filas, onSelect, deflactado, esEvento = false,
}: {
  titulo: string;
  filas: FilaHistorico[];
  onSelect: (categoryId: string) => void;
  deflactado: boolean;
  esEvento?: boolean;
}) {
  const unidadTexto = deflactado ? 'en pesos de hoy' : 'en pesos corrientes';
  return (
    <div>
      <p className="text-[10.5px] uppercase tracking-wider text-muted font-bold mb-1.5">{titulo}</p>
      <div className="rounded-2xl bg-surface border-[1.5px] border-border shadow-card px-3.5">
        {filas.map((f) => {
          const pct = f.desvio?.pct;
          const resumen = esEvento && f.pico
            ? `gasto excepcional en ${mesLargo(f.pico.month)} de ${formatCurrency(f.pico.monto)}`
            : pct != null
              ? `${pct > 0 ? 'subió' : 'bajó'} ${Math.abs(pct * 100).toFixed(0)}% contra la referencia`
              : 'sin comparación disponible';
          const tendenciaTexto = f.puntos
            .map((p) => `${mesLargo(p.month)}${p.enCurso ? ' (en curso)' : ''}: ${formatCurrency(p.real)}`)
            .join(', ');
          return (
            <button
              key={f.categoryId}
              type="button"
              onClick={() => onSelect(f.categoryId)}
              aria-label={`${f.categoryName}: ${resumen}. Tendencia mes a mes ${unidadTexto}: ${tendenciaTexto}.`}
              className="w-full flex items-center gap-2.5 py-2.5 border-b-[1.5px] border-border/10 last:border-b-0 text-left min-h-[44px]"
            >
              <span className="w-7 h-7 grid place-items-center rounded-lg border-[1.5px] border-border bg-surface-2 text-sm flex-none">
                {f.emoji ?? '•'}
              </span>
              <span className="flex-1 min-w-0 text-[13px] font-bold font-sans text-text truncate">
                {f.categoryName}
                {esEvento && f.pico && (
                  <small className="block font-normal text-[10.5px] text-muted">
                    {mesLargo(f.pico.month)}
                  </small>
                )}
              </span>
              <Sparkline
                valores={f.puntos.map((p) => p.real)}
                ultimoParcial={f.puntos[f.puntos.length - 1]?.enCurso}
              />
              <span
                className={cn(
                  'text-[12.5px] font-bold tnum text-right flex-none min-w-[52px]',
                  esEvento ? 'text-muted' : pct != null && pct > 0 ? 'text-bad' : 'text-good',
                )}
              >
                {esEvento && f.pico
                  ? formatCurrency(f.pico.monto)
                  : pct != null
                    ? `${pct > 0 ? '+' : '−'}${Math.abs(pct * 100).toFixed(0)}%`
                    : '—'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
