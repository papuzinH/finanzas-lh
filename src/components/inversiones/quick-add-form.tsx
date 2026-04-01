'use client'

import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ASSET_TYPES } from '@/lib/schemas/investment-asset'
import { getAssetTypeLabel } from './asset-type-badge'
import { quickAdd } from '@/app/inversiones/actions'
import { useFinanceStore } from '@/lib/store/financeStore'

const schema = z.object({
  ticker:         z.string().min(1, 'Requerido').max(20),
  name:           z.string().min(1, 'Requerido').max(100),
  asset_type:     z.enum(ASSET_TYPES, { error: 'Tipo requerido' }),
  quantity:       z.number({ error: 'Requerido' }).positive('Debe ser positiva'),
  price_per_unit: z.number({ error: 'Requerido' }).nonnegative('No puede ser negativo'),
  date:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD'),
  currency:       z.enum(['ARS', 'USD']),
  // Avanzado
  fees:           z.number().nonnegative().optional(),
  notes:          z.string().max(500).optional(),
  data_source_url: z.string().url('URL inválida').optional().or(z.literal('')),
  // Plazo fijo / money_market
  tna:            z.number().positive().optional(),
  end_date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  entity:         z.string().max(100).optional(),
})

type FormValues = z.infer<typeof schema>

const today = new Date().toISOString().split('T')[0]

export function QuickAddForm() {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const { fetchAllData } = useFinanceStore()

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { date: today, currency: 'ARS' },
  })

  const assetType = watch('asset_type')
  const isFixedTerm = assetType === 'plazo_fijo' || assetType === 'money_market'

  const onSubmit = async (data: FormValues) => {
    const result = await quickAdd({ ...data, ticker: data.ticker.toUpperCase() })
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Activo y transacción registrados')
      reset({ date: today, currency: 'ARS' })
      await fetchAllData()
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Fila 1: Ticker + Nombre */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-slate-300 text-xs">Ticker *</Label>
          <Input
            {...register('ticker')}
            placeholder="AL30D"
            className="bg-surface-raised border-slate-800 focus:border-indigo-500/50 uppercase text-sm h-9"
          />
          {errors.ticker && <p className="text-[10px] text-rose-400">{errors.ticker.message}</p>}
        </div>
        <div className="sm:col-span-2 space-y-1.5">
          <Label className="text-slate-300 text-xs">Nombre *</Label>
          <Input
            {...register('name')}
            placeholder="Bono AL30 dólar"
            className="bg-surface-raised border-slate-800 focus:border-indigo-500/50 text-sm h-9"
          />
          {errors.name && <p className="text-[10px] text-rose-400">{errors.name.message}</p>}
        </div>
      </div>

      {/* Fila 2: Tipo + Moneda */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-slate-300 text-xs">Tipo *</Label>
          <Controller
            name="asset_type"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="bg-surface-raised border-slate-800 h-9 text-sm">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent className="bg-surface-overlay border-slate-800">
                  {ASSET_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="focus:bg-slate-800 text-xs">
                      {getAssetTypeLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.asset_type && <p className="text-[10px] text-rose-400">{errors.asset_type.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label className="text-slate-300 text-xs">Moneda</Label>
          <Controller
            name="currency"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="bg-surface-raised border-slate-800 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-surface-overlay border-slate-800">
                  <SelectItem value="ARS" className="focus:bg-slate-800 text-xs">ARS</SelectItem>
                  <SelectItem value="USD" className="focus:bg-slate-800 text-xs">USD</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      {/* Fila 3: Cantidad + Precio + Fecha */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-slate-300 text-xs">Cantidad *</Label>
          <Input
            type="number"
            step="any"
            {...register('quantity', { valueAsNumber: true })}
            placeholder="100"
            className="bg-surface-raised border-slate-800 focus:border-indigo-500/50 text-sm h-9"
          />
          {errors.quantity && <p className="text-[10px] text-rose-400">{errors.quantity.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label className="text-slate-300 text-xs">Precio unit. *</Label>
          <Input
            type="number"
            step="any"
            {...register('price_per_unit', { valueAsNumber: true })}
            placeholder="1000"
            className="bg-surface-raised border-slate-800 focus:border-indigo-500/50 text-sm h-9"
          />
          {errors.price_per_unit && <p className="text-[10px] text-rose-400">{errors.price_per_unit.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label className="text-slate-300 text-xs">Fecha *</Label>
          <Input
            type="date"
            {...register('date')}
            className="bg-surface-raised border-slate-800 focus:border-indigo-500/50 text-sm h-9"
          />
          {errors.date && <p className="text-[10px] text-rose-400">{errors.date.message}</p>}
        </div>
      </div>

      {/* Campos especiales: plazo_fijo / money_market */}
      {isFixedTerm && (
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4 space-y-3">
          <p className="text-xs font-medium text-indigo-300">
            {assetType === 'plazo_fijo' ? 'Datos del Plazo Fijo' : 'Datos del Money Market'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">TNA (%)</Label>
              <Input
                type="number"
                step="0.01"
                {...register('tna', { valueAsNumber: true })}
                placeholder="100"
                className="bg-surface-raised border-slate-800 text-sm h-9"
              />
            </div>
            {assetType === 'plazo_fijo' && (
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">Fecha vencimiento</Label>
                <Input
                  type="date"
                  {...register('end_date')}
                  className="bg-surface-raised border-slate-800 text-sm h-9"
                />
              </div>
            )}
            {assetType === 'money_market' && (
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">Entidad</Label>
                <Input
                  {...register('entity')}
                  placeholder="Mercado Pago"
                  className="bg-surface-raised border-slate-800 text-sm h-9"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modo avanzado */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          Opciones avanzadas
        </button>

        {showAdvanced && (
          <div className="mt-3 space-y-3 pt-3 border-t border-slate-800">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">Comisiones</Label>
                <Input
                  type="number"
                  step="any"
                  {...register('fees', { valueAsNumber: true })}
                  placeholder="0"
                  className="bg-surface-raised border-slate-800 text-sm h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">URL fuente datos</Label>
                <Input
                  {...register('data_source_url')}
                  placeholder="https://iol.invertironline.com/..."
                  className="bg-surface-raised border-slate-800 text-sm h-9"
                />
                {errors.data_source_url && <p className="text-[10px] text-rose-400">{errors.data_source_url.message}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">Notas</Label>
              <Input
                {...register('notes')}
                placeholder="Opcional"
                className="bg-surface-raised border-slate-800 text-sm h-9"
              />
            </div>
          </div>
        )}
      </div>

      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-10"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Guardando...
          </>
        ) : (
          'Registrar operación'
        )}
      </Button>
    </form>
  )
}
