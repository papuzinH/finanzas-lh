import { Suspense } from 'react'
import Image from 'next/image'
import { LoginForm } from './login-form'
import { Loader } from '@/components/shared/loader'
import { InstallApp } from '@/components/shared/install-app'
import { permiteLoginPorEmail } from '@/lib/entorno'

export default function LoginPage() {
  const conEmail = permiteLoginPorEmail()

  return (
    <div className="paper-grain relative flex min-h-screen flex-col overflow-hidden bg-bg px-6">
      {/* Cinta con la frase. Su frente es abierto y toma el color del fondo,
          así que sobre estraza necesita la variante con franja central crema
          o deja de leerse como bandera. */}
      <header className="relative z-10 grid justify-items-center pt-14">
        <Image
          src="/brand/cinta-el-que-guarda.svg"
          alt="El que guarda, tiene"
          width={393}
          height={128}
          priority
          className="-mx-6 block w-[calc(100%+3rem)] max-w-[393px] dark:hidden"
        />
        <Image
          src="/brand/cinta-el-que-guarda-noche.svg"
          alt="El que guarda, tiene"
          width={393}
          height={128}
          priority
          className="-mx-6 hidden w-[calc(100%+3rem)] max-w-[393px] dark:block"
        />
        <h1 className="mt-6 font-display text-[42px] leading-none text-text">Chanchito</h1>
        <p className="mt-2.5 max-w-[250px] text-center text-[13.5px] leading-[1.45] text-muted">
          Gastos, cuotas y verdes del día a día, en orden.
        </p>
      </header>

      {/* El bloque de entrada se centra en el espacio entre la cinta y el sello
          (gate del 2026-08-26: antes quedaba anclado abajo). El colchón de 13rem
          sigue siendo el que evita pisar el sello, que mide ~190px de alto
          apoyado a 32px del borde: cualquier cosa que se sume acá abajo compite
          con él (ver docs/features/pwa-plataforma.md). */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center pb-[13rem]">
        <Suspense fallback={<Loader size="lg" centered text="Cargando..." />}>
          <LoginForm conEmail={conEmail} />
        </Suspense>
        <p className="mt-3 text-center text-[12.5px] leading-[1.45] text-faint">
          Al entrar aceptás la{' '}
          <a href="/privacidad" className="underline underline-offset-2 hover:text-text">
            política de privacidad
          </a>
          .
        </p>
        <InstallApp variante="login" />
      </main>

      {/* Sello de recibido. Ornamento de momento: el login es la única pantalla
          donde el sello es protagonista. */}
      <Image
        src="/brand/sello.svg"
        alt=""
        aria-hidden
        width={148}
        height={150}
        className="pointer-events-none absolute -right-6 bottom-8 z-0 w-[148px] -rotate-[20deg] select-none"
      />
    </div>
  )
}
