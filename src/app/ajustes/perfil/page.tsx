'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useFinanceStore } from '@/lib/store/financeStore';
import { signOut } from '@/app/perfil/actions';
import { limpiarCachesDeLaApp } from '@/lib/pwa/caches';
import { BorrarCuenta } from './_components/borrar-cuenta';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { User, Mail, Calendar, LogOut, MessageCircle, ShieldCheck, Settings } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function AjustesPerfilPage() {
  const { user, authEmail, authAvatarUrl } = useFinanceStore();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const createdAt = user?.created_at
    ? format(new Date(user.created_at), "d 'de' MMMM, yyyy", { locale: es })
    : null;

  const handleSignOut = async () => {
    setIsSigningOut(true);
    // Antes de irse: el service worker cachea navegaciones enteras y en un
    // teléfono compartido el próximo podría ver una pantalla vieja servida de
    // caché (auditoría L6). `signOut` redirige, así que tiene que ser acá.
    await limpiarCachesDeLaApp();
    await signOut();
  };

  return (
    <div className="min-h-screen bg-bg text-text font-sans pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-surface/80 backdrop-blur-md">
        <div className="mx-auto max-w-[1440px] px-4 md:px-6 py-4 flex items-center gap-3">
          <div className="p-2 rounded-xl bg-surface-2">
            <Settings className="h-5 w-5 text-text" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-text">Perfil</h1>
            <p className="text-xs text-muted mt-0.5">Tu cuenta y sesión</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 md:px-6 py-8 space-y-6">
        {/* Avatar y nombre */}
        <div className="flex flex-col items-center gap-4 py-4">
          {authAvatarUrl ? (
            <Image
              src={authAvatarUrl}
              alt="Foto de perfil"
              width={88}
              height={88}
              className="rounded-full ring-2 ring-accent/40"
            />
          ) : (
            <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-surface-2 ring-2 ring-accent/40">
              <User className="h-10 w-10 text-muted" />
            </div>
          )}
          <div className="text-center">
            <p className="text-xl font-bold">{user?.first_name || 'Usuario'}</p>
            {authEmail && <p className="text-sm text-muted">{authEmail}</p>}
          </div>
        </div>

        {/* Info de la cuenta */}
        <Card className="border-border bg-surface-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-text">Información de la cuenta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {authEmail && (
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted shrink-0" />
                <div>
                  <p className="text-xs text-muted">Email</p>
                  <p className="text-sm text-text break-all">{authEmail}</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-4 w-4 text-muted shrink-0" />
              <div>
                <p className="text-xs text-muted">Autenticación</p>
                <p className="text-sm text-text">Google OAuth</p>
              </div>
            </div>
            {user?.telegram_chat_id && (
              <div className="flex items-center gap-3">
                <MessageCircle className="h-4 w-4 text-muted shrink-0" />
                <div>
                  <p className="text-xs text-muted">Telegram Chat ID</p>
                  <p className="text-sm text-text">{user.telegram_chat_id}</p>
                </div>
              </div>
            )}
            {createdAt && (
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted shrink-0" />
                <div>
                  <p className="text-xs text-muted">Miembro desde</p>
                  <p className="text-sm text-text">{createdAt}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cerrar sesión */}
        <Button
          variant="destructive"
          className="w-full"
          onClick={handleSignOut}
          disabled={isSigningOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          {isSigningOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
        </Button>

        {/* Borrar la cuenta: al final, después de todo lo reversible. */}
        <BorrarCuenta />
      </main>
    </div>
  );
}
