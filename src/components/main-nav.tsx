'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ListOrdered, CreditCard, Wallet } from 'lucide-react';

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
      label: 'Cuotas',
      href: '/cuotas',
      icon: CreditCard,
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
                className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors ${
                  isActive ? 'text-emerald-500' : 'text-slate-500 hover:text-slate-400'
                }`}
              >
                <Icon className={`h-6 w-6 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Desktop Sidebar */}
      <nav className="hidden fixed left-0 top-0 h-full w-64 border-r border-slate-800 bg-slate-950 p-6 md:flex md:flex-col">
        <div className="flex items-center gap-3 mb-10 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
              <Wallet className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-100">Finanzas LH</h1>
        </div>
        
        <div className="flex flex-col gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                  isActive 
                    ? 'bg-emerald-500/10 text-emerald-500' 
                    : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="mt-auto px-2">
            <div className="rounded-xl bg-slate-900/50 p-4 border border-slate-800">
                <p className="text-xs text-slate-500 mb-2">Usuario</p>
                <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-linear-to-br from-slate-700 to-slate-800 flex items-center justify-center text-xs font-bold text-slate-300">
                        AD
                    </div>
                    <div className="overflow-hidden">
                        <p className="text-sm font-medium text-slate-200 truncate">Adriel</p>
                        <p className="text-[10px] text-slate-500 truncate">adriel@example.com</p>
                    </div>
                </div>
            </div>
        </div>
      </nav>
    </>
  );
}
