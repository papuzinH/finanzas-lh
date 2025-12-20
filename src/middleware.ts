import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // Excluir archivos estáticos e imágenes para no gastar recursos
    '/((?!_next/static|_next/image|favicon.ico|auth/callback|login|signup|.*\\.(?:svg|png|jpg|jpeg|gif|webp|js|css|webmanifest)$).*)',
  ],
}