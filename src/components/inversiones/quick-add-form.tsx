'use client'

import { useEffect, useRef, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ChevronDown, ChevronUp, Info, Loader2 } from 'lucide-react'
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
import { AssetTypePicker } from './asset-type-picker'
import { quickAdd } from '@/app/inversiones/actions'
import { useFinanceStore } from '@/lib/store/financeStore'

const schema = z
  .object({
    ticker: z.string().min(1, 'Requerido').max(20),
    name: z.string().min(1, 'Requerido').max(100),
    asset_type: z.enum(ASSET_TYPES, { error: 'Tipo requerido' }),
    quantity: z.number({ error: 'Requerido' }).positive('Debe ser positiva'),
    price_per_unit: z.number({ error: 'Requerido' }).nonnegative('No puede ser negativo'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD'),
    currency: z.enum(['ARS', 'USD']),
    fees: z.number().nonnegative().optional(),
    notes: z.string().max(500).optional(),
    data_source_url: z.string().url('URL inválida').optional().or(z.literal('')),
    tna: z.number().positive().optional(),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
    entity: z.string().max(100).optional(),
  })
  .superRefine((values, ctx) => {
    const isFixed = values.asset_type === 'plazo_fijo' || values.asset_type === 'money_market'

    if (!isFixed && values.price_per_unit <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['price_per_unit'],
        message: 'Debe ser mayor a 0',
      })
    }

    if (!isFixed) return

    if (!values.tna || values.tna <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tna'],
        message: 'TNA requerida para instrumentos de tasa',
      })
    }

    if (values.asset_type === 'plazo_fijo' && !values.end_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['end_date'],
        message: 'Fecha de vencimiento requerida',
      })
    }

    if (values.asset_type === 'money_market' && !values.entity?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['entity'],
        message: 'Entidad requerida para money market',
      })
    }
  })

type FormValues = z.infer<typeof schema>

const today = new Date().toISOString().split('T')[0]

const TICKER_PLACEHOLDERS: Record<string, string> = {
  stock: 'GGAL',
  cedear: 'AAPL',
  bond: 'AL30D',
  on: 'YMCHO',
  bopreal: 'BPY26',
  lecap: 'S31E5',
  boncap: 'T15D5',
  etf: 'VOO',
  crypto: 'BTC',
  stablecoin: 'USDT',
  fci: 'FCI-RENTA',
  plazo_fijo: 'PF-BCO-NACION',
  money_market: 'MM-MERCADO-PAGO',
}

const NAME_PLACEHOLDERS: Record<string, string> = {
  stock: 'Grupo Galicia',
  cedear: 'Apple Inc.',
  bond: 'Bonar 2030',
  on: 'YPF ON Clase X',
  bopreal: 'BOPREAL 2026',
  lecap: 'Lecap enero 2025',
  boncap: 'Boncap diciembre 2025',
  etf: 'Vanguard S&P 500',
  crypto: 'Bitcoin',
  stablecoin: 'Tether',
  fci: 'FCI Renta Fija',
  plazo_fijo: 'Plazo fijo tradicional',
  money_market: 'Mercado Pago',
}

const SUGGESTED_CURRENCY: Record<string, 'ARS' | 'USD'> = {
  stock: 'ARS',
  cedear: 'ARS',
  bond: 'ARS',
  on: 'ARS',
  bopreal: 'ARS',
  lecap: 'ARS',
  boncap: 'ARS',
  fci: 'ARS',
  plazo_fijo: 'ARS',
  money_market: 'ARS',
  etf: 'USD',
  crypto: 'USD',
  stablecoin: 'USD',
}

const TYPES_NEEDING_URL = new Set(['bond', 'on', 'bopreal', 'lecap', 'boncap', 'fci'])

const fmtCurrency = (n: number, currency: string) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: currency === 'USD' ? 'USD' : 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)

