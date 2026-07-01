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
import { cn, formatCurrency } from '@/lib/utils';
import { PaymentMethod, Transaction, RecurringPlan } from '@/types/database';
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
      nextClosingDate?: Date;
      nextPaymentDate?: Date;
    };
    history: Transaction[];
    subscriptions: RecurringPlan[];
  };
}

export function InstitutionalCard({ data }: PaymentCardProps) {
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const isCredit = data.type === 'credit';
  const { status, history, subscriptions } = data;

  const isNegative = status.projectedTotal < 0;
  const amountColor = isNegative ? "text-bad" : "text-good";

  const Icon = isCredit ? CreditCard : (data.type === 'cash' ? Banknote : Wallet);
  const iconColor = isCredit ? "text-accent-deep" : "text-accent-deep";
  const iconBg = isCredit ? "bg-accent/10" : "bg-accent/10";
  const borderColor = isCredit ? "border-border/50 hover:border-accent/40" : "border-border hover:border-accent/40";

  return (
    <>
      <div
        onClick={() => setIsDetailOpen(true)}
        className={cn(
          "rounded-2xl border bg-surface-2/50 p-5 relative overflow-hidden transition-all cursor-pointer active:scale-[0.98]",
          borderColor
        )}
      >

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", iconBg, iconColor)}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-text">{data.name}</h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-muted uppercase tracking-wide">
                  {isCredit ? 'Tarjeta de Crédito' : 'Cuenta / Efectivo'}
                </span>
              </div>
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
              className="bg-surface border-border text-text"
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

        {/* Body: Montos y Fechas */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <p className="text-xs text-muted mb-1">
              {isCredit ? 'Consumo Actual' : 'Saldo Disponible'}
            </p>
            <p className={cn("text-2xl font-bold font-mono tracking-tight", amountColor)}>
              {formatCurrency(status.projectedTotal)}
            </p>
          </div>

          {/* Fechas Clave (Solo Crédito) */}
          {isCredit && status.nextClosingDate && status.nextPaymentDate && (
            <div className="flex flex-col justify-center gap-2 text-xs border-l border-border pl-6">
              <div className="flex justify-between items-center">
                <span className="text-muted">Cierra el</span>
                <span className="font-medium text-text">
                  {format(status.nextClosingDate, 'd MMM', { locale: es })}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted">Vence el</span>
                <span className="font-medium text-warn">
                  {format(status.nextPaymentDate, 'd MMM', { locale: es })}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer: Mensualidades y Movimientos */}
        <div className="space-y-4 pt-4 border-t border-border/50">

          {/* Resumen Mensualidades */}
          {subscriptions.length > 0 && (
            <div className="flex items-center justify-between text-xs bg-surface-2 p-2 rounded-lg border border-border/50">
              <div className="flex items-center gap-2 text-muted">
                <CalendarClock className="h-3.5 w-3.5" />
                <span>{subscriptions.length} servicios adheridos</span>
              </div>
              <span className="font-mono font-medium text-text">
                {formatCurrency(status.fixedCosts)}
              </span>
            </div>
          )}

          {/* Últimos movimientos del mes */}
          <div className="space-y-2">
            <p className="text-[10px] font-medium text-muted uppercase tracking-wider mb-2">Movimientos del mes</p>
            {history.length > 0 ? (
              history.map((t, i) => (
                <div key={i} className="flex items-center justify-between text-xs group">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <div className={cn(
                      "h-1.5 w-1.5 rounded-full transition-colors",
                      t.type === 'income' ? "bg-good" : "bg-faint group-hover:bg-faint"
                    )} />
                    <span className="text-muted truncate max-w-[150px]">{t.description}</span>
                  </div>
                  <span className={cn(
                    "font-mono font-medium",
                    t.type === 'income' ? "text-good" : "text-muted"
                  )}>
                    {t.type === 'income' ? '+' : '-'}{formatCurrency(Math.abs(t.amount))}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-[10px] text-muted italic pl-3">Sin movimientos este mes</p>
            )}
          </div>
        </div>
      </div>

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
