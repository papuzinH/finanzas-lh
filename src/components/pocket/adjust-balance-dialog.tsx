'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Chip } from '@/components/ui/chip'
import { useFinanceStore } from '@/lib/store/financeStore'
import { reconcileOptionsFor, reconcileHeadline, type ReconcileOption } from '@/lib/finance/reconcile'
import { reconcileAccount } from '@/app/bolsillo/actions'
import { dateToLocalString } from '@/lib/utils/dates'
import { formatCurrency } from '@/lib/utils'

const OPTION_LABEL: Record<ReconcileOption, string> = {
  transfer: 'Lo mandé a una reserva',
  expense: 'Fue un gasto',
  income: 'Fue un ingreso',
  adjustment: 'Solo ajustar el saldo',
}

/**
 * Red de contención de la conciliación: se usa cuando el usuario dice que ya anotó
 * todo y el saldo sigue sin coincidir. Registra la diferencia clasificada; nunca
 * borra ni edita un movimiento previo.
 */
export function AdjustBalanceDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const { getAvailableToSpend, categories, fetchAllData } = useFinanceStore()
  const { accounts } = getAvailableToSpend()

  const cuentas = accounts
  const [methodId, setMethodId] = useState<string>('')
  const [declarado, setDeclarado] = useState('')
  const [opcion, setOpcion] = useState<ReconcileOption | null>(null)
  const [categoriaId, setCategoriaId] = useState('')
  const [destinoId, setDestinoId] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cuenta = cuentas.find((a) => a.methodId === methodId) ?? null
  // Mientras el usuario escribe (ej. un "-" suelto) Number(declarado) puede ser NaN.
  // Se trata como "todavía no hay diferencia" en lugar de dejar que reconcileOptionsFor
  // reciba NaN y devuelva una lista de opciones espuria.
  const parsedDeclarado = Number(declarado)
  const diferencia =
    cuenta && declarado.trim() !== '' && Number.isFinite(parsedDeclarado)
      ? parsedDeclarado - cuenta.balance
      : 0
  const opciones = useMemo(() => reconcileOptionsFor(diferencia), [diferencia])
  const reservas = cuentas.filter((a) => a.bucket === 'reserve' && a.methodId !== methodId)

  const tipoCategoria = diferencia < 0 ? 'expense' : 'income'
  const categoriasDisponibles = categories.filter((c) => c.type === tipoCategoria)

  // Si el signo de la diferencia cambia (el usuario edita el monto declarado después de
  // elegir una clasificación), la opción elegida puede dejar de estar entre las vigentes.
  // Se limpia junto con lo que dependía de ella. Se exige `opciones.length > 0` para no
  // pisar una selección válida durante un estado transitorio de tipeo (diferencia en 0).
  useEffect(() => {
    if (opcion && opciones.length > 0 && !opciones.includes(opcion)) {
      setOpcion(null)
      setCategoriaId('')
      setDestinoId('')
      setDescripcion('')
    }
  }, [opciones, opcion])

  const puedeGuardar =
    !!cuenta &&
    opciones.length > 0 &&
    !!opcion &&
    opciones.includes(opcion) &&
    (opcion !== 'transfer' || !!destinoId) &&
    (opcion === 'transfer' || opcion === 'adjustment' || (!!categoriaId && descripcion.trim().length > 0))

  const guardar = async () => {
    if (!cuenta || !opcion) return
    setGuardando(true)
    try {
      const classification =
        opcion === 'transfer'
          ? { kind: 'transfer' as const, to_payment_method_id: destinoId }
          : opcion === 'adjustment'
            ? { kind: 'adjustment' as const }
            : { kind: opcion, category_id: categoriaId, description: descripcion.trim() }

      const res = await reconcileAccount({
        payment_method_id: cuenta.methodId,
        difference: diferencia,
        date: dateToLocalString(new Date()),
        classification,
      })
      if (res.error) {
        toast.error(res.error)
        return
      }
      await fetchAllData()
      toast.success('Listo, el saldo quedó al día')
      onOpenChange(false)
      setDeclarado('')
      setOpcion(null)
      setCategoriaId('')
      setDestinoId('')
      setDescripcion('')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-surface border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-text">Poner el saldo al día</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="font-sans text-xs font-medium text-text">¿Qué cuenta?</label>
            <div className="flex flex-wrap gap-2">
              {cuentas.map((a) => (
                <Chip
                  key={a.methodId}
                  active={methodId === a.methodId}
                  onClick={() => {
                    setMethodId(a.methodId)
                    setDeclarado('')
                    setOpcion(null)
                    setCategoriaId('')
                    setDestinoId('')
                    setDescripcion('')
                  }}
                >
                  {a.name}
                </Chip>
              ))}
            </div>
          </div>

          {cuenta && (
            <>
              <div className="flex justify-between items-baseline">
                <span className="font-sans text-[13px] text-muted">Chanchito dice que tenés</span>
                <span className="font-display tnum text-[15px] text-text">{formatCurrency(cuenta.balance)}</span>
              </div>

              <div className="space-y-1.5">
                <label className="font-sans text-xs font-medium text-text">¿Cuánto tenés en realidad?</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={declarado}
                  onChange={(e) => setDeclarado(e.target.value)}
                  placeholder="El saldo de la app del banco"
                  className="bg-surface-2 border-border text-text tnum min-h-11"
                />
              </div>
            </>
          )}

          {cuenta && declarado.trim() !== '' && (
            <div className="rounded-xl border-[1.5px] border-border bg-surface-2 p-3 space-y-3">
              <div className="flex justify-between items-baseline">
                <span className="font-sans text-[13px] text-text">{reconcileHeadline(diferencia)}</span>
                <span className={`font-display tnum text-[15px] ${diferencia < 0 ? 'text-bad' : 'text-good'}`}>
                  {diferencia >= 0 ? '+' : ''}{formatCurrency(diferencia)}
                </span>
              </div>

              {opciones.length > 0 && (
                <div className="space-y-2">
                  <p className="font-sans text-xs text-muted">¿Qué pasó?</p>
                  <div className="flex flex-wrap gap-2">
                    {opciones.map((o) => (
                      <Chip key={o} active={opcion === o} onClick={() => setOpcion(o)}>
                        {OPTION_LABEL[o]}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}

              {opcion === 'transfer' && (
                <div className="space-y-2">
                  <p className="font-sans text-xs text-muted">¿A cuál?</p>
                  <div className="flex flex-wrap gap-2">
                    {reservas.map((r) => (
                      <Chip key={r.methodId} active={destinoId === r.methodId} onClick={() => setDestinoId(r.methodId)}>
                        {r.name}
                      </Chip>
                    ))}
                  </div>
                  {reservas.length === 0 && (
                    <p className="font-sans text-xs text-warn">
                      No tenés ninguna cuenta marcada como reserva. Marcá una en Ajustes → Medios de pago.
                    </p>
                  )}
                </div>
              )}

              {(opcion === 'expense' || opcion === 'income') && (
                <div className="space-y-2">
                  <Input
                    type="text"
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    placeholder="¿Qué fue?"
                    maxLength={120}
                    className="bg-surface border-border text-text min-h-11"
                  />
                  <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
                    {categoriasDisponibles.map((c) => (
                      <Chip key={c.id} active={categoriaId === c.id} onClick={() => setCategoriaId(c.id)}>
                        {c.emoji} {c.name}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <Button variant="accent" className="w-full h-11" onClick={guardar} disabled={!puedeGuardar || guardando}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
