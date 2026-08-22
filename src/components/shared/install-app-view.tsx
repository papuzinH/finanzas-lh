import { ArrowDownToLine, Share, Smartphone } from 'lucide-react'
import type { VistaInstalacion } from '@/lib/pwa/install'

type Props = {
  vista: VistaInstalacion
  /** El login es el segundo camino bajo el botón de Google; ajustes es una fila más. */
  variante: 'login' | 'ajustes'
  onAccion: () => void
}

/**
 * Presentación pura: no sabe nada del navegador, sólo qué mostrar. Separada del
 * contenedor para poder verificarla sin DOM, que es todo lo que hay acá.
 */
export function InstallAppView({ vista, variante, onAccion }: Props) {
  if (vista === 'oculto') return null

  const enIOS = vista === 'ios'

  if (variante === 'ajustes') {
    return (
      <button
        type="button"
        onClick={onAccion}
        className="group flex items-center gap-4 rounded-2xl border-[1.5px] border-border bg-surface p-5 text-left transition-all hover:bg-surface-2/50 active:scale-[0.99]"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft/30 text-accent-deep">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-sans font-bold text-text">Instalar la app</p>
          <p className="mt-0.5 truncate text-xs text-muted">
            {enIOS ? 'Agregala a tu pantalla de inicio' : 'Tenela a mano, sin la barra del navegador'}
          </p>
        </div>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onAccion}
      className="mt-2 grid w-full max-w-[342px] justify-items-center gap-1 rounded-xl px-3.5 py-2.5 text-center transition-colors duration-[120ms] hover:bg-surface-2/60 active:bg-btn-soft-active"
    >
      <span className="flex items-center gap-2 font-sans text-[13px] font-bold text-text">
        <ArrowDownToLine className="h-[15px] w-[15px]" />
        Tenelo a mano
      </span>
      {/* Corto a propósito: el sello de la marca ocupa la esquina de esta
          pantalla y una línea larga se le mete encima. */}
      <span className="max-w-[240px] text-[11px] text-faint">
        {enIOS ? 'Cómo agregarlo al inicio' : 'Se abre sin la barra del navegador'}
      </span>
    </button>
  )
}

/**
 * El reemplazo del botón en iPhone. Safari no expone `beforeinstallprompt`, así
 * que lo único que queda es nombrar el gesto con precisión.
 */
export function PasosIOS() {
  const pasos = [
    <>
      Tocá <Share className="-mt-0.5 inline h-[15px] w-[15px]" aria-hidden />{' '}
      <strong className="font-bold">Compartir</strong>, en la barra de abajo.
    </>,
    <>
      Bajá en la lista hasta <strong className="font-bold">Agregar a inicio</strong>.
    </>,
    <>
      Confirmá con <strong className="font-bold">Agregar</strong> y el chancho queda entre tus apps.
    </>,
  ]

  return (
    <div className="grid gap-3.5">
      <ol className="grid gap-3">
        {pasos.map((paso, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft/30 text-[12px] font-bold text-accent-deep tnum">
              {i + 1}
            </span>
            <span className="text-[13.5px] leading-[1.45] text-text">{paso}</span>
          </li>
        ))}
      </ol>
      <p className="text-[11.5px] leading-[1.4] text-faint">
        En iPhone esto sólo lo puede hacer Safari. Si estás en Chrome, abrí Chanchito en Safari y
        volvé a intentarlo.
      </p>
    </div>
  )
}
