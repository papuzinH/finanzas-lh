import { Suspense } from 'react'
import Image from 'next/image'
import { LoginForm } from './login-form'
import { Loader } from '@/components/shared/loader'
import { InstallApp } from '@/components/shared/install-app'

export default function LoginPage() {
  return (
    <div className="paper-grain relative flex min-h-screen flex-col justify-between overflow-hidden bg-bg px-6">
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

      <main className="relative z-10 grid justify-items-center pb-[13rem]">
        <Suspense fallback={<Loader size="lg" centered text="Cargando..." />}>
          <LoginForm />
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
