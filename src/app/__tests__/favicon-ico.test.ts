/**
 * `src/app/favicon.ico` lo procesa Next por convención de metadata, y en dev
 * Turbopack lo decodifica con el crate `image` de Rust, cuyo decoder de ICO
 * sólo acepta entradas PNG en RGBA de 8 bits. Del 22 al 26-ago-2026 el ico
 * traía PNGs RGB (colortype 2) y TODAS las páginas de `next dev` daban 500
 * («error decoding Ico: The PNG is not in RGBA format») — producción no lo
 * veía porque el build de webpack no decodifica el archivo. Ningún test de
 * markup pasa por el dev server, así que este es el único que lo vigila.
 *
 * Si cambia el ícono: generar las entradas con alfa (sharp: `.ensureAlpha()`
 * + `.png({ palette: false })`), o volver a entradas BMP.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const PNG_FIRMA = Buffer.from([0x89, 0x50, 0x4e, 0x47])
const COLORTYPE_RGBA = 6

function entradasDelIco(buf: Buffer) {
  const n = buf.readUInt16LE(4)
  return Array.from({ length: n }, (_, i) => {
    const o = 6 + i * 16
    const size = buf.readUInt32LE(o + 8)
    const off = buf.readUInt32LE(o + 12)
    return { ancho: buf[o] || 256, alto: buf[o + 1] || 256, datos: buf.subarray(off, off + size) }
  })
}

describe('src/app/favicon.ico', () => {
  const ico = readFileSync('src/app/favicon.ico')
  const entradas = entradasDelIco(ico)

  it('tiene al menos una entrada y la cabecera es de ICO', () => {
    expect(ico.readUInt16LE(0)).toBe(0) // reservado
    expect(ico.readUInt16LE(2)).toBe(1) // tipo 1 = icono
    expect(entradas.length).toBeGreaterThan(0)
  })

  for (const [i, e] of entradas.entries()) {
    it(`la entrada #${i} (${e.ancho}x${e.alto}) es BMP o PNG RGBA de 8 bits — lo que Turbopack sabe decodificar`, () => {
      const esPng = e.datos.subarray(0, 4).equals(PNG_FIRMA)
      if (!esPng) return // BMP/DIB: el decoder lo acepta tal cual
      const bitDepth = e.datos[24]
      const colorType = e.datos[25]
      expect({ bitDepth, colorType }).toEqual({ bitDepth: 8, colorType: COLORTYPE_RGBA })
    })
  }
})
