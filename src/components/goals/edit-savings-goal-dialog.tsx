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
import { updateSavingsGoal } from '@/app/dashboard/goals/actions'
import { useFinanceStore } from '@/lib/store/financeStore'
import type { SavingsGoal } from '@/types/database'

interface Props {
  goal: SavingsGoal
}

export function EditSavingsGoalDialog({ goal }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [type, setType] = useState<'one_time' | 'monthly'>(goal.type)
  const [currency, setCurrency] = useState<'ARS' | 'USD'>(goal.currency)
  const fetchGoalsData = useFinanceStore((s) => s.fetchGoalsData)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const res = await updateSavingsGoal(goal.id, formData)
    setLoading(false)

    if (res?.error) {
      toast.error(res.error)
    } else {
      toast.success('¡Meta actualizada!')
      setOpen(false)
      await fetchGoalsData()
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Editar meta" className="h-11 w-11 text-slate-400 hover:text-slate-100 hover:bg-slate-800">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[480px] bg-surface-overlay border-slate-800 text-slate-50">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              Editar Meta
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Modificá los datos de tu meta de ahorro.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-6">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-slate-300">Nombre de la meta</Label>
              <Input
                id="name"
                name="name"
                defaultValue={goal.name}
                className="bg-surface-raised border-slate-800 focus:border-emerald-500/50"
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Tipo de meta</Label>
              <Select name="type" value={type} onValueChange={(v) => setType(v as 'one_time' | 'monthly')}>
                <SelectTrigger className="bg-surface-raised border-slate-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-surface-overlay border-slate-800">
                  <SelectItem value="one_time">Meta con fecha límite</SelectItem>
                  <SelectItem value="monthly">Ahorro mensual recurrente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="target_amount" className="text-slate-300">Monto objetivo</Label>
                <Input
                  id="target_amount"
                  name="target_amount"
                  type="number"
                  min="1"
                  step="0.01"
                  defaultValue={goal.target_amount}
                  className="bg-surface-raised border-slate-800 focus:border-emerald-500/50"
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

            {type === 'one_time' && (
              <div className="space-y-2">
                <Label htmlFor="target_date" className="text-slate-300">Fecha objetivo</Label>
                <Input
                  id="target_date"
                  name="target_date"
                  type="date"
                  defaultValue={goal.target_date ?? ''}
                  className="bg-surface-raised border-slate-800 focus:border-emerald-500/50"
                  required={type === 'one_time'}
                />
              </div>
            )}
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
              className="w-full sm:w-auto h-11 sm:h-9 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {loading ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
