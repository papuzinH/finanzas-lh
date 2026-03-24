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
import { Loader2, Target } from 'lucide-react'
import { toast } from 'sonner'
import { createSavingsGoal } from '@/app/dashboard/goals/actions'
import { useFinanceStore } from '@/lib/store/financeStore'

export function CreateSavingsGoalDialog() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [type, setType] = useState<'one_time' | 'monthly'>('one_time')
  const [currency, setCurrency] = useState<'ARS' | 'USD'>('ARS')
  const fetchGoalsData = useFinanceStore((s) => s.fetchGoalsData)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const res = await createSavingsGoal(formData)
    setLoading(false)

    if (res?.error) {
      toast.error(res.error)
    } else {
      toast.success('¡Meta de ahorro creada!')
      setOpen(false)
      await fetchGoalsData()
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20">
          <Target className="w-4 h-4 mr-2" />
          Nueva Meta
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[480px] bg-slate-950 border-slate-800 text-slate-50">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              Nueva Meta de Ahorro
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Definí un objetivo de ahorro para seguir tu progreso.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-6">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-slate-300">Nombre de la meta</Label>
              <Input
                id="name"
                name="name"
                placeholder="Ej: Vacaciones en Brasil, Fondo de emergencia..."
                className="bg-slate-900 border-slate-800 focus:border-emerald-500/50"
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Tipo de meta</Label>
              <Select name="type" value={type} onValueChange={(v) => setType(v as 'one_time' | 'monthly')}>
                <SelectTrigger className="bg-slate-900 border-slate-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800">
                  <SelectItem value="one_time">
                    <div>
                      <div className="font-medium">Meta con fecha límite</div>
                      <div className="text-xs text-slate-400">Ahorrás hasta llegar al objetivo</div>
                    </div>
                  </SelectItem>
                  <SelectItem value="monthly">
                    <div>
                      <div className="font-medium">Ahorro mensual recurrente</div>
                      <div className="text-xs text-slate-400">Se resetea cada mes</div>
                    </div>
                  </SelectItem>
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
                  placeholder="500000"
                  className="bg-slate-900 border-slate-800 focus:border-emerald-500/50"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Moneda</Label>
                <Select name="currency" value={currency} onValueChange={(v) => setCurrency(v as 'ARS' | 'USD')}>
                  <SelectTrigger className="bg-slate-900 border-slate-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800">
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
                  className="bg-slate-900 border-slate-800 focus:border-emerald-500/50"
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
              {loading ? 'Guardando...' : 'Crear Meta'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
