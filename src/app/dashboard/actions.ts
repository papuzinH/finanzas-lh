'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

type ActionResponse = {
  error?: string
  success?: boolean
}

function isMissingInternalTransfersTable(errorMessage?: string): boolean {
  if (!errorMessage) return false
  return errorMessage.includes("Could not find the table 'public.internal_transfers'")
}

function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export async function createEndOfMonthSurplusTransfer(data: {
  amount: number
  currency?: 'ARS' | 'USD'
}): Promise<ActionResponse> {
  try {
    const amount = Number(data.amount)
    const currency = data.currency ?? 'ARS'

    if (!Number.isFinite(amount) || amount <= 0) {
      return { error: 'El monto debe ser positivo' }
    }

    if (currency !== 'ARS' && currency !== 'USD') {
      return { error: 'Moneda no valida' }
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'No autorizado' }
    }

    const now = new Date()
    const periodDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const realTransferDate = toLocalDateString(now)

    const { data: existing, error: existingError } = await supabase
      .from('internal_transfers')
      .select('id')
      .eq('user_id', user.id)
      .eq('period_date', periodDate)
      .eq('transfer_type', 'end_of_month_surplus')
      .maybeSingle()

    const missingInternalTransfersTable = isMissingInternalTransfersTable(existingError?.message)

    if (existingError && !missingInternalTransfersTable) {
      return { error: existingError.message }
    }

    if (!missingInternalTransfersTable && existing) {
      return { error: 'Ya guardaste el sobrante de este mes' }
    }

    let transferId: string | null = null

    if (!missingInternalTransfersTable) {
      const { data: transfer, error: transferError } = await supabase
        .from('internal_transfers')
        .insert({
          user_id: user.id,
          amount,
          currency,
          period_date: periodDate,
          real_transfer_date: realTransferDate,
          transfer_type: 'end_of_month_surplus',
          description: 'Ahorro de sobrante mensual desde dashboard',
        })
        .select('id')
        .single()

      if (transferError) {
        return { error: transferError.message }
      }

      transferId = transfer.id
    }

    const { error: savingError } = await supabase.from('savings').insert({
      user_id: user.id,
      amount,
      currency,
      date: realTransferDate,
    })

    if (savingError) {
      if (transferId) {
        await supabase.from('internal_transfers').delete().eq('id', transferId).eq('user_id', user.id)
      }
      return { error: savingError.message }
    }

    revalidatePath('/')
    revalidatePath('/inversiones')

    return { success: true }
  } catch {
    return { error: 'Ocurrio un error inesperado' }
  }
}
