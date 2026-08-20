// Sub-líneas de la card de ciclo de tarjeta (mock 2026-08-14). Puro.

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
