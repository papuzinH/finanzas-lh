import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { runUpdatePrices } from '@/lib/investments/update-prices-core'

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const result = await runUpdatePrices(supabase, user.id)
    return NextResponse.json(result)
  } catch (e) {
    console.error('Error in update-prices route:', e)
    return NextResponse.json({ error: 'Error al actualizar precios' }, { status: 500 })
  }
}
