import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { parseISO } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(amount);
};

/**
 * Formatea moneda de forma inteligente para inversiones.
 * Detecta la moneda por:
 * 1. Parámetro explícito `currency`
 * 2. Suffix del ticker: tickers que terminan en 'D' o 'C' → USD (ej: AL30D, GD30C)
 * 3. Default: ARS
 */
export const formatTickerCurrency = (
  amount: number,
  ticker?: string,
  currency?: 'ARS' | 'USD' | string | null,
): string => {
  const resolvedCurrency = currency || detectCurrencyFromTicker(ticker) || 'ARS';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: resolvedCurrency === 'USD' ? 'USD' : 'ARS',
    minimumFractionDigits: 2,
  }).format(amount);
};

/**
 * Detecta la moneda probable a partir del ticker del activo argentino.
 * - Suffix 'D' → dólares (ej: AL30D, GD30D, AE38D)
 * - Suffix 'C' → dólar cable (ej: GD30C)
 * - Crypto → USD
 * - Resto → ARS
 */
export const detectCurrencyFromTicker = (ticker?: string): 'ARS' | 'USD' | null => {
  if (!ticker) return null;
  const t = ticker.toUpperCase().trim();
  // Bonos en dólar MEP o Cable
  if (/^[A-Z]{2}\d{2}[DC]$/.test(t)) return 'USD';
  return null;
};

export const formatDate = (dateString: string | Date) => {
  let date = typeof dateString === 'string' ? parseISO(dateString) : dateString;
  
  // Si es un string de fecha (YYYY-MM-DD), parseISO lo toma como UTC.
  // Ajustamos para que se trate como hora local y no se mueva de día.
  if (typeof dateString === 'string' && !dateString.includes('T')) {
    date = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
  }

  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
};
