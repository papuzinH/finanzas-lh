/**
 * El riesgo real de esta feature: Chrome dispara `beforeinstallprompt` apenas
 * carga la página, y puede llegar ANTES de que React hidrate el componente. Si
 * el listener viviera dentro de un `useEffect`, el evento pasaría de largo y el
 * botón no aparecería nunca — con la app perfectamente instalable. Por eso el
 * registro se hace al cargar el módulo, no al montar.
 *
 * Recibe el `EventTarget` por parámetro justamente para poder probarlo acá, sin
 * navegador: Node trae `EventTarget` desde la v15.
 */
import { describe, it, expect, vi } from 'vitest'
import { crearRegistroDePrompt, type PromptInstalacion } from '../prompt-diferido'

/** Imita el evento de Chrome: es cancelable y trae su propio `prompt()`. */
function eventoDeInstalacion(prompt = vi.fn().mockResolvedValue(undefined)) {
  const e = new Event('beforeinstallprompt', { cancelable: true }) as PromptInstalacion
  e.prompt = prompt
  return e
}

describe('crearRegistroDePrompt', () => {
  it('arranca sin prompt: todavía no pasó nada', () => {
    const registro = crearRegistroDePrompt(new EventTarget())
    expect(registro.hayPrompt()).toBe(false)
  })

  it('guarda el evento aunque llegue antes de que nadie se suscriba', () => {
    const target = new EventTarget()
    const registro = crearRegistroDePrompt(target)

    target.dispatchEvent(eventoDeInstalacion())

    expect(registro.hayPrompt()).toBe(true)
  })

  it('frena el cartel propio del navegador para ofrecerlo en su lugar', () => {
    const target = new EventTarget()
    crearRegistroDePrompt(target)
    const evento = eventoDeInstalacion()

    target.dispatchEvent(evento)

    expect(evento.defaultPrevented).toBe(true)
  })

  it('avisa a quien esté escuchando cuando el prompt aparece', () => {
    const target = new EventTarget()
    const registro = crearRegistroDePrompt(target)
    const avisar = vi.fn()
    registro.suscribir(avisar)

    target.dispatchEvent(eventoDeInstalacion())

    expect(avisar).toHaveBeenCalledTimes(1)
  })

  it('deja de avisar al que se dio de baja', () => {
    const target = new EventTarget()
    const registro = crearRegistroDePrompt(target)
    const avisar = vi.fn()
    const baja = registro.suscribir(avisar)

    baja()
    target.dispatchEvent(eventoDeInstalacion())

    expect(avisar).not.toHaveBeenCalled()
  })

  it('instalar abre el diálogo del navegador', async () => {
    const target = new EventTarget()
    const registro = crearRegistroDePrompt(target)
    const prompt = vi.fn().mockResolvedValue(undefined)
    target.dispatchEvent(eventoDeInstalacion(prompt))

    await registro.instalar()

    expect(prompt).toHaveBeenCalledTimes(1)
  })

  it('el prompt se consume: el navegador no deja reusar el mismo evento', async () => {
    const target = new EventTarget()
    const registro = crearRegistroDePrompt(target)
    target.dispatchEvent(eventoDeInstalacion())

    await registro.instalar()

    expect(registro.hayPrompt()).toBe(false)
  })

  it('sin prompt en mano, instalar no explota', async () => {
    const registro = crearRegistroDePrompt(new EventTarget())
    await expect(registro.instalar()).resolves.toBeUndefined()
  })

  it('cuando la app queda instalada, la invitación se retira sola', () => {
    const target = new EventTarget()
    const registro = crearRegistroDePrompt(target)
    target.dispatchEvent(eventoDeInstalacion())

    target.dispatchEvent(new Event('appinstalled'))

    expect(registro.hayPrompt()).toBe(false)
  })

  it('avisa también cuando la app queda instalada, para que la vista se actualice', () => {
    const target = new EventTarget()
    const registro = crearRegistroDePrompt(target)
    const avisar = vi.fn()
    registro.suscribir(avisar)

    target.dispatchEvent(new Event('appinstalled'))

    expect(avisar).toHaveBeenCalledTimes(1)
  })
})
