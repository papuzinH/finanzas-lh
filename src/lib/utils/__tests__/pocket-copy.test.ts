import { describe, it, expect } from 'vitest';
import { rhythmLabel, periodLabel, nextPeriodLabel, RHYTHMS, BUCKET_HELP } from '../pocket-copy';

describe('pocket-copy', () => {
  it('nombra los cuatro ritmos', () => {
    expect(rhythmLabel('monthly')).toBe('Todos los meses');
    expect(rhythmLabel('biweekly')).toBe('Cada quincena');
    expect(rhythmLabel('weekly')).toBe('Todas las semanas');
    expect(rhythmLabel('irregular')).toBe('Cuando cae');
  });

  it('el periodo se nombra distinto segun el ritmo', () => {
    expect(periodLabel('monthly')).toBe('este mes');
    expect(periodLabel('biweekly')).toBe('esta quincena');
    expect(periodLabel('weekly')).toBe('esta semana');
  });

  it('con ritmo irregular no hay periodo: se descuenta todo', () => {
    expect(periodLabel('irregular')).toBe('en total');
    expect(nextPeriodLabel('irregular')).toBeNull();
  });

  it('el proximo periodo se nombra segun el ritmo', () => {
    expect(nextPeriodLabel('monthly')).toBe('del mes que viene');
    expect(nextPeriodLabel('biweekly')).toBe('de la quincena que viene');
    expect(nextPeriodLabel('weekly')).toBe('de la semana que viene');
  });

  it('RHYTHMS lista los cuatro, en el orden de la UI', () => {
    expect(RHYTHMS.map((r) => r.value)).toEqual(['monthly', 'biweekly', 'weekly', 'irregular']);
  });

  it('la distincion bolsillo/reserva se explica en una linea', () => {
    expect(BUCKET_HELP).toBe('El bolsillo es de donde gastás; la reserva es lo que decidiste no gastar.');
  });
});
