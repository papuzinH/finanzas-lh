'use client';

import { useRef, useState } from 'react';
import { type Control, type FieldValues, type Path, type UseFormSetValue } from 'react-hook-form';
import { AlignLeft, Grid3X3, Minus, Plus, Wallet, ChevronRight, Check } from 'lucide-react';
import { parseLocalDate, formatLocalDate } from '@/lib/utils/dates';

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
import { useFinanceStore } from '@/lib/store/financeStore';
import type { Category, PaymentMethod } from '@/types/database';

/* ─── Base type constraints ─── */
type BaseTransactionFields = {
  description: string;
  amount: number;
  date: string;
  category_id: string;
  type: 'income' | 'expense';
};

type BaseSubscriptionFields = {
  description: string;
  amount: number;
  start_date?: string;
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
  currency?: 'ARS' | 'USD';
  type?: 'expense' | 'income';
}

export function AmountField<T extends FieldValues>({
  control,
  setValue,
  watchedAmount,
  fieldName = 'amount',
  currency = 'ARS',
  type = 'expense',
}: AmountFieldProps<T>) {
  const amountInputRef = useRef<HTMLInputElement>(null);
  // Seleccionamos la función (referencia estable), no su resultado: getQuickAmounts
  // arma un array nuevo en cada llamada y usarlo como selector rompe el cacheo de
  // getSnapshot de Zustand ("infinite loop"). Se llama en el cuerpo del componente.
  const getQuickAmounts = useFinanceStore((s) => s.getQuickAmounts);
  const quickAmounts = getQuickAmounts(type, currency, 3);

  const displayAmount =
    watchedAmount === 0
      ? '0.00'
      : watchedAmount.toLocaleString('es-AR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

  return (
    <div className="flex flex-col items-center gap-3 pt-2">
      <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted">
        Monto
      </span>

      <FormField
        control={control}
        name={fieldName as Path<T>}
        render={({ field }) => (
          <FormItem className="w-full flex flex-col items-center">
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              className="flex items-baseline justify-center gap-1 w-full focus-visible:ring-2 focus-visible:ring-accent/50 rounded-lg"
              onClick={() => amountInputRef.current?.focus()}
            >
              <span className="text-3xl font-semibold text-muted">
                {currency === 'USD' ? 'US$' : '$'}
              </span>
              <span className="text-5xl sm:text-6xl font-poster text-text tnum">
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

      {/* Quick amount pills: sugeridos del historial del usuario por tipo y moneda */}
      <div className="flex items-center gap-2">
        {quickAmounts.map((amount) => (
          <button
            key={amount}
            type="button"
            aria-pressed={watchedAmount === amount}
            onClick={() =>
              setValue(fieldName as Path<T>, amount as T[Path<T>], {
                shouldValidate: true,
              })
            }
            className={cn(
              'min-h-11 rounded-full px-5 py-2 text-sm font-medium transition-all active:scale-95',
              'focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none',
              watchedAmount === amount
                ? 'bg-accent/10 text-accent ring-1 ring-accent/50'
                : 'bg-surface-2 text-muted hover:bg-surface hover:text-text'
            )}
          >
            {currency === 'USD' ? `US$${amount}` : `$${amount}`}
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
  /** Se invoca solo cuando el usuario clickea el toggle (no cuando el valor cambia por form.reset()). */
  onTypeChange?: (type: 'expense' | 'income') => void;
}

export function TypeToggle<T extends FieldValues & BaseTransactionFields>({
  control,
  onTypeChange,
}: TypeToggleProps<T>) {
  return (
    <FormField
      control={control}
      name={'type' as Path<T>}
      render={({ field }) => (
        <FormItem>
          <div role="radiogroup" aria-label="Tipo de movimiento" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
            {(['expense', 'income'] as const).map((type) => (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={field.value === type}
                onClick={() => {
                  field.onChange(type);
                  onTypeChange?.(type);
                }}
                className={cn(
                  'min-h-11 rounded-lg py-3 text-sm font-semibold transition-all',
                  'focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none',
                  field.value === type
                    ? 'bg-accent text-accent-ink'
                    : 'text-muted hover:text-text'
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
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted">
            Descripción
          </span>
          <FormControl>
            <div className="relative">
              <AlignLeft className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
              <Input
                placeholder="Ej: Compra supermercado"
                {...field}
                className="pl-10 min-h-11"
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
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted">
            Categoría
          </span>

          <div className="flex items-start gap-3 justify-center pt-1">
            {frequentCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                aria-pressed={field.value === cat.id}
                onClick={() => field.onChange(cat.id)}
                className={cn(
                  'flex flex-col items-center gap-1.5 min-w-[60px] group',
                  'focus-visible:outline-none'
                )}
              >
                <div
                  className={cn(
                    'flex items-center justify-center h-14 w-14 rounded-full transition-all',
                    'focus-visible:ring-2 focus-visible:ring-accent/50',
                    field.value === cat.id
                      ? 'bg-accent/10 ring-2 ring-accent scale-105'
                      : 'bg-surface-2 group-hover:bg-surface'
                  )}
                >
                  <span className="text-xl">{cat.emoji ?? '📦'}</span>
                </div>
                <span
                  className={cn(
                    'text-[10px] max-w-[60px] truncate transition-colors',
                    field.value === cat.id ? 'text-accent' : 'text-muted'
                  )}
                >
                  {cat.name}
                </span>
              </button>
            ))}

            {/* "More" button */}
            <button
              type="button"
              aria-expanded={showAll}
              aria-controls="category-picker-grid"
              onClick={() => setShowAll((v) => !v)}
              className="flex flex-col items-center gap-1.5 min-w-[60px] group focus-visible:outline-none"
            >
              <div
                className={cn(
                  'flex items-center justify-center h-14 w-14 rounded-full transition-all',
                  'bg-surface-2 group-hover:bg-surface',
                  showAll && 'ring-2 ring-border'
                )}
              >
                <Grid3X3 className="h-5 w-5 text-muted" />
              </div>
              <span className="text-[10px] text-muted">Más</span>
            </button>
          </div>

          {/* Expanded categories grid */}
          {showAll && (
            <div id="category-picker-grid" className="grid grid-cols-4 gap-2 pt-2 animate-in fade-in-0 slide-in-from-top-2 duration-200 motion-reduce:animate-none">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  aria-pressed={field.value === cat.id}
                  onClick={() => {
                    field.onChange(cat.id);
                    setShowAll(false);
                  }}
                  className={cn(
                    'flex flex-col items-center gap-1 p-2 rounded-xl transition-all min-h-11',
                    'focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none',
                    field.value === cat.id
                      ? 'bg-accent/10 ring-1 ring-accent'
                      : 'bg-surface-2 hover:bg-surface'
                  )}
                >
                  <span className="text-lg">{cat.emoji ?? '📦'}</span>
                  <span className="text-[9px] text-muted truncate w-full text-center">
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
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted">
            {label}
          </span>
          <FormControl>
            <Input
              type="date"
              value={typeof field.value === 'string' ? field.value : ''}
              onChange={(e) => field.onChange(e.target.value)}
              className="min-h-11 block w-full"
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
      <span className="inline-flex items-center justify-center rounded-md bg-hero px-2 py-0.5 text-[10px] font-bold tracking-wider text-cream-light uppercase">
        VISA
      </span>
    );
  }
  if (type === 'debit') {
    return (
      <span className="inline-flex items-center justify-center rounded-md bg-good/15 px-2 py-0.5 text-[10px] font-bold tracking-wider text-good uppercase">
        Débito
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center rounded-md bg-surface-2 px-2 py-0.5 text-[10px] font-bold tracking-wider text-muted uppercase">
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
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted">
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
                  'focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none active:scale-90',
                  watchedCount <= min
                    ? 'bg-surface-2/40 text-faint cursor-not-allowed'
                    : 'bg-surface-2 text-muted hover:bg-surface'
                )}
              >
                <Minus className="h-5 w-5" />
              </button>

              <span className="text-4xl font-poster text-text tnum min-w-[3ch] text-center">
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
                  'focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none active:scale-90',
                  watchedCount >= max
                    ? 'bg-surface-2/40 text-faint cursor-not-allowed'
                    : 'bg-accent text-accent-ink shadow-offset hover:opacity-90'
                )}
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>

            {/* Pill */}
            {installmentValue > 0 && (
              <div className="rounded-full bg-accent/10 border border-accent/20 px-4 py-2 text-center animate-in fade-in-0 zoom-in-95 duration-200">
                <span className="text-sm text-accent">
                  Pagarás{' '}
                  <span className="font-bold">{watchedCount} cuotas</span>
                  {' '}de{' '}
                  <span className="font-bold">{formatCurrency(installmentValue)}</span>
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
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted">
            Frecuencia
          </span>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
            {(['monthly', 'yearly'] as const).map((freq) => (
              <button
                key={freq}
                type="button"
                onClick={() => field.onChange(freq)}
                className={cn(
                  'min-h-11 rounded-lg py-3 text-sm font-semibold transition-all',
                  'focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none',
                  field.value === freq
                    ? 'bg-accent text-accent-ink'
                    : 'text-muted hover:text-text'
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
  watchedDate?: string;
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
  // Lógica: si compra DESPUÉS del cierre → siguiente ciclo; si paymentDay < closingDay → pago el mes siguiente al cierre
  const calculateCreditPaymentDate = (method: PaymentMethod, currentDateStr: string): string => {
    if (method.type !== 'credit' || !method.default_closing_day || !method.default_payment_day) {
      return currentDateStr;
    }

    const currentDate = parseLocalDate(currentDateStr);
    const dayOfPurchase = currentDate.getDate();
    const paymentDate = new Date(currentDate);

    if (dayOfPurchase > method.default_closing_day) {
      paymentDate.setMonth(paymentDate.getMonth() + 1);
    }
    if (method.default_payment_day < method.default_closing_day) {
      paymentDate.setMonth(paymentDate.getMonth() + 1);
    }
    paymentDate.setDate(method.default_payment_day);

    return formatLocalDate(paymentDate);
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
          const paymentDay = selectedMethod.default_payment_day;
          if (!closingDay || !paymentDay) return null;

          const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                              'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
          const watchedLocalDate = parseLocalDate(watchedDate);
          const purchaseDay = watchedLocalDate.getDate();
          const purchaseMonth = watchedLocalDate.getMonth();

          // Mes de cierre
          const closingMonthIdx = (purchaseDay > closingDay ? purchaseMonth + 1 : purchaseMonth) % 12;
          // Mes de pago
          let paymentMonthIdx = closingMonthIdx;
          if (paymentDay < closingDay) paymentMonthIdx = (paymentMonthIdx + 1) % 12;

          return `Cierra el ${closingDay} de ${MONTHS_ES[closingMonthIdx]} · Vence el ${paymentDay} de ${MONTHS_ES[paymentMonthIdx]}`;
        })();

        return (
        <>
          <FormItem>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted">
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
                  className="w-full bg-surface-2 border-[1.5px] border-border rounded-xl min-h-[52px] px-3 py-2 flex items-center gap-3 focus-visible:ring-2 focus-visible:ring-accent/50 [&>svg]:hidden"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {selectedMethod ? (
                      <>
                        <PaymentMethodBadge type={selectedMethod.type} />
                        <span className="text-sm text-text truncate">
                          {selectedMethod.name}
                        </span>
                      </>
                    ) : (
                      <>
                        <Wallet className="h-5 w-5 text-muted shrink-0" />
                        <span className="text-sm text-muted">Sin asignar</span>
                      </>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted shrink-0" />
                </SelectTrigger>
              </FormControl>
              <SelectContent position="popper" sideOffset={4} className="bg-surface border-border text-text max-h-60">
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
              <p className="text-[11px] text-accent/80 mt-1 pl-1 animate-in fade-in-0 duration-200">
                {creditHint}
              </p>
            )}

            <FormMessage />
          </FormItem>

          {/* Debit payment day selector */}
          {selectedMethod?.type === 'debit' && setValue && (
            <div className="mt-4 animate-in fade-in-0 duration-300">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted mb-3 block">
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
                    'focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none active:scale-90',
                    (watchedDebitDay || 1) <= 1
                      ? 'bg-surface-2/40 text-faint cursor-not-allowed'
                      : 'bg-surface-2 text-muted hover:bg-surface hover:text-text'
                  )}
                >
                  <Minus className="h-4 w-4" />
                </button>

                <div className="text-center min-w-[80px]">
                  <div className="text-2xl font-poster text-text tnum">
                    {watchedDebitDay || (watchedDate ? parseLocalDate(watchedDate).getDate() : 1)}
                  </div>
                  <div className="text-xs text-muted">
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
                    'focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none active:scale-90',
                    (watchedDebitDay || 1) >= 28
                      ? 'bg-surface-2/40 text-faint cursor-not-allowed'
                      : 'bg-accent text-accent-ink hover:opacity-90'
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

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CurrencyField
   Toggle ARS/USD + selector de cotización + preview en vivo
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const RATE_OPTIONS: { pair: string; label: string }[] = [
  { pair: 'USD_ARS_BLUE', label: 'Blue' },
  { pair: 'USD_ARS_MEP', label: 'MEP' },
  { pair: 'USD_ARS_CCL', label: 'CCL' },
  { pair: 'USDT_ARS', label: 'USDT' },
];

export const DEFAULT_RATE_PAIR = 'USD_ARS_MEP';

interface CurrencyFieldProps<T extends FieldValues> {
  control: Control<T>;
  setValue: UseFormSetValue<T>;
  watchedCurrency: 'ARS' | 'USD';
  watchedRatePair?: string | null;
  watchedAmount: number;
}

export function CurrencyField<T extends FieldValues>({
  control,
  setValue,
  watchedCurrency,
  watchedRatePair,
  watchedAmount,
}: CurrencyFieldProps<T>) {
  const getExchangeRate = useFinanceStore((s) => s.getExchangeRate);
  const activePair = watchedRatePair || DEFAULT_RATE_PAIR;
  const rate = watchedCurrency === 'USD' ? getExchangeRate(activePair) : 0;
  const arsPreview = rate > 0 ? watchedAmount * rate : 0;
  const rateLabel = RATE_OPTIONS.find((o) => o.pair === activePair)?.label ?? 'MEP';

  return (
    <FormField
      control={control}
      name={'currency' as Path<T>}
      render={({ field }) => (
        <FormItem>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted">
            Moneda
          </span>
          {/* ARS / USD */}
          <div role="radiogroup" aria-label="Moneda" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
            {(['ARS', 'USD'] as const).map((cur) => (
              <button
                key={cur}
                type="button"
                role="radio"
                aria-checked={field.value === cur}
                onClick={() => {
                  field.onChange(cur);
                  if (cur === 'USD' && !watchedRatePair) {
                    setValue('rate_pair' as Path<T>, DEFAULT_RATE_PAIR as T[Path<T>], { shouldValidate: true });
                  }
                }}
                className={cn(
                  'min-h-11 rounded-lg py-2.5 text-sm font-semibold transition-all',
                  'focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none',
                  field.value === cur
                    ? 'bg-accent text-accent-ink'
                    : 'text-muted hover:text-text'
                )}
              >
                {cur === 'ARS' ? '$ Pesos' : 'US$ Dólares'}
              </button>
            ))}
          </div>

          {/* Selector de cotización + preview, solo en USD */}
          {field.value === 'USD' && (
            <div className="mt-3 space-y-2 animate-in fade-in-0 slide-in-from-top-2 duration-200">
              <div role="radiogroup" aria-label="Cotización" className="flex gap-1 p-1 rounded-xl bg-surface-2 border-[1.5px] border-border">
                {RATE_OPTIONS.map((opt) => (
                  <button
                    key={opt.pair}
                    type="button"
                    role="radio"
                    aria-checked={activePair === opt.pair}
                    onClick={() => setValue('rate_pair' as Path<T>, opt.pair as T[Path<T>], { shouldValidate: true })}
                    className={cn(
                      'flex-1 min-h-11 px-2 py-1.5 rounded-lg text-xs font-medium transition-all',
                      activePair === opt.pair
                        ? 'bg-accent text-accent-ink'
                        : 'text-muted hover:text-text'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-center text-xs text-muted">
                {rate > 0
                  ? <>≈ {formatCurrency(arsPreview)} ARS · a {formatCurrency(rate)} {rateLabel}</>
                  : 'Cotización no disponible'}
              </p>
            </div>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
