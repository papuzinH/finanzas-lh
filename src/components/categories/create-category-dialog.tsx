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
        className="max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0 sm:max-w-[500px] bg-surface border-border text-text"
      >
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle className="font-poster text-text text-[18px]">
            Nueva Categoría
          </DialogTitle>
          <p className="text-sm text-muted mt-1">
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
                            className="w-14 h-14 text-2xl p-0 bg-surface-2 border-[1.5px] border-border rounded-xl hover:bg-surface transition-all"
                            aria-label="Seleccionar emoji"
                          >
                            {field.value}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-2 bg-surface border-border shadow-float">
                          <div className="grid grid-cols-5 gap-1">
                            {COMMON_EMOJIS.map((e) => (
                              <button
                                key={e}
                                type="button"
                                onClick={() => field.onChange(e)}
                                aria-label={`Seleccionar emoji ${e}`}
                                className="w-10 h-10 min-h-11 min-w-11 flex items-center justify-center text-xl hover:bg-surface-2 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
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
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted">
                        Nombre
                      </span>
                      <FormControl>
                        <div className="relative">
                          <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
                          <Input
                            placeholder="Ej: Comida Rápida, Gimnasio..."
                            className="pl-10 min-h-11"
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
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted">
                        Descripción (para la IA)
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleGenerateDescription}
                        disabled={generatingAi || !watchedName}
                        className="text-accent hover:text-accent-deep hover:bg-accent/10 transition-colors"
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
                          className="min-h-[100px] resize-none"
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
                            <div className="flex items-center gap-2 text-accent font-medium">
                              <Sparkles className="w-4 h-4 animate-pulse" />
                              <span>Chanchito está pensando...</span>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <p className="text-[11px] text-muted italic">
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
                variant="accent" size="lg" className="w-full"
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