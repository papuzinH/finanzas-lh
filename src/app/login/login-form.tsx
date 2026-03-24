'use client'

import { useSearchParams } from 'next/navigation'
import { signInWithGoogle } from './actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'

function GoogleButton() {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      variant="outline"
      className="w-full border-slate-700 bg-surface hover:bg-surface-raised hover:text-slate-50"
      disabled={pending}
    >
      {pending ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
          <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z" />
        </svg>
      )}
      Continuar con Google
    </Button>
  )
}

export function LoginForm() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  return (
    <Card className="w-full max-w-sm border-slate-800 bg-surface-raised text-slate-50">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl font-bold">Bienvenido</CardTitle>
        <CardDescription className="text-slate-400">
          Ingresa con tu cuenta de Google para continuar
        </CardDescription>
        {error && (
          <div className="rounded-md bg-red-500/10 p-3 text-sm text-red-500">
            {error === 'auth_callback_failed'
              ? 'Error de conexión. Intenta nuevamente.'
              : error}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <form action={async () => { await signInWithGoogle() }}>
          <GoogleButton />
        </form>
      </CardContent>
    </Card>
  )
}
