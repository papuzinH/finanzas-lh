'use client'

import { useRef, useState, useEffect } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { PhoneFrame } from './phone-frame'

/**
 * El patrón central de la estructura B: en desktop el teléfono queda fijo
 * (sticky) y muta de pantalla según qué bloque de texto está a la vista; en
 * mobile el sticky marea, así que cada bloque apila su propia captura.
 */
const BLOQUES = [
  {
    captura: '/landing/captura-home.png',
    alt: 'El home: tu plata libre para hoy',
    kicker: 'Disponible real',
    titulo: 'Un número que dice la verdad',
    texto:
      'Anclás cada cuenta a lo que tenés hoy y Chanchito descuenta lo que ya tiene dueño: cuotas, suscripciones, el resumen que viene. Lo que queda es tuyo de verdad — no un acumulado que se despega de la realidad al primer olvido.',
  },
  {
    captura: '/landing/captura-compromisos.png',
    alt: 'Compromisos: cuotas y suscripciones',
    kicker: 'Compromisos',
    titulo: 'Las cuotas se anotan solas',
    texto:
      'Cargás la compra una vez y las doce cuotas nacen fechadas al vencimiento de tu tarjeta. Las mensualidades se debitan solas cuando cierra el resumen. Vos mirás; Chanchito se acuerda.',
  },
  {
    captura: '/landing/captura-inversiones.png',
    alt: 'Inversiones en pesos y dólares',
    kicker: 'Inversiones',
    titulo: 'Pesos y verdes, sin mezclar',
    texto:
      'Tu cartera en las dos monedas de acá, con cotizaciones reales. Y cuando una cotización falta, Chanchito muestra un guion — nunca un número inventado.',
  },
]

function Bloque({ indice, onVisible }: { indice: number; onVisible: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const visible = useInView(ref, { margin: '-45% 0px -45% 0px' })
  const reducido = useReducedMotion()

  useEffect(() => {
    if (visible) onVisible(indice)
  }, [visible, indice, onVisible])

  const b = BLOQUES[indice]
  return (
    <motion.div
      ref={ref}
      initial={reducido ? false : { opacity: 0, y: 24 }}
      whileInView={reducido ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-15% 0px' }}
      transition={{ duration: 0.55, ease: 'easeOut' }}
      className="grid content-center gap-4 py-16 md:min-h-[70vh] md:py-0"
    >
      <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-accent-deep">{b.kicker}</p>
      <h2 className="font-display text-[30px] leading-[1.1] md:text-[38px]">{b.titulo}</h2>
      <p className="max-w-[420px] text-[15.5px] leading-[1.6] text-muted">{b.texto}</p>
      {/* En mobile cada bloque muestra su propia pantalla; en desktop la muestra
          la columna sticky. */}
      <PhoneFrame captura={b.captura} alt={b.alt} className="mt-4 w-[230px] md:hidden" />
    </motion.div>
  )
}

export function BloquesValor() {
  const [activo, setActivo] = useState(0)
  const reducido = useReducedMotion()

  return (
    <section className="mx-auto grid max-w-[1100px] gap-10 px-6 py-10 md:grid-cols-[1.1fr_0.9fr]">
      <div>
        {BLOQUES.map((_, i) => (
          <Bloque key={i} indice={i} onVisible={setActivo} />
        ))}
      </div>
      <div className="hidden md:block">
        <div className="sticky top-24 mx-auto w-[270px]">
          <div className="relative">
            {BLOQUES.map((b, i) => (
              <motion.div
                key={b.captura}
                animate={{ opacity: activo === i ? 1 : 0 }}
                transition={{ duration: reducido ? 0 : 0.35, ease: 'easeOut' }}
                className={i === 0 ? 'relative' : 'absolute inset-0'}
              >
                <PhoneFrame captura={b.captura} alt={b.alt} />
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
