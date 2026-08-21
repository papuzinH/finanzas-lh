'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AccountAnchorFields } from '@/components/pocket/account-anchor-fields'
import { useFinanceStore } from '@/lib/store/financeStore'
import { anchorValueForDeclaredBalance, computeAccountBalance } from '@/lib/finance/pocket'
import { saveAccountAnchors } from '@/app/bolsillo/actions'
import { dateToLocalString } from '@/lib/utils/dates'
import { formatCurrency } from '@/lib/utils'
import type { PaymentMethod } from '@/types/database'

const KEEP_ANCHOR_HELP = 'Si lo dejás vacío no tocamos el saldo que ya declaraste.'

/**
 * Corrige el ancla de una cuenta: el saldo declarado envejece, y una cuenta puede
 * pasar de bolsillo a reserva. Lo que se guarda no es lo declarado sino el saldo al
 * comienzo del día (`anchorValueForDeclaredBalance`), para no restar dos veces lo que
 * el usuario ya registró hoy.
 *
 * Dejar el campo vacío NUNCA borra un ancla existente: si la cuenta ya estaba anclada,
 * se reenvía su `initial_balance`/`initial_balance_at` sin cambios (solo se aplica el
 * bucket nuevo). Vaciar el campo solo deja "sin anclar" a una cuenta que ya lo estaba.
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
  const yaAnclada = method.initial_balance_at !== null

  useEffect(() => {
    if (open) {
      setBucket(method.bucket)
      setBalance('')
    }
  }, [open, method.bucket])

  const saldoActual = useMemo(
    () => computeAccountBalance(method, transactions, internalTransfers),
    [method, transactions, internalTransfers],
  )

  const guardar = async () => {
    setGuardando(true)
    try {
      const hoy = dateToLocalString(new Date())
      const declarado = balance.trim() === '' ? null : Number(balance)

      const anchor =
        declarado !== null
          ? {
              initial_balance: anchorValueForDeclaredBalance(
                declarado, method, transactions, internalTransfers, hoy,
              ),
              initial_balance_at: hoy,
            }
          : yaAnclada
            // Campo vacío en una cuenta ya anclada: no tocar el ancla, solo el bucket.
            ? { initial_balance: method.initial_balance, initial_balance_at: method.initial_balance_at }
            // Campo vacío en una cuenta sin anclar: sigue sin anclar.
            : { initial_balance: 0, initial_balance_at: null }

      const res = await saveAccountAnchors([
        { payment_method_id: method.id, bucket, ...anchor },
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
          <div className="flex justify-between items-baseline">
            <span className="font-sans text-[13px] text-muted">Chanchito dice que tenés</span>
            <span className="font-display tnum text-[15px] text-text">{formatCurrency(saldoActual)}</span>
          </div>
          <AccountAnchorFields
            bucket={bucket}
            balance={balance}
            onBucketChange={setBucket}
            onBalanceChange={setBalance}
            balanceCaption={yaAnclada ? KEEP_ANCHOR_HELP : undefined}
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
