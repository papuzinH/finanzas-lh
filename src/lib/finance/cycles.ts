//
// El resumen de tarjeta como entidad. PURO: sin Zustand ni Supabase, como todo
// lo de lib/finance/ -- lo consumen el store (cliente) y las tools del chat (servidor).
//
// Las fechas se comparan como strings 'yyyy-MM-dd' y no como Date: el orden
// lexicografico coincide con el cronologico y no depende de la TZ del runtime
// (Vercel corre en UTC, la maquina de desarrollo no). Es la leccion de rangoDelMes.
//
// Spec: docs/superpowers/specs/2026-09-01-ciclos-tarjeta-design.md
import { addMonths, getDaysInMonth, setDate } from 'date-fns'
import { formatLocalDate, parseLocalDate } from '@/lib/utils/dates'
import type { Database, PaymentMethod } from '@/types/database'

export type CreditCardCycle = Database['public']['Tables']['credit_card_cycles']['Row']
export type CicloNuevo = Omit<CreditCardCycle, 'id' | 'created_at'>

/** Los ciclos de UNA tarjeta, ordenados por cierre ascendente. */
export function ciclosDeMetodo(methodId: string, ciclos: CreditCardCycle[]): CreditCardCycle[] {
  return ciclos
    .filter((c) => c.payment_method_id === methodId)
    .sort((a, b) => a.closing_date.localeCompare(b.closing_date))
}

/**
 * A que resumen pertenece una compra: el primero que cierra en su fecha o despues.
 *
 * El `>=` es la regla del borde: una compra hecha EL DIA del cierre entra en el
 * ciclo que cierra, porque el ciclo corre hasta las 23:59 de esa fecha. Es la regla
 * del banco, confirmada por el usuario, y es la que ya tenia calculateCreditPaymentDate
 * (saltaba de ciclo con `diaCompra > closingDay`, que con 27 > 27 da false).
 *
 * Devuelve undefined si ningun ciclo materializado la contiene: quien llame decide
 * si generar mas (asegurarCiclos) o dejar la transaccion sin ciclo. Nunca inventa uno.
 *
 * Precondicion: `ciclos` debe llegar ya filtrado por tarjeta y ordenado ascendente por
 * `closing_date`, como lo produce `ciclosDeMetodo`. Quien llame es responsable del orden.
 */
export function cicloDeCompra(purchaseDate: string, ciclos: CreditCardCycle[]): CreditCardCycle | undefined {
  return ciclos.filter((c) => c.closing_date >= purchaseDate)[0]
}

/**
 * El resumen vigente: el de menor vencimiento que todavia no paso.
 *
 * El dia EXACTO del vencimiento sigue siendo el vigente -- ese dia todavia hay que
 * pagarlo. Mismo criterio que tenia getCreditCycleDates, que esta funcion reemplaza.
 */
export function cicloVigente(ciclos: CreditCardCycle[], now: Date): CreditCardCycle | undefined {
  const hoy = formatLocalDate(now)
  // Se ordena por due_date, que para los ciclos generados coincide siempre con el orden
  // de closing_date. Para 'declared' con due_date atípico (cambio de feriado, etc), se
  // asume que esa anomalía es pequeña y no invierte el orden real de vencimientos.
  return [...ciclos].sort((a, b) => a.due_date.localeCompare(b.due_date)).find((c) => c.due_date >= hoy)
}

/**
 * El resumen inmediatamente anterior a `ciclo` por fecha de cierre.
 *
 * Precondicion: `ciclos` debe llegar ya filtrado por tarjeta y ordenado ascendente por
 * `closing_date`, como lo produce `ciclosDeMetodo`. Quien llame es responsable del orden.
 */
export function cicloAnterior(ciclos: CreditCardCycle[], ciclo: CreditCardCycle): CreditCardCycle | undefined {
  const previos = ciclos.filter((c) => c.closing_date < ciclo.closing_date)
  return previos[previos.length - 1]
}

