'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import {
  DollarSign,
  CreditCard,
  Layers,
  MoreVertical,
  Pencil,
  Trash2,
  Loader2
} from "lucide-react";
import { isFuture } from "date-fns";
import { parseLocalDate } from '@/lib/utils/dates';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { EditTransactionDialog } from "@/components/transactions/edit-transaction-dialog";
import { ConfirmationModal } from "@/components/shared/confirmation-modal";
import { deleteTransaction } from "@/app/dashboard/transactions/actions";
import { toast } from "sonner";
import { useFinanceStore } from "@/lib/store/financeStore";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();

    let timeoutId: ReturnType<typeof setTimeout>;
    const debounced = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(check, 150);
    };

    window.addEventListener('resize', debounced);
    return () => {
      window.removeEventListener('resize', debounced);
      clearTimeout(timeoutId);
    };
  }, []);

  return isMobile;
}

interface TransactionItemProps {
  transaction: {
    id: number;
    amount: number;
    description: string;
    date: string;
    category_id: string | null;
    type: 'expense' | 'income' | null;
    payment_method_id: number | null;
    installment_plan_id?: number | null;
    recurring_plan_id?: number | null;
    original_currency?: string | null;
    original_amount?: number | null;
    rate_pair?: string | null;
  };
  paymentMethodName?: string;
  paymentMethodType?: string;
  showDate?: boolean;
  grouped?: boolean;
}

const SWIPE_THRESHOLD = 80;

