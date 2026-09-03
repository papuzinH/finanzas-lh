'use client'

import Link from 'next/link';
import { useState } from 'react'
import { Wallet, Tag, User, ChevronRight, Palette, CalendarClock, Scale } from 'lucide-react';
import { toast } from 'sonner'
import { ScreenHeader } from '@/components/shared/screen-header';
import { InstallApp } from '@/components/shared/install-app';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { useFinanceStore } from '@/lib/store/financeStore'
import { RhythmPicker } from '@/components/pocket/rhythm-picker'
import { AdjustBalanceDialog } from '@/components/pocket/adjust-balance-dialog'
import { Chip } from '@/components/ui/chip'
import { saveIncomeRhythm, saveIncomePeriodPreference } from '@/app/bolsillo/actions'
import type { IncomeRhythm } from '@/lib/finance/pocket'

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
  const { incomeRhythm, incomeCountsNextMonth, fetchAllData } = useFinanceStore()
  const [rhythm, setRhythm] = useState<IncomeRhythm>(incomeRhythm)
  const [cuentaAlSiguiente, setCuentaAlSiguiente] = useState<boolean | null>(incomeCountsNextMonth)
  const [ajustando, setAjustando] = useState(false)

  const cambiarRitmo = async (r: IncomeRhythm) => {
    setRhythm(r)
    const res = await saveIncomeRhythm(r)
    if (res.error) {
      toast.error(res.error)
      return
    }
    await fetchAllData()
  }

  const guardarPreferencia = async (valor: boolean) => {
    setCuentaAlSiguiente(valor)
    const res = await saveIncomePeriodPreference(valor)
    if (res.error) {
      toast.error(res.error)
      return
    }
    await fetchAllData()
  }

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

          {/* Ritmo de cobro. Cambia con la vida —de relación de dependencia a
              freelance, un laburo quincenal que se suma—, por eso es editable. */}
          <div className="rounded-2xl border-[1.5px] border-border bg-surface p-5 space-y-3">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft/30 text-accent-deep">
                <CalendarClock className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-sans font-bold text-text">Cada cuánto cobrás</p>
                <p className="mt-0.5 text-xs text-muted">Define qué te descontamos hoy</p>
              </div>
            </div>
            <RhythmPicker value={rhythm} onChange={cambiarRitmo} />

            {rhythm === 'monthly' && (
              <div className="space-y-2">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted">
                  Cobros de fin de mes
                </span>
                <div className="flex flex-wrap gap-2" role="group" aria-label="A que mes cuenta un cobro de fin de mes">
                  <Chip active={cuentaAlSiguiente === false} onClick={() => guardarPreferencia(false)}>
                    Al mes en que cobro
                  </Chip>
                  <Chip active={cuentaAlSiguiente === true} onClick={() => guardarPreferencia(true)}>
                    Al mes que arranca
                  </Chip>
                </div>
                <p className="font-sans text-xs text-muted">
                  Si cobrás los últimos días del mes, esto decide qué opción viene marcada cuando cargás
                  el sueldo. Siempre podés cambiarla en cada cobro.
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setAjustando(true)}
            className="group flex items-center gap-4 rounded-2xl border-[1.5px] border-border bg-surface p-5 text-left transition-all hover:bg-surface-2/50 active:scale-[0.99]"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft/30 text-accent-deep">
              <Scale className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-sans font-bold text-text">Poner el saldo al día</p>
              <p className="mt-0.5 truncate text-xs text-muted">Cuando la cuenta no te cierra</p>
            </div>
          </button>

          <InstallApp variante="ajustes" />

          <AdjustBalanceDialog open={ajustando} onOpenChange={setAjustando} />
        </div>
      </main>
    </div>
  );
}
