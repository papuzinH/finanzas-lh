import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { OnboardingClient } from './onboarding-client'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Verificar si ya tiene telegram_chat_id
  const { data: profile } = await supabase
    .from('users')
    .select('telegram_chat_id')
    .eq('id', user.id)
    .single()

  const currentTelegramId = profile?.telegram_chat_id
  const isValid = currentTelegramId && currentTelegramId.trim().length > 0

  if (isValid) {
    redirect('/')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <OnboardingClient userId={user.id} />
    </div>
  )
}
