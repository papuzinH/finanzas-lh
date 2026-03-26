import Link from 'next/link';
import { Wallet, Tag, User, ChevronRight, Settings } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';

const sections = [
  {
    href: '/ajustes/medios',
    icon: Wallet,
    iconColor: 'text-sky-400',
    iconBg: 'bg-sky-500/10',
    title: 'Medios de Pago',
    description: 'Tarjetas, billeteras y deudas personales',
  },
  {
    href: '/ajustes/categorias',
    icon: Tag,
    iconColor: 'text-emerald-400',
    iconBg: 'bg-emerald-500/10',
    title: 'Categorías',
    description: 'Etiquetas para clasificar tus gastos',
  },
  {
    href: '/ajustes/perfil',
    icon: User,
    iconColor: 'text-violet-400',
    iconBg: 'bg-violet-500/10',
    title: 'Perfil',
    description: 'Tu cuenta y sesión',
  },
];

export default function AjustesPage() {
  return (
    <div className="min-h-screen bg-surface text-slate-50 font-sans selection:bg-emerald-500/30 pb-24">
      <PageHeader
        title="Ajustes"
        subtitle="Configuración de la app"
        icon={<Settings className="h-5 w-5" />}
        containerClassName="max-w-[1440px]"
      />

      <main className="mx-auto max-w-[1440px] px-4 md:px-6 py-6 md:py-8">
        <div className="flex flex-col gap-3 max-w-xl">
          {sections.map(({ href, icon: Icon, iconColor, iconBg, title, description }) => (
            <Link
              key={href}
              href={href}
              data-tour={href === '/ajustes/medios' ? 'section-medios' : undefined}
              className="group flex items-center gap-4 rounded-2xl border border-slate-800 bg-surface-raised/50 p-5 transition-all hover:bg-surface-raised hover:border-slate-700"
            >
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
                <Icon className={`h-5 w-5 ${iconColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-200 group-hover:text-white transition-colors">{title}</p>
                <p className="text-xs text-slate-400 mt-0.5 truncate">{description}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-slate-400 transition-colors shrink-0" />
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
