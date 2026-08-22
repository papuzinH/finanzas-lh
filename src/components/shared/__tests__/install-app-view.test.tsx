/**
 * La misma invitación vive en dos pantallas con formas distintas: en el login es
 * el segundo camino debajo de "Continuar con Google", y en Ajustes es una fila
 * más del listado. Está en las dos porque si sólo estuviera en el login, quien
 * entró sin instalarla tendría que cerrar sesión para volver a verla.
 *
 * Sin DOM no se puede probar el click (eso es navegador), pero sí lo que decide
 * el markup: que no aparezca donde no corresponde, que cada variante use la
 * forma de su pantalla, y que en iOS no prometa un botón que Safari no tiene.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { InstallAppView, PasosIOS } from '../install-app-view'

const render = (ui: React.ReactElement) => renderToStaticMarkup(ui)
const noop = () => {}

describe('InstallAppView oculta', () => {
  it('no deja rastro en el login', () => {
    expect(render(<InstallAppView vista="oculto" variante="login" onAccion={noop} />)).toBe('')
  })

  it('no deja rastro en ajustes', () => {
    expect(render(<InstallAppView vista="oculto" variante="ajustes" onAccion={noop} />)).toBe('')
  })
})

describe('InstallAppView en el login', () => {
  const html = (vista: 'boton' | 'ios') =>
    render(<InstallAppView vista={vista} variante="login" onAccion={noop} />)

  it('invita a tener la app a mano', () => {
    expect(html('boton')).toContain('Tenelo a mano')
  })

  it('explica qué gana el usuario: se abre como app', () => {
    expect(html('boton')).toContain('sin la barra del navegador')
  })

  it('en iOS no ofrece instalar, ofrece mostrar cómo', () => {
    expect(html('ios')).toContain('Cómo agregarlo')
    expect(html('ios')).not.toContain('Se abre sin la barra')
  })

  it('no se disfraza de tarjeta: en el login es el segundo camino, no una sección', () => {
    expect(html('boton')).not.toContain('rounded-2xl border-[1.5px] border-border bg-surface')
  })
})

describe('InstallAppView en ajustes', () => {
  const html = (vista: 'boton' | 'ios') =>
    render(<InstallAppView vista={vista} variante="ajustes" onAccion={noop} />)

  it('usa la tarjeta con la que están hechas las otras filas de la pantalla', () => {
    expect(html('boton')).toContain('rounded-2xl')
    expect(html('boton')).toContain('border-[1.5px] border-border')
    expect(html('boton')).toContain('bg-surface')
  })

  it('lleva el ícono en el cuadrado de acento, como el resto de las filas', () => {
    expect(html('boton')).toContain('bg-accent-soft/30')
    expect(html('boton')).toContain('text-accent-deep')
  })

  it('se anuncia como instalar la app', () => {
    expect(html('boton')).toContain('Instalar la app')
  })

  it('en iOS cambia el subtítulo por el camino que sí existe en Safari', () => {
    expect(html('ios')).toContain('pantalla de inicio')
  })
})

describe('InstallAppView y el design system', () => {
  it('no usa colores crudos: sólo tokens semánticos', () => {
    const todas = [
      render(<InstallAppView vista="boton" variante="login" onAccion={noop} />),
      render(<InstallAppView vista="ios" variante="login" onAccion={noop} />),
      render(<InstallAppView vista="boton" variante="ajustes" onAccion={noop} />),
      render(<InstallAppView vista="ios" variante="ajustes" onAccion={noop} />),
    ].join(' ')
    // Ni hex ni escalas de Tailwind: es regla dura del repo.
    expect(todas).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(todas).not.toMatch(/\b(?:bg|text|border)-(?:slate|gray|zinc|emerald|red|blue|amber)-\d{2,3}\b/)
  })
})

/**
 * En iPhone no hay nada que automatizar: Safari no expone el evento y la única
 * vía es el gesto manual. Estos pasos son el reemplazo del botón, así que si no
 * nombran el gesto exacto no sirven para nada — y hay un detalle que se olvida
 * siempre: en iOS sólo Safari puede agregar a la pantalla de inicio, de modo que
 * alguien leyendo esto desde Chrome necesita que se lo digan.
 */
describe('PasosIOS', () => {
  const html = () => render(<PasosIOS />)

  it('nombra el botón por el que arranca todo', () => {
    expect(html()).toContain('Compartir')
  })

  it('nombra la opción exacta del menú', () => {
    expect(html()).toContain('Agregar a inicio')
  })

  it('avisa que tiene que ser Safari, que es donde más gente se traba', () => {
    expect(html()).toContain('Safari')
  })

  it('va numerado: es una secuencia, no una lista de opciones', () => {
    expect(html()).toContain('<ol')
  })
})
