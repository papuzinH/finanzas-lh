// Headers de grupo por día de la lista de Movimientos (mock 2026-08-14). Puro.
import { parseLocalDate } from '@/lib/utils/dates';

const dow = (d: Date) => new Intl.DateTimeFormat('es-AR', { weekday: 'short' }).format(d).replace('.', '');
const mes = (d: Date) => new Intl.DateTimeFormat('es-AR', { month: 'short' }).format(d).replace('.', '');

export function dayGroupLabel(dateKey: string, now: Date = new Date()): string {
  const d = parseLocalDate(dateKey);
  const hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  const esMismoDia = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const base = `${dow(d)} ${d.getDate()}`;
  if (esMismoDia(d, hoy)) return `Hoy · ${base}`;
  if (esMismoDia(d, ayer)) return `Ayer · ${base}`;
  if (d.getFullYear() !== now.getFullYear()) return `${base} ${mes(d)} ${d.getFullYear()}`;
  if (d.getMonth() !== now.getMonth()) return `${base} ${mes(d)}`;
  return base;
}
