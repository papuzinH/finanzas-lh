import { describe, it, expect } from 'vitest'
import { buildAgentPrompt } from '@/lib/ai/agentPrompt'

const baseOpts = {
  categories: [
    { id: 'cat-1', name: 'Comida', emoji: '🍔', type: 'expense' as const },
    { id: 'cat-2', name: 'Sueldo', emoji: '💰', type: 'income' as const },
    { id: 'cat-3', name: 'Otros', emoji: null, type: 'expense' as const },
  ],
  paymentMethods: [
    { name: 'Mercado Pago', type: 'debit', isDefault: true },
    { name: 'Visa', type: 'credit', isDefault: false },
  ],
  today: '2026-07-07',
  cardAlerts: [] as string[],
}

describe('buildAgentPrompt', () => {
  it('incluye la identidad de Chanchito', () => {
    const prompt = buildAgentPrompt(baseOpts)
    expect(prompt).toContain('Chanchito')
    expect(prompt).toMatch(/🐷/)
  })

  it('golden: contiene el diccionario de categorías, la fecha y las reglas de números', () => {
    const prompt = buildAgentPrompt(baseOpts)

    // Diccionario de categorías: una línea por categoría con emoji/fallback,
    // nombre, tipo y UUID.
    expect(prompt).toContain('- 🍔 Comida (expense): cat-1')
    expect(prompt).toContain('- 💰 Sueldo (income): cat-2')
    // Categoría sin emoji: usa un fallback, nunca deja el campo vacío.
    expect(prompt).toMatch(/- \S+ Otros \(expense\): cat-3/)

    // Fecha de hoy presente literalmente.
    expect(prompt).toContain('2026-07-07')

    // Reglas duras de números: nunca inventar, todo dato sale de una tool.
    expect(prompt).toMatch(/nunca inventes/i)
    expect(prompt).toMatch(/tool/i)
  })

  it('incluye los medios de pago con su tipo y marca el predeterminado', () => {
    const prompt = buildAgentPrompt(baseOpts)
    expect(prompt).toContain('- Mercado Pago (debit) (predeterminado)')
    expect(prompt).toContain('- Visa (credit)')
    // Visa no es default: su línea no debe llevar la marca de predeterminado.
    expect(prompt).not.toContain('- Visa (credit) (predeterminado)')
  })

  it('sin alertas de tarjeta no menciona alertas activas', () => {
    const prompt = buildAgentPrompt(baseOpts)
    expect(prompt).not.toMatch(/alerta/i)
  })

  it('con alertas de tarjeta las incluye en el contexto', () => {
    const prompt = buildAgentPrompt({
      ...baseOpts,
      cardAlerts: ['La Visa vence en 2 días', 'La Master ya cerró su resumen'],
    })
    expect(prompt).toContain('La Visa vence en 2 días')
    expect(prompt).toContain('La Master ya cerró su resumen')
    expect(prompt).toMatch(/alerta/i)
  })

  it('explica el protocolo confirmed de delete_entity para borrados', () => {
    const prompt = buildAgentPrompt(baseOpts)
    expect(prompt).toMatch(/delete_entity/)
    expect(prompt).toMatch(/confirmed/)
  })

  it('pide preguntar ante ambigüedad antes de escribir', () => {
    const prompt = buildAgentPrompt(baseOpts)
    expect(prompt).toMatch(/ambig/i)
  })

  it('especifica el formato de montos y el uso de negritas', () => {
    const prompt = buildAgentPrompt(baseOpts)
    expect(prompt).toContain('$14.500')
    expect(prompt).toContain('**')
  })

  it('sin categorías ni medios no rompe y aclara que no hay', () => {
    const prompt = buildAgentPrompt({ categories: [], paymentMethods: [], today: '2026-07-07', cardAlerts: [] })
    expect(prompt).not.toContain('undefined')
    expect(prompt).not.toContain('null')
  })

  it('con userName presenta al usuario por su nombre y aclara que Chanchito es el asistente', () => {
    const prompt = buildAgentPrompt({ ...baseOpts, userName: 'Lautaro' })
    expect(prompt).toContain('**Lautaro**')
    expect(prompt).toMatch(/llamalo por su nombre/i)
    expect(prompt).toMatch(/nunca llames "Chanchito" al usuario/i)
  })

  it('sin userName igual aclara que Chanchito es el asistente y pide no usar nombre', () => {
    const prompt = buildAgentPrompt(baseOpts)
    expect(prompt).toMatch(/nunca llames "Chanchito" al usuario/i)
    expect(prompt).toMatch(/no uses ninguno/i)
    expect(prompt).not.toContain('undefined')
  })

  /**
   * La regla 2 ("si una tool falla, decíselo al usuario") hacía que el modelo
   * transcribiera los errores de Zod: el 2026-09-01 una usuaria leyó en el chat
   * "nota: Invalid input: expected string, received undefined". El resultado de una
   * tool es un canal de MENOR autoridad que el system prompt, así que no alcanza con
   * pedirlo ahí: la excepción tiene que estar en la regla misma.
   */
  it('la regla de contar los fallos exceptúa los errores de argumentos', () => {
    const prompt = buildAgentPrompt(baseOpts)

    const regla2 = prompt.match(/\n2\.[\s\S]*?\n3\./)?.[0] ?? ''
    expect(regla2).not.toBe('')
    expect(regla2.toLowerCase()).toContain('argumentos inválidos')
  })
})
