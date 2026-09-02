import { describe, expect, it } from 'vitest'
import type { PaymentMethod, RecurringPlan, Transaction } from '@/types/database'
import { parseLocalDate } from '@/lib/utils/dates'
import type { CreditCardCycle } from '../cycles'
import {
  computeMissingAutomaticCharges,
  etiquetaDeCobro,
  expectedChargeDate,
  expectedChargeDatePorCiclo,
  isAutomaticPlan,
} from '../recurring'

/** Tarjeta que cierra el 20 y vence el 1 del mes siguiente. */
const visa = {
  id: 'card-visa',
  name: 'Visa',
  type: 'credit',
  default_closing_day: 20,
  default_payment_day: 1,
  bucket: 'pocket',
  initial_balance: 0,
  initial_balance_at: null,
  is_personal: false,
  is_default: false,
  user_id: 'u1',
  created_at: '2025-12-01T00:00:00Z',
} as unknown as PaymentMethod

/** Tarjeta que cierra el 27 y vence el 4. */
const master = {
  ...visa,
  id: 'card-master',
  name: 'Master',
  default_closing_day: 27,
  default_payment_day: 4,
} as PaymentMethod

/** Cuenta a la vista: nunca se automatiza. */
const debito = {
  ...visa,
  id: 'acc-debito',
  name: 'Cuenta',
  type: 'debit',
  default_closing_day: null,
  default_payment_day: null,
} as PaymentMethod

function plan(over: Partial<RecurringPlan> = {}): RecurringPlan {
  return {
    id: 'plan-1',
    user_id: 'u1',
    description: 'Servicio',
    // amount SIEMPRE positivo: el signo lo lleva `type` en la transacción.
    amount: 10000,
    category_id: 'cat-1',
    payment_method_id: visa.id,
    currency: 'ARS',
    frequency: 'monthly',
    is_active: true,
    created_at: '2026-01-10T00:00:00Z',
    original_amount: null,
    rate_pair: null,
    exchange_rate: null,
    billing_day: null,
    ...over,
  } as RecurringPlan
}

let txSeq = 0
function tx(over: Partial<Transaction> = {}): Transaction {
  txSeq += 1
  return {
    id: `tx-${txSeq}`,
    user_id: 'u1',
    description: 'Servicio',
    amount: 10000,
    date: '2026-09-01',
    type: 'expense',
    category_id: 'cat-1',
    payment_method_id: visa.id,
    recurring_plan_id: 'plan-1',
    installment_plan_id: null,
    created_at: '2026-09-01T00:00:00Z',
    original_amount: null,
    original_currency: 'ARS',
    rate_pair: null,
    exchange_rate: null,
    card_payment_for: null,
    is_balance_adjustment: false,
    ...over,
  } as unknown as Transaction
}

describe('isAutomaticPlan', () => {
  it('automatiza un plan mensual en una tarjeta con ciclo cargado', () => {
    expect(isAutomaticPlan(plan(), visa)).toBe(true)
  })

  it('A5: no automatiza si la tarjeta no tiene el ciclo cargado', () => {
    const sinCiclo = { ...visa, default_closing_day: null } as PaymentMethod
    expect(isAutomaticPlan(plan(), sinCiclo)).toBe(false)
  })

  it('A6: no automatiza un plan anual', () => {
    expect(isAutomaticPlan(plan({ frequency: 'yearly' }), visa)).toBe(false)
  })

  it('A7: no automatiza un plan de débito', () => {
    expect(isAutomaticPlan(plan({ payment_method_id: debito.id }), debito)).toBe(false)
  })

  it('no automatiza si el plan no tiene medio de pago', () => {
    expect(isAutomaticPlan(plan({ payment_method_id: null }), undefined)).toBe(false)
  })

  it('trata frequency null como mensual (el default del producto)', () => {
    expect(isAutomaticPlan(plan({ frequency: null }), visa)).toBe(true)
  })
})

