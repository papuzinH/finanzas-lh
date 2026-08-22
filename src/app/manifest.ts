import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Chanchito',
    short_name: 'Chanchito',
    description: 'Tus gastos, cuotas y verdes del dia a dia, en orden',
    start_url: '/',
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
