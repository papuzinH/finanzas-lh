'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import {
  DollarSign,
  CreditCard,
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
  };
  paymentMethodName?: string;
  paymentMethodType?: string;
  showDate?: boolean;
}

const SWIPE_THRESHOLD = 80;

export function TransactionItem({ transaction, paymentMethodName, paymentMethodType, showDate = true }: TransactionItemProps) {
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
  const isCredit = paymentMethodType === 'credit';

  const handleDelete = () => {
    setIsDeleteOpen(true);
  };

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
    if (info.offset.x < -SWIPE_THRESHOLD) {
      handleDelete();
    } else if (info.offset.x > SWIPE_THRESHOLD) {
      setIsEditOpen(true);
    }
    animate(x, 0, { type: 'spring', stiffness: 400, damping: 40 });
  };

  const cardInner = (
    <div className={cn(
      "group relative flex items-center justify-between rounded-xl border border-slate-800/40 bg-slate-900/20 p-3 transition-all hover:bg-slate-900/60 hover:border-slate-700 hover:shadow-lg hover:shadow-black/20",
      !canSwipe && "pr-10"
    )}>
      {/* Left: Icon & Info */}
      <div className="flex items-center gap-3 overflow-hidden">
        <div className={cn(
          "flex h-10 w-10 min-w-10 items-center justify-center rounded-full border transition-colors",
          isIncome
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
            : "bg-slate-800/50 border-slate-700/50 text-slate-400 group-hover:text-slate-300"
        )}>
          {category?.emoji ? <span className="text-lg">{category.emoji}</span> : <DollarSign className="h-5 w-5" />}
        </div>

        <div className="flex flex-col min-w-0">
          <span className="font-medium text-sm text-slate-200 truncate">
            {transaction.description}
          </span>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 truncate">
            {paymentMethodName && (
              <span className="flex items-center gap-1 text-slate-400">
                {isCredit && <CreditCard className="h-2.5 w-2.5" />}
                {paymentMethodName}
              </span>
            )}
            {paymentMethodName && <span className="text-slate-500">•</span>}
            <span className="capitalize">{category?.name || 'Varios'}</span>
          </div>
        </div>
      </div>

      {/* Right: Amount & Status */}
      <div className="flex flex-col items-end gap-0.5 pl-2 mr-2">
        <span className={cn(
          "font-bold text-sm font-mono tracking-tight whitespace-nowrap",
          isIncome ? "text-emerald-400" : "text-slate-200"
        )}>
          {isIncome ? '+' : ''} {formatCurrency(Math.abs(transaction.amount))}
        </span>

        {showDate && (
          isFutureDate ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-amber-500/80 font-medium">
                {formatDate(transaction.date)}
              </span>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            </div>
          ) : (
            <span className="text-[10px] text-slate-400">
              {formatDate(transaction.date)}
            </span>
          )
        )}
      </div>

      {/* Actions Dropdown – solo desktop */}
      {!canSwipe && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Opciones de transacción" className="h-11 w-11 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-slate-900 border-slate-800 text-slate-200">
              {transaction.installment_plan_id ? (
                <DropdownMenuItem disabled className="text-slate-500 cursor-not-allowed opacity-50">
                  <span className="text-xs">Gestionar en Cuotas</span>
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem onClick={() => setIsEditOpen(true)} className="focus:bg-slate-800 focus:text-slate-200 cursor-pointer">
                    <Pencil className="mr-2 h-4 w-4" />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="text-red-400 focus:bg-red-950/30 focus:text-red-400 cursor-pointer"
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
        description="¿Estás seguro de que quieres eliminar esta transacción? Esta acción no se puede deshacer."
        onConfirm={confirmDelete}
        isLoading={isDeleting}
        variant="destructive"
        confirmText="Eliminar"
      />

      {canSwipe ? (
        <div className="relative overflow-hidden rounded-xl">
          {/* Fondo editar – se revela al deslizar a la derecha */}
          <motion.div
            className="absolute inset-0 flex items-center px-5 rounded-xl bg-indigo-600"
            style={{ opacity: editBgOpacity }}
            aria-hidden
          >
            <Pencil className="h-5 w-5 text-white" />
            <span className="ml-2 text-sm font-medium text-white">Editar</span>
          </motion.div>

          {/* Fondo eliminar – se revela al deslizar a la izquierda */}
          <motion.div
            className="absolute inset-0 flex items-center justify-end px-5 rounded-xl bg-red-600"
            style={{ opacity: deleteBgOpacity }}
            aria-hidden
          >
            <span className="mr-2 text-sm font-medium text-white">Eliminar</span>
            <Trash2 className="h-5 w-5 text-white" />
          </motion.div>

          {/* Card deslizable */}
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
