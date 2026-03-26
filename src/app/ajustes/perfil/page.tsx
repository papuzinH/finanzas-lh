'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useFinanceStore } from '@/lib/store/financeStore';
import { useOnboardingStore } from '@/lib/store/onboardingStore';
import { signOut } from '@/app/perfil/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { User, Mail, Calendar, LogOut, MessageCircle, ShieldCheck, Settings, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function AjustesPerfilPage() {
  const { user, authEmail, authAvatarUrl } = useFinanceStore();
  const resetTour = useOnboardingStore((s) => s.resetTour);
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const createdAt = user?.created_at
    ? format(new Date(user.created_at), "d 'de' MMMM, yyyy", { locale: es })
    : null;

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await signOut();
  };

  return (
    <div className="min-h-screen bg-surface text-slate-50 font-sans pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-surface/80 backdrop-blur-md">
        <div className="mx-auto max-w-[1440px] px-4 md:px-6 py-4 flex items-center gap-3">
          <div className="p-2 rounded-xl bg-slate-800">
            <Settings className="h-5 w-5 text-slate-300" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">Perfil</h1>
            <p className="text-xs text-slate-400 mt-0.5">Tu cuenta y sesión</p>
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
              className="rounded-full ring-2 ring-emerald-500/40"
            />
          ) : (
            <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-slate-800 ring-2 ring-emerald-500/40">
              <User className="h-10 w-10 text-slate-400" />
            </div>
          )}
          <div className="text-center">
            <p className="text-xl font-bold">{user?.first_name || 'Usuario'}</p>
            {authEmail && <p className="text-sm text-slate-400">{authEmail}</p>}
          </div>
        </div>

        {/* Info de la cuenta */}
        <Card className="border-slate-800 bg-[var(--surface-raised)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-slate-200">Información de la cuenta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {authEmail && (
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-slate-400 shrink-0" />
                <div>
                  <p className="text-xs text-slate-400">Email</p>
                  <p className="text-sm text-slate-200 break-all">{authEmail}</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-4 w-4 text-slate-400 shrink-0" />
              <div>
                <p className="text-xs text-slate-400">Autenticación</p>
                <p className="text-sm text-slate-200">Google OAuth</p>
              </div>
            </div>
            {user?.telegram_chat_id && (
              <div className="flex items-center gap-3">
                <MessageCircle className="h-4 w-4 text-slate-400 shrink-0" />
                <div>
                  <p className="text-xs text-slate-400">Telegram Chat ID</p>
                  <p className="text-sm text-slate-200">{user.telegram_chat_id}</p>
                </div>
              </div>
            )}
            {createdAt && (
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                <div>
                  <p className="text-xs text-slate-400">Miembro desde</p>
                  <p className="text-sm text-slate-200">{createdAt}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Reiniciar tour guiado */}
        <Button
          variant="outline"
          className="w-full border-slate-700 text-slate-200 bg-slate-800"
          onClick={() => {
            resetTour();
            router.push('/');
          }}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Reiniciar Tour Guiado
        </Button>

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
      </main>
    </div>
  );
}