export function TransactionItem({ transaction, paymentMethodName, paymentMethodType, showDate = true, grouped = false }: TransactionItemProps) {
  const router = useRouter();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { fetchAllData, categories } = useFinanceStore();
  const isMobile = useIsMobile();
  const hapticFired = useRef(false);

  const x = useMotionValue(0);
  const editBgOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1]);
  const deleteBgOpacity = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0]);

  const category = categories.find(c => c.id === transaction.category_id);
  const canSwipe = isMobile && !transaction.installment_plan_id;

  const localTDate = parseLocalDate(transaction.date);
  const isFutureDate = isFuture(localTDate);
  const isIncome = transaction.type === 'income';
  const isUsd = transaction.original_currency === 'USD' && transaction.original_amount != null;
  const rateLabel = ({ USD_ARS_BLUE: 'Blue', USD_ARS_MEP: 'MEP', USD_ARS_CCL: 'CCL', USDT_ARS: 'USDT' } as Record<string, string>)[transaction.rate_pair ?? ''] ?? '';
  const isCredit = paymentMethodType === 'credit';
  const isInstallment = !!transaction.installment_plan_id;
  const installmentMatch = transaction.description.match(/\((\d+)\/(\d+)\)$/);
  const currentInstallment = installmentMatch ? parseInt(installmentMatch[1]) : null;
  const totalInstallments = installmentMatch ? parseInt(installmentMatch[2]) : null;
  const displayDescription = isInstallment
    ? transaction.description.replace(/\s*\(\d+\/\d+\)$/, '')
    : transaction.description;

  const handleDelete = () => setIsDeleteOpen(true);

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteTransaction(transaction.id.toString());
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Transacción eliminada');
        await fetchAllData();
        router.refresh();
      }
      setIsDeleteOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDrag = (_: unknown, info: { offset: { x: number } }) => {
    if (Math.abs(info.offset.x) > SWIPE_THRESHOLD && !hapticFired.current) {
      navigator.vibrate?.(10);
      hapticFired.current = true;
    } else if (Math.abs(info.offset.x) <= SWIPE_THRESHOLD) {
      hapticFired.current = false;
    }
  };

  const handleDragEnd = (_: unknown, info: { offset: { x: number } }) => {
    hapticFired.current = false;
    if (info.offset.x < -SWIPE_THRESHOLD) handleDelete();
    else if (info.offset.x > SWIPE_THRESHOLD) setIsEditOpen(true);
    animate(x, 0, { type: 'spring', stiffness: 400, damping: 40 });
  };

  const cardInner = (
    <div className={cn(
      "group relative flex items-center justify-between p-3 transition-all bg-surface",
      grouped
        ? "hover:bg-surface-2"
        : cn(
            "rounded-xl border-[1.5px]",
            isInstallment
              ? "border-accent-soft/40 hover:border-accent-soft/70"
              : "border-border hover:shadow-card"
          ),
      !canSwipe && "pr-10"
    )}>
      {/* Left: Icon & Info */}
      <div className="flex items-center gap-3 overflow-hidden">
        <div className="w-9 h-9 min-w-9 rounded-xl bg-surface-2 border-[1.5px] border-border grid place-items-center shrink-0 text-[18px]">
          {category?.emoji
            ? <span>{category.emoji}</span>
            : isInstallment
              ? <Layers className="h-4 w-4 text-accent" />
              : <DollarSign className="h-4 w-4 text-muted" />
          }
        </div>

        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-sans font-bold text-[13.5px] text-text truncate leading-snug">
              {displayDescription}
            </span>
            {isInstallment && currentInstallment && (
              <span className="shrink-0 text-[11px] font-bold text-muted border-[1.5px] border-border px-1.5 py-0.5 rounded-full leading-none">
                {currentInstallment}/{totalInstallments}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-[12px] text-muted truncate mt-0.5">
            {paymentMethodName && (
              <span className="flex items-center gap-1">
                {(isInstallment || isCredit) && <CreditCard className="h-2.5 w-2.5" />}
                {paymentMethodName}
              </span>
            )}
            {paymentMethodName && !isInstallment && <span className="text-faint">·</span>}
            {!isInstallment && (
              <span className="capitalize">{category?.name || 'Varios'}</span>
            )}
          </div>
        </div>
      </div>

      {/* Right: Amount & Meta */}
      <div className="flex flex-col items-end gap-0.5 pl-2 mr-2">
        <span className={cn(
          "font-poster tnum text-[15px] leading-none whitespace-nowrap",
          isIncome ? "text-good" : "text-bad"
        )}>
          {isIncome ? '+' : '-'} {isUsd
            ? `US$ ${Math.abs(transaction.original_amount as number).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : formatCurrency(Math.abs(transaction.amount))}
        </span>

        {isUsd && (
          <span className="text-[11px] text-muted tnum">
            ≈ {formatCurrency(Math.abs(transaction.amount))}{rateLabel ? ` · ${rateLabel}` : ''}
          </span>
        )}

        {showDate && !isInstallment && (
          isFutureDate ? (
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-warn font-medium">{formatDate(transaction.date)}</span>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-warn animate-pulse" />
            </div>
          ) : (
            <span className="text-[11px] text-faint">{formatDate(transaction.date)}</span>
          )
        )}
      </div>

      {/* Actions Dropdown – solo desktop */}
      {!canSwipe && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Opciones de transacción"
                className="h-8 w-8 text-muted hover:text-text hover:bg-surface-2"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-surface border-[1.5px] border-border text-text">
              {transaction.installment_plan_id ? (
                <DropdownMenuItem disabled className="text-muted cursor-not-allowed opacity-50">
                  <span className="text-xs">Gestionar en Cuotas</span>
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem onClick={() => setIsEditOpen(true)} className="focus:bg-surface-2 cursor-pointer">
                    <Pencil className="mr-2 h-4 w-4" />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="text-bad focus:bg-bad/10 focus:text-bad cursor-pointer"
                  >
                    {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                    Eliminar
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );

  return (
    <>
      <ConfirmationModal
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title="Eliminar transacción"
        description="¿Estás seguro de que querés eliminar esta transacción? Esta acción no se puede deshacer."
        onConfirm={confirmDelete}
        isLoading={isDeleting}
        variant="destructive"
        confirmText="Eliminar"
      />

      {canSwipe ? (
        <div className={cn("relative overflow-hidden", !grouped && "rounded-xl")}>
          {/* Fondo editar – deslizar a la derecha */}
          <motion.div
            className={cn("absolute inset-0 flex items-center px-5 bg-accent", !grouped && "rounded-xl")}
            style={{ opacity: editBgOpacity }}
            aria-hidden
          >
            <Pencil className="h-5 w-5 text-accent-ink" />
            <span className="ml-2 text-sm font-bold text-accent-ink">Editar</span>
          </motion.div>

          {/* Fondo eliminar – deslizar a la izquierda */}
          <motion.div
            className={cn("absolute inset-0 flex items-center justify-end px-5 bg-bad", !grouped && "rounded-xl")}
            style={{ opacity: deleteBgOpacity }}
            aria-hidden
          >
            <span className="mr-2 text-sm font-bold text-accent-ink">Eliminar</span>
            <Trash2 className="h-5 w-5 text-accent-ink" />
          </motion.div>

          <motion.div
            style={{ x }}
            drag="x"
            dragDirectionLock
            dragConstraints={{ left: -150, right: 150 }}
            dragElastic={0.15}
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
          >
            {cardInner}
          </motion.div>
        </div>
      ) : (
        cardInner
      )}

      <EditTransactionDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        transaction={transaction}
      />
    </>
  );
}
