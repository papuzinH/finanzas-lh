import Link from 'next/link';
import { Wallet, Tag, User, ChevronRight, Palette } from 'lucide-react';
import { ScreenHeader } from '@/components/shared/screen-header';
import { ThemeToggle } from '@/components/theme/theme-toggle';

const sections = [
  {
    href: '/ajustes/medios',
    icon: Wallet,
    title: 'Medios de Pago',
    description: 'Tarjetas, billeteras y deudas personales',
  },
  {
    href: '/ajustes/categorias',
    icon: Tag,
    title: 'Categorías',
    description: 'Etiquetas para clasificar tus gastos',
  },
  {
    href: '/ajustes/perfil',
    icon: User,
    title: 'Perfil',
    description: 'Tu cuenta y sesión',
  },
];

export default function AjustesPage() {
  return (
    <div className="min-h-screen bg-bg text-text font-sans pb-28 md:pb-8">
      <ScreenHeader title="Ajustes" sub="Configuración de la app" />

      <main className="mx-auto max-w-[1440px] px-5 py-4">
        <div className="flex flex-col gap-3 max-w-xl">
          {sections.map(({ href, icon: Icon, title, description }) => (
            <Link
              key={href}
              href={href}
              data-tour={href === '/ajustes/medios' ? 'section-medios' : undefined}
              className="group flex items-center gap-4 rounded-2xl border-[1.5px] border-border bg-surface p-5 transition-all hover:bg-surface-2/50 active:scale-[0.99]"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft/30 text-accent-deep">
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-sans font-bold text-text">{title}</p>
                <p className="text-xs text-muted mt-0.5 truncate">{description}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted group-hover:text-text transition-colors shrink-0" />
            </Link>
          ))}

          {/* Apariencia. Día es papel crema; Noche es papel de estraza, el de
              envolver del almacén — no un dark mode. */}
          <div className="flex items-center gap-4 rounded-2xl border-[1.5px] border-border bg-surface p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft/30 text-accent-deep">
              <Palette className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-sans font-bold text-text">Tema</p>
              <p className="mt-0.5 truncate text-xs text-muted">Papel de día, estraza de noche</p>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </main>
    </div>
  );
}
