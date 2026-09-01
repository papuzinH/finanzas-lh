'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Chancho } from '@/components/brand/chancho'
import { useFinanceStore } from '@/lib/store/financeStore'
import { novedadParaMostrar } from '@/lib/novedades/decidir'
import { VERSIONES, type Version } from '@/lib/novedades/versiones'
import { marcarNovedadVista } from '@/app/actions/novedades'

/**
 * El contenido, separado de la parte que habla con el store: así el markup se
 * prueba con `renderToStaticMarkup`, que es como se verifica la UI en este repo.
 */
export function ContenidoNovedades({
  version,
  onCerrar,
}: {
  version: Version
  onCerrar: () => void
}) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border-[1.5px] border-border bg-surface-2">
        <Chancho className="h-9 w-9" slot="var(--surface-2)" />
      </div>

      {/* El título accesible lo pone `DialogTitle` en el modal; este es el visual. */}
      <h2
        aria-hidden="true"
        className="font-display text-[22px] leading-[var(--leading-display)] text-text"
      >
        {version.titulo}
      </h2>

      <ul className="mt-4 space-y-2 text-left">
        {version.items.map((item) => (
          <li key={item} className="flex gap-2 text-sm text-muted">
            <span aria-hidden="true" className="text-accent">
              •
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>

      {/* Una sola salida: es un changelog, no una decisión. */}
      <Button variant="accent" className="mt-6 w-full" onClick={onCerrar}>
        Listo
      </Button>
    </div>
  )
}

/**
 * Popup de novedades: se muestra una vez por versión y por usuario.
 *
 * Va montado en `AppShell` al lado del tour, y eso no es casual — el shell
 * devuelve `children` pelado en las rutas públicas, `/login`, `/auth`,
 * `/onboarding`, `/puesta-a-punto` y la landing anónima, así que desde ahí
 * hereda gratis no aparecer en ninguna de esas pantallas.
 *
 * Spec: docs/superpowers/specs/2026-09-01-popup-novedades-design.md
 */
export function NovedadesModal() {
  const { user, transactions } = useFinanceStore()
  const [cerrado, setCerrado] = useState(false)

  const novedad = user ? novedadParaMostrar(VERSIONES, user.last_seen_version, user.created_at ?? '') : null

  // Sin un solo movimiento cargado, el usuario está aprendiendo a usar la app y
  // encima tiene el tour encendido (que sólo existe con `transactions.length === 0`):
  // dos overlays sobre el mismo home compiten. No le contamos novedades todavía.
  const reciénLlegado = transactions.length === 0

  if (!novedad || cerrado || reciénLlegado) return null

  const cerrar = () => {
    // Optimista a propósito: la escritura puede fallar y el único costo es que
    // el popup vuelva la próxima vez. No hay por qué hacerlo esperar.
    setCerrado(true)
    void marcarNovedadVista(novedad.version)
  }

  return (
    <Dialog open onOpenChange={cerrar}>
      <DialogContent className="max-w-sm">
        <DialogTitle className="sr-only">{novedad.titulo}</DialogTitle>
        <ContenidoNovedades version={novedad} onCerrar={cerrar} />
      </DialogContent>
    </Dialog>
  )
}