describe('expectedChargeDate', () => {
  it('A1: cobro el día 1, cierre 20 → vence el 1 del mes siguiente', () => {
    expect(expectedChargeDate(plan({ billing_day: 1 }), visa, '2026-08')).toBe('2026-09-01')
  })

  it('A2: cobro el día 25 (después del cierre) → se va un resumen más', () => {
    expect(expectedChargeDate(plan({ billing_day: 25 }), visa, '2026-08')).toBe('2026-10-01')
  })

  it('A3: la otra tarjeta usa su propio ciclo (cierra 27, vence 4)', () => {
    expect(expectedChargeDate(plan({ billing_day: 1 }), master, '2026-08')).toBe('2026-09-04')
  })

  it('A4: billing_day 31 en febrero clampea al último día del mes', () => {
    // 28 de febrero es posterior al cierre (20) → resumen de abril.
    expect(expectedChargeDate(plan({ billing_day: 31 }), visa, '2026-02')).toBe('2026-04-01')
  })

  it('billing_day nulo se lee como día 1', () => {
    expect(expectedChargeDate(plan({ billing_day: null }), visa, '2026-08')).toBe('2026-09-01')
  })
})

describe('expectedChargeDatePorCiclo', () => {
  it('la mensualidad cae en el resumen que le corresponde, con la fecha real del ciclo', () => {
    const ciclos: CreditCardCycle[] = [
      { id: 'ago', user_id: 'u1', payment_method_id: 'visa', closing_date: '2026-08-20', due_date: '2026-09-01', source: 'declared', created_at: '2026-01-01T00:00:00Z', reminder_dismissed_at: null },
      { id: 'sep', user_id: 'u1', payment_method_id: 'visa', closing_date: '2026-09-24', due_date: '2026-10-05', source: 'declared', created_at: '2026-01-01T00:00:00Z', reminder_dismissed_at: null },
    ]
    // Netflix se cobra el 25: cae DESPUES del cierre del 20, o sea en el resumen siguiente.
    const p = plan({ billing_day: 25 })
    const r = expectedChargeDatePorCiclo(p, '2026-08', ciclos)
    expect(r).toEqual({ cycleId: 'sep', date: '2026-10-05' })
  })

  it('sin ningun ciclo que contenga el dia de cobro devuelve undefined', () => {
    expect(expectedChargeDatePorCiclo(plan({ billing_day: 1 }), '2026-08', [])).toBeUndefined()
  })
})

describe('computeMissingAutomaticCharges: cycleId (Task 10)', () => {
  const methods = [visa, master, debito]
  const hoy = parseLocalDate('2026-08-21')

  it('cuando hay ciclos que cubren el mes, cada faltante trae el cycleId Y la fecha real del resumen', () => {
    // Cierres/vencimientos desparejos A PROPOSITO (ver el comentario de TRES en
    // cycles.test.ts): NINGUNO coincide con el corrimiento que dan los defaults
    // de `visa` (cierra 20, vence el 1 del mes siguiente). Si `computeMissingAutomaticCharges`
    // se rompiera y volviera a usar `expectedChargeDate` (el fallback) en vez de
    // `porCiclo.date`, las fechas de abajo NO coincidirían con estos ciclos y el
    // test lo detectaría — con fechas iguales a los defaults, esta mutación
    // hubiera quedado invisible.
    const ciclos: CreditCardCycle[] = [
      { id: 'c-jun', user_id: 'u1', payment_method_id: visa.id, closing_date: '2026-06-19', due_date: '2026-07-02', source: 'generated', created_at: '2026-01-01T00:00:00Z', reminder_dismissed_at: null },
      { id: 'c-jul', user_id: 'u1', payment_method_id: visa.id, closing_date: '2026-07-23', due_date: '2026-08-03', source: 'generated', created_at: '2026-01-01T00:00:00Z', reminder_dismissed_at: null },
      { id: 'c-ago', user_id: 'u1', payment_method_id: visa.id, closing_date: '2026-08-20', due_date: '2026-09-04', source: 'generated', created_at: '2026-01-01T00:00:00Z', reminder_dismissed_at: null },
    ]
    const faltantes = computeMissingAutomaticCharges(
      [plan({ billing_day: 1, created_at: '2026-06-01T00:00:00Z' })],
      methods,
      [],
      '2026-06',
      hoy,
      ciclos,
    )
    expect(faltantes.map((f) => f.cycleId)).toEqual(['c-jun', 'c-jul', 'c-ago'])
    expect(faltantes.map((f) => f.date)).toEqual(['2026-07-02', '2026-08-03', '2026-09-04'])
    // Provenance explícita: si esto viniera del fallback por defaults (cierra
    // 20, vence el 1), darían '2026-07-01' / '2026-08-01' / '2026-09-01' — otra fecha.
    expect(faltantes.map((f) => f.date)).not.toEqual(
      faltantes.map((f) => expectedChargeDate(plan({ billing_day: 1 }), visa, f.month)),
    )
  })

  it('sin ciclos para la tarjeta, cae al fallback con cycleId null', () => {
    const faltantes = computeMissingAutomaticCharges(
      [plan({ billing_day: 1, created_at: '2026-08-01T00:00:00Z' })],
      methods,
      [],
      '2026-08',
      hoy,
    )
    expect(faltantes.map((f) => f.cycleId)).toEqual([null])
  })
})

