'use client';

import { useRef, useState } from 'react';
import { type Control, type FieldValues, type Path, type UseFormSetValue } from 'react-hook-form';
import { format } from 'date-fns';
import { AlignLeft, Grid3X3, Minus, Plus, Wallet, ChevronRight, Check } from 'lucide-react';

import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { cn, formatCurrency } from '@/lib/utils';
import type { Category, PaymentMethod } from '@/types/database';

const QUICK_AMOUNTS = [100, 500, 1000] as const;

/* ─── Base type constraints ─── */
type BaseTransactionFields = {
  description: string;
  amount: number;
  date: Date;
  category_id: string;
  type: 'income' | 'expense';
};

type BaseSubscriptionFields = {
  description: string;
  amount: number;
  start_date?: Date;
  category_id: string;
  frequency?: 'monthly' | 'yearly';
  payment_method_id?: string;
  debit_payment_day?: number;
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   AmountField
   Large display + hidden input + quick-amount pills
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

interface AmountFieldProps<T extends FieldValues> {
  control: Control<T>;
  setValue: UseFormSetValue<T>;
  watchedAmount: number;
  fieldName?: string;
}

export function AmountField<T extends FieldValues>({
  control,
  setValue,
  watchedAmount,
  fieldName = 'amount',
}: AmountFieldProps<T>) {
  const amountInputRef = useRef<HTMLInputElement>(null);

  const displayAmount =
    watchedAmount === 0
      ? '0.00'
      : watchedAmount.toLocaleString('es-AR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

  return (
    <div className="flex flex-col items-center gap-3 pt-2">
      <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
        Monto
      </span>

      <FormField
        control={control}
        name={fieldName as Path<T>}
        render={({ field }) => (
          <FormItem className="w-full flex flex-col items-center">
            <button
              type="button"
              className="flex items-baseline justify-center gap-1 w-full focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg"
              onClick={() => amountInputRef.current?.focus()}
            >
              <span className="text-3xl font-semibold text-slate-600">$</span>
              <span className="text-5xl sm:text-6xl font-semibold text-slate-50 tabular-nums">
                {displayAmount}
              </span>
            </button>
            <FormControl>
              <input
                ref={amountInputRef}
                type="number"
                step="0.01"
                inputMode="decimal"
                value={field.value || ''}
                onChange={(e) => {
                  const value = parseFloat(e.target.value);
                  field.onChange(isNaN(value) ? 0 : value);
                }}
                onBlur={field.onBlur}
                name={field.name}
                className="sr-only"
                aria-label="Monto de la transacción"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Quick amount pills */}
      <div className="flex items-center gap-2">
        {QUICK_AMOUNTS.map((amount) => (
          <button
            key={amount}
            type="button"
            onClick={() =>
              setValue(fieldName as Path<T>, amount as T[Path<T>], {
                shouldValidate: true,
              })
            }
            className={cn(
              'min-h-11 rounded-full px-5 py-2 text-sm font-medium transition-all active:scale-95',
              'focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none',
              watchedAmount === amount
                ? 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/50'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300'
            )}
          >
            ${amount}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TypeToggle
   Expense / Income segmented control
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

interface TypeToggleProps<T extends FieldValues & BaseTransactionFields> {
  control: Control<T>;
}

export function TypeToggle<T extends FieldValues & BaseTransactionFields>({
  control,
}: TypeToggleProps<T>) {
  return (
    <FormField
      control={control}
      name={'type' as Path<T>}
      render={({ field }) => (
        <FormItem>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-900/80 p-1">
            {(['expense', 'income'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => field.onChange(type)}
                className={cn(
                  'min-h-11 rounded-lg py-3 text-sm font-semibold transition-all',
                  'focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none',
                  field.value === type
                    ? 'bg-indigo-500 text-white shadow-[0_0_20px_rgba(129,140,248,0.3)]'
                    : 'text-slate-500 hover:text-slate-300'
                )}
              >
                {type === 'expense' ? 'Gasto' : 'Ingreso'}
              </button>
            ))}
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   DescriptionField
   Text input with AlignLeft icon
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

interface DescriptionFieldProps<T extends FieldValues & { description: string }> {
  control: Control<T>;
}

export function DescriptionField<T extends FieldValues & { description: string }>({
  control,
}: DescriptionFieldProps<T>) {
  return (
    <FormField
      control={control}
      name={'description' as Path<T>}
      render={({ field }) => (
        <FormItem>
          <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
            Descripción
          </span>
          <FormControl>
            <div className="relative">
              <AlignLeft className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
              <Input
                placeholder="Ej: Compra supermercado"
                {...field}
                className="pl-10 bg-surface-raised border-0 rounded-xl min-h-11 text-slate-50 placeholder:text-slate-600 focus-visible:ring-2 focus-visible:ring-indigo-500"
              />
            </div>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CategoryPicker
   Frequent icons + expandable grid
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

interface CategoryPickerProps<T extends FieldValues & { category_id: string | undefined }> {
  control: Control<T>;
  categories: Category[];
  frequentCategories: Category[];
}

export function CategoryPicker<T extends FieldValues & { category_id: string | undefined }>({
  control,
  categories,
  frequentCategories,
}: CategoryPickerProps<T>) {
  const [showAll, setShowAll] = useState(false);

  return (
    <FormField
      control={control}
      name={'category_id' as Path<T>}
      render={({ field }) => (
        <FormItem>
          <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
            Categoría
          </span>

          <div className="flex items-start gap-3 justify-center pt-1">
            {frequentCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => field.onChange(cat.id)}
                className={cn(
                  'flex flex-col items-center gap-1.5 min-w-[60px] group',
                  'focus-visible:outline-none'
                )}
              >
                <div
                  className={cn(
                    'flex items-center justify-center h-14 w-14 rounded-full transition-all',
                    'focus-visible:ring-2 focus-visible:ring-indigo-500',
                    field.value === cat.id
                      ? 'bg-indigo-500/20 ring-2 ring-indigo-400 scale-105'
                      : 'bg-slate-800/60 group-hover:bg-slate-700/60'
                  )}
                >
                  <span className="text-xl">{cat.emoji ?? '📦'}</span>
                </div>
                <span
                  className={cn(
                    'text-[10px] max-w-[60px] truncate transition-colors',
                    field.value === cat.id ? 'text-indigo-300' : 'text-slate-500'
                  )}
                >
                  {cat.name}
                </span>
              </button>
            ))}

            {/* "More" button */}
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="flex flex-col items-center gap-1.5 min-w-[60px] group focus-visible:outline-none"
            >
              <div
                className={cn(
                  'flex items-center justify-center h-14 w-14 rounded-full transition-all',
                  'bg-slate-800/60 group-hover:bg-slate-700/60',
                  showAll && 'ring-2 ring-slate-600'
                )}
              >
                <Grid3X3 className="h-5 w-5 text-slate-400" />
              </div>
              <span className="text-[10px] text-slate-500">Más</span>
            </button>
          </div>

          {/* Expanded categories grid */}
          {showAll && (
            <div className="grid grid-cols-4 gap-2 pt-2 animate-in fade-in-0 slide-in-from-top-2 duration-200">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    field.onChange(cat.id);
                    setShowAll(false);
                  }}
                  className={cn(
                    'flex flex-col items-center gap-1 p-2 rounded-xl transition-all min-h-11',
                    'focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none',
                    field.value === cat.id
                      ? 'bg-indigo-500/20 ring-1 ring-indigo-400'
                      : 'bg-slate-800/40 hover:bg-slate-700/40'
                  )}
                >
                  <span className="text-lg">{cat.emoji ?? '📦'}</span>
                  <span className="text-[9px] text-slate-400 truncate w-full text-center">
                    {cat.name}
                  </span>
                </button>
              ))}
            </div>
          )}

          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   DateField
   Native date input
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

interface DateFieldProps<T extends FieldValues> {
  control: Control<T>;
  fieldName?: string;
  label?: string;
}

export function DateField<T extends FieldValues>({
  control,
  fieldName = 'date',
  label = 'Fecha',
}: DateFieldProps<T>) {
  return (
    <FormField
      control={control}
      name={fieldName as Path<T>}
      render={({ field }) => (
        <FormItem>
          <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
            {label}
          </span>
          <FormControl>
            <Input
              type="date"
              value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
              onChange={(e) => field.onChange(new Date(e.target.value))}
              className="bg-surface-raised border-0 rounded-xl min-h-11 text-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-500 block w-full"
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   PaymentMethodBadge
   Visual badge for payment method type
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function PaymentMethodBadge({ type }: { type: string }) {
  if (type === 'credit') {
    return (
      <span className="inline-flex items-center justify-center rounded-md bg-linear-to-r from-indigo-600 to-violet-600 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white uppercase">
        VISA
      </span>
    );
  }
  if (type === 'debit') {
    return (
      <span className="inline-flex items-center justify-center rounded-md bg-emerald-600/80 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white uppercase">
        Débito
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center rounded-md bg-slate-700 px-2 py-0.5 text-[10px] font-bold tracking-wider text-slate-300 uppercase">
      Efectivo
    </span>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   InstallmentSelector
   +/- buttons with glow on + and "Pagarás X cuotas de $Y" pill
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

interface InstallmentSelectorProps<T extends FieldValues> {
  control: Control<T>;
  setValue: UseFormSetValue<T>;
  watchedCount: number;
  watchedAmount: number;
  fieldName?: string;
  min?: number;
  max?: number;
}

export function InstallmentSelector<T extends FieldValues>({
  control,
  setValue,
  watchedCount,
  watchedAmount,
  fieldName = 'installments_count',
  min = 2,
  max = 60,
}: InstallmentSelectorProps<T>) {
  const installmentValue =
    watchedAmount > 0 && watchedCount > 0 ? watchedAmount / watchedCount : 0;

  return (
    <FormField
      control={control}
      name={fieldName as Path<T>}
      render={() => (
        <FormItem>
          <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
            Cuotas
          </span>

          <div className="flex flex-col items-center gap-3">
            {/* +/- row */}
            <div className="flex items-center gap-4">
              <button
                type="button"
                disabled={watchedCount <= min}
                onClick={() =>
                  setValue(
                    fieldName as Path<T>,
                    Math.max(min, watchedCount - 1) as T[Path<T>],
                    { shouldValidate: true }
                  )
                }
                className={cn(
                  'flex items-center justify-center h-12 w-12 rounded-full transition-all',
                  'focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none active:scale-90',
                  watchedCount <= min
                    ? 'bg-slate-800/40 text-slate-600 cursor-not-allowed'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                )}
              >
                <Minus className="h-5 w-5" />
              </button>

              <span className="text-4xl font-bold text-slate-50 tabular-nums min-w-[3ch] text-center">
                {watchedCount}
              </span>

              <button
                type="button"
                disabled={watchedCount >= max}
                onClick={() =>
                  setValue(
                    fieldName as Path<T>,
                    Math.min(max, watchedCount + 1) as T[Path<T>],
                    { shouldValidate: true }
                  )
                }
                className={cn(
                  'flex items-center justify-center h-12 w-12 rounded-full transition-all',
                  'focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none active:scale-90',
                  watchedCount >= max
                    ? 'bg-slate-800/40 text-slate-600 cursor-not-allowed'
                    : 'bg-linear-to-br from-indigo-500 to-violet-500 text-white shadow-[0_0_20px_rgba(139,92,246,0.4)] hover:shadow-[0_0_28px_rgba(139,92,246,0.55)]'
                )}
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>

            {/* Pill */}
            {installmentValue > 0 && (
              <div className="rounded-full bg-indigo-500/10 border border-indigo-500/20 px-4 py-2 text-center animate-in fade-in-0 zoom-in-95 duration-200">
                <span className="text-sm text-indigo-300">
                  Pagarás{' '}
                  <span className="font-semibold text-indigo-200">{watchedCount} cuotas</span>
                  {' '}de{' '}
                  <span className="font-semibold text-indigo-200">{formatCurrency(installmentValue)}</span>
                </span>
              </div>
            )}
          </div>

          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   FrequencySelector
   Monthly / Yearly frequency toggle
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

interface FrequencySelectorProps<T extends FieldValues & { frequency: 'monthly' | 'yearly' }> {
  control: Control<T>;
}

export function FrequencySelector<T extends FieldValues & { frequency: 'monthly' | 'yearly' }>({
  control,
}: FrequencySelectorProps<T>) {
  return (
    <FormField
      control={control}
      name={'frequency' as Path<T>}
      render={({ field }) => (
        <FormItem>
          <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
            Frecuencia
          </span>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-900/80 p-1">
            {(['monthly', 'yearly'] as const).map((freq) => (
              <button
                key={freq}
                type="button"
                onClick={() => field.onChange(freq)}
                className={cn(
                  'min-h-11 rounded-lg py-3 text-sm font-semibold transition-all',
                  'focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none',
                  field.value === freq
                    ? 'bg-violet-500 text-white shadow-[0_0_20px_rgba(139,92,246,0.3)]'
                    : 'text-slate-500 hover:text-slate-300'
                )}
              >
                {freq === 'monthly' ? 'Mensual' : 'Anual'}
              </button>
            ))}
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   PaymentMethodField
   Full Select with badge + smart credit card info
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

interface PaymentMethodFieldProps<T extends FieldValues> {
  control: Control<T>;
  setValue?: UseFormSetValue<T>;
  paymentMethods: PaymentMethod[];
  fieldName?: string;
  debitFieldName?: string;
  dateFieldName?: string;
  watchedDate?: Date;
  watchedDebitDay?: number;
}

export function PaymentMethodField<T extends FieldValues>({
  control,
  setValue,
  paymentMethods,
  fieldName = 'payment_method_id',
  debitFieldName = 'debit_payment_day',
  dateFieldName = 'start_date',
  watchedDate,
  watchedDebitDay,
}: PaymentMethodFieldProps<T>) {
  
  // Function to calculate credit card payment date
  const calculateCreditPaymentDate = (method: PaymentMethod, currentDate: Date): Date => {
    if (method.type !== 'credit' || !method.default_closing_day || !method.default_payment_day) {
      return currentDate;
    }

    const today = new Date(currentDate);
    const currentDay = today.getDate();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    let paymentDate: Date;
    
    if (currentDay < method.default_closing_day) {
      // Si estamos antes del cierre, el vencimiento es en el mismo mes
      paymentDate = new Date(currentYear, currentMonth, method.default_payment_day);
    } else {
      // Si estamos después del cierre, el vencimiento es el próximo mes
      paymentDate = new Date(currentYear, currentMonth + 1, method.default_payment_day);
    }
    
    return paymentDate;
  };

  return (
    <FormField
      control={control}
      name={fieldName as Path<T>}
      render={({ field }) => {
        const selectedMethod = paymentMethods.find(
          (m) => m.id.toString() === field.value
        );

        // Credit card charge date hint
        const creditHint = (() => {
          if (!selectedMethod || selectedMethod.type !== 'credit' || !watchedDate) return null;
          const closingDay = selectedMethod.default_closing_day;
          const dueDay = selectedMethod.default_payment_day;
          if (!closingDay || !dueDay) return null;

          const purchaseDay = watchedDate.getDate();
          if (purchaseDay < closingDay) {
            return `Cierra el ${closingDay} de este mes · Vence el ${dueDay}`;
          }
          return `Cierra el ${closingDay} del próximo mes · Vence el ${dueDay} (fecha incierta)`;
        })();

        return (
        <>
          <FormItem>
            <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
              Método de pago
            </span>
            <Select
              onValueChange={(value) => {
                field.onChange(value);
                
                // Auto-adjust date for credit cards
                if (setValue && watchedDate && dateFieldName) {
                  const method = paymentMethods.find(m => m.id.toString() === value);
                  if (method?.type === 'credit') {
                    const adjustedDate = calculateCreditPaymentDate(method, watchedDate);
                    setValue(dateFieldName as Path<T>, adjustedDate as T[Path<T>], {
                      shouldValidate: true
                    });
                  }
                }
              }}
              value={field.value || 'none'}
            >
              <FormControl>
                <SelectTrigger
                  className="w-full bg-surface-raised border-0 rounded-xl min-h-[52px] px-3 py-2 flex items-center gap-3 focus-visible:ring-2 focus-visible:ring-indigo-500 [&>svg]:hidden"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {selectedMethod ? (
                      <>
                        <PaymentMethodBadge type={selectedMethod.type} />
                        <span className="text-sm text-slate-200 truncate">
                          {selectedMethod.name}
                        </span>
                      </>
                    ) : (
                      <>
                        <Wallet className="h-5 w-5 text-slate-500 shrink-0" />
                        <span className="text-sm text-slate-400">Sin asignar</span>
                      </>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-500 shrink-0" />
                </SelectTrigger>
              </FormControl>
              <SelectContent position="popper" sideOffset={4} className="bg-surface-overlay border-slate-800 text-slate-200 max-h-60">
                <SelectItem value="none">Sin asignar</SelectItem>
                {paymentMethods.map((method) => (
                  <SelectItem key={method.id} value={method.id.toString()}>
                    <div className="flex items-center gap-2">
                      <PaymentMethodBadge type={method.type} />
                      {method.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Credit card charge date hint */}
            {creditHint && (
              <p className="text-[11px] text-violet-400/80 mt-1 pl-1 animate-in fade-in-0 duration-200">
                {creditHint}
              </p>
            )}

            <FormMessage />
          </FormItem>

          {/* Debit payment day selector */}
          {selectedMethod?.type === 'debit' && setValue && (
            <div className="mt-4 animate-in fade-in-0 duration-300">
              <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-3 block">
                Día de pago
              </span>

              <div className="flex items-center gap-4">
                <button
                  type="button"
                  disabled={(watchedDebitDay || 1) <= 1}
                  onClick={() =>
                    setValue(
                      debitFieldName as Path<T>,
                      Math.max(1, (watchedDebitDay || 1) - 1) as T[Path<T>],
                      { shouldValidate: true }
                    )
                  }
                  className={cn(
                    'flex items-center justify-center h-10 w-10 rounded-full transition-all',
                    'focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none active:scale-90',
                    (watchedDebitDay || 1) <= 1
                      ? 'bg-slate-800/40 text-slate-600 cursor-not-allowed'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  )}
                >
                  <Minus className="h-4 w-4" />
                </button>

                <div className="text-center min-w-[80px]">
                  <div className="text-2xl font-bold text-slate-50 tabular-nums">
                    {watchedDebitDay || (watchedDate?.getDate() || 1)}
                  </div>
                  <div className="text-xs text-slate-400">
                    de cada mes
                  </div>
                </div>

                <button
                  type="button"
                  disabled={(watchedDebitDay || 1) >= 28}
                  onClick={() =>
                    setValue(
                      debitFieldName as Path<T>,
                      Math.min(28, (watchedDebitDay || 1) + 1) as T[Path<T>],
                      { shouldValidate: true }
                    )
                  }
                  className={cn(
                    'flex items-center justify-center h-10 w-10 rounded-full transition-all',
                    'focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none active:scale-90',
                    (watchedDebitDay || 1) >= 28
                      ? 'bg-slate-800/40 text-slate-600 cursor-not-allowed'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  )}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
        );
      }}
    />
  );
}
