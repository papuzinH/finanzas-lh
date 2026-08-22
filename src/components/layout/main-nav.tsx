'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, ListOrdered, Layers, Target, TrendingUp, Settings, Wallet, MoreHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { ActionSheet } from '@/components/ui/action-sheet';
import { Chancho } from '@/components/brand/chancho';
import { MOBILE_ITEMS, MORE_DESTINATIONS, isActive, isMoreActive } from './nav-config';

const ICONS: Record<string, LucideIcon> = {
  '/': Home,
  '/movimientos': ListOrdered,
  '/compromisos': Layers,
  '/objetivos': Target,
  '/inversiones': TrendingUp,
  '/ajustes/medios': Wallet,
  '/ajustes': Settings,
};

const desktopItems = [
  { label: 'Inicio', href: '/' },
  { label: 'Movimientos', href: '/movimientos' },
  { label: 'Compromisos', href: '/compromisos' },
  { label: 'Objetivos', href: '/objetivos' },
  { label: 'Inversiones', href: '/inversiones' },
  { label: 'Ajustes', href: '/ajustes' },
];

export function MainNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      {/* ========== MOBILE BOTTOM NAV ========== */}
      <nav className="fixed bottom-0 inset-x-0 z-50 md:hidden">
        <div
          className="bg-bg-2/95 backdrop-blur border-t-[1.5px] border-border"
          style={{ boxShadow: '0 -6px 20px -12px rgb(var(--navy-700-rgb) / 0.4)' }}
        >
          <div className="flex items-stretch justify-between px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+8px)]">
            {MOBILE_ITEMS.map(({ label, href }) => {
              const Icon = ICONS[href];
              const on = isActive(href, pathname);
              return (
                <Link key={href} href={href} className="flex-1">
                  <motion.div whileTap={{ scale: 0.88 }} className="flex flex-col items-center gap-1 py-1">
                    <span className={`grid place-items-center w-11 h-8 rounded-full transition-colors ${on ? 'bg-accent text-accent-ink' : 'text-muted'}`}>
                      <Icon size={20} strokeWidth={on ? 2.4 : 2} />
                    </span>
                    <span className={`text-[9.5px] font-bold tracking-tight transition-colors ${on ? 'text-text' : 'text-faint'}`}>
                      {label}
                    </span>
                  </motion.div>
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className="flex-1"
              aria-label="Más destinos"
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
            >
              <motion.div whileTap={{ scale: 0.88 }} className="flex flex-col items-center gap-1 py-1">
                <span className={`grid place-items-center w-11 h-8 rounded-full transition-colors ${isMoreActive(pathname) ? 'bg-accent text-accent-ink' : 'text-muted'}`}>
                  <MoreHorizontal size={20} strokeWidth={isMoreActive(pathname) ? 2.4 : 2} />
                </span>
                <span className={`text-[9.5px] font-bold tracking-tight transition-colors ${isMoreActive(pathname) ? 'text-text' : 'text-faint'}`}>
                  Más
                </span>
              </motion.div>
            </button>
          </div>
          <div className="mx-auto h-1 w-32 rounded-full bg-text opacity-25 mb-1" />
        </div>
      </nav>

      <ActionSheet
        open={moreOpen}
        onOpenChange={setMoreOpen}
        title="Más"
        actions={MORE_DESTINATIONS.map(({ label, href }) => {
          const Icon = ICONS[href];
          return {
            label,
            icon: <Icon size={18} strokeWidth={2} aria-hidden="true" />,
            onClick: () => router.push(href),
          };
        })}
      />

      {/* ========== DESKTOP SIDEBAR (sin cambios de destino) ========== */}
      <nav className="hidden fixed left-0 top-0 z-40 h-full w-64 border-r-[1.5px] border-border bg-bg-2 p-6 md:flex md:flex-col">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="grid h-10 w-10 place-items-center rounded-full border-[1.5px] border-border bg-surface-2">
            <Chancho className="w-[22px] text-text" slot="var(--surface-2)" />
          </div>
          <h1 className="font-display text-text text-[20px]">Chanchito</h1>
        </div>
        <div className="flex flex-col gap-1">
          {desktopItems.map(({ label, href }) => {
            const Icon = ICONS[href];
            const on = isActive(href, pathname);
            return (
              <Link key={href} href={href}>
                <motion.div
                  whileHover={{ x: 3 }}
                  whileTap={{ scale: 0.98 }}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-[13.5px] font-bold transition-colors ${
                    on ? 'bg-accent/10 text-accent' : 'text-muted hover:text-text hover:bg-surface'
                  }`}
                >
                  <Icon size={18} strokeWidth={on ? 2.4 : 2} />
                  {label}
                </motion.div>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
