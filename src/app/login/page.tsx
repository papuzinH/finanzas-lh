import { Suspense } from 'react'
import { LoginForm } from './login-form'
import { Loader } from '@/components/shared/loader'

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <Suspense fallback={<Loader size="lg" centered text="Cargando..." />}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
