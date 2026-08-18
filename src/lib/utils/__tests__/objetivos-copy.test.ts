import { describe, it, expect } from 'vitest';
import { formatCurrency } from '@/lib/utils';
import { goalSubtitle, budgetStatusLine, daysLeftInMonth } from '../objetivos-copy';

const NOW = new Date(2026, 7, 18); // 18-ago-2026

describe('goalSubtitle', () => {
  it('meta única en USD con fecha objetivo: "en verdes · meta para enero 2027"', () => {
    expect(goalSubtitle({ currency: 'USD', type: 'one_time', target_date: '2027-01-15', created_at: '2026-03-02T10:00:00Z' }, NOW))
      .toBe('en verdes · meta para enero 2027');
  });

  it('meta única en ARS sin fecha: "empezó en marzo" (mismo año, sin año)', () => {
    expect(goalSubtitle({ currency: 'ARS', type: 'one_time', target_date: null, created_at: '2026-03-02T10:00:00Z' }, NOW))
      .toBe('empezó en marzo');
  });

  it('meta única en USD sin fecha de otro año: "en verdes · empezó en marzo 2025"', () => {
    expect(goalSubtitle({ currency: 'USD', type: 'one_time', target_date: null, created_at: '2025-03-02T10:00:00Z' }, NOW))
      .toBe('en verdes · empezó en marzo 2025');
  });

  it('meta mensual: "se renueva cada mes"', () => {
    expect(goalSubtitle({ currency: 'ARS', type: 'monthly', target_date: null, created_at: '2026-08-01T10:00:00Z' }, NOW))
      .toBe('se renueva cada mes');
  });
});

describe('budgetStatusLine', () => {
  it('superado: "Te pasaste $X · frená un toque" en bad', () => {
    const r = budgetStatusLine({ percent: 108, spent: 86300, limit: 80000, currency: 'ARS', status: 'exceeded', daysLeft: 17 });
    expect(r.text).toBe(`Te pasaste ${formatCurrency(6300)} · frená un toque`);
    expect(r.tone).toBe('bad');
  });

  it('uso alto (≥70%): "74% usado · quedan $X para 17 días"', () => {
    const r = budgetStatusLine({ percent: 74.2, spent: 118700, limit: 160000, currency: 'ARS', status: 'ok', daysLeft: 17 });
    expect(r.text).toBe(`74% usado · quedan ${formatCurrency(41300)} para 17 días`);
    expect(r.tone).toBe('muted');
  });

  it('warning pinta warn y singulariza el día', () => {
    const r = budgetStatusLine({ percent: 90, spent: 90000, limit: 100000, currency: 'ARS', status: 'warning', daysLeft: 1 });
    expect(r.text).toBe(`90% usado · quedan ${formatCurrency(10000)} para 1 día`);
    expect(r.tone).toBe('warn');
  });

  it('uso bajo: "56% usado · venís bien"', () => {
    const r = budgetStatusLine({ percent: 56, spent: 22400, limit: 40000, currency: 'ARS', status: 'ok', daysLeft: 17 });
    expect(r.text).toBe('56% usado · venís bien');
    expect(r.tone).toBe('muted');
  });

  it('USD lleva el prefijo en los montos', () => {
    const r = budgetStatusLine({ percent: 110, spent: 110, limit: 100, currency: 'USD', status: 'exceeded', daysLeft: 5 });
    expect(r.text).toBe(`Te pasaste USD ${formatCurrency(10)} · frená un toque`);
  });
});

describe('daysLeftInMonth', () => {
  it('cuenta los días restantes incluyendo hoy', () => {
    expect(daysLeftInMonth(new Date(2026, 7, 18))).toBe(14); // ago tiene 31: 31-18+1
    expect(daysLeftInMonth(new Date(2026, 7, 31))).toBe(1);
  });
});
