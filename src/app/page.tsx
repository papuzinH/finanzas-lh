import type { Metadata } from 'next'
import { createClient } from '@/utils/supabase/server'
import DashboardClient from './dashboard-client'
import { Landing } from '@/components/landing/landing'

export const metadata: Metadata = {
  title: 'Chanchito — Tus gastos, en orden',
  description:
    'Gastos, cuotas, suscripciones y verdes del día a día. Una app de finanzas hecha en Argentina, para saber cuánta plata te queda de verdad.',
  openGraph: {
    title: 'Chanchito — Tus gastos, en orden',
    description: 'La app de plata que entiende este país. El que guarda, tiene.',
    images: [{ url: '/landing/og.png', width: 1200, height: 630 }],
  },
}

// La raíz sirve dos mundos: la landing al que llega sin sesión, el dashboard
// al que ya entró. La decisión es del server — el middleware deja pasar `/`
// anónimo justamente para que esta página pueda elegir.
export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) return <DashboardClient />
  return <Landing />
}