describe('computeMissingAutomaticCharges: cobertura por resumen, no por mes (Task 8)', () => {
  // Tarjeta y plan compartidos por los dos tests: id 'pm' para calzar con el
  // payment_method_id de los ciclos armados a mano.
  const TARJETA = { ...visa, id: 'pm', default_closing_day: 27, default_payment_day: 28 } as PaymentMethod
  const PLAN = plan({ id: 'p1', payment_method_id: 'pm', billing_day: 1 })

  it('no duplica una mensualidad cuando el resumen cruza de mes', () => {
    // El resumen 'sep' se posteo primero como estimado (cierra antes del 24, sin cruzar de
    // mes) y la transaccion quedo fechada el 25-sep, dentro de septiembre. Declarar el resumen
    // real ACTUALIZA esa misma fila (mismo id 'sep'): ahora cierra el 24-sep y vence el 2-oct,
    // cruzando de mes. La transaccion ya posteada no se toca (E13): su `date` se queda en
    // 25-sep aunque el resumen que la contiene ahora vence en octubre.
    const ciclos: CreditCardCycle[] = [
      { id: 'sep', user_id: 'u', payment_method_id: 'pm', closing_date: '2026-09-24', due_date: '2026-10-02', source: 'declared', created_at: 'x', reminder_dismissed_at: null },
    ]
    const posteada = [{ recurring_plan_id: 'p1', date: '2026-09-25', cycle_id: 'sep' }]
    const faltantes = computeMissingAutomaticCharges([PLAN], [TARJETA], posteada, '2026-09', new Date('2026-09-30T12:00:00'), ciclos)
    // Con la regla vieja (mes de `date`) el mes recalculado (octubre, por el vencimiento nuevo)
    // no coincide con el mes de la transaccion ya posteada (septiembre) y se veia descubierto:
    // se posteaba de nuevo. Por `cycle_id` sigue siendo el mismo resumen ('sep'): cubierto.
    expect(faltantes).toEqual([])
  })

  it('sigue cubriendo por mes cuando la transaccion no tiene resumen', () => {
    const posteada = [{ recurring_plan_id: 'p1', date: '2026-09-28', cycle_id: null }]
    const faltantes = computeMissingAutomaticCharges([PLAN], [TARJETA], posteada, '2026-09', new Date('2026-09-30T12:00:00'), [])
    expect(faltantes).toEqual([])
  })

  it('no duplica cuando declarar un resumen mueve el dia de cobro a OTRO resumen', () => {
    // El caso Galicia del brief: cierre estimado 20, vencimiento 28, mensualidad con
    // billing_day 22 -- un dia de cobro DENTRO de la ventana que la declaracion corrige.
    //
    // Antes de declarar, cicloDeCompra('2026-09-22') caia en el resumen de OCTUBRE (el de
    // septiembre ya habia cerrado el 20): la mensualidad se posteo con cycle_id 'oct' y
    // fecha 28-oct. Despues el usuario declara que septiembre cerro el 24 y vence el 2-oct,
    // asi que la MISMA prediccion ahora cae en 'sep'. El resumen cambia de identidad, pero
    // la transaccion ya posteada no se toca (E13).
    //
    // Si la cobertura particionara las transacciones (las que tienen resumen solo por
    // cycle_id, las que no solo por mes), esta fila aportaria unicamente la clave 'oct' y
    // el consumo de septiembre se veria descubierto: segundo cargo real por el mismo mes.
    const ciclos: CreditCardCycle[] = [
      { id: 'sep', user_id: 'u', payment_method_id: 'pm', closing_date: '2026-09-24', due_date: '2026-10-02', source: 'declared', created_at: 'x', reminder_dismissed_at: null },
      { id: 'oct', user_id: 'u', payment_method_id: 'pm', closing_date: '2026-10-20', due_date: '2026-10-28', source: 'generated', created_at: 'x', reminder_dismissed_at: null },
    ]
    const PLAN_22 = plan({ id: 'p1', payment_method_id: 'pm', billing_day: 22 })
    const posteada = [{ recurring_plan_id: 'p1', date: '2026-10-28', cycle_id: 'oct' }]
    const faltantes = computeMissingAutomaticCharges([PLAN_22], [TARJETA], posteada, '2026-09', new Date('2026-09-30T12:00:00'), ciclos)
    expect(faltantes).toEqual([])
  })

  it('el respaldo por mes sigue aplicando aunque HOY exista un ciclo para ese mes (transaccion previa a los resumenes)', () => {
    // Julio se posteo SIN cycle_id (de antes de que existiera la columna). Los
    // ciclos se materializan retroactivamente (asegurarCiclos cubre meses
    // pasados), asi que HOY ya existe un resumen de julio -- la prediccion
    // fresca trae un cycleId truthy aunque la transaccion vieja no lo tenga.
    // Si la cobertura mirara SOLO cubiertosPorCiclo cuando cycleId sale
    // truthy (either/or en vez de OR), esta transaccion quedaria invisible y
    // julio se volveria a postear: el caso de los 54 planes recurrentes reales.
    const ciclos: CreditCardCycle[] = [
      { id: 'jul', user_id: 'u', payment_method_id: 'pm', closing_date: '2026-07-23', due_date: '2026-08-03', source: 'declared', created_at: 'x', reminder_dismissed_at: null },
    ]
    const posteada = [{ recurring_plan_id: 'p1', date: '2026-08-01', cycle_id: null }]
    const faltantes = computeMissingAutomaticCharges([PLAN], [TARJETA], posteada, '2026-07', new Date('2026-07-25T12:00:00'), ciclos)
    expect(faltantes).toEqual([])
  })
})

