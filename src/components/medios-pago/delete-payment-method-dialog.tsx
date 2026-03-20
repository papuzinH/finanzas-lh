'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Loader2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { deletePaymentMethod, reassignAndDeletePaymentMethod } from '@/app/medios-pago/actions'
import { useFinanceStore } from '@/lib/store/financeStore'
import { useRouter } from 'next/navigation'
import { PaymentMethod } from '@/types/database'

interface DeletePaymentMethodDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  paymentMethod: PaymentMethod
}

export function DeletePaymentMethodDialog({
  open,
  onOpenChange,
  paymentMethod,
}: DeletePaymentMethodDialogProps) {
  const [isPending, setIsPending] = useState(false)
  const [reassignTo, setReassignTo] = useState<string>('none')
  const { fetchAllData, transactions, recurringPlans, installmentPlans, paymentMethods } = useFinanceStore()
  const router = useRouter()

  const transactionCount = transactions.filter(t => t.payment_method_id === paymentMethod.id).length
  const recurringCount = recurringPlans.filter(p => p.payment_method_id === paymentMethod.id).length
  const installmentCount = installmentPlans.filter(p => p.payment_method_id === paymentMethod.id).length
  const totalDependencies = transactionCount + recurringCount + installmentCount
  const hasDependencies = totalDependencies > 0

  const otherMethods = paymentMethods.filter(pm => pm.id !== paymentMethod.id)

  async function handleDelete() {
    setIsPending(true)
    try {
      let result

      if (hasDependencies) {
        if (reassignTo === 'none') {
          toast.error('Seleccioná a qué medio de pago reasignar los datos')
          return
        }
        result = await reassignAndDeletePaymentMethod(paymentMethod.id, Number(reassignTo))
      } else {
        result = await deletePaymentMethod(paymentMethod.id)
      }

      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Medio de pago eliminado')
        onOpenChange(false)
        await fetchAllData()
        router.refresh()
      }
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0 sm:max-w-[500px] bg-slate-950 border-slate-800 text-slate-50">
        <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0">
          <DialogTitle className="text-xl font-bold text-rose-400">
            Eliminar medio de pago
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Estás por eliminar <span className="text-slate-200 font-medium">{paymentMethod.name}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 px-6 space-y-4">
          {hasDependencies ? (
            <>
              <div className="flex gap-3 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3">
                <TriangleAlert className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1 text-sm">
                  <p className="text-amber-300 font-medium">Este medio de pago tiene datos asociados</p>
                  <ul className="text-slate-400 space-y-0.5 text-[13px]">
                    {transactionCount > 0 && (
                      <li>{transactionCount} transacción{transactionCount !== 1 ? 'es' : ''}</li>
                    )}
                    {recurringCount > 0 && (
                      <li>{recurringCount} gasto{recurringCount !== 1 ? 's' : ''} fijo{recurringCount !== 1 ? 's' : ''}</li>
                    )}
                    {installmentCount > 0 && (
                      <li>{installmentCount} plan{installmentCount !== 1 ? 'es' : ''} de cuotas</li>
                    )}
                  </ul>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-slate-300">
                  Reasignar todos los datos a otro medio de pago:
                </p>
                <Select value={reassignTo} onValueChange={setReassignTo}>
                  <SelectTrigger className="bg-slate-900 border-slate-800">
                    <SelectValue placeholder="Seleccionar medio de pago" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800">
                    <SelectItem value="none" className="focus:bg-slate-800 text-slate-500">
                      Seleccioná un medio de pago...
                    </SelectItem>
                    {otherMethods.map(pm => (
                      <SelectItem key={pm.id} value={pm.id.toString()} className="focus:bg-slate-800">
                        {pm.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {otherMethods.length === 0 && (
                  <p className="text-[12px] text-rose-400">
                    No tenés otros medios de pago. Creá uno antes de eliminar este.
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-400">
              Esta acción es permanente y no se puede deshacer. El medio de pago no tiene datos asociados, por lo que puede eliminarse de forma segura.
            </p>
          )}
        </div>

        <div className="px-4 sm:px-6 py-4 border-t border-slate-800 flex-shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto h-11 sm:h-9 text-slate-400 hover:text-slate-100 hover:bg-slate-800"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleDelete}
            disabled={isPending || (hasDependencies && (reassignTo === 'none' || otherMethods.length === 0))}
            className="w-full sm:w-auto h-11 sm:h-9 bg-rose-600 hover:bg-rose-700 text-white"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Eliminando...
              </>
            ) : hasDependencies ? (
              'Reasignar y Eliminar'
            ) : (
              'Eliminar'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
