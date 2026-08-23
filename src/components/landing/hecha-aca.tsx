'use client'

import Image from 'next/image'
import { motion, useReducedMotion } from 'framer-motion'

/**
 * La sección identidad: por qué una app argentina. Es la única sección sin
 * capturas — acá el ornamento de la marca (sello, sol) trabaja de contenido.
 * Las estampillas entran «pegándose»: caen con una rotación leve, como se
 * pega una estampilla en una libreta.
 */
const ESTAMPILLAS = [
  { titulo: 'Cuotas y ciclos de tarjeta', texto: 'Cierre el 20, vencimiento el 28: la compra post-cierre impacta el mes que viene, como en la vida real.' },
  { titulo: 'El blue, de verdad', texto: 'Cotizaciones reales para tus verdes. Y si la fuente falla, un guion honesto — nunca un número inventado.' },
  { titulo: 'Cobrás a fin de mes', texto: 'Acá el sueldo llega los últimos días hábiles. Chanchito arma el período alrededor de tu ritmo, no de un calendario ajeno.' },
  { titulo: 'Habla como vos', texto: 'Rioplatense hasta en la voz del chat. «Lucas» es plata, «el chino» es el súper.' },
]

export function HechaAca() {
  const reducido = useReducedMotion()
  return (
    <section className="relative mx-auto max-w-[1100px] overflow-hidden px-6 py-20">
      <Image
        src="/brand/sol.svg"
        alt=""
        aria-hidden
        width={120}
        height={120}
        className="pointer-events-none absolute -top-6 right-4 w-[110px] select-none opacity-70 motion-safe:animate-[spin_80s_linear_infinite]"
      />
      <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-accent-deep">Hecha acá</p>
      <h2 className="mt-3 max-w-[520px] font-display text-[30px] leading-[1.1] md:text-[38px]">
        Una app de plata que entiende este país
      </h2>
      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {ESTAMPILLAS.map((e, i) => (
          <motion.div
            key={e.titulo}
            initial={reducido ? false : { opacity: 0, y: 20, rotate: i % 2 ? 1.5 : -1.5 }}
            whileInView={reducido ? undefined : { opacity: 1, y: 0, rotate: i % 2 ? 0.6 : -0.6 }}
            viewport={{ once: true, margin: '-10% 0px' }}
            transition={{ duration: 0.45, delay: (i % 2) * 0.12, ease: 'easeOut' }}
            className="rounded-2xl border-[1.5px] border-border bg-surface p-6 shadow-card"
          >
            <h3 className="font-sans text-[16px] font-bold">{e.titulo}</h3>
            <p className="mt-2 text-[14px] leading-[1.55] text-muted">{e.texto}</p>
          </motion.div>
        ))}
      </div>
      <Image
        src="/brand/sello.svg"
        alt=""
        aria-hidden
        width={130}
        height={132}
        className="pointer-events-none mt-8 ml-auto block w-[120px] -rotate-12 select-none"
      />
    </section>
  )
}
