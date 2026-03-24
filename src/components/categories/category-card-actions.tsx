'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { MoreVertical, Pencil, Trash2, Loader2, Sparkles, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { generateCategoryDescription } from '@/app/actions/ai'
import {
  updateCategory,
  getCategoryDependencies,
  deleteCategoryReassign,
  deleteCategoryUnlink,
  deleteCategory,
} from '@/app/categorias/actions'
import { motion, AnimatePresence } from 'framer-motion'
import type { Category } from '@/types/database'

const COMMON_EMOJIS = [
  '🍔', '🍕', '🍺', '☕', '🏠', '🚗', '🛒', '💊', '🎮', '👕',
  '🎓', '✈️', '🏦', '💰', '📈', '🎁', '🐶', '🐱', '🎬', '🎧',
  '📱', '💻', '🔋', '🔧', '🧹', '🧴', '🧺', '🚿', '🛌', '🛋️',
  '🚲', '🚌', '🚇', '⛽', '🏥', '🏫', '🏢', '🌳', '🌸', '⚽',
]

interface Props {
  category: Category
  allCategories: Category[]
}

type DeleteState =
  | { step: 'idle' }
  | { step: 'checking' }
  | { step: 'confirm-simple' }
  | { step: 'resolve-conflict'; deps: { transactions: number; installmentPlans: number; recurringPlans: number; total: number } }
  | { step: 'working' }

