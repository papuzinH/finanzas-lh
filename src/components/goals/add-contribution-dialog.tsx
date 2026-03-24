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
import { Archive, Loader2, PartyPopper, PiggyBank, Trophy } from 'lucide-react'
import { toast } from 'sonner'
import { addGoalContribution, completeGoal } from '@/app/dashboard/goals/actions'
import { useFinanceStore } from '@/lib/store/financeStore'
import type { SavingsGoal } from '@/types/database'

interface Props {
  goal: SavingsGoal
}

type Phase = 'form' | 'celebration'

export function AddContributionDialog({ goal }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [phase, setPhase] = useState<Phase>('form')
  const [currency, setCurrency] = useState<'ARS' | 'USD'>(goal.currency)
  const { fetchGoalsData, getSavingsGoalProgress } = useFinanceStore()

  const today = new Date().toISOString().split('T')[0]

  const handleOpenChange = (value: boolean) => {
    if (!value) setPhase('form')
    setOpen(value)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)

    const wasCompleted = getSavingsGoalProgress(goal.id)?.status === 'completed'

    const formData = new FormData(e.currentTarget)
    formData.set('goal_id', goal.id)
    const res = await addGoalContribution(formData)
    setLoading(false)

    if (res?.error) {
      toast.error(res.error)
      return
    }

    await fetchGoalsData()

    const isNowCompleted = getSavingsGoalProgress(goal.id)?.status === 'completed'

    if (!wasCompleted && isNowCompleted) {
      setPhase('celebration')
    } else {
      toast.success('¡Aporte registrado!')
      setOpen(false)
    }
  }

  const handleArchive = async () => {
    setArchiving(true)
    const res = await completeGoal(goal.id)
    setArchiving(false)
    if (res?.error) {
      toast.error(res.error)
      return
    }
    await fetchGoalsData()
    toast.success('Meta archivada')
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="min-h-[44px] border-emerald-700 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
        >
          <PiggyBank className="w-4 h-4 mr-1.5" />
          Aportar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[420px] bg-slate-950 border-slate-800 text-slate-50">
        {phase === 'celebration' ? (
          <div className="py-2 space-y-6 text-center">
            <div className="flex justify-center">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <Trophy className="w-10 h-10 text-emerald-400" />
                </div>
                <PartyPopper className="w-6 h-6 text-amber-400 absolute -top-1 -right-1" />
              </div>
            </div>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-emerald-400">
                ¡Meta completada!
              </DialogTitle>
              <DialogDescription className="text-slate-300">
                Lograste tu meta{' '}
                <span className="font-semibold text-slate-100">
                  &ldquo;{goal.name}&rdquo;
                </span>
                . ¡Felicitaciones!
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Button
                onClick={handleArchive}
                disabled={archiving}
                className="w-full min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {archiving
                  ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Archivando...</>
                  : <><Archive className="w-4 h-4 mr-2" />Archivar meta</>}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setOpen(false)}
                className="w-full min-h-[44px] text-slate-400 hover:text-slate-100 hover:bg-slate-800"
              >
                Dejar activa
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <input type="hidden" name="goal_id" value={goal.id} />
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-slate-100">
                Aportar a &ldquo;{goal.name}&rdquo;
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                Registrá cuánto pusiste en esta meta hoy.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="amount" className="text-slate-300">Monto</Label>
                  <Input
                    id="amount"
                    name="amount"
                    type="number"
                    min="1"
                    step="0.01"
                    placeholder="10000"
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

              <div className="space-y-2">
                <Label htmlFor="date" className="text-slate-300">Fecha</Label>
                <Input
                  id="date"
                  name="date"
                  type="date"
                  defaultValue={today}
                  className="bg-slate-900 border-slate-800 focus:border-emerald-500/50"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="note" className="text-slate-300">Nota (opcional)</Label>
                <Input
                  id="note"
                  name="note"
                  placeholder="Ej: Parte del sueldo de marzo"
                  className="bg-slate-900 border-slate-800 focus:border-emerald-500/50"
                />
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
                className="w-full sm:w-auto h-11 sm:h-9 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Guardando...</>
                  : 'Registrar Aporte'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
