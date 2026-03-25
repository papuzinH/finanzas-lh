'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ListOrdered,
  CalendarClock,
  Target,
  Settings,
} from 'lucide-react';
import { motion } from 'framer-motion';

const navItems = [
  { label: 'Inicio',      href: '/',            icon: LayoutDashboard },
  { label: 'Movimientos', href: '/movimientos', icon: ListOrdered },
  { label: 'Compromisos', href: '/compromisos', icon: CalendarClock },
  { label: 'Objetivos',   href: '/objetivos',   icon: Target },
  { label: 'Ajustes',     href: '/ajustes',     icon: Settings },
];

function isRouteActive(itemHref: string, pathname: string) {
  if (itemHref === '/') return pathname === '/';
  return pathname === itemHref || pathname.startsWith(itemHref + '/');
}

export function MainNav() {
  const pathname = usePathname();

  return (
    <>
      {/* ========== MOBILE BOTTOM NAV ========== */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
        <div className="relative z-50 border-t border-slate-800/80 bg-[var(--surface)]/95 backdrop-blur-xl">
          <div className="mx-auto flex h-16 items-center justify-around px-1 pb-[env(safe-area-inset-bottom)]">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = isRouteActive(item.href, pathname);
              return (
                <Link key={item.href} href={item.href} className="flex-1">
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
          </div>
        </div>
      </nav>

      {/* ========== DESKTOP SIDEBAR ========== */}
      <nav className="hidden fixed left-0 top-0 z-40 h-full w-64 border-r border-slate-800 bg-[var(--surface)] p-6 md:flex md:flex-col">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="relative h-10 w-10 aspect-square overflow-hidden rounded-full shadow-[0_0_15px_rgba(16,185,129,0.2)]">
            <Image src="/icon.png" alt="Chanchito Logo" fill className="object-cover" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-100">Chanchito</h1>
        </div>
        <div className="flex flex-col gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = isRouteActive(item.href, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="block"
                data-tour={item.href === '/objetivos' ? 'nav-objetivos' : undefined}
              >
                <motion.div
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.98 }}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-emerald-500/10 text-emerald-500'
                      : 'text-slate-400 hover:bg-surface-raised hover:text-slate-200'
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
