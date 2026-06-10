"use client";
import {
  Home, List, Layers, Target, BarChart2, Settings,
  TrendingUp, TrendingDown, CreditCard, Wallet, Banknote,
  DollarSign, Coins, PiggyBank, Plus, PlusCircle,
  Check, CheckCircle, X, Pencil, Trash2, Filter, SlidersHorizontal,
  Search, Calendar, Bell, Eye, EyeOff, ChevronRight, ChevronLeft,
  ChevronDown, ChevronUp, ArrowDownLeft, ArrowUpRight,
  Mic, Send, Sparkles, Repeat, ShoppingBag, Coffee,
  Bus, Plane, Gift, Phone, Shield, Zap, Film, Music,
  Cloud, Laptop, MoreHorizontal, Info, AlertTriangle, Flame, Tag,
} from "lucide-react";
import type React from "react";

const ICONS: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  home: Home, list: List, layers: Layers, target: Target, chart: BarChart2,
  settings: Settings, "trending-up": TrendingUp, "trending-down": TrendingDown,
  "credit-card": CreditCard, wallet: Wallet, banknote: Banknote,
  dollar: DollarSign, coins: Coins, piggy: PiggyBank,
  plus: Plus, "plus-circle": PlusCircle, check: Check, "check-circle": CheckCircle,
  x: X, edit: Pencil, trash: Trash2, filter: Filter, sliders: SlidersHorizontal,
  search: Search, calendar: Calendar, bell: Bell, eye: Eye, "eye-off": EyeOff,
  "chevron-right": ChevronRight, "chevron-left": ChevronLeft,
  "chevron-down": ChevronDown, "chevron-up": ChevronUp,
  "arrow-down-left": ArrowDownLeft, "arrow-up-right": ArrowUpRight,
  mic: Mic, send: Send, sparkle: Sparkles, repeat: Repeat,
  bag: ShoppingBag, coffee: Coffee, bus: Bus, plane: Plane,
  gift: Gift, phone: Phone, shield: Shield, zap: Zap,
  film: Film, music: Music, cloud: Cloud, laptop: Laptop,
  more: MoreHorizontal, info: Info, alert: AlertTriangle, flame: Flame,
  tag: Tag,
};

export function Icon({ name, size = 24, stroke = 2, className }: {
  name: string;
  size?: number;
  stroke?: number;
  className?: string;
}) {
  const Ic = ICONS[name];
  if (!Ic) return null;
  return <Ic size={size} strokeWidth={stroke} className={className} />;
}
