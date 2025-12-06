import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { 
  Coffee, 
  ShoppingBag, 
  Home as HomeIcon, 
  Car, 
  Smartphone, 
  DollarSign, 
  CreditCard
} from "lucide-react";
import { isFuture, parseISO } from "date-fns";

// Definimos la interfaz localmente para no depender de tipos globales si no es necesario,
// pero idealmente debería importar Transaction de types/database
interface TransactionItemProps {
  transaction: {
    id: number;
    amount: number;
    description: string;
    date: string;
    category: string | null;
    type: 'income' | 'expense' | null;
    payment_method_id: number | null;
  };
  paymentMethodName?: string;
  paymentMethodType?: string;
  showDate?: boolean;
}

const getCategoryIcon = (category: string | null) => {
  const cat = category?.toLowerCase() || '';
  if (cat.includes('comida') || cat.includes('delivery') || cat.includes('restaurant')) return <Coffee className="h-5 w-5" />;
  if (cat.includes('compra') || cat.includes('super') || cat.includes('ropa')) return <ShoppingBag className="h-5 w-5" />;
  if (cat.includes('casa') || cat.includes('alquiler') || cat.includes('servicios')) return <HomeIcon className="h-5 w-5" />;
  if (cat.includes('transporte') || cat.includes('auto') || cat.includes('viajes')) return <Car className="h-5 w-5" />;
  if (cat.includes('internet') || cat.includes('celular') || cat.includes('tecnología')) return <Smartphone className="h-5 w-5" />;
  return <DollarSign className="h-5 w-5" />;
};

export function TransactionItem({ transaction, paymentMethodName, paymentMethodType, showDate = true }: TransactionItemProps) {
  const isFutureDate = isFuture(parseISO(transaction.date));
  const isIncome = transaction.type === 'income';
  const isCredit = paymentMethodType === 'credit';

  return (
    <div className="group relative flex items-center justify-between rounded-xl border border-slate-800/40 bg-slate-900/20 p-3 transition-all hover:bg-slate-900/60 hover:border-slate-700 hover:shadow-lg hover:shadow-black/20">
      {/* Left: Icon & Info */}
      <div className="flex items-center gap-3 overflow-hidden">
        <div className={cn(
          "flex h-10 w-10 min-w-10 items-center justify-center rounded-full border transition-colors",
          isIncome
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
            : "bg-slate-800/50 border-slate-700/50 text-slate-400 group-hover:text-slate-300"
        )}>
          {getCategoryIcon(transaction.category)}
        </div>

        <div className="flex flex-col min-w-0">
          <span className="font-medium text-sm text-slate-200 truncate">
            {transaction.description}
          </span>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 truncate">
            {paymentMethodName && (
              <span className="flex items-center gap-1 text-slate-400">
                {isCredit && <CreditCard className="h-2.5 w-2.5" />}
                {paymentMethodName}
              </span>
            )}
            {paymentMethodName && <span className="text-slate-700">•</span>}
            <span className="capitalize">{transaction.category || 'Varios'}</span>
          </div>
        </div>
      </div>

      {/* Right: Amount & Status */}
      <div className="flex flex-col items-end gap-0.5 pl-2">
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
            <span className="text-[10px] text-slate-500">
              {formatDate(transaction.date)}
            </span>
          )
        )}
      </div>
    </div>
  );
}
