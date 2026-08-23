'use client'

import { useRef } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'

/**
 * Teatro puro: la conversación es un guion fijo que se anima al entrar en
 * viewport — ninguna llamada al chat real. El guion usa la categoría real de
 * los datos demo («chino» → Delivery de comida) para que lo que promete sea
 * lo que la app hace.
 */
const GUION = [
  { de: 'vos' as const, texto: 'gasté 8 lucas en el chino' },
  { de: 'chanchito' as const, texto: 'Listo: $ 8.000 en Delivery de comida 🍔, con Mercado Pago. ¿Algo más?' },
  { de: 'vos' as const, texto: 'no, gracias chanchito' },
  { de: 'chanchito' as const, texto: 'De nada. El que guarda, tiene 🐷' },
]

export function ChatTeatro() {
  const ref = useRef<HTMLDivElement>(null)
  const visible = useInView(ref, { once: true, margin: '-20% 0px' })
  const reducido = useReducedMotion()

  return (
    <section className="mx-auto max-w-[640px] px-6 py-20">
      <p className="text-center text-[12px] font-bold uppercase tracking-[0.14em] text-accent-deep">El chat</p>
      <h2 className="mt-3 text-center font-display text-[30px] leading-[1.1] md:text-[38px]">
        Anotalo como lo dirías
      </h2>
      <p className="mx-auto mt-3 max-w-[420px] text-center text-[15.5px] leading-[1.6] text-muted">
        Escribí — o decilo con la voz — y Chanchito lo categoriza, lo fecha y te
        deja el número al día.
      </p>
      <div ref={ref} className="mt-8 grid gap-3">
        {GUION.map((m, i) => (
          <motion.div
            key={i}
            initial={reducido ? false : { opacity: 0, y: 12 }}
            animate={visible || reducido ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.35, delay: reducido ? 0 : 0.5 + i * 0.9, ease: 'easeOut' }}
            className={
              m.de === 'vos'
                ? 'justify-self-end rounded-2xl rounded-br-md border-[1.5px] border-text bg-accent-soft/40 px-4 py-2.5 text-[14.5px]'
                : 'justify-self-start rounded-2xl rounded-bl-md border-[1.5px] border-border bg-surface px-4 py-2.5 text-[14.5px] shadow-card'
            }
          >
            {m.texto}
          </motion.div>
        ))}
      </div>
    </section>
  )
}
