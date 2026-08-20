'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AccountAnchorFields } from '@/components/pocket/account-anchor-fields'
import { useFinanceStore } from '@/lib/store/financeStore'
import { anchorValueForDeclaredBalance } from '@/lib/finance/pocket'
import { saveAccountAnchors } from '@/app/bolsillo/actions'
import { dateToLocalString } from '@/lib/utils/dates'
import type { PaymentMethod } from '@/types/database'

/**
 * Corrige el ancla de una cuenta: el saldo declarado envejece, y una cuenta puede
 * pasar de bolsillo a reserva. Lo que se guarda no es lo declarado sino el saldo al
 * comienzo del día (`anchorValueForDeclaredBalance`), para no restar dos veces lo que
 * el usuario ya registró hoy.
 */
export function EditAnchorDialog({
  method,
  open,
  onOpenChange,
}: {
  method: PaymentMethod
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const { transactions, internalTransfers, fetchAllData } = useFinanceStore()
  const [bucket, setBucket] = useState<'pocket' | 'reserve'>(method.bucket)
  const [balance, setBalance] = useState('')
  const [guardando, setGuardando] = useState(false)

  const guardar = async () => {
    setGuardando(true)
    try {
      const hoy = dateToLocalString(new Date())
      const declarado = balance.trim() === '' ? null : Number(balance)
      const res = await saveAccountAnchors([
        {
          payment_method_id: method.id,
          bucket,
          initial_balance:
            declarado === null
              ? 0
              : anchorValueForDeclaredBalance(declarado, method, transactions, internalTransfers, hoy),
          initial_balance_at: declarado === null ? null : hoy,
        },
      ])
      if (res.error) {
        toast.error(res.error)
        return
      }
      await fetchAllData()
      toast.success('Saldo actualizado')
      onOpenChange(false)
      setBalance('')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-surface border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-text">Saldo de {method.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <AccountAnchorFields
            bucket={bucket}
            balance={balance}
            onBucketChange={setBucket}
            onBalanceChange={setBalance}
          />
          <p className="font-sans text-[11px] text-faint">
            Desde acá, Chanchito cuenta los movimientos que registres. Los anteriores ya están
            adentro de este número.
          </p>
          <Button variant="accent" className="w-full h-11" onClick={guardar} disabled={guardando}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
