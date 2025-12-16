'use client'

import { useActionState } from 'react'
import { useSearchParams } from 'next/navigation'
import { login, signup, signInWithGoogle } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2 } from 'lucide-react'

export function LoginForm() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  const [loginState, loginAction, isLoginPending] = useActionState(login, null)
  const [signupState, signupAction, isSignupPending] = useActionState(signup, null)

  return (
    <Card className="w-full max-w-md border-slate-800 bg-slate-900 text-slate-50">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold text-center">Bienvenido</CardTitle>
        <CardDescription className="text-center text-slate-400">
          Ingresa a tu cuenta o regístrate para comenzar
        </CardDescription>
        {error && (
          <div className="mt-2 rounded-md bg-red-500/10 p-3 text-sm text-red-500 text-center">
            {error === 'auth_callback_failed' 
              ? 'Error de conexión con el proveedor. Intenta nuevamente.' 
              : error}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-slate-800">
            <TabsTrigger value="login">Ingresar</TabsTrigger>
            <TabsTrigger value="register">Registrarse</TabsTrigger>
          </TabsList>
          
          <TabsContent value="login">
            <form action={loginAction} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" placeholder="m@example.com" required className="bg-slate-950 border-slate-800" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input id="password" name="password" type="password" required className="bg-slate-950 border-slate-800" />
              </div>
              {loginState?.error && (
                <p className="text-sm text-red-500">{loginState.error}</p>
              )}
              <Button type="submit" className="w-full" disabled={isLoginPending}>
                {isLoginPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Ingresar
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="register">
            <form action={signupAction} className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">Nombre</Label>
                  <Input id="firstName" name="firstName" placeholder="Juan" required className="bg-slate-950 border-slate-800" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Apellido</Label>
                  <Input id="lastName" name="lastName" placeholder="Pérez" required className="bg-slate-950 border-slate-800" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-email">Email</Label>
                <Input id="register-email" name="email" type="email" placeholder="m@example.com" required className="bg-slate-950 border-slate-800" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-password">Contraseña</Label>
                <Input id="register-password" name="password" type="password" required className="bg-slate-950 border-slate-800" />
              </div>
              {signupState?.error && (
                <p className="text-sm text-red-500">{signupState.error}</p>
              )}
              <Button type="submit" className="w-full" disabled={isSignupPending}>
                {isSignupPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Crear cuenta
              </Button>
            </form>
          </TabsContent>
        </Tabs>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-slate-800" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-slate-900 px-2 text-slate-400">O continuar con</span>
          </div>
        </div>

        <form action={async () => { await signInWithGoogle() }}>
           <Button variant="outline" type="submit" className="w-full border-slate-800 bg-slate-950 hover:bg-slate-800 hover:text-slate-50">
            <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
              <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path>
            </svg>
            Google
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
