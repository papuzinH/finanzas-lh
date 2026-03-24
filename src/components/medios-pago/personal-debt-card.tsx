'use client';

import { User, ArrowRight, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { cn, formatCurrency } from '@/lib/utils';
import { PaymentCardProps } from './institutional-card';
import { PaymentMethodDetailModal } from './payment-method-detail-modal';
import { EditPaymentMethodDialog } from './edit-payment-method-dialog';
import { DeletePaymentMethodDialog } from './delete-payment-method-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function PersonalDebtCard({ data }: PaymentCardProps) {
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const { status, history } = data;

  const isDebt = status.currentConsumption < 0;
  const amount = Math.abs(status.currentConsumption);

  return (
    <>
      <div
        onClick={() => setIsDetailOpen(true)}
        className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 flex flex-col justify-between hover:border-slate-700 transition-colors cursor-pointer active:scale-[0.98]"
      >
        <div>
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-300">
                <User className="h-4 w-4" />
              </div>
              <h3 className="font-medium text-slate-200">{data.name}</h3>
            </div>

            {/* Menú de acciones */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Más opciones"
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="bg-slate-900 border-slate-800 text-slate-200"
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenuItem
                  onClick={() => setIsEditOpen(true)}
                  className="gap-2 cursor-pointer focus:bg-slate-800 focus:text-slate-100"
                >
                  <Pencil className="h-4 w-4" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setIsDeleteOpen(true)}
                  className="gap-2 cursor-pointer text-rose-400 focus:bg-rose-500/10 focus:text-rose-300"
                >
                  <Trash2 className="h-4 w-4" />
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="mb-4">
            <p className="text-xs text-slate-500 mb-0.5">
              {isDebt ? 'Le debes' : 'A favor'}
            </p>
            <p className={cn("text-xl font-bold font-mono tracking-tight", isDebt ? "text-rose-400" : "text-emerald-400")}>
              {formatCurrency(amount)}
            </p>
          </div>

          {/* Movimientos del mes */}
          <div className="space-y-2 mb-4 pt-3 border-t border-slate-800/50">
            <p className="text-[9px] font-medium text-slate-500 uppercase tracking-wider mb-1">Movimientos del mes</p>
            {history.length > 0 ? (
              history.map((t, i) => (
                <div key={i} className="flex items-center justify-between text-[10px] group">
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <div className={cn(
                      "h-1 w-1 rounded-full",
                      t.type === 'income' ? "bg-emerald-500" : "bg-slate-700"
                    )} />
                    <span className="text-slate-400 truncate max-w-[100px]">{t.description}</span>
                  </div>
                  <span className={cn(
                    "font-mono",
                    t.type === 'income' ? "text-emerald-400" : "text-slate-500"
                  )}>
                    {t.type === 'income' ? '+' : '-'}{formatCurrency(Math.abs(t.amount))}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-[9px] text-slate-600 italic">Sin movimientos</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-slate-500 bg-slate-950/50 py-1.5 px-2 rounded border border-slate-800/50">
          <ArrowRight className="h-3 w-3" />
          <span>
            {data.default_payment_day
              ? `Se transfiere el día ${data.default_payment_day}`
              : 'Sin fecha de pago definida'}
          </span>
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
