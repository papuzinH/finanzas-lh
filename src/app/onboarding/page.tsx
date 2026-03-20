import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { OnboardingFlow } from './onboarding-flow'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Verificar si ya completó el onboarding
  const { data: profile } = await supabase
    .from('users')
    .select('onboarding_completed')
    .eq('id', user.id)
    .single()

  if (profile?.onboarding_completed) {
    redirect('/')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <OnboardingFlow />
    </div>
  )
}
