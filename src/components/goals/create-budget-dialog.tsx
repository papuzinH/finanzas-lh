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
import { Loader2, Plus, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { createCategoryBudget } from '@/app/dashboard/goals/actions'
import { useFinanceStore } from '@/lib/store/financeStore'
import type { Category } from '@/types/database'

interface Props {
  categories: Category[]
}

export function CreateBudgetDialog({ categories }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [currency, setCurrency] = useState<'ARS' | 'USD'>('ARS')
  const [categoryId, setCategoryId] = useState<string>('')
  const fetchGoalsData = useFinanceStore((s) => s.fetchGoalsData)
  const { categoryBudgets } = useFinanceStore()

  // Filter out categories that already have an active budget
  const existingBudgetCategoryIds = new Set(
    categoryBudgets.filter((b) => b.is_active).map((b) => b.category_id)
  )
  const availableCategories = categories.filter((c) => !existingBudgetCategoryIds.has(c.id))

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const res = await createCategoryBudget(formData)
    setLoading(false)

    if (res?.error) {
      toast.error(res.error)
    } else {
      toast.success('¡Presupuesto creado!')
      setOpen(false)
      setCategoryId('')
      await fetchGoalsData()
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" className="h-9 w-9 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20">
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[440px] bg-surface-overlay border-slate-800 text-slate-50">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
              Nuevo Presupuesto
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Establecé un límite mensual de gasto por categoría.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-6">
            <div className="space-y-2">
              <Label className="text-slate-300">Categoría</Label>
              {availableCategories.length === 0 ? (
                <p className="text-sm text-slate-500 italic">Todas las categorías ya tienen presupuesto asignado.</p>
              ) : (
                <Select name="category_id" value={categoryId} onValueChange={setCategoryId} required>
                  <SelectTrigger className="bg-surface-raised border-slate-800">
                    <SelectValue placeholder="Elegí una categoría..." />
                  </SelectTrigger>
                  <SelectContent className="bg-surface-overlay border-slate-800 max-h-60">
                    {availableCategories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.emoji} {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="amount" className="text-slate-300">Límite mensual</Label>
                <Input
                  id="amount"
                  name="amount"
                  type="number"
                  min="1"
                  step="0.01"
                  placeholder="80000"
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
              disabled={loading || availableCategories.length === 0}
              className="w-full sm:w-auto h-11 sm:h-9 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {loading ? 'Guardando...' : 'Crear Presupuesto'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
