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
