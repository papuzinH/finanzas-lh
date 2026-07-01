"use client";
/* ============================================================
   Chanchito · Icon
   Los íconos del sistema son estilo Lucide (línea, trazo 2px).
   Lo más limpio en Next es usar `lucide-react` directamente.
   Este wrapper mapea los nombres usados en los prototipos a
   sus equivalentes de lucide-react, para que puedas copiar el
   markup tal cual. Instalá:  npm i lucide-react
   ============================================================ */
import {
  Home, List, Layers, Target, PieChart, TrendingUp, TrendingDown, Flame,
  Wallet, CreditCard, Banknote, DollarSign, Coins, PiggyBank, Plus, PlusCircle,
  Check, CheckCircle2, X, Pencil, Trash2, Filter, SlidersHorizontal, Search,
  Calendar, Bell, Eye, EyeOff, Settings, MoreVertical, Info, AlertTriangle,
  ChevronRight, ChevronLeft, ChevronDown, ChevronUp, ArrowRight, ArrowUpRight,
  ArrowDownLeft, Mic, Send, Sparkles, Repeat, ShoppingBag, ShoppingCart, Coffee,
  QrCode, BarChart3, Bus, Plane, Gift, Smartphone, HeartPulse, Shield, Zap,
  Film, Music, Cloud, Laptop, type LucideIcon,
} from "lucide-react";

const MAP: Record<string, LucideIcon> = {
  home: Home, list: List, layers: Layers, target: Target, chart: PieChart,
  "trending-up": TrendingUp, "trending-down": TrendingDown, flame: Flame,
  wallet: Wallet, "credit-card": CreditCard, banknote: Banknote, dollar: DollarSign,
  coins: Coins, piggy: PiggyBank, plus: Plus, "plus-circle": PlusCircle,
  check: Check, "check-circle": CheckCircle2, x: X, edit: Pencil, trash: Trash2,
  filter: Filter, sliders: SlidersHorizontal, search: Search, calendar: Calendar,
  bell: Bell, eye: Eye, "eye-off": EyeOff, settings: Settings, more: MoreVertical,
  info: Info, alert: AlertTriangle, "chevron-right": ChevronRight,
  "chevron-left": ChevronLeft, "chevron-down": ChevronDown, "chevron-up": ChevronUp,
  "arrow-right": ArrowRight, "arrow-up-right": ArrowUpRight, "arrow-down-left": ArrowDownLeft,
  mic: Mic, send: Send, sparkle: Sparkles, repeat: Repeat, bag: ShoppingBag,
  cart: ShoppingCart, coffee: Coffee, qr: QrCode, bars: BarChart3, bus: Bus,
  plane: Plane, gift: Gift, "phone-screen": Smartphone, health: HeartPulse,
  shield: Shield, zap: Zap, film: Film, music: Music, cloud: Cloud, laptop: Laptop,
};

export function Icon({
  name, size = 24, stroke = 2, className, style,
}: {
  name: keyof typeof MAP | string;
  size?: number;
  stroke?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const C = MAP[name] ?? Info;
  return <C size={size} strokeWidth={stroke} className={className} style={style} aria-hidden />;
}
