'use client';

import {
  CreditCard,
  Wallet,
  Banknote,
  CalendarClock,
  MoreVertical,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn, formatCurrency, formatUsd } from '@/lib/utils';
import { PaymentMethod, Transaction, RecurringPlan } from '@/types/database';
import type { AccountBalance } from '@/lib/finance/pocket';
import { Card } from '@/components/ui/card';
import { PaymentMethodDetailModal } from './payment-method-detail-modal';
import { EditPaymentMethodDialog } from './edit-payment-method-dialog';
import { DeletePaymentMethodDialog } from './delete-payment-method-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface PaymentCardProps {
  data: PaymentMethod & {
    status: {
      currentConsumption: number;
      fixedCosts: number;
      projectedTotal: number;
      usdExpenses: number;
      arsExpenses: number;
      nextClosingDate?: Date;
      nextPaymentDate?: Date;
    };
    history: Transaction[];
    subscriptions: RecurringPlan[];
    /** Saldo del modelo de bolsillo. null para las tarjetas de crédito, que no tienen saldo propio. */
    cuenta: AccountBalance | null;
  };
}

/** Monto de un movimiento respetando su moneda original (USD no se convierte). */
function movementAmount(t: Transaction): string {
  if (t.original_currency === 'USD' && t.original_amount) {
    return formatUsd(Math.abs(Number(t.original_amount)));
  }
  return formatCurrency(Math.abs(Number(t.amount)));
}