export function QuickAddForm() {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const { fetchAllData } = useFinanceStore()
  const currencyTouched = useRef(false)

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { date: today, currency: 'ARS' },
  })

  const assetType = watch('asset_type')
  const quantity = watch('quantity')
  const pricePerUnit = watch('price_per_unit')
  const currency = watch('currency')
  const isFixedTerm = assetType === 'plazo_fijo' || assetType === 'money_market'
  const needsUrl = !!assetType && TYPES_NEEDING_URL.has(assetType)

  // Inferencia automática de moneda cuando cambia el tipo (si el usuario no la tocó)
  useEffect(() => {
    if (currencyTouched.current) return
    if (!assetType) return
    const suggested = SUGGESTED_CURRENCY[assetType]
    if (suggested) setValue('currency', suggested)
  }, [assetType, setValue])

  const totalInvestido =
    typeof quantity === 'number' && typeof pricePerUnit === 'number' && quantity > 0 && pricePerUnit > 0
      ? quantity * pricePerUnit
      : null

  const onSubmit = async (data: FormValues) => {
    const fixed = data.asset_type === 'plazo_fijo' || data.asset_type === 'money_market'
    const payload = {
      ...data,
      ticker: data.ticker.toUpperCase(),
      price_per_unit: fixed ? 1 : data.price_per_unit,
      currency: fixed ? 'ARS' as const : data.currency,
    }

    toast.loading('Registrando operación…', { id: 'quickadd' })
    const result = await quickAdd(payload)

    if (result.error) {
      toast.error(result.error, { id: 'quickadd' })
      return
    }

    if (fixed) {
      toast.success('Plazo registrado', { id: 'quickadd' })
    } else if (result.priceFetched && result.currentPrice !== undefined) {
      toast.success(
        `Registrado · Precio actual: ${fmtCurrency(result.currentPrice, 'ARS')}`,
        { id: 'quickadd' },
      )
    } else {
      toast.success('Registrado · sin precio automático (probá actualizar)', { id: 'quickadd' })
    }

    reset({ date: today, currency: 'ARS' })
    currencyTouched.current = false
    await fetchAllData()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Callout informativo */}
      <div className="flex items-start gap-2 rounded-lg bg-accent/5 border-[1.5px] border-accent/20 px-3 py-2.5">
        <Info className="h-4 w-4 text-accent shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted leading-relaxed">
          Cargá la compra (cantidad y precio que pagaste). Chanchito busca el precio actual
          automáticamente y calcula tu rendimiento.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-muted text-xs">Tipo de inversión *</Label>
        <Controller
          name="asset_type"
          control={control}
          render={({ field }) => (
            <AssetTypePicker value={field.value} onChange={field.onChange} />
          )}
        />
        {errors.asset_type && <p className="text-[10px] text-bad">{errors.asset_type.message}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-muted text-xs">
            {isFixedTerm ? 'Identificador único *' : 'Ticker *'}
          </Label>
          <Input
            {...register('ticker')}
            placeholder={(assetType && TICKER_PLACEHOLDERS[assetType]) || 'GGAL'}
            className="bg-surface-2 border-border focus:border-accent/50 uppercase text-sm h-9"
          />
          {errors.ticker && <p className="text-[10px] text-bad">{errors.ticker.message}</p>}
        </div>
        <div className="sm:col-span-2 space-y-1.5">
          <Label className="text-muted text-xs">Nombre descriptivo *</Label>
          <Input
            {...register('name')}
            placeholder={(assetType && NAME_PLACEHOLDERS[assetType]) || 'Grupo Galicia'}
            className="bg-surface-2 border-border focus:border-accent/50 text-sm h-9"
          />
          {errors.name && <p className="text-[10px] text-bad">{errors.name.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-muted text-xs">Fecha de compra *</Label>
          <Input
            type="date"
            {...register('date')}
            className="bg-surface-2 border-border focus:border-accent/50 text-sm h-9"
          />
          {errors.date && <p className="text-[10px] text-bad">{errors.date.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label className="text-muted text-xs">Moneda de la operación</Label>
          <Controller
            name="currency"
            control={control}
            render={({ field }) => (
              <Select
                value={isFixedTerm ? 'ARS' : field.value}
                onValueChange={(v) => {
                  if (isFixedTerm) return
                  currencyTouched.current = true
                  field.onChange(v as 'ARS' | 'USD')
                }}
                disabled={isFixedTerm}
              >
                <SelectTrigger className="bg-surface-2 border-border h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-surface border-border">
                  <SelectItem value="ARS" className="focus:bg-surface-2 text-xs">ARS</SelectItem>
                  <SelectItem value="USD" className="focus:bg-surface-2 text-xs">USD</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      {!isFixedTerm && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-muted text-xs">Cantidad de nominales *</Label>
              <Input
                type="number"
                step="any"
                {...register('quantity', { valueAsNumber: true })}
                placeholder="100"
                className="bg-surface-2 border-border focus:border-accent/50 text-sm h-9"
              />
              {errors.quantity && <p className="text-[10px] text-bad">{errors.quantity.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted text-xs">Precio al que compraste cada unidad *</Label>
              <Input
                type="number"
                step="any"
                {...register('price_per_unit', { valueAsNumber: true })}
                placeholder="1000"
                className="bg-surface-2 border-border focus:border-accent/50 text-sm h-9"
              />
              {errors.price_per_unit && <p className="text-[10px] text-bad">{errors.price_per_unit.message}</p>}
            </div>
          </div>

          {totalInvestido !== null && (
            <div className="rounded-lg bg-surface-2 border-[1.5px] border-border px-3 py-2 flex items-center justify-between">
              <span className="text-[11px] text-muted">Total invertido</span>
              <span className="text-sm tnum font-bold text-text">
                {fmtCurrency(totalInvestido, currency)}
              </span>
            </div>
          )}

          {needsUrl && (
            <div className="space-y-1.5">
              <Label className="text-muted text-xs">URL fuente de precio (opcional)</Label>
              <Input
                {...register('data_source_url')}
                placeholder="https://iol.invertironline.com/titulo/cotizacion/BCBA/AL30/1"
                className="bg-surface-2 border-border focus:border-accent/50 text-sm h-9"
              />
              <p className="text-[10px] text-muted">
                Si Chanchito no encuentra el precio automáticamente, pegá el link de IOL del activo.
              </p>
              {errors.data_source_url && <p className="text-[10px] text-bad">{errors.data_source_url.message}</p>}
            </div>
          )}
        </>
      )}

      {isFixedTerm && (
        <div className="rounded-xl border-[1.5px] border-accent/20 bg-accent/5 p-4 space-y-4">
          <p className="text-xs font-bold text-accent">
            {assetType === 'plazo_fijo' ? 'Datos de Plazo Fijo' : 'Datos de Money Market'}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-muted text-xs">Capital inicial invertido (ARS) *</Label>
              <Input
                type="number"
                step="any"
                {...register('quantity', { valueAsNumber: true })}
                placeholder="Monto depositado"
                className="bg-surface-2 border-border text-sm h-9"
              />
              {errors.quantity && <p className="text-[10px] text-bad">{errors.quantity.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted text-xs">TNA anual (%) *</Label>
              <Input
                type="number"
                step="0.01"
                {...register('tna', { valueAsNumber: true })}
                placeholder="35"
                className="bg-surface-2 border-border text-sm h-9"
              />
              {errors.tna && <p className="text-[10px] text-bad">{errors.tna.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-muted text-xs">Banco / Entidad financiera</Label>
              <Input
                {...register('entity')}
                placeholder="Banco Galicia o Mercado Pago"
                className="bg-surface-2 border-border text-sm h-9"
              />
              {errors.entity && <p className="text-[10px] text-bad">{errors.entity.message}</p>}
            </div>

            {assetType === 'plazo_fijo' && (
              <div className="space-y-1.5">
                <Label className="text-muted text-xs">Fecha de vencimiento *</Label>
                <Input
                  type="date"
                  {...register('end_date')}
                  className="bg-surface-2 border-border text-sm h-9"
                />
                {errors.end_date && <p className="text-[10px] text-bad">{errors.end_date.message}</p>}
              </div>
            )}
          </div>

          {/* price_per_unit se fuerza a 1 para instrumentos de tasa */}
          <input type="hidden" value={1} {...register('price_per_unit', { valueAsNumber: true })} />
        </div>
      )}

      {/* Modo avanzado */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-muted hover:text-text transition-colors"
        >
          {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          Opciones avanzadas
        </button>

        {showAdvanced && (
          <div className="mt-3 space-y-3 pt-3 border-t-[1.5px] border-border">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-muted text-xs">Comisiones</Label>
                <Input
                  type="number"
                  step="any"
                  {...register('fees', { valueAsNumber: true })}
                  placeholder="0"
                  className="bg-surface-2 border-border text-sm h-9"
                />
              </div>
              {!needsUrl && (
                <div className="space-y-1.5">
                  <Label className="text-muted text-xs">URL fuente datos</Label>
                  <Input
                    {...register('data_source_url')}
                    placeholder="https://iol.invertironline.com/..."
                    className="bg-surface-2 border-border text-sm h-9"
                  />
                  {errors.data_source_url && <p className="text-[10px] text-bad">{errors.data_source_url.message}</p>}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted text-xs">Notas</Label>
              <Input
                {...register('notes')}
                placeholder="Opcional"
                className="bg-surface-2 border-border text-sm h-9"
              />
            </div>
          </div>
        )}
      </div>

      <Button
        type="submit"
        disabled={isSubmitting}
        variant="accent"
        className="w-full h-10"
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