/**
 * El ciclo que esta `n` resumenes despues de `desde` (n = 0 es `desde`).
 *
 * Las cuotas cuentan RESUMENES, no meses: con vencimientos reales de 4-sep y 9-oct,
 * addMonths(primera, 1) daria 4-oct, que no es ninguna fecha de esa tarjeta.
 *
 * Precondicion: `ciclos` debe llegar ya filtrado por tarjeta y ordenado ascendente por
 * `closing_date`, como lo produce `ciclosDeMetodo`. Quien llame es responsable del orden.
 */
export function cicloNEsimo(
  ciclos: CreditCardCycle[],
  desde: CreditCardCycle,
  n: number,
): CreditCardCycle | undefined {
  const i = ciclos.findIndex((c) => c.id === desde.id)
  if (i < 0) return undefined
  return ciclos[i + n]
}

/**
 * El resumen que un pago hecho en `fechaPago` salda: el ULTIMO ciclo (por
 * closing_date) con cierre en o antes de esa fecha -- el mas recientemente
 * cerrado a la fecha en que se pago.
 *
 * Lo usa el dialogo de "Registrar pago" (pagos sueltos que no vienen de un
 * summary, el usuario elige tarjeta/medio/monto/fecha a mano): acierta en pago
 * puntual, adelantado o con algunos dias de atraso; solo falla si el pago
 * llega despues del cierre SIGUIENTE al que salda -- caso que la logica vieja
 * por rango de mes tampoco resolvia. Elegir el resumen a mano queda para mas
 * adelante.
 *
 * Precondicion: `ciclos` debe llegar ya filtrado por tarjeta y ordenado ascendente
 * por `closing_date`, como lo produce `ciclosDeMetodo`. Quien llame es responsable
 * del orden.
 */
export function cicloSaldadoEn(ciclos: CreditCardCycle[], fechaPago: string): CreditCardCycle | undefined {
  const cerrados = ciclos.filter((c) => c.closing_date <= fechaPago)
  return cerrados[cerrados.length - 1]
}

/**
 * Pare los ciclos que faltan entre `desde` y `hasta` (ambos inclusive, por mes)
 * a partir de los defaults de la tarjeta.
 *
 * `default_closing_day` / `default_payment_day` sobreviven como GENERADOR, no como
 * verdad: paren el proximo ciclo cuando no hay dato mejor. Un mes que ya tiene ciclo
 * no se toca, sea 'generated' o 'declared' -- de ahi sale el invariante de que
 * regenerar nunca pisa lo que el usuario leyo del resumen.
 *
 * Limitacion asumida: UN ciclo por mes calendario. Los emisores relevados (Macro,
 * Ciudad, Galicia, Naranja X, Uala) cierran una vez por mes por tarjeta; el "cada
 * jueves" de Macro es un cierre por cartera, no cuatro para la misma tarjeta.
 */
export function generarCiclos(
  method: PaymentMethod,
  desde: Date,
  hasta: Date,
  existentes: CreditCardCycle[],
): CicloNuevo[] {
  const closingDay = method.default_closing_day
  const paymentDay = method.default_payment_day
  if (method.type !== 'credit' || !closingDay || !paymentDay) return []

  const mesesOcupados = new Set(
    ciclosDeMetodo(method.id, existentes).map((c) => c.closing_date.slice(0, 7)),
  )

  const nuevos: CicloNuevo[] = []
  let cursor = new Date(desde.getFullYear(), desde.getMonth(), 1)
  const fin = new Date(hasta.getFullYear(), hasta.getMonth(), 1)

  while (cursor <= fin) {
    const mes = formatLocalDate(cursor).slice(0, 7)
    if (!mesesOcupados.has(mes)) {
      const cierre = setDate(cursor, Math.min(closingDay, getDaysInMonth(cursor)))
      // paymentDay > closingDay: vence en el mismo mes del cierre (cierra 10, vence 25).
      // paymentDay <= closingDay: vence el mes siguiente (cierra 20, vence 1).
      const mesDelPago = paymentDay > closingDay ? cursor : addMonths(cursor, 1)
      const vencimiento = setDate(mesDelPago, Math.min(paymentDay, getDaysInMonth(mesDelPago)))
      nuevos.push({
        user_id: method.user_id,
        payment_method_id: method.id,
        closing_date: formatLocalDate(cierre),
        due_date: formatLocalDate(vencimiento),
        source: 'generated',
      })
    }
    cursor = addMonths(cursor, 1)
  }
  return nuevos
}

