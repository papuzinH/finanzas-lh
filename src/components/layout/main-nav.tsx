'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  ListOrdered, 
  CreditCard, 
  Wallet, 
  CalendarClock, 
  TrendingUp, 
  Sparkles,
  Menu,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

const navItems = [
  { label: 'Inicio',       href: '/',              icon: LayoutDashboard },
  { label: 'Movimientos',  href: '/movimientos',   icon: ListOrdered },
  { label: 'Billetera',    href: '/medios-pago',   icon: Wallet },
  { label: 'Cuotas',       href: '/cuotas',        icon: CreditCard },
  { label: 'Fijos',        href: '/mensualidades', icon: CalendarClock },
  { label: 'Categorías',   href: '/categorias',    icon: Sparkles },
  { label: 'Inversiones',  href: '/inversiones',   icon: TrendingUp },
];

// Los primeros 4 siempre visibles en bottom bar, el 5to es "Más"
const PRIMARY_NAV_ITEMS = navItems.slice(0, 4);
const SECONDARY_NAV_ITEMS = navItems.slice(4);

export function MainNav() {
  const pathname = usePathname();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  // Determinar si la ruta actual está en el menú secundario
  const isSecondaryActive = SECONDARY_NAV_ITEMS.some(item => pathname === item.href);

  // Cerrar menú al presionar Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMoreOpen(false);
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, []);

  // Bloquear scroll del body cuando el menú está abierto
  useEffect(() => {
    if (isMoreOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isMoreOpen]);

  return (
    <>
      {/* ========== MOBILE BOTTOM NAV ========== */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
        {/* Overlay para cerrar menú "Más" */}
        <AnimatePresence>
          {isMoreOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
              onClick={() => setIsMoreOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* Panel expandible "Más" */}
        <AnimatePresence>
          {isMoreOpen && (
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="absolute bottom-full left-0 right-0 z-50 mb-0"
            >
              <div className="mx-3 mb-2 rounded-2xl border border-slate-800 bg-slate-900/95 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden">
                <div className="px-4 pt-4 pb-2 border-b border-slate-800/50">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Más opciones</p>
                </div>
                <div className="p-2">
                  {SECONDARY_NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;
                    return (
                      <Link key={item.href} href={item.href} onClick={() => setIsMoreOpen(false)}>
                        <motion.div
                          whileTap={{ scale: 0.97 }}
                          className={`flex items-center gap-3 px-4 py-3.5 rounded-xl transition-colors ${
                            isActive 
                              ? 'bg-emerald-500/10 text-emerald-400' 
                              : 'text-slate-300 active:bg-slate-800'
                          }`}
                        >
                          <Icon className="h-5 w-5" />
                          <span className="text-sm font-medium">{item.label}</span>
                          {isActive && (
                            <div className="ml-auto h-2 w-2 rounded-full bg-emerald-400" />
                          )}
                        </motion.div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom Bar Principal */}
        <div className="relative z-50 border-t border-slate-800/80 bg-slate-950/95 backdrop-blur-xl">
          <div className="mx-auto flex h-16 items-center justify-around px-1 pb-[env(safe-area-inset-bottom)]">
            {PRIMARY_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link key={item.href} href={item.href} className="flex-1" onClick={() => setIsMoreOpen(false)}>
                  <motion.div
                    whileTap={{ scale: 0.85 }}
                    className="flex flex-col items-center justify-center gap-0.5 py-1.5 relative"
                  >
                    {isActive && (
                      <motion.div
                        layoutId="mobileActiveTab"
                        className="absolute -top-px left-1/2 -translate-x-1/2 h-[3px] w-8 rounded-full bg-emerald-500"
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                    <Icon className={`h-[22px] w-[22px] transition-colors ${
                      isActive ? 'text-emerald-400 stroke-[2.5px]' : 'text-slate-500 stroke-[1.5px]'
                    }`} />
                    <span className={`text-[10px] transition-colors ${
                      isActive ? 'text-emerald-400 font-semibold' : 'text-slate-500 font-medium'
                    }`}>
                      {item.label}
                    </span>
                  </motion.div>
                </Link>
              );
            })}

            {/* Botón "Más" */}
            <button 
              onClick={() => setIsMoreOpen(!isMoreOpen)} 
              className="flex-1"
            >
              <motion.div
                whileTap={{ scale: 0.85 }}
                className="flex flex-col items-center justify-center gap-0.5 py-1.5 relative"
              >
                {isSecondaryActive && !isMoreOpen && (
                  <motion.div
                    layoutId="mobileActiveTab"
                    className="absolute -top-px left-1/2 -translate-x-1/2 h-[3px] w-8 rounded-full bg-emerald-500"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <AnimatePresence mode="wait">
                  {isMoreOpen ? (
                    <motion.div
                      key="close"
                      initial={{ rotate: -90, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: 90, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <X className="h-[22px] w-[22px] text-emerald-400 stroke-[2.5px]" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="menu"
                      initial={{ rotate: 90, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: -90, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <Menu className={`h-[22px] w-[22px] transition-colors ${
                        isSecondaryActive ? 'text-emerald-400 stroke-[2.5px]' : 'text-slate-500 stroke-[1.5px]'
                      }`} />
                    </motion.div>
                  )}
                </AnimatePresence>
                <span className={`text-[10px] transition-colors ${
                  isMoreOpen || isSecondaryActive ? 'text-emerald-400 font-semibold' : 'text-slate-500 font-medium'
                }`}>
                  Más
                </span>
              </motion.div>
            </button>
          </div>
        </div>
      </nav>

      {/* ========== DESKTOP SIDEBAR ========== */}
      <nav className="hidden fixed left-0 top-0 z-40 h-full w-64 border-r border-slate-800 bg-slate-950 p-6 md:flex md:flex-col">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="relative h-10 w-10 aspect-square overflow-hidden rounded-full shadow-[0_0_15px_rgba(16,185,129,0.2)]">
            <Image src="/icon.png" alt="Chanchito Logo" fill className="object-cover" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-100">Chanchito</h1>
        </div>
        <div className="flex flex-col gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} className="block">
                <motion.div
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.98 }}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-emerald-500/10 text-emerald-500'
                      : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </motion.div>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
