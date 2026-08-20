'use client'

import { Chip } from '@/components/ui/chip'
import { RHYTHMS, rhythmHelp } from '@/lib/utils/pocket-copy'
import type { IncomeRhythm } from '@/lib/finance/pocket'

/**
 * Se declara el RITMO, no la fecha: los usuarios cobran el 1°, los últimos días
 * hábiles o el último martes, y algunos normalizan la fecha al cargar. Lo que el
 * cálculo necesita saber es si hay otro cobro antes de que venza el compromiso.
 */
export function RhythmPicker({
  value,
  onChange,
}: {
  value: IncomeRhythm
  onChange: (r: IncomeRhythm) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {RHYTHMS.map((r) => (
          <Chip key={r.value} active={value === r.value} onClick={() => onChange(r.value)}>
            {r.label}
          </Chip>
        ))}
      </div>
      <p className="font-sans text-xs text-muted">{rhythmHelp(value)}</p>
    </div>
  )
}
