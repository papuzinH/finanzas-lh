import { z } from 'zod'
import { format, startOfDay } from 'date-fns'
import { formatLocalDate, parseLocalDate } from '@/lib/utils/dates'
import { computePendingCreditCards, computePaymentMethodStatus } from '@/lib/finance/balances'
import { computePendingFixedExpenses } from '@/lib/finance/pending'
import { computeMonthlyBalance, computeExpensesByCategory } from '@/lib/finance/analysis'
import { computeAvailableToSpend, computeAccountBalance } from '@/lib/finance/pocket'
import { handlePortfolio } from '@/lib/ai/handlers'
import type { ToolDef } from './types'
import { loadFinanceData } from './dataLoader'
import type { SavingsGoal, SavingsGoalContribution, CategoryBudget } from '@/types/database'

// `ToolDef[]` usa el generic por defecto (`z.ZodTypeAny`), así que `execute` recibe
// `args: unknown` en el array final. `executeToolWith` ya validó los args contra el
// `schema` de cada tool antes de llamar a `execute`; estos tipos documentan esa forma
// ya validada para poder leer sus campos sin recurrir a `any`.
type PaymentMethodStatusArgs = { nombre?: string }
type MonthlySummaryArgs = { mes?: string }

// --- Tools agregadas en Task 9: a diferencia de los alias de arriba, cada schema se
// define como const separada y se castea `rawArgs as z.infer<typeof xSchema>` en el
// punto de uso (feedback de review de Task 8: no duplicar la forma del schema a mano).
const expensesByCategorySchema = z.object({
  mes: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional()
    .describe('Mes a desglosar en formato YYYY-MM; si falta, usa el mes actual'),
  tipo: z.enum(['expense', 'income']).optional().describe('Tipo de movimiento a desglosar; por defecto "expense"'),
})

const searchTransactionsSchema = z.object({
  texto: z.string().optional().describe('Texto a buscar en la descripción (case-insensitive, coincidencia parcial)'),
  categoria: z.string().optional().describe('Nombre de categoría a filtrar (case-insensitive, coincidencia parcial)'),
  medio: z.string().optional().describe('Nombre del medio de pago a filtrar (case-insensitive, coincidencia parcial)'),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Fecha desde (YYYY-MM-DD), inclusive'),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Fecha hasta (YYYY-MM-DD), inclusive'),
  limite: z
    .number()
    .int()
    .positive()
    .max(20)
    .default(10)
    .describe('Cantidad máxima de resultados a devolver (máx 20, default 10)'),
})

const installmentsStatusSchema = z.object({
  busqueda: z.string().optional().describe('Texto para filtrar planes de cuotas por descripción (case-insensitive)'),
})

const recurringPlansSchema = z.object({})
const goalsAndBudgetsSchema = z.object({})
const portfolioStatusSchema = z.object({})

