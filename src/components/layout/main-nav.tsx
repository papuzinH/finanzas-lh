'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ListOrdered, CreditCard, Wallet, CalendarClock, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';

export function MainNav() {
  const pathname = usePathname();

  const navItems = [
    {
      label: 'Inicio',
      href: '/',
      icon: LayoutDashboard,
    },
    {
      label: 'Movimientos',
      href: '/movimientos',
      icon: ListOrdered,
    },
    {
      label: 'Billetera',
      href: '/medios-pago',
      icon: Wallet,
    },
    {
      label: 'Cuotas',
      href: '/cuotas',
      icon: CreditCard,
    },
    {
      label: 'Fijos',
      href: '/mensualidades',
      icon: CalendarClock,
    },
    {
      label: 'Inversiones',
      href: '/inversiones',
      icon: TrendingUp,
    },
  ];

  return (
    <>
      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-800 bg-slate-950/90 backdrop-blur-lg pb-safe md:hidden">
        <div className="mx-auto flex h-16 items-center justify-around px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex-1"
              >
                <motion.div
                  whileTap={{ scale: 0.9 }}
                  className={`flex flex-col items-center justify-center gap-1 py-2 transition-colors ${
                    isActive ? 'text-emerald-500' : 'text-slate-500 hover:text-slate-400'
                  }`}
                >
                  <Icon className={`h-6 w-6 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </motion.div>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Desktop Sidebar */}
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
              <Link
                key={item.href}
                href={item.href}
                className="block"
              >
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
