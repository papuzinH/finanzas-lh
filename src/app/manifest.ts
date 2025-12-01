import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Smart Finance',
    short_name: 'Finanzas',
    description: 'Mi gestor de gastos personal con IA',
    start_url: '/',
    display: 'standalone', // Esto elimina la barra del navegador
    background_color: '#020617', // Slate-950 (Tu fondo dark)
    theme_color: '#020617',
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
    ],
  }
}