export const readTools: ToolDef[] = [
  {
    name: 'get_balance_snapshot',
    description:
      'Plata disponible del usuario: lo que tiene hoy en sus cuentas de gastar menos lo que ya está comprometido en el período (mensualidades y resúmenes de tarjeta). Incluye el saldo por cuenta y lo guardado en reservas. Usar para "cuánta plata tengo".',
    kind: 'read',
    schema: z.object({}),
    execute: async (_args, ctx) => {
      const data = await loadFinanceData(ctx)
      const now = new Date()
      const pendingCards = computePendingCreditCards(
        data.paymentMethods,
        data.transactions,
        data.recurringPlans,
        now,
      )
      const r = computeAvailableToSpend({
        paymentMethods: data.paymentMethods,
        transactions: data.transactions,
        transfers: data.internalTransfers,
        recurringPlans: data.recurringPlans,
        pendingCards,
        rhythm: data.incomeRhythm,
        now,
      })
      return {
        ok: true,
        data: {
          disponible: Math.round(r.available),
          enTusCuentas: Math.round(r.pocketTotal),
          guardadoEnReservas: Math.round(r.reserveTotal),
          comprometido: Math.round(r.committed),
          comprometidoProximoPeriodo: Math.round(r.committedNextPeriod),
          detalleComprometido: r.commitmentItems.map((i) => ({
            concepto: i.name,
            monto: Math.round(i.amount),
            tipo: i.kind === 'card' ? 'tarjeta' : 'mensualidad',
            vence: i.dueDate ? formatLocalDate(i.dueDate) : null,
          })),
          cuentas: r.accounts.map((a) => ({
            medio: a.name,
            saldo: Math.round(a.balance),
            tipo: a.bucket === 'reserve' ? 'reserva' : 'bolsillo',
            saldoDeclarado: a.anchored,
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
          saldo: Math.round(computeAccountBalance(method, data.transactions, data.internalTransfers, now)),
          bolsillo: method.bucket === 'pocket',
          saldoDeclarado: method.initial_balance_at !== null,
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
        .filter((t) => t.type === 'income' && !t.is_balance_adjustment)
        .reduce((acc, t) => acc + Number(t.amount), 0)

      const gastos = inMonth
        .filter((t) => t.type === 'expense' && !t.card_payment_for && !t.is_balance_adjustment)
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
  {
    name: 'get_expenses_by_category',
    description:
      'Desglose de gastos (o ingresos) de un mes por categoría, ordenado de mayor a menor con el porcentaje que representa cada una sobre el total. Sin mes, usa el mes actual. Usar para "en qué gasto más" o "cuánto gasté en comida".',
    kind: 'read',
    schema: expensesByCategorySchema,
    execute: async (rawArgs, ctx) => {
      const args = rawArgs as z.infer<typeof expensesByCategorySchema>
      const data = await loadFinanceData(ctx)
      const now = new Date()
      const tipo = args.tipo ?? 'expense'
      const currentMonth = format(now, 'yyyy-MM')
      const mes = args.mes ?? currentMonth

      // Semántica de "mes histórico" vs "mes actual":
      // computeExpensesByCategory con scope 'current_month' delega en
      // isExpenseInCurrentMonthScope, que para cuotas de tarjeta calcula el ciclo de
      // cierre/vencimiento tratando `now` como "hoy real" — solo da un resultado
      // correcto cuando `now` efectivamente ES hoy (mes actual). No podemos simular
      // un "now" falso para un mes histórico/futuro sin romper esa cuenta de ciclo.
      // Por eso, para cualquier mes != mes actual, pre-filtramos las transacciones
      // por periodDate (el mes VISUAL, que prepareTransactions ya calculó aplicando
      // el ciclo de tarjeta correspondiente — mismo criterio que usa
      // get_monthly_summary) y llamamos a computeExpensesByCategory con scope
      // 'global' sobre ese subconjunto ya acotado, para que no vuelva a filtrar por
      // fecha (scope 'global' incluye todo lo que reciba).
      const isCurrentMonth = mes === currentMonth
      const breakdown = isCurrentMonth
        ? computeExpensesByCategory(data.transactions, data.paymentMethods, data.categories, 'current_month', tipo, now)
        : computeExpensesByCategory(
            data.transactions.filter((t) => (t.periodDate || t.date).slice(0, 7) === mes),
            data.paymentMethods,
            data.categories,
            'global',
            tipo,
            now,
          )

      const total = Object.values(breakdown).reduce((acc, monto) => acc + monto, 0)
      const items = Object.entries(breakdown)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([categoria, monto]) => ({
          categoria,
          monto: Math.round(monto),
          porcentaje: total > 0 ? Math.round((monto / total) * 1000) / 10 : 0,
        }))

      return { ok: true, data: { mes, tipo, total: Math.round(total), items } }
    },
  },
  {
    name: 'search_transactions',
    description:
      'Busca movimientos por texto en la descripción, categoría, medio de pago o rango de fechas. Devuelve como máximo 20 filas (10 por defecto), las más recientes primero. Usar para "cuándo compré X" o "mostrame los gastos con la Visa".',
    kind: 'read',
    schema: searchTransactionsSchema,
    execute: async (rawArgs, ctx) => {
      const args = rawArgs as z.infer<typeof searchTransactionsSchema>
      const data = await loadFinanceData(ctx)
      const limite = Math.min(args.limite, 20) // clamp defensivo: el schema ya rechaza >20, pero no confiamos solo en eso

      const texto = args.texto?.toLowerCase()
      const categoriaQuery = args.categoria?.toLowerCase()
      const medioQuery = args.medio?.toLowerCase()

      const rows = data.transactions
        .filter((t) => {
          if (texto && !t.description.toLowerCase().includes(texto)) return false
          if (args.desde && t.date < args.desde) return false
          if (args.hasta && t.date > args.hasta) return false
          if (categoriaQuery) {
            const cat = data.categories.find((c) => c.id === t.category_id)
            if (!cat || !cat.name.toLowerCase().includes(categoriaQuery)) return false
          }
          if (medioQuery) {
            const pm = data.paymentMethods.find((m) => m.id === t.payment_method_id)
            if (!pm || !pm.name.toLowerCase().includes(medioQuery)) return false
          }
          return true
        })
        .slice()
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        .slice(0, limite)
        .map((t) => ({
          id: t.id,
          fecha: t.date,
          descripcion: t.description,
          monto: Math.round(Number(t.amount)),
          categoria: data.categories.find((c) => c.id === t.category_id)?.name ?? 'Otros',
          medio: data.paymentMethods.find((m) => m.id === t.payment_method_id)?.name ?? null,
        }))

      return { ok: true, data: rows }
    },
  },
  {
    name: 'get_installments_status',
    description:
      'Estado de los planes de cuotas: cuántas cuotas ya se pagaron y cuántas faltan, y el monto restante de cada plan. Usar para "cuánto me falta pagar de la notebook" o "cuántas cuotas me quedan".',
    kind: 'read',
    schema: installmentsStatusSchema,
    execute: async (rawArgs, ctx) => {
      const args = rawArgs as z.infer<typeof installmentsStatusSchema>
      const data = await loadFinanceData(ctx)
      const now = new Date()
      const query = args.busqueda?.toLowerCase()

      const plans = query
        ? data.installmentPlans.filter((p) => p.description.toLowerCase().includes(query))
        : data.installmentPlans

      // Replica getInstallmentStatus del store (financeStore.ts ~1016-1057) sobre los
      // datos del loader. No está en lib/finance por decisión de alcance: es corta y
      // específica de esta tool (fuera del scope de extracción del plan de Task 9).
      const items = plans.slice(0, 20).map((plan) => {
        const relatedTransactions = data.transactions.filter((t) => t.installment_plan_id === plan.id)
        const paidTransactions = relatedTransactions.filter((t) => parseLocalDate(t.date) <= startOfDay(now))
        const paidAmount = paidTransactions.reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0)
        const totalAmount = Number(plan.total_amount)
        const installmentsPaidCount = paidTransactions.length
        const remainingAmount = Math.max(totalAmount - paidAmount, 0)
        const remainingInstallments = Math.max(plan.installments_count - installmentsPaidCount, 0)
        const progress = totalAmount > 0 ? Math.round((paidAmount / totalAmount) * 1000) / 10 : 0

        return {
          id: plan.id,
          descripcion: plan.description,
          cuotasPagadas: installmentsPaidCount,
          cuotasRestantes: remainingInstallments,
          montoRestante: Math.round(remainingAmount),
          progreso: progress,
          finalizado: remainingAmount <= 100,
        }
      })

      return { ok: true, data: items }
    },
  },
  {
    name: 'list_recurring_plans',
    description:
      'Lista las mensualidades activas con su monto en ARS y si ya se registró el pago de este mes. Usar para "qué mensualidades tengo" o "qué me falta pagar este mes".',
    kind: 'read',
    schema: recurringPlansSchema,
    execute: async (_rawArgs, ctx) => {
      const data = await loadFinanceData(ctx)
      const now = new Date()
      const pendingFixed = computePendingFixedExpenses(data.recurringPlans, data.transactions, now)
      const pendingIds = new Set(pendingFixed.items.map((i) => i.id))

      const items = data.recurringPlans
        .filter((p) => p.is_active)
        .slice(0, 20)
        .map((plan) => ({
          id: plan.id,
          descripcion: plan.description,
          monto: Math.round(Number(plan.amount)),
          frecuencia: plan.frequency,
          pendienteEsteMes: pendingIds.has(plan.id),
        }))

      return { ok: true, data: items }
    },
  },
  {
    name: 'list_goals_and_budgets',
    description:
      'Metas de ahorro y presupuestos por categoría del usuario, con su progreso y estado actual. Usar para "cómo voy con mis metas" o "me estoy pasando del presupuesto de comida".',
    kind: 'read',
    schema: goalsAndBudgetsSchema,
    execute: async (_rawArgs, ctx) => {
      const { supabase, authUserId } = ctx
      const now = new Date()
      const currentMonth = format(now, 'yyyy-MM')

      // Metas/presupuestos: queries directas (mismo criterio que el goalContext de
      // src/app/api/chat/route.ts:141-206), filtrando por ctx.authUserId (UUID).
      // Para "gastado por categoría" reutilizamos loadFinanceData en vez de repetir la
      // query de transactions de esa referencia: esa query filtra `transactions`
      // (columna user_id NUMÉRICA) con el UUID de auth, un mismatch de tipos que deja
      // `spentByCategory` siempre en 0 (mismo bug documentado en dataLoader.ts Step 0
      // para `categories`). loadFinanceData ya trae transactions/categories con el
      // criterio correcto, así que evitamos propagar ese bug.
      const [{ data: savingsGoalsData }, { data: contributionsData }, { data: budgetsData }] = await Promise.all([
        supabase.from('savings_goals').select('*').eq('user_id', authUserId).eq('is_active', true),
        supabase.from('savings_goal_contributions').select('*').eq('user_id', authUserId),
        supabase.from('category_budgets').select('*').eq('user_id', authUserId).eq('is_active', true),
      ])

      const goals = (savingsGoalsData ?? []) as SavingsGoal[]
      const contributions = (contributionsData ?? []) as SavingsGoalContribution[]
      const budgets = (budgetsData ?? []) as CategoryBudget[]

      const metas = goals.map((g) => {
        const goalContributions = contributions.filter((c) => c.goal_id === g.id)
        const total = goalContributions.reduce((s, c) => s + Number(c.amount), 0)
        const monthTotal = goalContributions
          .filter((c) => c.date.startsWith(currentMonth))
          .reduce((s, c) => s + Number(c.amount), 0)
        const effective = g.type === 'monthly' ? monthTotal : total
        const targetAmount = Number(g.target_amount)
        const progreso = targetAmount > 0 ? Math.round((effective / targetAmount) * 1000) / 10 : 0
        return {
          nombre: g.name,
          tipo: g.type,
          objetivo: targetAmount,
          progreso,
          estado: effective >= targetAmount ? 'completada' : 'activa',
        }
      })

      const data = await loadFinanceData(ctx)
      const spentByCategory = data.transactions
        .filter(
          (t) =>
            t.type === 'expense' &&
            !t.card_payment_for &&
            !t.is_balance_adjustment &&
            (t.periodDate || t.date).slice(0, 7) === currentMonth,
        )
        .reduce((acc, t) => {
          if (!t.category_id) return acc
          acc[t.category_id] = (acc[t.category_id] || 0) + Math.abs(Number(t.amount))
          return acc
        }, {} as Record<string, number>)

      const presupuestos = budgets.map((b) => {
        const cat = data.categories.find((c) => c.id === b.category_id)
        const limite = Number(b.amount)
        const gastado = spentByCategory[b.category_id] ?? 0
        const porcentaje = limite > 0 ? Math.round((gastado / limite) * 1000) / 10 : 0
        return {
          categoria: cat?.name ?? b.category_id,
          limite,
          gastado: Math.round(gastado),
          porcentaje,
          estado: porcentaje >= 100 ? 'excedido' : porcentaje >= 80 ? 'alerta' : 'ok',
        }
      })

      return { ok: true, data: { metas, presupuestos } }
    },
  },
  {
    name: 'get_portfolio_status',
    description:
      'Estado del portfolio de inversiones: tickers, cantidad, precio de compra promedio y variación respecto al precio de mercado actual. Usar para "cómo van mis inversiones".',
    kind: 'read',
    schema: portfolioStatusSchema,
    execute: async (_rawArgs, ctx) => {
      const res = await handlePortfolio(ctx.supabase, ctx.authUserId)
      if (!res.success) return { ok: false, error: res.message }
      return { ok: true, data: { resumen: res.message } }
    },
  },
]