describe('computeMissingAutomaticCharges', () => {
  const methods = [visa, master, debito]
  const hoy = parseLocalDate('2026-08-21')

  it('genera los meses faltantes desde el piso hasta lo ya facturado', () => {
    const faltantes = computeMissingAutomaticCharges(
      [plan({ billing_day: 1, created_at: '2026-01-10T00:00:00Z' })],
      methods,
      [],
      '2026-06',
      hoy,
    )
    // Junio, julio y agosto: los tres ya se facturaron (el día 1 ya pasó).
    expect(faltantes.map((f) => f.month)).toEqual(['2026-06', '2026-07', '2026-08'])
    expect(faltantes.map((f) => f.date)).toEqual(['2026-07-01', '2026-08-01', '2026-09-01'])
  })

  it('A8: no genera el mes en curso si el día de cobro todavía no llegó', () => {
    const faltantes = computeMissingAutomaticCharges(
      [plan({ billing_day: 28, created_at: '2026-07-01T00:00:00Z' })],
      methods,
      [],
      '2026-07',
      hoy, // 21 de agosto: el cobro del 28 de agosto todavía no ocurrió
    )
    expect(faltantes.map((f) => f.month)).toEqual(['2026-07'])
  })

  it('A9: el piso es la creación del plan cuando es posterior al primer ingreso', () => {
    const faltantes = computeMissingAutomaticCharges(
      [plan({ billing_day: 1, created_at: '2026-07-15T00:00:00Z' })],
      methods,
      [],
      '2026-04',
      hoy,
    )
    expect(faltantes.map((f) => f.month)).toEqual(['2026-07', '2026-08'])
  })

  it('A10: el piso es el primer ingreso cuando el plan es anterior', () => {
    const faltantes = computeMissingAutomaticCharges(
      [plan({ billing_day: 1, created_at: '2025-12-01T00:00:00Z' })],
      methods,
      [],
      '2026-08',
      hoy,
    )
    expect(faltantes.map((f) => f.month)).toEqual(['2026-08'])
  })

  it('A11: no duplica un mes que ya tiene su transacción', () => {
    const faltantes = computeMissingAutomaticCharges(
      [plan({ billing_day: 1, created_at: '2026-07-01T00:00:00Z' })],
      methods,
      [tx({ date: '2026-08-01' })], // consumo de julio, ya posteado
      '2026-07',
      hoy,
    )
    expect(faltantes.map((f) => f.month)).toEqual(['2026-08'])
  })

  it('A12: una transacción con la fecha editada a mano igual cuenta como cubierta', () => {
    const faltantes = computeMissingAutomaticCharges(
      [plan({ billing_day: 1, created_at: '2026-07-01T00:00:00Z' })],
      methods,
      [tx({ date: '2026-08-14' })], // mismo mes de vencimiento, otro día
      '2026-07',
      hoy,
    )
    expect(faltantes.map((f) => f.month)).toEqual(['2026-08'])
  })

  it('ignora los planes inactivos y los que no se automatizan', () => {
    const faltantes = computeMissingAutomaticCharges(
      [
        plan({ id: 'p-inactivo', is_active: false, created_at: '2026-07-01T00:00:00Z' }),
        plan({ id: 'p-debito', payment_method_id: debito.id, created_at: '2026-07-01T00:00:00Z' }),
        plan({ id: 'p-anual', frequency: 'yearly', created_at: '2026-07-01T00:00:00Z' }),
      ],
      methods,
      [],
      '2026-07',
      hoy,
    )
    expect(faltantes).toEqual([])
  })

  it('la cobertura se mira por plan, no globalmente', () => {
    const faltantes = computeMissingAutomaticCharges(
      [
        plan({ id: 'p-a', created_at: '2026-08-01T00:00:00Z' }),
        plan({ id: 'p-b', created_at: '2026-08-01T00:00:00Z' }),
      ],
      methods,
      [tx({ recurring_plan_id: 'p-a', date: '2026-09-01' })],
      '2026-08',
      hoy,
    )
    expect(faltantes.map((f) => f.planId)).toEqual(['p-b'])
  })
})

describe('etiquetaDeCobro', () => {
  const plan = { id: 'p1', payment_method_id: 'pm', frequency: 'monthly', billing_day: 10, is_active: true } as unknown as RecurringPlan;
  const metodo = { id: 'pm', type: 'credit', name: 'Visa', default_closing_day: 24, default_payment_day: 6 } as unknown as PaymentMethod;

  it('usa el vencimiento del resumen cuando existe', () => {
    // Resumen declarado de septiembre: cierra el 24, vence el 2 de octubre.
    const ciclos = [
      { id: 'sep', user_id: 'u', payment_method_id: 'pm', closing_date: '2026-09-24', due_date: '2026-10-02', source: 'declared' as const, created_at: 'x', reminder_dismissed_at: null },
    ];
    expect(etiquetaDeCobro(plan, metodo, '2026-09', ciclos)).toBe('Visa · vence 2/10');
  });

  it('cae a los defaults de la tarjeta cuando no hay resumen', () => {
    expect(etiquetaDeCobro(plan, metodo, '2026-09', [])).toBe('Visa · vence 6/10');
  });
});