export function InstitutionalCard({ data }: PaymentCardProps) {
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const isCredit = data.type === 'credit';
  const { status, history, subscriptions } = data;

  // Crédito: se muestra ARS y USD por separado (sin conversión).
  const arsDue = status.arsExpenses;
  const usdDue = status.usdExpenses;
  const isCreditSettled = isCredit && arsDue === 0 && usdDue === 0;

  const cuenta = data.cuenta;
  // El saldo de una cuenta sale del modelo de bolsillo (anclado); el de una tarjeta,
  // de su ciclo. `status.projectedTotal` para débito es el histórico sin ancla: no se usa.
  const saldo = cuenta ? cuenta.balance : status.projectedTotal;
  const balanceIsNegative = saldo < 0;

  // Mensualidades del ciclo que todavía no se debitaron (para que el total cuadre).
  const postedRecurringIds = new Set(
    history.filter((t) => t.recurring_plan_id != null).map((t) => t.recurring_plan_id)
  );
  const pendingSubs = isCredit
    ? subscriptions.filter((s) => !postedRecurringIds.has(s.id))
    : [];

  const Icon = isCredit ? CreditCard : (data.type === 'cash' ? Banknote : Wallet);

  return (
    <>
      <Card
        onClick={() => setIsDetailOpen(true)}
        className="p-5 relative overflow-hidden transition-colors cursor-pointer active:scale-[0.98] hover:border-accent/40"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent-deep">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-sans font-bold text-text">{data.name}</h3>
                {cuenta?.bucket === 'reserve' && (
                  <span className="rounded-full border-[1.5px] border-border px-2 py-0.5 text-[10px] font-bold text-muted">
                    Reserva
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium text-muted uppercase tracking-wide">
                {isCredit ? 'Tarjeta de Crédito' : 'Cuenta / Efectivo'}
              </span>
            </div>
          </div>

          {/* Menú de acciones */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                aria-label="Más opciones"
                className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:text-text hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="bg-surface border-[1.5px] border-border text-text"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenuItem
                onClick={() => setIsEditOpen(true)}
                className="gap-2 cursor-pointer focus:bg-surface-2 focus:text-text"
              >
                <Pencil className="h-4 w-4" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setIsDeleteOpen(true)}
                className="gap-2 cursor-pointer text-bad focus:bg-bad/10 focus:text-bad"
              >
                <Trash2 className="h-4 w-4" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Body: Monto principal y fechas */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <p className="text-xs text-muted mb-1">
              {isCredit ? 'A pagar este ciclo' : cuenta?.bucket === 'reserve' ? 'Guardado' : 'Saldo disponible'}
            </p>
            {isCredit ? (
              isCreditSettled ? (
                <p className="font-display tnum text-2xl leading-none text-good">Al día</p>
              ) : (
                <div className="space-y-1">
                  {(arsDue > 0 || usdDue === 0) && (
                    <p className="font-display tnum text-2xl leading-none text-text">
                      {formatCurrency(arsDue)}
                    </p>
                  )}
                  {usdDue > 0 && (
                    <p
                      className={cn(
                        'font-display tnum leading-none text-text',
                        arsDue > 0 ? 'text-base text-muted' : 'text-2xl'
                      )}
                    >
                      {formatUsd(usdDue)}
                    </p>
                  )}
                </div>
              )
            ) : (
              <>
                <p
                  className={cn(
                    'font-display tnum text-2xl leading-none',
                    balanceIsNegative ? 'text-bad' : 'text-good'
                  )}
                >
                  {formatCurrency(saldo)}
                </p>
                {cuenta && !cuenta.anchored && (
                  <p className="mt-1 text-[11px] text-faint">Sin saldo declarado</p>
                )}
              </>
            )}
          </div>

          {/* Fechas Clave (Solo Crédito) */}
          {isCredit && status.nextClosingDate && status.nextPaymentDate && (
            <div className="flex flex-col justify-center gap-2 text-xs border-l-[1.5px] border-border pl-6">
              <div className="flex justify-between items-center">
                <span className="text-muted">Cierra el</span>
                <span className="font-medium text-text tnum">
                  {format(status.nextClosingDate, 'd MMM', { locale: es })}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted">Vence el</span>
                <span className="font-medium text-warn tnum">
                  {format(status.nextPaymentDate, 'd MMM', { locale: es })}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer: Mensualidades y Movimientos */}
        <div className="space-y-4 pt-4 border-t-[1.5px] border-border">
          {/* Resumen Mensualidades */}
          {subscriptions.length > 0 && (
            <div className="flex items-center justify-between text-xs bg-surface-2 p-2 rounded-lg border-[1.5px] border-border">
              <div className="flex items-center gap-2 text-muted">
                <CalendarClock className="h-3.5 w-3.5" />
                <span>{subscriptions.length} servicios adheridos</span>
              </div>
              <span className="tnum font-medium text-text">
                {formatCurrency(status.fixedCosts)}
              </span>
            </div>
          )}

          {/* Movimientos del ciclo / mes */}
          <div className="space-y-2">
            <p className="text-[10px] font-medium text-muted uppercase tracking-wider mb-2">
              {isCredit ? 'Movimientos del ciclo' : 'Movimientos del mes'}
            </p>
            {history.length > 0 || pendingSubs.length > 0 ? (
              <>
                {history.map((t, i) => (
                  <div key={i} className="flex items-center justify-between text-xs group">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          t.type === 'income' ? 'bg-good' : 'bg-faint'
                        )}
                      />
                      <span className="text-muted truncate max-w-[150px]">{t.description}</span>
                    </div>
                    <span
                      className={cn(
                        'tnum font-medium',
                        t.type === 'income' ? 'text-good' : 'text-muted'
                      )}
                    >
                      {t.type === 'income' ? '+' : '-'}
                      {movementAmount(t)}
                    </span>
                  </div>
                ))}
                {/* Mensualidades del ciclo aún sin debitar (para que cuadre con "A pagar") */}
                {pendingSubs.map((s) => (
                  <div key={`sub-${s.id}`} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div className="h-1.5 w-1.5 rounded-full bg-accent/40" />
                      <span className="text-faint truncate max-w-[150px]">
                        {s.description} · por debitar
                      </span>
                    </div>
                    <span className="tnum font-medium text-faint">
                      -
                      {s.currency === 'USD' && s.original_amount
                        ? formatUsd(Math.abs(Number(s.original_amount)))
                        : formatCurrency(Math.abs(Number(s.amount)))}
                    </span>
                  </div>
                ))}
              </>
            ) : (
              <p className="text-[10px] text-muted italic pl-3">Sin movimientos este mes</p>
            )}
          </div>
        </div>
      </Card>

      <PaymentMethodDetailModal
        isOpen={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        data={data}
      />

      <EditPaymentMethodDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        paymentMethod={data}
      />

      <DeletePaymentMethodDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        paymentMethod={data}
      />
    </>
  );
}