export function CategoryCardActions({ category, allCategories }: Props) {
  // ── Edit state ──────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState(category.name)
  const [editEmoji, setEditEmoji] = useState(category.emoji ?? '💰')
  const [editDescription, setEditDescription] = useState(category.description ?? '')
  const [editLoading, setEditLoading] = useState(false)
  const [generatingAi, setGeneratingAi] = useState(false)

  // ── Delete state ─────────────────────────────────────────────
  const [deleteState, setDeleteState] = useState<DeleteState>({ step: 'idle' })
  const [reassignTo, setReassignTo] = useState('')

  const otherCategories = allCategories.filter((c) => c.id !== category.id)

  // ── Edit handlers ────────────────────────────────────────────
  const handleGenerateDescription = async () => {
    if (!editName) {
      toast.error('Escribí un nombre primero.')
      return
    }
    setGeneratingAi(true)
    try {
      const res = await generateCategoryDescription(editName)
      if (res.success && res.text) {
        setEditDescription(res.text)
      } else {
        toast.error(res.error || 'Error al generar la descripción')
      }
    } finally {
      setGeneratingAi(false)
    }
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setEditLoading(true)

    const formData = new FormData()
    formData.append('name', editName)
    formData.append('emoji', editEmoji)
    formData.append('description', editDescription)

    const res = await updateCategory(category.id, formData)
    setEditLoading(false)

    if (res?.error) {
      toast.error(res.error)
    } else {
      toast.success('Categoría actualizada')
      setEditOpen(false)
    }
  }

  // ── Delete handlers ──────────────────────────────────────────
  const handleDeleteClick = async () => {
    setDeleteState({ step: 'checking' })
    const deps = await getCategoryDependencies(category.id)

    if (deps.total === 0) {
      setDeleteState({ step: 'confirm-simple' })
    } else {
      setDeleteState({ step: 'resolve-conflict', deps })
    }
  }

  const handleDeleteSimple = async () => {
    setDeleteState({ step: 'working' })
    const res = await deleteCategory(category.id)
    setDeleteState({ step: 'idle' })
    if (res?.error) {
      toast.error(res.error)
    } else {
      toast.success('Categoría eliminada')
    }
  }

  const handleReassign = async () => {
    if (!reassignTo) {
      toast.error('Seleccioná una categoría de destino')
      return
    }
    setDeleteState({ step: 'working' })
    const res = await deleteCategoryReassign(category.id, reassignTo)
    setDeleteState({ step: 'idle' })
    if (res?.error) {
      toast.error(res.error)
    } else {
      toast.success('Transacciones reasignadas y categoría eliminada')
    }
  }

  const handleUnlink = async () => {
    setDeleteState({ step: 'working' })
    const res = await deleteCategoryUnlink(category.id)
    setDeleteState({ step: 'idle' })
    if (res?.error) {
      toast.error(res.error)
    } else {
      toast.success('Categoría eliminada. Las transacciones quedaron sin categoría.')
    }
  }

  const deps = deleteState.step === 'resolve-conflict' ? deleteState.deps : null
  const isWorking = deleteState.step === 'checking' || deleteState.step === 'working'

  return (
    <>
      {/* ── Trigger button ── */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Opciones de categoría"
            className="h-7 w-7 min-h-11 min-w-11 text-slate-400 hover:text-slate-200 hover:bg-slate-800 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            onClick={(e) => e.preventDefault()}
          >
            {isWorking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MoreVertical className="h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="bg-surface-raised border-slate-800 text-slate-200"
        >
          <DropdownMenuItem
            className="gap-2 cursor-pointer hover:bg-slate-800 focus:bg-slate-800"
            onSelect={() => setEditOpen(true)}
          >
            <Pencil className="h-4 w-4 text-slate-400" />
            Editar
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-slate-800" />
          <DropdownMenuItem
            className="gap-2 cursor-pointer text-red-400 hover:text-red-300 hover:bg-red-500/10 focus:bg-red-500/10 focus:text-red-300"
            onSelect={handleDeleteClick}
            disabled={isWorking}
          >
            <Trash2 className="h-4 w-4" />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* ── Edit dialog ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[500px] bg-surface-overlay border-slate-800 text-slate-50">
          <form onSubmit={handleEditSubmit}>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
                Editar Categoría
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                Modificá el nombre, emoji o descripción de la categoría.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-6 py-6">
              <div className="flex items-center gap-4">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-16 h-16 text-3xl p-0 border-slate-800 bg-surface-raised hover:bg-slate-800 hover:border-indigo-500/50 transition-all"
                    >
                      {editEmoji}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-2 bg-surface-overlay border-slate-800 shadow-2xl">
                    <div className="grid grid-cols-5 gap-1">
                      {COMMON_EMOJIS.map((e) => (
                        <button
                          key={e}
                          type="button"
                          onClick={() => setEditEmoji(e)}
                          aria-label={`Seleccionar emoji ${e}`}
                          className="w-10 h-10 min-h-11 min-w-11 flex items-center justify-center text-xl hover:bg-slate-800 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>

                <div className="flex-1 space-y-2">
                  <Label htmlFor="edit-name" className="text-slate-300">Nombre</Label>
                  <Input
                    id="edit-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="bg-surface-raised border-slate-800 focus:border-indigo-500/50 focus:ring-indigo-500/20"
                    required
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label htmlFor="edit-desc" className="text-slate-300">Descripción (para la IA)</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleGenerateDescription}
                    disabled={generatingAi || !editName}
                    className="text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
                  >
                    {generatingAi ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Sparkles className="w-4 h-4 mr-2" />
                    )}
                    Generar con IA
                  </Button>
                </div>

                <div className="relative">
                  <Textarea
                    id="edit-desc"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Explica qué gastos entran acá..."
                    className="bg-surface-raised border-slate-800 focus:border-indigo-500/50 focus:ring-indigo-500/20 min-h-[100px] resize-none"
                  />
                  <AnimatePresence>
                    {generatingAi && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-surface-raised/50 backdrop-blur-[1px] flex items-center justify-center rounded-md"
                      >
                        <div className="flex items-center gap-2 text-indigo-400 font-medium">
                          <Sparkles className="w-4 h-4 animate-pulse" />
                          <span>Chanchito está pensando...</span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditOpen(false)}
                className="w-full sm:w-auto h-11 sm:h-9 text-slate-400 hover:text-slate-100 hover:bg-slate-800"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={editLoading}
                className="w-full sm:w-auto h-11 sm:h-9 bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {editLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Guardando...
                  </>
                ) : (
                  'Guardar cambios'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Simple delete confirm ── */}
      <AlertDialog
        open={deleteState.step === 'confirm-simple'}
        onOpenChange={(open) => !open && setDeleteState({ step: 'idle' })}
      >
        <AlertDialogContent className="bg-surface-overlay border-slate-800 text-slate-50">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar "{category.name}"?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-slate-100">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSimple}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Conflict resolution dialog ── */}
      <Dialog
        open={deleteState.step === 'resolve-conflict' || deleteState.step === 'working'}
        onOpenChange={(open) => !open && deleteState.step !== 'working' && setDeleteState({ step: 'idle' })}
      >
        <DialogContent className="sm:max-w-[480px] bg-surface-overlay border-slate-800 text-slate-50">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              Categoría con elementos asociados
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              La categoría <strong className="text-slate-200">"{category.name}"</strong> tiene{' '}
              {deps && (
                <span>
                  {deps.transactions > 0 && `${deps.transactions} transacción${deps.transactions !== 1 ? 'es' : ''}`}
                  {deps.installmentPlans > 0 && `${deps.transactions > 0 ? ', ' : ''}${deps.installmentPlans} plan${deps.installmentPlans !== 1 ? 'es' : ''} de cuotas`}
                  {deps.recurringPlans > 0 && `${(deps.transactions > 0 || deps.installmentPlans > 0) ? ' y ' : ''}${deps.recurringPlans} gasto${deps.recurringPlans !== 1 ? 's' : ''} fijo${deps.recurringPlans !== 1 ? 's' : ''}`}
                </span>
              )}{' '}asociados. Debés resolverlos antes de eliminarla.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Option 1: Reassign */}
            <div className="rounded-xl border border-slate-800 bg-surface-raised/50 p-4 space-y-3">
              <p className="text-sm font-medium text-slate-200">Opción 1 — Reasignar a otra categoría</p>
              <p className="text-xs text-slate-400">Todos los elementos pasarán a la categoría que elijas.</p>
              <Select value={reassignTo} onValueChange={setReassignTo}>
                <SelectTrigger className="bg-surface-raised border-slate-700 text-slate-200">
                  <SelectValue placeholder="Elegí una categoría..." />
                </SelectTrigger>
                <SelectContent className="bg-surface-overlay border-slate-800 text-slate-200">
                  {otherCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="focus:bg-slate-800 focus:text-slate-100">
                      {c.emoji} {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleReassign}
                disabled={!reassignTo || deleteState.step === 'working'}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {deleteState.step === 'working' ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Procesando...</>
                ) : (
                  'Reasignar y eliminar categoría'
                )}
              </Button>
            </div>

            {/* Option 2: Unlink */}
            <div className="rounded-xl border border-slate-800 bg-surface-raised/50 p-4 space-y-3">
              <p className="text-sm font-medium text-slate-200">Opción 2 — Quitar la categoría de los elementos</p>
              <p className="text-xs text-slate-400">
                Los elementos quedarán sin categoría asignada. Podrás reclasificarlos luego.
              </p>
              <Button
                variant="destructive"
                onClick={handleUnlink}
                disabled={deleteState.step === 'working'}
                className="w-full"
              >
                {deleteState.step === 'working' ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Procesando...</>
                ) : (
                  'Quitar categoría y eliminar'
                )}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeleteState({ step: 'idle' })}
              disabled={deleteState.step === 'working'}
              className="text-slate-400 hover:text-slate-100 hover:bg-slate-800"
            >
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
