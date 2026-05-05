'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ArrowRight, Loader2, Plus, Sparkles, X, Check, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  DEFAULT_ONBOARDING_CATEGORIES,
  saveOnboardingCategories,
  suggestCategoriesFromDescription,
} from '../actions'

const COMMON_EMOJIS = [
  '🛒', '🍔', '🍻', '🚗', '🏠', '💊', '🎬', '🔁',
  '☕', '🛍️', '🎓', '✈️', '💰', '🎁', '👕', '⚽',
  '📱', '💻', '🐶', '🐱', '🎧', '🎮', '⛽', '🌳',
]

type Category = {
  emoji: string
  name: string
  description: string
  /** Si es false, el usuario destildó esta categoría y no se va a guardar */
  selected: boolean
}

interface CategoriesSlideProps {
  onNext: (count: number) => void
}

export function CategoriesSlide({ onNext }: CategoriesSlideProps) {
  const [categories, setCategories] = useState<Category[]>(
    DEFAULT_ONBOARDING_CATEGORIES.map((c) => ({ ...c, selected: true }))
  )
  const [isPending, setIsPending] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)

  const selectedCount = categories.filter((c) => c.selected).length

  const toggleCategory = (idx: number) => {
    setCategories((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, selected: !c.selected } : c))
    )
  }

  const updateCategory = (idx: number, patch: Partial<Category>) => {
    setCategories((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)))
  }

  const addCategory = (cat: Omit<Category, 'selected'>) => {
    setCategories((prev) => [...prev, { ...cat, selected: true }])
  }

  const removeCategory = (idx: number) => {
    setCategories((prev) => prev.filter((_, i) => i !== idx))
  }

  const replaceWithAI = (aiCats: Array<{ emoji: string; name: string; description: string }>) => {
    setCategories(aiCats.map((c) => ({ ...c, selected: true })))
    toast.success(`${aiCats.length} categorías sugeridas. Editalas como prefieras.`)
  }

  const handleContinue = async () => {
    const toSave = categories.filter((c) => c.selected)
    if (toSave.length === 0) {
      toast.error('Necesitás al menos una categoría para registrar gastos')
      return
    }

    setIsPending(true)
    try {
      const res = await saveOnboardingCategories(
        toSave.map((c) => ({ emoji: c.emoji, name: c.name, description: c.description }))
      )
      if (res.error) {
        toast.error(res.error)
        return
      }
      onNext(toSave.length)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-5"
    >
      <div className="text-center space-y-2">
        <div className="text-5xl mb-3">📂</div>
        <h2 className="text-2xl font-bold text-white">Tus categorías</h2>
        <p className="text-sm text-slate-400">
          Las usamos para clasificar tus gastos. Tocá para activar/desactivar.
        </p>
      </div>

      {/* Acciones secundarias */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">
          {selectedCount} {selectedCount === 1 ? 'seleccionada' : 'seleccionadas'}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setAiOpen(true)}
            disabled={isPending}
            className="text-xs h-8 px-3 text-violet-400 hover:text-violet-300 hover:bg-violet-500/10"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            Personalizar con IA
          </Button>
        </div>
      </div>

      {/* Grid de chips */}
      <div className="grid grid-cols-2 gap-2 max-h-[280px] overflow-y-auto pr-1">
        <AnimatePresence>
          {categories.map((cat, idx) => (
            <motion.button
              key={`${cat.name}-${idx}`}
              type="button"
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={() => toggleCategory(idx)}
              disabled={isPending}
              className={cn(
                'group relative flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-all',
                cat.selected
                  ? 'border-indigo-500/50 bg-indigo-500/10 text-slate-100'
                  : 'border-slate-800 bg-surface-raised/30 text-slate-500 opacity-60'
              )}
            >
              <span className="text-lg shrink-0">{cat.emoji}</span>
              <span className="text-sm font-medium truncate flex-1">{cat.name}</span>
              {cat.selected && (
                <Check className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
              )}
              {/* Edit mini-button (esquina sup. derecha) */}
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation()
                  setEditing(idx)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    setEditing(idx)
                  }
                }}
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded hover:bg-slate-700/50 transition-opacity cursor-pointer"
                aria-label={`Editar ${cat.name}`}
              >
                <Pencil className="h-3 w-3 text-slate-400" />
              </span>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>

      {/* Agregar nueva */}
      <AddCategoryForm onAdd={addCategory} disabled={isPending} />

      {/* Continuar */}
      <Button
        type="button"
        size="lg"
        onClick={handleContinue}
        disabled={isPending || selectedCount === 0}
        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white h-12 text-base font-medium shadow-lg shadow-indigo-600/25"
      >
        {isPending ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>
            Continuar con {selectedCount}
            <ArrowRight className="ml-2 h-5 w-5" />
          </>
        )}
      </Button>

      {/* Modal: editar categoría */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md bg-surface-raised border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Editar categoría</DialogTitle>
          </DialogHeader>
          {editing !== null && categories[editing] && (
            <EditCategoryForm
              category={categories[editing]}
              onSave={(patch) => {
                updateCategory(editing, patch)
                setEditing(null)
              }}
              onDelete={() => {
                removeCategory(editing)
                setEditing(null)
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: IA */}
      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="sm:max-w-md bg-surface-raised border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-slate-100 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-400" />
              Sugerir con IA
            </DialogTitle>
          </DialogHeader>
          <AIDescriptionForm
            onSuggested={(cats) => {
              replaceWithAI(cats)
              setAiOpen(false)
            }}
          />
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}

// =============================================================================
// Add Category form (inline)
// =============================================================================

function AddCategoryForm({
  onAdd,
  disabled,
}: {
  onAdd: (cat: { emoji: string; name: string; description: string }) => void
  disabled?: boolean
}) {
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('💰')
  const [emojiOpen, setEmojiOpen] = useState(false)

  const handleAdd = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onAdd({ emoji, name: trimmed, description: '' })
    setName('')
    setEmoji('💰')
  }

  return (
    <div className="flex gap-2">
      <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className="h-11 w-11 shrink-0 p-0 text-xl bg-surface-raised border-slate-700 hover:bg-slate-800"
          >
            {emoji}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2 bg-surface-raised border-slate-800">
          <div className="grid grid-cols-8 gap-1">
            {COMMON_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  setEmoji(e)
                  setEmojiOpen(false)
                }}
                className="text-xl p-1.5 rounded hover:bg-slate-800 transition-colors"
              >
                {e}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <Input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            handleAdd()
          }
        }}
        placeholder="Agregar categoría..."
        maxLength={50}
        disabled={disabled}
        className="flex-1 h-11 bg-surface-raised border-slate-700 text-sm text-slate-100"
      />
      <Button
        type="button"
        onClick={handleAdd}
        disabled={disabled || !name.trim()}
        className="h-11 w-11 shrink-0 p-0 bg-slate-700 hover:bg-slate-600"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  )
}

