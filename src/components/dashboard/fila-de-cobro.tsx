'use client'

import { Chip } from '@/components/ui/chip'
import { mesesCandidatos } from '@/lib/finance/imputacion-ingresos'

/**
 * Una fila del repaso de `CobrosSinImputarBanner`: descripción, monto y los dos
 * chips de mes de un cobro ambiguo.
 *
 * Componente PURO (sin `useFinanceStore`), a propósito -- mismo patrón que
 * `MesDelCobroField` (Task 7) y `PreferenciaCobroFinDeMes` (Task 6). La
 * preselección (`value`) sale de `mesPorDefecto(fecha, incomeCountsNextMonth)` en
 * el banner, que lee `incomeCountsNextMonth` como CAMPO del store: bajo
 * `renderToStaticMarkup` (sin hidratación), `useFinanceStore()` usa el
 * getServerSnapshot de zustand (`api.getInitialState()`, fijo al crear el store)
 * para los campos -- quedaría congelado si se leyera desde ADENTRO de este
 * componente. Sacándolo a props, el valor que llega es el que decidió quien lo
 * llama, y el componente se testea pasándoselo directo, sin pasar por el store.
 */
export function FilaDeCobro({
  fecha,
  descripcion,
  monto,
  value,
  onChange,
}: {
  fecha: string
  descripcion: string
  monto: string
  value: string
  onChange: (valor: string) => void
}) {
  const opciones = mesesCandidatos(fecha)

  return (
    <li className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-sans text-sm text-text truncate">{descripcion}</span>
        <span className="font-display tnum text-sm text-good shrink-0">{monto}</span>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={`Mes de ${descripcion}`}>
        {opciones.map((o) => (
          <Chip key={o.valor} active={value === o.valor} onClick={() => onChange(o.valor)}>
            {o.label}
          </Chip>
        ))}
      </div>
    </li>
  )
}
