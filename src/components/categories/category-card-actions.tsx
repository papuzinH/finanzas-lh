'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
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
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Form, FormControl, FormField, FormItem, FormMessage,
} from '@/components/ui/form'
import { MoreVertical, Pencil, Trash2, Loader2, Sparkles, AlertTriangle, CheckCircle2, Tag } from 'lucide-react'
import { toast } from 'sonner'
import { generateCategoryDescription } from '@/app/actions/ai'
import {
  updateCategory,
  getCategoryDependencies,
  deleteCategoryReassign,
  deleteCategoryUnlink,
  deleteCategory,
} from '@/app/categorias/actions'
import { categorySchema, type CategoryFormValues } from '@/lib/schemas/category'
import { motion, AnimatePresence } from 'framer-motion'
import type { Category } from '@/types/database'
import { cn } from '@/lib/utils'

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
  const [editLoading, setEditLoading] = useState(false)
  const [generatingAi, setGeneratingAi] = useState(false)
  const [depsTotal, setDepsTotal] = useState<number | null>(null)

  const editForm = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: category.name,
      emoji: category.emoji ?? '💰',
      description: category.description ?? '',
      type: category.type,
    },
  })

  const watchedEditName = editForm.watch('name')

  useEffect(() => {
    if (editOpen) {
      editForm.reset({
        name: category.name,
        emoji: category.emoji ?? '💰',
        description: category.description ?? '',
        type: category.type,
      })
      setDepsTotal(null)
      getCategoryDependencies(category.id).then((deps) => setDepsTotal(deps.total))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOpen, category])

  // ── Delete state ─────────────────────────────────────────────
  const [deleteState, setDeleteState] = useState<DeleteState>({ step: 'idle' })
  const [reassignTo, setReassignTo] = useState('')

  const otherCategories = allCategories.filter((c) => c.id !== category.id && c.type === category.type)

  // ── Edit handlers ────────────────────────────────────────────
  const handleGenerateDescription = async () => {
    if (!watchedEditName) {
      toast.error('Escribí un nombre primero.')
      return
    }
    setGeneratingAi(true)
    try {
      const res = await generateCategoryDescription(watchedEditName)
      if (res.success && res.text) {
        editForm.setValue('description', res.text)
      } else {
        toast.error(res.error || 'Error al generar la descripción')
      }
    } finally {
      setGeneratingAi(false)
    }
  }

  const handleEditSubmit = async (data: CategoryFormValues) => {
    setEditLoading(true)
    const res = await updateCategory(category.id, data)
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
            className="h-7 w-7 min-h-11 min-w-11 text-muted hover:text-text hover:bg-surface-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
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
          className="bg-surface-2 border-border text-text"
        >
          <DropdownMenuItem
            className="gap-2 cursor-pointer hover:bg-surface-2 focus:bg-surface-2"
            onSelect={() => setEditOpen(true)}
          >
            <Pencil className="h-4 w-4 text-muted" />
            Editar
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-surface-2" />
          <DropdownMenuItem
            className="gap-2 cursor-pointer text-bad hover:text-bad hover:bg-bad/10 focus:bg-bad/10 focus:text-bad"
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
        <DialogContent
          showCloseButton
          className="max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0 sm:max-w-[500px] bg-surface border-border/50 text-text"
        >
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle className="text-xl font-bold text-accent-deep">
              Editar Categoría
            </DialogTitle>
            <p className="text-sm text-muted mt-1">
              Modificá el nombre, emoji o descripción de la categoría.
            </p>
          </DialogHeader>

          <Form {...editForm}>
            <form id="edit-category-form" onSubmit={editForm.handleSubmit(handleEditSubmit)} className="contents">
              <div className="overflow-y-auto flex-1 px-6 pb-4 space-y-5">

                {/* ── Type Toggle ── */}
                <FormField
                  control={editForm.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <span className="text-[10px] font-medium uppercase tracking-widest text-muted">
                        Tipo
                      </span>
                      <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
                        {(['expense', 'income'] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            disabled={!!depsTotal}
                            onClick={() => field.onChange(t)}
                            className={cn(
                              'min-h-11 rounded-lg py-3 text-sm font-semibold transition-all',
                              'focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none',
                              !!depsTotal && 'opacity-50 cursor-not-allowed',
                              field.value === t
                                ? 'bg-accent text-accent-ink'
                                : 'text-muted hover:text-text'
                            )}
                          >
                            {t === 'expense' ? 'Gasto' : 'Ingreso'}
                          </button>
                        ))}
                      </div>
                      {!!depsTotal && (
                        <p className="text-[11px] text-muted italic mt-1">
                          No se puede cambiar el tipo: esta categoría tiene {depsTotal} movimiento{depsTotal !== 1 ? 's' : ''} asociado{depsTotal !== 1 ? 's' : ''}.
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* ── Emoji + Name ── */}
                <div className="flex items-start gap-3">
                  <FormField
                    control={editForm.control}
                    name="emoji"
                    render={({ field }) => (
                      <FormItem>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              className="w-14 h-14 text-2xl p-0 border-0 bg-surface-2 rounded-xl hover:bg-surface-2 transition-all"
                              aria-label="Seleccionar emoji"
                            >
                              {field.value}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-64 p-2 bg-surface border-border shadow-2xl">
                            <div className="grid grid-cols-5 gap-1">
                              {COMMON_EMOJIS.map((e) => (
                                <button
                                  key={e}
                                  type="button"
                                  onClick={() => field.onChange(e)}
                                  aria-label={`Seleccionar emoji ${e}`}
                                  className="w-10 h-10 min-h-11 min-w-11 flex items-center justify-center text-xl hover:bg-surface-2 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                                >
                                  {e}
                                </button>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={editForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <span className="text-[10px] font-medium uppercase tracking-widest text-muted">
                          Nombre
                        </span>
                        <FormControl>
                          <div className="relative">
                            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
                            <Input
                              placeholder="Ej: Comida Rápida, Gimnasio..."
                              className="pl-10 bg-surface-2 border-0 rounded-xl min-h-11 text-text placeholder:text-faint focus-visible:ring-2 focus-visible:ring-accent"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* ── Description with AI ── */}
                <FormField
                  control={editForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-medium uppercase tracking-widest text-muted">
                          Descripción (para la IA)
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleGenerateDescription}
                          disabled={generatingAi || !watchedEditName}
                          className="text-accent-deep hover:text-accent hover:bg-accent/10 transition-colors"
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
                        <FormControl>
                          <Textarea
                            placeholder="Explica qué gastos entran acá..."
                            className="bg-surface-2 border-0 rounded-xl min-h-[100px] resize-none text-text placeholder:text-faint focus-visible:ring-2 focus-visible:ring-accent"
                            {...field}
                          />
                        </FormControl>
                        <AnimatePresence>
                          {generatingAi && (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="absolute inset-0 bg-surface-2/50 backdrop-blur-[1px] flex items-center justify-center rounded-xl"
                            >
                              <div className="flex items-center gap-2 text-accent-deep font-medium">
                                <Sparkles className="w-4 h-4 animate-pulse" />
                                <span>Chanchito está pensando...</span>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

              </div>

              {/* ── Submit Button ── */}
              <div className="px-6 pb-6 pt-3 shrink-0">
                <Button
                  type="submit"
                  form="edit-category-form"
                  disabled={editLoading}
                  className="w-full min-h-[52px] rounded-xl bg-accent hover:bg-accent-deep text-accent-ink text-base font-semibold transition-all active:scale-[0.98]"
                >
                  {editLoading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-5 w-5" />
                      Guardar Cambios
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Simple delete confirm ── */}
      <AlertDialog
        open={deleteState.step === 'confirm-simple'}
        onOpenChange={(open) => !open && setDeleteState({ step: 'idle' })}
      >
        <AlertDialogContent className="bg-surface border-border text-text">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar &ldquo;{category.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted">
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border bg-transparent text-text hover:bg-surface-2 hover:text-text">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSimple}
              className="bg-bad hover:bg-[color:var(--btn-destructive-border)] text-accent-ink"
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
        <DialogContent className="sm:max-w-[480px] bg-surface border-border text-text">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warn" />
              Categoría con elementos asociados
            </DialogTitle>
            <DialogDescription className="text-muted">
              La categoría <strong className="text-text">&ldquo;{category.name}&rdquo;</strong> tiene{' '}
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
            <div className="rounded-xl border border-border bg-surface-2/50 p-4 space-y-3">
              <p className="text-sm font-medium text-text">Opción 1 — Reasignar a otra categoría</p>
              <p className="text-xs text-muted">Todos los elementos pasarán a la categoría que elijas.</p>
              <Select value={reassignTo} onValueChange={setReassignTo}>
                <SelectTrigger className="bg-surface-2 border-border text-text">
                  <SelectValue placeholder="Elegí una categoría..." />
                </SelectTrigger>
                <SelectContent className="bg-surface border-border text-text">
                  {otherCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="focus:bg-surface-2 focus:text-text">
                      {c.emoji} {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleReassign}
                disabled={!reassignTo || deleteState.step === 'working'}
                className="w-full bg-accent hover:bg-accent-deep text-accent-ink"
              >
                {deleteState.step === 'working' ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Procesando...</>
                ) : (
                  'Reasignar y eliminar categoría'
                )}
              </Button>
            </div>

            {/* Option 2: Unlink */}
            <div className="rounded-xl border border-border bg-surface-2/50 p-4 space-y-3">
              <p className="text-sm font-medium text-text">Opción 2 — Quitar la categoría de los elementos</p>
              <p className="text-xs text-muted">
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
              className="text-muted hover:text-text hover:bg-surface-2"
            >
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
