'use client'

import { Chip } from '@/components/ui/chip'
import { mesesCandidatos, necesitaDeclararMes } from '@/lib/finance/imputacion-ingresos'

/**
 * A que mes cuenta este cobro. Solo aparece cuando la fecha cae en los ultimos dias
 * del mes, que es donde la pregunta significa algo: quien cobra el 29 de agosto puede
 * estar cobrando agosto trabajado o septiembre por adelantado, y la app no puede
 * distinguirlo sin preguntar.
 *
 * Se muestran los NOMBRES de los meses y no "este / el que viene", que se lee ambiguo
 * justo donde importa.
 */
export function MesDelCobroField({
  fecha,
  value,
  onChange,
}: {
  fecha: string
  value: string | null
  onChange: (valor: string) => void
}) {
  if (!fecha || !necesitaDeclararMes(fecha)) return null

  const opciones = mesesCandidatos(fecha)

  return (
    <div className="space-y-2">
      <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted">
        ¿A qué mes cuenta?
      </span>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Mes al que cuenta el cobro">
        {opciones.map((o) => (
          <Chip key={o.valor} active={value === o.valor} onClick={() => onChange(o.valor)}>
            {o.label}
          </Chip>
        ))}
      </div>
      <p className="font-sans text-xs text-muted">
        Cobraste sobre el final del mes: elegí para qué mes cuenta esta plata.
      </p>
    </div>
  )
}
