import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Chanchito',
    short_name: 'Chanchito',
    description: 'Mi gestor de gastos personal con IA',
    start_url: '/',
    display: 'standalone',
    background_color: '#020617', // Slate-950
    theme_color: '#020617',
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