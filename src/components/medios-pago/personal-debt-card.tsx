'use client';

import { User, ArrowRight, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn, formatCurrency } from '@/lib/utils';
import { PaymentCardProps } from './institutional-card';
import { EditPaymentMethodDialog } from './edit-payment-method-dialog';
import { DeletePaymentMethodDialog } from './delete-payment-method-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function PersonalDebtCard({ data }: PaymentCardProps) {
  const router = useRouter();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const { status } = data;

  const isDebt = status.currentConsumption < 0;
  const amount = Math.abs(status.currentConsumption);

  return (
    <>
      <div
        onClick={() => router.push(`/ajustes/medios/${data.id}`)}
        className="rounded-xl border-[1.5px] border-border bg-surface p-4 flex flex-col justify-between hover:border-border-strong transition-colors cursor-pointer active:scale-[0.98]"
      >
        <div>
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-accent-deep">
                <User className="h-4 w-4" />
              </div>
              <h3 className="font-medium text-text">{data.name}</h3>
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

          <div>
            <p className="text-xs text-muted mb-0.5">
              {isDebt ? 'Le debes' : 'A favor'}
            </p>
            <p className={cn("font-display tnum text-xl leading-none", isDebt ? "text-bad" : "text-good")}>
              {formatCurrency(amount)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-muted bg-surface-2 py-1.5 px-2 rounded border-[1.5px] border-border">
          <ArrowRight className="h-3 w-3" />
          <span>
            {data.default_payment_day
              ? `Se transfiere el día ${data.default_payment_day}`
              : 'Sin fecha de pago definida'}
          </span>
        </div>
      </div>

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
