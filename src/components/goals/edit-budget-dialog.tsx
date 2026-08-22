'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Loader2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { updateCategoryBudget } from '@/app/dashboard/goals/actions'
import { useFinanceStore } from '@/lib/store/financeStore'
import type { CategoryBudget } from '@/types/database'

interface Props {
  budget: CategoryBudget
  categoryName: string
  categoryEmoji: string | null
  /** Abierto desde afuera (menú de la card). Sin esto, el diálogo trae su botón. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * Se puede usar de dos maneras: suelto, y trae su propio botón; o controlado
 * desde afuera con `open`/`onOpenChange`, que es como lo abren las cards de
 * /objetivos desde su menú de acciones (ahí la card no tiene botones propios).
 */
export function EditBudgetDialog({ budget, categoryName, categoryEmoji, open: controlledOpen, onOpenChange }: Props) {
  const [selfOpen, setSelfOpen] = useState(false)
  // Controlado si viene `open` por props; si no, el diálogo se maneja solo.
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : selfOpen
  const setOpen = (value: boolean) => {
    if (isControlled) onOpenChange?.(value)
    else setSelfOpen(value)
  }
  const [loading, setLoading] = useState(false)
  const [currency, setCurrency] = useState<'ARS' | 'USD'>(budget.currency)
  const fetchGoalsData = useFinanceStore((s) => s.fetchGoalsData)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const data = {
      category_id: budget.category_id,
      amount: Number(formData.get('amount')),
      currency: formData.get('currency') as string,
    }
    
    const res = await updateCategoryBudget(budget.id, data)
    setLoading(false)

    if (res?.error) {
      toast.error(res.error)
    } else {
      toast.success('¡Presupuesto actualizado!')
      setOpen(false)
      await fetchGoalsData()
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
{!isControlled && (
        <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Editar presupuesto" className="h-11 w-11 text-muted hover:text-text hover:bg-surface-2">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[420px] bg-surface border-border text-text">
        <form onSubmit={handleSubmit}>
          <input type="hidden" name="category_id" value={budget.category_id} />
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-text">
              Editar presupuesto de {categoryEmoji} {categoryName}
            </DialogTitle>
            <DialogDescription className="text-muted">
              Modificá el límite mensual de gasto.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="amount" className="text-text">Nuevo límite</Label>
                <Input
                  id="amount"
                  name="amount"
                  type="number"
                  min="1"
                  step="0.01"
                  defaultValue={budget.amount}
                  className="bg-surface-2 border-border focus:border-accent"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-text">Moneda</Label>
                <Select name="currency" value={currency} onValueChange={(v) => setCurrency(v as 'ARS' | 'USD')}>
                  <SelectTrigger className="bg-surface-2 border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-surface border-border">
                    <SelectItem value="ARS">🇦🇷 ARS</SelectItem>
                    <SelectItem value="USD">🇺🇸 USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              className="w-full sm:w-auto h-11 sm:h-9 text-muted hover:text-text hover:bg-surface-2"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto h-11 sm:h-9 bg-accent hover:bg-accent-deep text-accent-ink"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {loading ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
