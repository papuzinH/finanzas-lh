'use client'

import { useSearchParams } from 'next/navigation'
import { signInWithGoogle } from './actions'
import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'

function GoogleButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-[50px] w-full items-center justify-center gap-2.5 rounded-xl border-[1.5px] border-border bg-surface font-sans text-[14.5px] font-bold text-text transition-colors duration-[120ms] hover:bg-surface-2 active:bg-btn-soft-active disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="h-[17px] w-[17px] animate-spin" />
      ) : (
        <svg className="h-[17px] w-[17px]" aria-hidden="true" focusable="false" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
          <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z" />
        </svg>
      )}
      Continuar con Google
    </button>
  )
}

export function LoginForm() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  return (
    <div className="grid w-full max-w-[342px] justify-items-center gap-3.5">
      {error && (
        <p
          role="alert"
          className="w-full rounded-xl border-[1.5px] border-bad/40 bg-bad/10 px-3.5 py-2.5 text-center text-[12.5px] font-semibold text-bad"
        >
          {error === 'auth_callback_failed'
            ? 'No se pudo conectar. Probá de nuevo.'
            : error}
        </p>
      )}
      <form action={async () => { await signInWithGoogle() }} className="w-full">
        <GoogleButton />
      </form>
      <p className="text-center text-[11px] text-faint">
        Solo usamos tu cuenta para entrar. Tus datos quedan tuyos.
      </p>
    </div>
  )
}
