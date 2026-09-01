// Sub-líneas de la card de ciclo de tarjeta (mock 2026-08-14). Puro.
import { formatCurrency, formatUsd } from '@/lib/utils';

const fmtDia = (d: Date) =>
  `${d.getDate()} ${new Intl.DateTimeFormat('es-AR', { month: 'short' }).format(d).replace('.', '')}`;

export function cicloSub(
  nextClosingDate: Date | undefined,
  nextPaymentDate: Date,
  now: Date = new Date(),
): { fechas: string; dias: string; pct: number } {
  const vence = `vence el ${fmtDia(nextPaymentDate)}`;
  if (!nextClosingDate) return { fechas: vence, dias: '', pct: 100 };

  const cierre = nextClosingDate;
  const inicio = new Date(cierre.getFullYear(), cierre.getMonth() - 1, cierre.getDate());
  const MS_DIA = 24 * 60 * 60 * 1000;
  const total = Math.max(1, Math.round((cierre.getTime() - inicio.getTime()) / MS_DIA));
  const transcurridos = Math.min(total, Math.max(0, Math.round((now.getTime() - inicio.getTime()) / MS_DIA)));
  const pct = Math.min(100, Math.max(0, (transcurridos / total) * 100));

  return {
    fechas: `cierra el ${fmtDia(cierre)} · ${vence}`,
    dias: `${transcurridos} día${transcurridos === 1 ? '' : 's'} del ciclo transcurrido${transcurridos === 1 ? '' : 's'}`,
    pct,
  };
}

/**
 * Las dos monedas del resumen de una tarjeta, para mostrarlas juntas.
 *
 * Deliberadamente NO devuelve `total`: los dólares del resumen se pagan al
 * cambio del día de cierre, así que sumarlos a los pesos en la card sería
 * afirmar una conversión que la app no puede garantizar. El total convertido sí
 * se usa para el disponible y para registrar el pago (ver `computeCommitments`),
 * donde hace falta un único número; acá lo que hace falta es que el usuario vea
 * que además de los pesos debe dólares — antes el `u$s` vivía suelto al lado del
 * chip de pago y la cifra grande mostraba sólo la parte en pesos.
 */
export function montoDelCiclo(card: { total: number; totalARS: number; totalUSD: number }): {
  principal: string;
  secundario: string | null;
} {
  const { total, totalARS, totalUSD } = card;
  if (totalARS > 0) {
    return {
      principal: formatCurrency(totalARS),
      secundario: totalUSD > 0 ? `+ ${formatUsd(totalUSD)}` : null,
    };
  }
  if (totalUSD > 0) return { principal: formatUsd(totalUSD), secundario: null };
  // Sin desglose (puede pasar si el ciclo sólo trae ingresos/ajustes): el total
  // es lo único que queda, y es mejor que mostrar cero.
  return { principal: formatCurrency(total), secundario: null };
}
