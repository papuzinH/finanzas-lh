import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { parseISO } from "date-fns"
import { parseLocalDate } from "./utils/dates"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(amount);
};

/** Formato de montos en dólares: "u$s 1.234,56" (sin convertir a ARS). */
export const formatUsd = (amount: number) => {
  return `u$s ${amount.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

/** Formato compacto para espacios ajustados: $1,5M · $340K · $890 */
export const formatCompact = (amount: number): string => {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    const val = abs / 1_000_000;
    const str = val % 1 === 0 ? val.toFixed(0) : val.toFixed(1).replace('.', ',');
    return `${sign}$${str}M`;
  }
  if (abs >= 1_000) {
    const val = abs / 1_000;
    const str = val % 1 === 0 ? val.toFixed(0) : val.toFixed(1).replace('.', ',');
    return `${sign}$${str}K`;
  }
  return `${sign}$${Math.round(abs)}`;
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

export const formatRelativeTime = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return 'recién';
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'recién';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
};

export const isStale = (iso: string | null | undefined, hours = 24): boolean => {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() > hours * 3600_000;
};

export const formatDate = (dateString: string | Date) => {
  let date: Date;

  if (typeof dateString === 'string') {
    // Si es un string de fecha (YYYY-MM-DD sin hora), parsearlo como LOCAL
    if (!dateString.includes('T')) {
      date = parseLocalDate(dateString);
    } else {
      // Si es un string ISO completo (con hora), parsearlo normalmente
      date = parseISO(dateString);
    }
  } else {
    date = dateString;
  }

  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
};
