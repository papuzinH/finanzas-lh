'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { Chancho } from '@/components/brand/chancho'
import { CtaInstalar } from './cta-instalar'

/** El cierre: el chancho grande, la invitación y la línea de confianza. */
export function CtaFinal() {
  const reducido = useReducedMotion()
  return (
    <section className="mx-auto grid max-w-[640px] justify-items-center gap-5 px-6 py-24 text-center">
      <motion.div
        whileHover={reducido ? undefined : { rotate: [-2, 2, -1, 0], y: -6 }}
        transition={{ duration: 0.5 }}
        className="w-[130px] text-text"
      >
        <Chancho className="w-full" title="El chancho de Chanchito" />
      </motion.div>
      <h2 className="font-display text-[34px] leading-[1.05] md:text-[44px]">Tenelo a mano</h2>
      <p className="max-w-[400px] text-[15.5px] leading-[1.6] text-muted">
        Se instala desde el navegador y se abre como cualquier app — sin tienda,
        sin vueltas.
      </p>
      <CtaInstalar grande />
      <p className="text-[12px] text-faint">
        Tus datos quedan tuyos: entrás con tu cuenta de Google y nadie más los ve.
      </p>
    </section>
  )
}
