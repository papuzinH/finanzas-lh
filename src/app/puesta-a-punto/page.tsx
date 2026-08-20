import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { PuestaAPuntoFlow } from './puesta-a-punto-flow'

export default async function PuestaAPuntoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('onboarding_completed, pocket_setup_completed')
    .eq('id', user.id)
    .single()

  if (!profile?.onboarding_completed) redirect('/onboarding')
  if (profile?.pocket_setup_completed) redirect('/')

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <PuestaAPuntoFlow />
    </div>
  )
}