export type CambioDeCiclo = { id: string; closing_date: string; due_date: string };

/**
 * El resumen cuyo cierre cae en el MISMO MES CALENDARIO que `closingDate`.
 *
 * Declarar es corregir la fecha de un resumen que la app ya estimo, no crear uno nuevo: si el
 * estimado de septiembre cierra el 20 y el usuario declara que cerro el 24, hay que ACTUALIZAR
 * esa fila. Insertar dejaria dos resumenes de septiembre para la misma tarjeta -- la unique de
 * la tabla es (payment_method_id, closing_date) y no lo impide.
 *
 * Espera `ciclos` ya filtrado por tarjeta (ver ciclosDeMetodo).
 */
export function cicloDelMesDe(
  ciclos: CreditCardCycle[],
  closingDate: string,
): CreditCardCycle | undefined {
  const mes = closingDate.slice(0, 7);
  return ciclos.find((c) => c.closing_date.slice(0, 7) === mes);
}

/**
 * Que resumenes futuros hay que re-fechar cuando cambian los defaults de la tarjeta.
 *
 * Es la segunda mitad del invariante del spec: declarar o editar un cierre NO reasigna ninguna
 * transaccion, pero SI actualiza las fechas de los resumenes futuros estimados. Sin esto la
 * ficha de la tarjeta dice una cosa y sus resumenes dicen otra -- medido en DEV el 2026-09-02,
 * con cuatro meses de cuotas venciendo un dia que la tarjeta ya no declaraba.
 *
 * Nunca toca un `declared` (es dato que el usuario leyo del resumen) ni un resumen que ya cerro
 * (sus compras estan imputadas, y re-fecharlo moveria plata de un resumen a otro).
 *
 * Devuelve solo los que efectivamente cambian, para no escribir de mas.
 */
export function recalcularFuturosGenerated(
  method: PaymentMethod,
  ciclos: CreditCardCycle[],
  hoy: string,
): CambioDeCiclo[] {
  if (method.type !== 'credit' || !method.default_closing_day || !method.default_payment_day) {
    return [];
  }

  const futurosEstimados = ciclos
    .filter((c) => c.source === 'generated' && c.closing_date > hoy)
    .sort((a, b) => a.closing_date.localeCompare(b.closing_date));
  if (futurosEstimados.length === 0) return [];

  // generarCiclos ya sabe clampear el dia al ultimo del mes y decidir si el vencimiento cae en
  // el mismo mes o en el siguiente. Se le pide el rango de los futuros SIN pasarle existentes,
  // y se aparea por mes con lo que hay.
  const desde = parseLocalDate(futurosEstimados[0].closing_date);
  const hasta = parseLocalDate(futurosEstimados[futurosEstimados.length - 1].closing_date);
  const frescos = generarCiclos(method, desde, hasta, []);
  const frescoPorMes = new Map(frescos.map((c) => [c.closing_date.slice(0, 7), c]));

  const cambios: CambioDeCiclo[] = [];
  for (const viejo of futurosEstimados) {
    const fresco = frescoPorMes.get(viejo.closing_date.slice(0, 7));
    if (!fresco) continue;
    if (fresco.closing_date === viejo.closing_date && fresco.due_date === viejo.due_date) continue;
    cambios.push({ id: viejo.id, closing_date: fresco.closing_date, due_date: fresco.due_date });
  }
  return cambios;
}
