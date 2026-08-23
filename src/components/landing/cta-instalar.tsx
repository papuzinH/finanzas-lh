'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowDownToLine } from 'lucide-react'
import { useInstallApp } from '@/hooks/useInstallApp'
import { PasosIOS } from '@/components/shared/install-app-view'
import { Modal } from '@/components/shared/modal'

/**
 * Los dos caminos de la landing: instalar (cuando el navegador puede — misma
 * lógica que el login y Ajustes, feature del 2026-08-22) o entrar por la web.
 * En SSR el botón de instalar no existe: `useInstallApp` arranca 'oculto' y
 * decide en el cliente.
 */
export function CtaInstalar({ grande = false }: { grande?: boolean }) {
  const { vista, instalar } = useInstallApp()
  const [mostrandoPasos, setMostrandoPasos] = useState(false)

  return (
    <div className={grande ? 'grid justify-items-center gap-3' : 'flex flex-wrap items-center gap-3'}>
      {vista !== 'oculto' && (
        <button
          type="button"
          onClick={() => {
            if (vista === 'ios') setMostrandoPasos(true)
            else void instalar()
          }}
          className={
            grande
              ? 'flex h-[54px] items-center gap-2.5 rounded-xl border-[1.5px] border-text bg-accent px-7 font-sans text-[15px] font-bold text-accent-ink transition-transform duration-[120ms] hover:-translate-y-0.5 active:translate-y-0'
              : 'flex h-[48px] items-center gap-2 rounded-xl border-[1.5px] border-text bg-accent px-5 font-sans text-[14px] font-bold text-accent-ink transition-transform duration-[120ms] hover:-translate-y-0.5 active:translate-y-0'
          }
        >
          <ArrowDownToLine className="h-[17px] w-[17px]" />
          Instalar la app
        </button>
      )}
      <Link
        href="/login"
        className={
          grande
            ? 'flex h-[54px] items-center rounded-xl border-[1.5px] border-border bg-surface px-7 font-sans text-[15px] font-bold text-text transition-colors duration-[120ms] hover:bg-surface-2'
            : 'flex h-[48px] items-center rounded-xl border-[1.5px] border-border bg-surface px-5 font-sans text-[14px] font-bold text-text transition-colors duration-[120ms] hover:bg-surface-2'
        }
      >
        Usar en el navegador
      </Link>
      <Modal isOpen={mostrandoPasos} onClose={() => setMostrandoPasos(false)} title="Tenelo a mano">
        <PasosIOS />
      </Modal>
    </div>
  )
}
