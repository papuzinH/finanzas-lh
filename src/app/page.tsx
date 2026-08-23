import { createClient } from '@/utils/supabase/server'
import DashboardClient from './dashboard-client'
import { Landing } from '@/components/landing/landing'

// La raíz sirve dos mundos: la landing al que llega sin sesión, el dashboard
// al que ya entró. La decisión es del server — el middleware deja pasar `/`
// anónimo justamente para que esta página pueda elegir.
export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) return <DashboardClient />
  return <Landing />
}
