import { cn } from '@/lib/utils'

/**
 * Mini gráfico de barras para una serie corta. Sin librería: son divs con
 * altura porcentual, igual que la barra apilada de Inversiones.
 *
 * `ultimoParcial` marca la última barra como un mes que todavía no cerró.
 */
export function Sparkline({
  valores,
  ultimoParcial = false,
  className,
}: {
  valores: number[]
  ultimoParcial?: boolean
  className?: string
}) {
  const max = Math.max(...valores, 0)

  return (
    <div className={cn('flex items-end gap-[3px] h-6 w-[74px] flex-none', className)} aria-hidden="true">
      {valores.map((v, i) => {
        const esUltimo = i === valores.length - 1
        const parcial = esUltimo && ultimoParcial
        return (
          <div
            key={i}
            data-barra
            data-parcial={parcial ? 'true' : undefined}
            className={cn(
              'flex-1 rounded-t-[2px] min-h-[2px]',
              !esUltimo && 'bg-muted/45',
              parcial && 'opacity-60',
            )}
            style={{
              height: max > 0 ? `${(v / max) * 100}%` : '2px',
              background: esUltimo ? 'var(--bandera)' : undefined,
            }}
          />
        )
      })}
    </div>
  )
}
