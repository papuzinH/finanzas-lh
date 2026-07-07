import { describe, it, expect } from 'vitest'
import { appHelpTool } from '@/lib/ai/tools/appHelp'
import { executeToolWith } from '@/lib/ai/tools/registry'
import type { AgentContext } from '@/lib/ai/tools/types'

// appHelp no toca la DB: un ctx vacío alcanza (mismo patrón que registry.test.ts).
const ctx = {} as AgentContext

async function ask(tema: string) {
  return executeToolWith([appHelpTool], 'get_app_help', { tema }, ctx)
}

describe('appHelpTool', () => {
  it('matchea "disponible real", "Disponible Real" y "disponible" a la misma entrada', async () => {
    const r1 = await ask('disponible real')
    const r2 = await ask('Disponible Real')
    const r3 = await ask('disponible')

    expect(r1.ok).toBe(true)
    expect(r2).toEqual(r1)
    expect(r3).toEqual(r1)

    const data = r1.data as { titulo: string; explicacion: string }
    expect(data.titulo.toLowerCase()).toContain('disponible')
    expect(data.explicacion.length).toBeGreaterThan(0)
  })

  it('tema desconocido devuelve ok:true con la lista de temas disponibles', async () => {
    const r = await ask('un concepto que no existe en ningún lado')
    expect(r.ok).toBe(true)
    const data = r.data as { temas: string[] }
    expect(Array.isArray(data.temas)).toBe(true)
    expect(data.temas.length).toBeGreaterThan(5)
    // Debe incluir al menos el título de disponible-real, para que el modelo pueda ofrecerlo.
    expect(data.temas.some((t) => t.toLowerCase().includes('disponible'))).toBe(true)
  })

  it('"qué significa período" (con acento) matchea periodDate-vs-fecha-real', async () => {
    const r = await ask('qué significa período')
    expect(r.ok).toBe(true)
    const data = r.data as { titulo: string; explicacion: string }
    expect(data.titulo.toLowerCase()).toContain('period')
  })

  it('explica ciclo de tarjeta (cerrado vs. en curso)', async () => {
    const r = await ask('ciclo de tarjeta')
    expect(r.ok).toBe(true)
    const data = r.data as { titulo: string; explicacion: string }
    expect(data.explicacion.toLowerCase()).toContain('cerrado')
    expect(data.explicacion.toLowerCase()).toContain('curso')
  })

  it('explica mensualidades: son transacciones reales y no mueven el disponible', async () => {
    const r = await ask('mensualidades')
    expect(r.ok).toBe(true)
    const data = r.data as { titulo: string; explicacion: string }
    expect(data.explicacion.toLowerCase()).toContain('transacci')
  })

  it('explica pago de tarjeta: neutro para el disponible global', async () => {
    const r = await ask('pago de tarjeta')
    expect(r.ok).toBe(true)
    const data = r.data as { titulo: string; explicacion: string }
    expect(data.explicacion.toLowerCase()).toContain('neutro')
  })

  it('explica cuotas', async () => {
    const r = await ask('cuotas')
    expect(r.ok).toBe(true)
    const data = r.data as { titulo: string; explicacion: string }
    expect(data.titulo.toLowerCase()).toContain('cuota')
  })

  it('explica medio predeterminado', async () => {
    const r = await ask('medio predeterminado')
    expect(r.ok).toBe(true)
    const data = r.data as { titulo: string; explicacion: string }
    expect(data.explicacion.toLowerCase()).toContain('predeterminado')
  })

  it('explica metas y presupuestos', async () => {
    const r = await ask('presupuestos')
    expect(r.ok).toBe(true)
    const data = r.data as { titulo: string; explicacion: string }
    expect(data.titulo.toLowerCase()).toMatch(/meta|presupuesto/)
  })

  it('explica saldo bruto', async () => {
    const r = await ask('saldo bruto')
    expect(r.ok).toBe(true)
    const data = r.data as { titulo: string; explicacion: string }
    expect(data.titulo.toLowerCase()).toContain('saldo bruto')
  })

  it('no requiere acceso a supabase ni a datos de usuario (ctx vacío)', async () => {
    const r = await ask('disponible real')
    expect(r.ok).toBe(true)
  })
})
