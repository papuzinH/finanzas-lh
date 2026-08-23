'use client'

import Image from 'next/image'
import { useEffect } from 'react'
import { motion, animate, useMotionValue, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { formatCurrency } from '@/lib/utils'
import { PhoneFrame } from './phone-frame'
import { CtaInstalar } from './cta-instalar'
import { DISPONIBLE_DEMO } from './constantes'

/**
 * Split hero: claim + caminos a la izquierda, el teléfono a la derecha.
 * El contador redibuja el disponible ANIMADO sobre la zona del número de la
 * captura (un PNG no se anima): el overlay lleva fondo `bg-surface` porque la
 * card del home es superficie, y tapa el número quemado.
 */
export function Hero() {
  const reducido = useReducedMotion()
  const mv = useMotionValue(reducido ? DISPONIBLE_DEMO : 0)
  const { scrollY } = useScroll()
  // Parallax suave: el teléfono se retrasa apenas respecto del scroll.
  const y = useTransform(scrollY, [0, 600], [0, reducido ? 0 : -36])

  useEffect(() => {
    if (reducido) return
    const control = animate(mv, DISPONIBLE_DEMO, { duration: 1.8, delay: 0.5, ease: [0, 0, 0.2, 1] })
    return () => control.stop()
  }, [mv, reducido])

  const texto = useTransform(mv, (v) => formatCurrency(Math.round(v)))

  const entrada = reducido
    ? {}
    : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 } }

  return (
    <section className="relative mx-auto grid max-w-[1100px] items-center gap-10 px-6 pb-20 pt-14 md:grid-cols-[1.1fr_0.9fr] md:pt-20">
      <div className="grid justify-items-start gap-5">
        <motion.div {...entrada} transition={{ duration: 0.5, ease: 'easeOut' }}>
          <Image
            src="/brand/cinta-guita-clara.svg"
            alt="Guita clara"
            width={280}
            height={72}
            priority
            className="block w-[240px] max-w-full md:w-[280px]"
          />
        </motion.div>
        <motion.h1
          {...entrada}
          transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
          className="font-display text-[44px] leading-[1.05] md:text-[58px]"
        >
          Tus gastos, en orden.
        </motion.h1>
        <motion.p
          {...entrada}
          transition={{ duration: 0.5, delay: 0.2, ease: 'easeOut' }}
          className="max-w-[440px] text-[16px] leading-[1.55] text-muted"
        >
          Gastos, cuotas, suscripciones y verdes del día a día — para saber
          cuánta plata te queda de verdad. Hecha acá, para acá.
        </motion.p>
        <motion.div {...entrada} transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' }}>
          <CtaInstalar />
        </motion.div>
      </div>

      <motion.div style={{ y }} className="mx-auto w-[240px] sm:w-[270px] md:w-[290px]">
        <PhoneFrame captura="/landing/captura-home.png" alt="El home de Chanchito: tu plata libre para hoy" priority>
          {/* Tapa el número quemado en la captura y lo redibuja animado.
              Posición inicial medida sobre la captura 780×1688; se afina en la
              verificación en navegador (Task 6). */}
          <div
            data-overlay-disponible
            className="absolute left-[7%] right-[8%] top-[14.5%] flex h-[6%] items-center rounded-lg bg-surface"
          >
            <motion.span className="tnum font-display text-[clamp(20px,7.5cqw,30px)] leading-none text-text [container-type:inline-size]">
              {texto}
            </motion.span>
          </div>
        </PhoneFrame>
      </motion.div>
    </section>
  )
}
