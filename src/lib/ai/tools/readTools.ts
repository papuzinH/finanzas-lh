import { z } from 'zod'
import { format } from 'date-fns'
import { formatLocalDate } from '@/lib/utils/dates'
import { computeGlobalBalance, computePendingCreditCards, computePaymentMethodStatus } from '@/lib/finance/balances'
import { computePendingFixedExpenses } from '@/lib/finance/pending'
import { computeMonthlyBalance } from '@/lib/finance/analysis'
import type { ToolDef } from './types'
import { loadFinanceData } from './dataLoader'

// `ToolDef[]` usa el generic por defecto (`z.ZodTypeAny`), así que `execute` recibe
// `args: unknown` en el array final. `executeToolWith` ya validó los args contra el
// `schema` de cada tool antes de llamar a `execute`; estos tipos documentan esa forma
// ya validada para poder leer sus campos sin recurrir a `any`.
type PaymentMethodStatusArgs = { nombre?: string }
type MonthlySummaryArgs = { mes?: string }

export const readTools: ToolDef[] = [
  {
    name: 'get_balance_snapshot',
    description:
      'Disponible Real del usuario: cuánta plata libre tiene hoy, saldo bruto y compromisos pendientes (mensualidades y tarjetas). Usar para "cuánta plata tengo".',
    kind: 'read',
    schema: z.object({}),
    execute: async (_args, ctx) => {
      const data = await loadFinanceData(ctx)
      const now = new Date()
      const pendingFixed = computePendingFixedExpenses(data.recurringPlans, data.transactions, now)
      const disponibleReal = computeGlobalBalance(
        data.transactions,
        data.paymentMethods,
        data.internalTransfers,
        pendingFixed.total,
        now,
      )
      const pendingCards = computePendingCreditCards(
        data.paymentMethods,
        data.transactions,
        data.recurringPlans,
        now,
      ).filter((c) => c.isPending)
      const pendingCardTotal = pendingCards.reduce((acc, c) => acc + c.total, 0)
      return {
        ok: true,
        data: {
          disponibleReal: Math.round(disponibleReal),
          saldoBruto: Math.round(disponibleReal + pendingFixed.total + pendingCardTotal),
          mensualidadesPendientes: pendingFixed,
          tarjetasPendientes: pendingCards.map((c) => ({
            tarjeta: c.name,
            total: Math.round(c.total),
            vence: formatLocalDate(c.nextPaymentDate),
            estado: c.isCycleClosed ? 'cerrado' : 'en curso',
          })),
        },
      }
    },
  },
  {
    name: 'get_payment_method_status',
    description:
      'Estado de un medio de pago (tarjeta, débito o efectivo): para crédito devuelve el total a pagar en el próximo vencimiento; para débito/efectivo el saldo disponible. Sin nombre, lista todos los medios con su estado resumido. Usar para "cuánto tengo en X" o "cuánto debo de la tarjeta Y".',
    kind: 'read',
    schema: z.object({
      nombre: z.string().optional().describe('Nombre del medio de pago a consultar; si falta, lista todos'),
    }),
    execute: async (rawArgs, ctx) => {
      const args = rawArgs as PaymentMethodStatusArgs
      const data = await loadFinanceData(ctx)
      const now = new Date()
      // isCycleClosed no es un output de computePaymentMethodStatus: lo tomamos de
      // computePendingCreditCards (misma fuente que get_balance_snapshot) para no
      // reimplementar la comparación de fechas a mano.
      const pendingCards = computePendingCreditCards(data.paymentMethods, data.transactions, data.recurringPlans, now)

      const summarize = (method: (typeof data.paymentMethods)[number]) => {
        const status = computePaymentMethodStatus(method, data.transactions, data.recurringPlans, now)

        if (status.nextPaymentDate) {
          const cardSummary = pendingCards.find((c) => c.methodId === method.id)
          return {
            medio: method.name,
            tipo: method.type,
            totalAPagar: Math.round(Math.abs(status.projectedTotal)),
            vencimiento: formatLocalDate(status.nextPaymentDate),
            cierre: status.nextClosingDate ? formatLocalDate(status.nextClosingDate) : null,
            arsExpenses: Math.round(status.arsExpenses),
            usdExpenses: Math.round(status.usdExpenses),
            estado: cardSummary?.isCycleClosed ? 'cerrado' : 'en curso',
          }
        }

        return {
          medio: method.name,
          tipo: method.type,
          saldo: Math.round(status.currentConsumption),
        }
      }

      if (!args.nombre) {
        return { ok: true, data: data.paymentMethods.map(summarize) }
      }

      const query = args.nombre.toLowerCase()
      const method = data.paymentMethods.find((m) => m.name.toLowerCase().includes(query))
      if (!method) {
        const names = data.paymentMethods.map((m) => m.name).join(', ')
        return { ok: false, error: `No encontré "${args.nombre}". Medios: ${names}` }
      }

      return { ok: true, data: summarize(method) }
    },
  },
  {
    name: 'get_monthly_summary',
    description:
      'Resumen de ingresos, gastos y balance de un mes (todos los medios de pago combinados). Sin mes, usa el mes actual. Usar para "cómo vengo este mes" o "cuánto gasté en julio".',
    kind: 'read',
    schema: z.object({
      mes: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .optional()
        .describe('Mes a consultar en formato YYYY-MM; si falta, usa el mes actual'),
    }),
    execute: async (rawArgs, ctx) => {
      const args = rawArgs as MonthlySummaryArgs
      const data = await loadFinanceData(ctx)
      const now = new Date()
      const mes = args.mes ?? format(now, 'yyyy-MM')

      const inMonth = data.transactions.filter((t) => {
        const visualDate = t.periodDate || t.date
        return visualDate.slice(0, 7) === mes
      })

      const ingresos = inMonth
        .filter((t) => t.type === 'income')
        .reduce((acc, t) => acc + Number(t.amount), 0)

      const gastos = inMonth
        .filter((t) => t.type === 'expense' && !t.card_payment_for)
        .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0)

      const balance = computeMonthlyBalance(data.transactions, data.recurringPlans, mes, 'all', now)

      return {
        ok: true,
        data: {
          mes,
          ingresos: Math.round(ingresos),
          gastos: Math.round(gastos),
          balance: Math.round(balance),
        },
      }
    },
  },
]
