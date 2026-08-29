/**
 * L6 de la auditoría 2026-08-26: el service worker cachea navegaciones
 * (`cacheOnFrontEndNav` + `aggressiveFrontEndNavCaching` en `next.config.ts`).
 * En un dispositivo compartido, después de cerrar sesión, una navegación puede
 * servirse de esa caché por un instante y mostrar pantallas del usuario que se
 * fue. Los datos no vuelven (la sesión ya no existe), pero el HTML cacheado sí.
 *
 * La limpieza es al cerrar sesión, y no puede impedirla nunca: si el navegador
 * no tiene CacheStorage o un borrado falla, el logout sigue igual.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { limpiarCachesDeLaApp } from '@/lib/pwa/caches'

type CachesFalsas = {
  keys: () => Promise<string[]>
  delete: (k: string) => Promise<boolean>
}

function instalarCaches(caches: CachesFalsas | undefined) {
  ;(globalThis as unknown as { caches?: CachesFalsas }).caches = caches
}

afterEach(() => {
  delete (globalThis as unknown as { caches?: CachesFalsas }).caches
})

describe('limpiarCachesDeLaApp', () => {
  it('borra todas las caches y dice cuántas', async () => {
    const borradas: string[] = []
    instalarCaches({
      keys: async () => ['workbox-precache-v2', 'next-data', 'others'],
      delete: async (k) => {
        borradas.push(k)
        return true
      },
    })

    const total = await limpiarCachesDeLaApp()

    expect(borradas).toEqual(['workbox-precache-v2', 'next-data', 'others'])
    expect(total).toBe(3)
  })

  it('sin CacheStorage no rompe', async () => {
    instalarCaches(undefined)
    await expect(limpiarCachesDeLaApp()).resolves.toBe(0)
  })

  it('si un borrado falla, no lanza y sigue con los demás', async () => {
    const borradas: string[] = []
    instalarCaches({
      keys: async () => ['a', 'b', 'c'],
      delete: async (k) => {
        if (k === 'b') throw new Error('QuotaExceeded')
        borradas.push(k)
        return true
      },
    })

    const total = await limpiarCachesDeLaApp()

    expect(borradas).toEqual(['a', 'c'])
    expect(total).toBe(2)
  })

  it('si el propio keys() falla, tampoco lanza', async () => {
    instalarCaches({
      keys: async () => {
        throw new Error('sin permiso')
      },
      delete: async () => true,
    })

    await expect(limpiarCachesDeLaApp()).resolves.toBe(0)
  })
})

describe('las dos salidas de sesión limpian la caché', () => {
  // Server Components no pueden: `caches` es del navegador y las dos actions
  // redirigen, así que la limpieza va del lado del cliente, antes de llamarlas.
  const salidas = [
    ['cerrar sesión', 'src/app/ajustes/perfil/page.tsx'],
    ['borrar la cuenta', 'src/app/ajustes/perfil/_components/borrar-cuenta.tsx'],
  ] as const

  for (const [nombre, archivo] of salidas) {
    it(`${nombre} limpia antes de llamar a la action`, () => {
      const fuente = readFileSync(archivo, 'utf8')
      expect(fuente).toContain("from '@/lib/pwa/caches'")
      expect(fuente).toContain('await limpiarCachesDeLaApp()')
    })
  }
})
