'use client'

import { useState } from 'react'
import { useInstallApp } from '@/hooks/useInstallApp'
import { InstallAppView, PasosIOS } from './install-app-view'
import { Modal } from './modal'

/**
 * La invitación a instalar Chanchito. Se muestra sola donde corresponde y no
 * deja rastro donde no: adentro de la app instalada devuelve `null`.
 */
export function InstallApp({ variante }: { variante: 'login' | 'ajustes' }) {
  const { vista, instalar } = useInstallApp()
  const [mostrandoPasos, setMostrandoPasos] = useState(false)

  return (
    <>
      <InstallAppView
        vista={vista}
        variante={variante}
        onAccion={() => {
          if (vista === 'ios') setMostrandoPasos(true)
          else void instalar()
        }}
      />
      <Modal
        isOpen={mostrandoPasos}
        onClose={() => setMostrandoPasos(false)}
        title="Tenelo a mano"
      >
        <PasosIOS />
      </Modal>
    </>
  )
}
