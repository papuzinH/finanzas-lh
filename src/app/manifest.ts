import { MetadataRoute } from 'next'
import { START_URL_APP } from '@/lib/pwa/arranque'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Chanchito',
    short_name: 'Chanchito',
    description: 'Tus gastos, cuotas y verdes del dia a dia, en orden',
    // `id` clava la identidad de la PWA. Sin él, la identidad ES el
    // `start_url`, y moverlo dejaría huérfana toda instalación existente y
    // duplicaría la próxima. Con el valor que el start_url tuvo siempre ('/'),
    // la app instalada sigue siendo la misma aunque cambie por dónde arranca.
    id: '/',
    // La app instalada se anuncia: el server no puede ver `display-mode:
    // standalone` (eso vive en el navegador), así que sin este dato `/` le
    // mostraría la landing —con su «usar en el navegador»— a alguien que ya la
    // instaló. La otra punta la lee el middleware.
    start_url: START_URL_APP,
    display: 'standalone',
    // Papel crema: es lo que ve alguien al instalar la PWA, antes de abrirla.
    background_color: '#F4EDDC',
    theme_color: '#F4EDDC',
    // El chancho de la identidad (2026-08-13) sobre papel crema. Los `maskable`
    // son otro archivo, no el mismo con otro `purpose`: Android puede recortar
    // hasta un círculo, así que su chancho va más chico para entrar en la safe
    // zone del 80%. Se generan desde `design/brand/chancho.svg`.
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-192-maskable.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
