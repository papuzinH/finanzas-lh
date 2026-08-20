'use client'

import { useId } from 'react'
import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BUCKET_HELP } from '@/lib/utils/pocket-copy'

/**
 * Los dos datos que anclan una cuenta: cuánto tiene hoy y si es plata para gastar.
 * `balance` viaja como string para poder distinguir "" (salteado, queda sin anclar)
 * de "0" (declaró que no tiene nada).
 */
export function AccountAnchorFields({
  bucket,
  balance,
  onBucketChange,
  onBalanceChange,
  showBucketHelp = true,
}: {
  bucket: 'pocket' | 'reserve'
  balance: string
  onBucketChange: (b: 'pocket' | 'reserve') => void
  onBalanceChange: (v: string) => void
  showBucketHelp?: boolean
}) {
  const uid = useId()
  const balanceId = `${uid}-balance`
  const bucketLabelId = `${uid}-bucket`

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={balanceId} className="font-sans text-xs font-medium text-text">
          ¿Cuánto tenés hoy?
        </Label>
        <Input
          id={balanceId}
          type="number"
          inputMode="decimal"
          value={balance}
          onChange={(e) => onBalanceChange(e.target.value)}
          placeholder="Lo que ves en la app del banco"
          className="bg-surface border-border text-text tnum"
        />
        <p className="font-sans text-[11px] text-faint">
          Si lo dejás vacío, la cuenta queda sin saldo declarado y te lo preguntamos más adelante.
        </p>
      </div>

      <div className="space-y-2">
        <span id={bucketLabelId} className="font-sans text-xs font-medium text-text block">
          ¿Esta plata es para gastar?
        </span>
        <div className="flex gap-2" role="group" aria-labelledby={bucketLabelId}>
          <Chip active={bucket === 'pocket'} onClick={() => onBucketChange('pocket')}>
            Bolsillo
          </Chip>
          <Chip active={bucket === 'reserve'} onClick={() => onBucketChange('reserve')}>
            Reserva
          </Chip>
        </div>
        {showBucketHelp && <p className="font-sans text-[11px] text-faint">{BUCKET_HELP}</p>}
      </div>
    </div>
  )
}
