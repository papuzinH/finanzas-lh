'use client'

import { Chip } from '@/components/ui/chip'

/**
 * Cobrás los últimos días del mes: ¿esa plata es del mes que cierra o del que
 * arranca? Decide qué chip viene marcado cuando se carga el sueldo (siempre
 * editable en el momento de cargarlo). Compartido por Ajustes y el slide de
 * ritmo del onboarding — mismo copy en los dos lugares.
 */
export function PreferenciaCobroFinDeMes({
  value,
  onChange,
}: {
  value: boolean | null
  onChange: (v: boolean) => void
}) {
  return (
    <div className="space-y-2">
      <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted">
        Cobros de fin de mes
      </span>
      <div className="flex flex-wrap gap-2" role="group" aria-label="A que mes cuenta un cobro de fin de mes">
        <Chip active={value === false} onClick={() => onChange(false)}>
          Al mes en que cobro
        </Chip>
        <Chip active={value === true} onClick={() => onChange(true)}>
          Al mes que arranca
        </Chip>
      </div>
      <p className="font-sans text-xs text-muted">
        Si cobrás los últimos días del mes, esto decide qué opción viene marcada cuando cargás
        el sueldo. Siempre podés cambiarla en cada cobro.
      </p>
    </div>
  )
}
