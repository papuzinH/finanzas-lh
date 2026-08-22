'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { decidirVista, esIOS, type VistaInstalacion } from '@/lib/pwa/install'
import { crearRegistroDePrompt } from '@/lib/pwa/prompt-diferido'

// Al cargar el módulo, no al montar el componente: el evento de Chrome puede
// llegar antes de que React hidrate. Ver `lib/pwa/prompt-diferido.ts`.
const registro = typeof window === 'undefined' ? null : crearRegistroDePrompt(window)

function corriendoInstalada(): boolean {
  const porDisplayMode = window.matchMedia?.('(display-mode: standalone)').matches ?? false
  // Safari en iOS no implementa `display-mode`: expone una bandera propia.
  const porSafari = (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  return porDisplayMode || porSafari
}

const suscribir = (avisar: () => void) => registro?.suscribir(avisar) ?? (() => {})

// Devuelve un string, no un objeto: `useSyncExternalStore` compara por identidad
// y un objeto nuevo en cada lectura sería un bucle de renders.
const leerEnCliente = (): VistaInstalacion =>
  registro
    ? decidirVista({
        tienePrompt: registro.hayPrompt(),
        esIOS: esIOS({
          userAgent: navigator.userAgent,
          maxTouchPoints: navigator.maxTouchPoints,
        }),
        yaInstalada: corriendoInstalada(),
      })
    : 'oculto'

const leerEnServidor = (): VistaInstalacion => 'oculto'

export function useInstallApp() {
  const vista = useSyncExternalStore(suscribir, leerEnCliente, leerEnServidor)
  const instalar = useCallback(() => registro?.instalar() ?? Promise.resolve(), [])
  return { vista, instalar }
}
