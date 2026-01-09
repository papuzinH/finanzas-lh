'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Loader2, Sparkles, Smile } from 'lucide-react'
import { toast } from 'sonner'
import { generateCategoryDescription } from '@/app/actions/ai'
import { createCategory } from '@/app/dashboard/categories/actions'
import { motion, AnimatePresence } from 'framer-motion'

const COMMON_EMOJIS = [
  '🍔', '🍕', '🍺', '☕', '🏠', '🚗', '🛒', '💊', '🎮', '👕', 
  '🎓', '✈️', '🏦', '💰', '📈', '🎁', '🐶', '🐱', '🎬', '🎧', 
  '📱', '💻', '🔋', '🔧', '🧹', '🧴', '🧺', '🚿', '🛌', '🛋️',
  '🚲', '🚌', '🚇', '⛽', '🏥', '🏫', '🏢', '🌳', '🌸', '⚽'
]

export function CreateCategoryDialog() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [generatingAi, setGeneratingAi] = useState(false)
  
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('💰')
  const [description, setDescription] = useState('')

  const handleGenerateDescription = async () => {
    if (!name) {
      toast.error('Escribí un nombre primero para que la IA sepa qué hacer.')
      return
    }
    setGeneratingAi(true)
    try {
      const res = await generateCategoryDescription(name)
      if (res.success && res.text) {
        setDescription(res.text)
        toast.success('¡Descripción generada! Podés editarla si querés.')
      } else {
        toast.error(res.error || 'Error al generar la descripción')
      }
    } catch (error) {
      toast.error('Ocurrió un error inesperado')
    } finally {
      setGeneratingAi(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData()
    formData.append('name', name)
    formData.append('emoji', emoji)
    formData.append('description', description)

    const res = await createCategory(formData)
    setLoading(false)

    if (res?.error) {
      toast.error(res.error)
    } else {
      toast.success('Categoría creada con éxito')
      setOpen(false)
      setName('')
      setEmoji('💰')
      setDescription('')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20">
          + Nueva Categoría
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-slate-950 border-slate-800 text-slate-50">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
              Crear Categoría
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Agrega una categoría nueva. La descripción es vital para que el sistema reconozca tus gastos automáticamente.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-6 py-6">
            <div className="flex items-center gap-4">
              <Popover>
                <PopoverTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="w-16 h-16 text-3xl p-0 border-slate-800 bg-slate-900 hover:bg-slate-800 hover:border-indigo-500/50 transition-all"
                  >
                    {emoji}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2 bg-slate-900 border-slate-800 shadow-2xl">
                  <div className="grid grid-cols-5 gap-1">
                    {COMMON_EMOJIS.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => setEmoji(e)}
                        className="w-10 h-10 flex items-center justify-center text-xl hover:bg-slate-800 rounded-md transition-colors"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              
              <div className="flex-1 space-y-2">
                <Label htmlFor="name" className="text-slate-300">Nombre de la categoría</Label>
                <Input 
                  id="name" 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  placeholder="Ej: Comida Rápida, Gimnasio..." 
                  className="bg-slate-900 border-slate-800 focus:border-indigo-500/50 focus:ring-indigo-500/20"
                  required
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label htmlFor="desc" className="text-slate-300">Descripción (para la IA)</Label>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleGenerateDescription}
                  disabled={generatingAi || !name}
                  className="text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
                >
                  {generatingAi ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2"/>
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2"/>
                  )}
                  Generar con IA
                </Button>
              </div>
              
              <div className="relative">
                <Textarea 
                  id="desc" 
                  value={description} 
                  onChange={e => setDescription(e.target.value)} 
                  placeholder="Explica qué gastos entran acá..." 
                  className="bg-slate-900 border-slate-800 focus:border-indigo-500/50 focus:ring-indigo-500/20 min-h-[100px] resize-none"
                  required
                />
                <AnimatePresence>
                  {generatingAi && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center rounded-md"
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
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              type="button" 
              variant="ghost" 
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-slate-100 hover:bg-slate-800"
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[120px]"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2"/>
                  Guardando...
                </>
              ) : (
                'Crear Categoría'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}