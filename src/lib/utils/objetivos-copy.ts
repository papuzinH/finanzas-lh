// Copy rioplatense de la pantalla Objetivos (mock 2026-08-14). Funciones puras.
import { formatCurrency } from '@/lib/utils';
import { parseLocalDate } from '@/lib/utils/dates';

const mesDe = (d: Date) => new Intl.DateTimeFormat('es-AR', { month: 'long' }).format(d);

export function goalSubtitle(
  goal: { currency: 'ARS' | 'USD'; type: 'one_time' | 'monthly'; target_date: string | null; created_at: string },
  now: Date = new Date(),
): string {
  const parts: string[] = [];
  if (goal.currency === 'USD') parts.push('en verdes');
  if (goal.type === 'monthly') {
    parts.push('se renueva cada mes');
  } else if (goal.target_date) {
    const d = parseLocalDate(goal.target_date);
    parts.push(`meta para ${mesDe(d)} ${d.getFullYear()}`);
  } else {
    const d = new Date(goal.created_at);
    const año = d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`;
    parts.push(`empezó en ${mesDe(d)}${año}`);
  }
  return parts.join(' · ');
}

export function budgetStatusLine(i: {
  percent: number;
  spent: number;
  limit: number;
  currency: 'ARS' | 'USD';
  status: 'ok' | 'warning' | 'exceeded';
  daysLeft: number;
}): { text: string; tone: 'muted' | 'warn' | 'bad' } {
  const fmt = (n: number) => `${i.currency === 'USD' ? 'USD ' : ''}${formatCurrency(n)}`;
  if (i.status === 'exceeded') {
    return { text: `Te pasaste ${fmt(i.spent - i.limit)} · frená un toque`, tone: 'bad' };
  }
  const pct = Math.round(i.percent);
  if (pct >= 70) {
    const dias = `${i.daysLeft} día${i.daysLeft === 1 ? '' : 's'}`;
    return {
      text: `${pct}% usado · quedan ${fmt(Math.max(i.limit - i.spent, 0))} para ${dias}`,
      tone: i.status === 'warning' ? 'warn' : 'muted',
    };
  }
  return { text: `${pct}% usado · venís bien`, tone: 'muted' };
}

export function daysLeftInMonth(now: Date = new Date()): number {
  const ultimo = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return ultimo - now.getDate() + 1;
}
