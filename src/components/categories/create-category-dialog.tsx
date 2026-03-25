'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Form, FormControl, FormField, FormItem, FormMessage,
} from '@/components/ui/form'
import { Loader2, Sparkles, CheckCircle2, Tag } from 'lucide-react'
import { AnimatedPlusButton } from '@/components/shared/animated-plus-button';
import { toast } from 'sonner'
import { generateCategoryDescription } from '@/app/actions/ai'
import { createCategory } from '@/app/dashboard/categories/actions'
import { categorySchema, type CategoryFormValues } from '@/lib/schemas/category'
import { motion, AnimatePresence } from 'framer-motion'

const COMMON_EMOJIS = [
  '🍔', '🍕', '🍺', '☕', '🏠', '🚗', '🛒', '💊', '🎮', '👕',
  '🎓', '✈️', '🏦', '💰', '📈', '🎁', '🐶', '🐱', '🎬', '🎧',
  '📱', '💻', '🔋', '🔧', '🧹', '🧴', '🧺', '🚿', '🛌', '🛋️',
  '🚲', '🚌', '🚇', '⛽', '🏥', '🏫', '🏢', '🌳', '🌸', '⚽',
]

export function CreateCategoryDialog() {
  const [open, setOpen] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [generatingAi, setGeneratingAi] = useState(false)

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: '',
      emoji: '💰',
      description: '',
    },
  })

  const watchedName = form.watch('name')

  const handleGenerateDescription = async () => {
    if (!watchedName) {
      toast.error('Escribí un nombre primero.')
      return
    }
    setGeneratingAi(true)
    try {
      const res = await generateCategoryDescription(watchedName)
      if (res.success && res.text) {
        form.setValue('description', res.text)
        toast.success('¡Descripción generada!')
      } else {
        toast.error(res.error || 'Error al generar la descripción')
      }
    } finally {
      setGeneratingAi(false)
    }
  }

  async function onSubmit(data: CategoryFormValues) {
    setIsPending(true)
    try {
      const res = await createCategory(data)
      if (res?.error) {
        toast.error(res.error)
      } else {
        toast.success('Categoría creada con éxito')
        setOpen(false)
        form.reset()
      }
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <AnimatedPlusButton
          label="Crear categoría"
          onClick={() => {}}
          ariaLabel="Nueva categoría"
        />
      </DialogTrigger>
      <DialogContent
        showCloseButton
        className="max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0 sm:max-w-[500px] bg-surface border-slate-800/50 text-slate-50"
      >
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle className="text-xl font-bold text-indigo-300">
            Nueva Categoría
          </DialogTitle>
          <p className="text-sm text-slate-400 mt-1">
            La descripción es clave para que Chanchito clasifique automáticamente.
          </p>
        </DialogHeader>

        <Form {...form}>
          <form id="category-form" onSubmit={form.handleSubmit(onSubmit)} className="contents">
            <div className="overflow-y-auto flex-1 px-6 pb-4 space-y-5">

              {/* ── Emoji + Name ── */}
              <div className="flex items-start gap-3">
                <FormField
                  control={form.control}
                  name="emoji"
                  render={({ field }) => (
                    <FormItem>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            className="w-14 h-14 text-2xl p-0 border-0 bg-surface-raised rounded-xl hover:bg-slate-800 transition-all"
                            aria-label="Seleccionar emoji"
                          >
                            {field.value}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-2 bg-surface-overlay border-slate-800 shadow-2xl">
                          <div className="grid grid-cols-5 gap-1">
                            {COMMON_EMOJIS.map((e) => (
                              <button
                                key={e}
                                type="button"
                                onClick={() => field.onChange(e)}
                                aria-label={`Seleccionar emoji ${e}`}
                                className="w-10 h-10 min-h-11 min-w-11 flex items-center justify-center text-xl hover:bg-slate-800 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
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
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
                        Nombre
                      </span>
                      <FormControl>
                        <div className="relative">
                          <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                          <Input
                            placeholder="Ej: Comida Rápida, Gimnasio..."
                            className="pl-10 bg-surface-raised border-0 rounded-xl min-h-11 text-slate-50 placeholder:text-slate-600 focus-visible:ring-2 focus-visible:ring-indigo-500"
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
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
                        Descripción (para la IA)
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleGenerateDescription}
                        disabled={generatingAi || !watchedName}
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
                      <FormControl>
                        <Textarea
                          placeholder="Explica qué gastos entran acá..."
                          className="bg-surface-raised border-0 rounded-xl min-h-[100px] resize-none text-slate-50 placeholder:text-slate-600 focus-visible:ring-2 focus-visible:ring-indigo-500"
                          {...field}
                        />
                      </FormControl>
                      <AnimatePresence>
                        {generatingAi && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-surface-raised/50 backdrop-blur-[1px] flex items-center justify-center rounded-xl"
                          >
                            <div className="flex items-center gap-2 text-indigo-400 font-medium">
                              <Sparkles className="w-4 h-4 animate-pulse" />
                              <span>Chanchito está pensando...</span>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <p className="text-[11px] text-slate-500 italic">
                      * Cuanto mejor sea la descripción, mejor clasificará Chanchito tus gastos automáticamente.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

            </div>

            {/* ── Submit Button ── */}
            <div className="px-6 pb-6 pt-3 shrink-0">
              <Button
                type="submit"
                form="category-form"
                disabled={isPending}
                className="w-full min-h-[52px] rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-base font-semibold shadow-[0_0_24px_rgba(129,140,248,0.25)] transition-all active:scale-[0.98]"
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Creando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-5 w-5" />
                    Crear Categoría
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}