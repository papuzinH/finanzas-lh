// Textos del modelo de bolsillo. Puros, para que los compartan el onboarding, la
// puesta a punto, Ajustes y el hero de Inicio sin duplicar strings.
// Spec: docs/superpowers/specs/2026-08-20-disponible-real-anclado-design.md
import type { IncomeRhythm } from '@/lib/finance/pocket';

export const BUCKET_HELP =
  'El bolsillo es de donde gastás; la reserva es lo que decidiste no gastar.';

/** Default para `AccountAnchorFields`: onboarding y puesta a punto, donde vaciar el
 *  campo significa "todavía no sé, preguntame después". */
export const BALANCE_EMPTY_HELP =
  'Si lo dejás vacío, la cuenta queda sin saldo declarado y te lo preguntamos más adelante.';

export const RHYTHMS: Array<{ value: IncomeRhythm; label: string; help: string }> = [
  { value: 'monthly', label: 'Todos los meses', help: 'Sueldo mensual, honorarios fijos.' },
  { value: 'biweekly', label: 'Cada quincena', help: 'Cobrás dos veces por mes.' },
  { value: 'weekly', label: 'Todas las semanas', help: 'Jornales, changas semanales.' },
  { value: 'irregular', label: 'Cuando cae', help: 'Freelance, ventas: no hay fecha fija.' },
];

export function rhythmLabel(r: IncomeRhythm): string {
  return RHYTHMS.find((x) => x.value === r)?.label ?? 'Todos los meses';
}

export function rhythmHelp(r: IncomeRhythm): string {
  return RHYTHMS.find((x) => x.value === r)?.help ?? '';
}

/** Cómo se nombra el período vigente en el desglose del disponible. */
export function periodLabel(r: IncomeRhythm): string {
  if (r === 'biweekly') return 'esta quincena';
  if (r === 'weekly') return 'esta semana';
  if (r === 'irregular') return 'en total';
  return 'este mes';
}

/**
 * Cómo se nombra lo que vence después del período vigente.
 * `null` con ritmo irregular: sin próximo cobro que asumir, ya está todo descontado.
 */
export function nextPeriodLabel(r: IncomeRhythm): string | null {
  if (r === 'irregular') return null;
  if (r === 'biweekly') return 'de la quincena que viene';
  if (r === 'weekly') return 'de la semana que viene';
  return 'del mes que viene';
}
