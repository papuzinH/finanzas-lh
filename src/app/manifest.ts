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
    icons: [
      {
        src: '/icon.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icon.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable'
      },
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      },
    ],
  }
}