// =============================================================================
// Edit Category form (modal)
// =============================================================================

function EditCategoryForm({
  category,
  onSave,
  onDelete,
}: {
  category: Category
  onSave: (patch: Partial<Category>) => void
  onDelete: () => void
}) {
  const [name, setName] = useState(category.name)
  const [emoji, setEmoji] = useState(category.emoji)
  const [description, setDescription] = useState(category.description)
  const [emojiOpen, setEmojiOpen] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-11 shrink-0 p-0 text-xl bg-surface-raised border-slate-700 hover:bg-slate-800"
            >
              {emoji}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2 bg-surface-raised border-slate-800">
            <div className="grid grid-cols-8 gap-1">
              {COMMON_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    setEmoji(e)
                    setEmojiOpen(false)
                  }}
                  className="text-xl p-1.5 rounded hover:bg-slate-800 transition-colors"
                >
                  {e}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <Input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={50}
          className="flex-1 h-11 bg-surface-raised border-slate-700 text-slate-100"
        />
      </div>

      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Descripción (opcional). Ayuda a la IA a clasificar gastos."
        maxLength={300}
        rows={3}
        className="bg-surface-raised border-slate-700 text-sm text-slate-100"
      />

      <div className="flex justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onDelete}
          className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
        >
          <X className="h-4 w-4 mr-1" />
          Eliminar
        </Button>
        <Button
          type="button"
          onClick={() => onSave({ name: name.trim(), emoji, description: description.trim() })}
          disabled={!name.trim()}
          className="bg-indigo-600 hover:bg-indigo-500 text-white"
        >
          Guardar cambios
        </Button>
      </div>
    </div>
  )
}

// =============================================================================
// AI description form (modal)
// =============================================================================

function AIDescriptionForm({
  onSuggested,
}: {
  onSuggested: (cats: Array<{ emoji: string; name: string; description: string }>) => void
}) {
  const [text, setText] = useState('')
  const [isPending, setIsPending] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim() || isPending) return

    setIsPending(true)
    try {
      const res = await suggestCategoriesFromDescription(text.trim())
      if (res.error || !res.data) {
        toast.error(res.error || 'No pude generar sugerencias')
        return
      }
      onSuggested(res.data.categories)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm text-slate-400">
        Contame en qué solés gastar y te sugiero categorías personalizadas. Vas a poder editarlas después.
      </p>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='Ej: "Comida en super y delivery, nafta para el auto, salidas con amigos, gimnasio, Netflix y Spotify, tarjeta SUBE."'
        rows={5}
        autoFocus
        disabled={isPending}
        className="bg-surface-raised border-slate-700 text-sm text-slate-100"
      />
      <Button
        type="submit"
        disabled={isPending || text.trim().length < 3}
        className="w-full bg-violet-600 hover:bg-violet-500 text-white"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <Sparkles className="h-4 w-4 mr-2" />
            Sugerir categorías
          </>
        )}
      </Button>
      <p className="text-xs text-slate-500 text-center">
        Las sugerencias van a reemplazar las actuales. Vas a poder editarlas.
      </p>
    </form>
  )
}
