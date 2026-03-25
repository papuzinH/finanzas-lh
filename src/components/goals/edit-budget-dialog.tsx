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
}

export function EditBudgetDialog({ budget, categoryName, categoryEmoji }: Props) {
  const [open, setOpen] = useState(false)
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
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Editar presupuesto" className="h-11 w-11 text-slate-400 hover:text-slate-100 hover:bg-slate-800">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[420px] bg-surface-overlay border-slate-800 text-slate-50">
        <form onSubmit={handleSubmit}>
          <input type="hidden" name="category_id" value={budget.category_id} />
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-100">
              Editar presupuesto de {categoryEmoji} {categoryName}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Modificá el límite mensual de gasto.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="amount" className="text-slate-300">Nuevo límite</Label>
                <Input
                  id="amount"
                  name="amount"
                  type="number"
                  min="1"
                  step="0.01"
                  defaultValue={budget.amount}
                  className="bg-surface-raised border-slate-800 focus:border-indigo-500/50"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Moneda</Label>
                <Select name="currency" value={currency} onValueChange={(v) => setCurrency(v as 'ARS' | 'USD')}>
                  <SelectTrigger className="bg-surface-raised border-slate-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-surface-overlay border-slate-800">
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
              className="w-full sm:w-auto h-11 sm:h-9 text-slate-400 hover:text-slate-100 hover:bg-slate-800"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto h-11 sm:h-9 bg-indigo-600 hover:bg-indigo-700 text-white"
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
