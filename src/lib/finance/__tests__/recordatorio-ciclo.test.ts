import { describe, it, expect } from 'vitest';
import { ciclosQuePidenDeclaracion } from '@/lib/finance/cycles';

const base = { user_id: 'u', payment_method_id: 'pm', created_at: 'x', reminder_dismissed_at: null };

describe('ciclosQuePidenDeclaracion', () => {
  it('pide declarar un resumen estimado que ya cerro', () => {
    const ciclos = [{ ...base, id: 'a', closing_date: '2026-09-01', due_date: '2026-09-10', source: 'generated' as const }];
    expect(ciclosQuePidenDeclaracion(ciclos, '2026-09-02').map((c) => c.id)).toEqual(['a']);
  });

  it('no pide nada antes del cierre: el banco todavia no emitio el resumen', () => {
    const ciclos = [{ ...base, id: 'a', closing_date: '2026-09-24', due_date: '2026-10-02', source: 'generated' as const }];
    expect(ciclosQuePidenDeclaracion(ciclos, '2026-09-02')).toEqual([]);
  });

  it('no pide un resumen que el usuario ya declaro', () => {
    const ciclos = [{ ...base, id: 'a', closing_date: '2026-09-01', due_date: '2026-09-10', source: 'declared' as const }];
    expect(ciclosQuePidenDeclaracion(ciclos, '2026-09-02')).toEqual([]);
  });

  it('no pide uno que el usuario pospuso', () => {
    const ciclos = [{ ...base, id: 'a', closing_date: '2026-09-01', due_date: '2026-09-10', source: 'generated' as const, reminder_dismissed_at: '2026-09-02T10:00:00Z' }];
    expect(ciclosQuePidenDeclaracion(ciclos, '2026-09-02')).toEqual([]);
  });

  it('pide solo el mas reciente cuando hay varios cerrados sin declarar', () => {
    const ciclos = [
      { ...base, id: 'jul', closing_date: '2026-07-23', due_date: '2026-07-31', source: 'generated' as const },
      { ...base, id: 'ago', closing_date: '2026-08-20', due_date: '2026-08-28', source: 'generated' as const },
    ];
    expect(ciclosQuePidenDeclaracion(ciclos, '2026-09-02').map((c) => c.id)).toEqual(['ago']);
  });

  it('pide uno por CADA tarjeta, no uno en total', () => {
    const ciclos = [
      { ...base, id: 'visa', payment_method_id: 'pm1', closing_date: '2026-08-20', due_date: '2026-08-28', source: 'generated' as const },
      { ...base, id: 'master', payment_method_id: 'pm2', closing_date: '2026-08-27', due_date: '2026-09-04', source: 'generated' as const },
    ];
    expect(ciclosQuePidenDeclaracion(ciclos, '2026-09-02').map((c) => c.id).sort()).toEqual(['master', 'visa']);
  });
});
