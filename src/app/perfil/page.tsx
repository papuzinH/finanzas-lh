'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useFinanceStore } from '@/lib/store/financeStore';
import { signOut } from './actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  User,
  Mail,
  Calendar,
  LogOut,
  MessageCircle,
  ShieldCheck,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { FullPageLoader } from '@/components/shared/loader';

export default function PerfilPage() {
  const {
    user,
    authEmail,
    authAvatarUrl,
    isLoading,
    isInitialized,
    fetchAllData,
  } = useFinanceStore();

  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    if (!isInitialized) fetchAllData();
  }, [isInitialized, fetchAllData]);

  if (isLoading && !isInitialized) return <FullPageLoader />;

  const createdAt = user?.created_at
    ? format(new Date(user.created_at), "d 'de' MMMM, yyyy", { locale: es })
    : null;

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await signOut();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto max-w-[1440px] px-4 md:px-6 py-4">
          <h1 className="text-xl font-bold tracking-tight text-white">Mi perfil</h1>
        </div>
      </header>

      <div className="mx-auto max-w-xl px-4 md:px-6 py-6 space-y-6">
        {/* Avatar y nombre */}
        <div className="flex flex-col items-center gap-4">
          {authAvatarUrl ? (
            <Image
              src={authAvatarUrl}
              alt="Foto de perfil"
              width={96}
              height={96}
              className="rounded-full ring-2 ring-emerald-500/40"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-800 ring-2 ring-emerald-500/40">
              <User className="h-10 w-10 text-slate-400" />
            </div>
          )}
          <div className="text-center">
            <p className="text-2xl font-bold">{user?.first_name || 'Usuario'}</p>
            {authEmail && (
              <p className="text-sm text-slate-400">{authEmail}</p>
            )}
          </div>
        </div>

        {/* Info de la cuenta */}
        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-base text-slate-200">Información de la cuenta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {authEmail && (
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-slate-500" />
                <div>
                  <p className="text-xs text-slate-500">Email</p>
                  <p className="text-sm text-slate-200">{authEmail}</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-slate-500" />
              <div>
                <p className="text-xs text-slate-500">Autenticación</p>
                <p className="text-sm text-slate-200">Google OAuth</p>
              </div>
            </div>

            {user?.telegram_chat_id && (
              <div className="flex items-center gap-3">
                <MessageCircle className="h-5 w-5 text-slate-500" />
                <div>
                  <p className="text-xs text-slate-500">Telegram Chat ID</p>
                  <p className="text-sm text-slate-200">{user.telegram_chat_id}</p>
                </div>
              </div>
            )}

            {createdAt && (
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-slate-500" />
                <div>
                  <p className="text-xs text-slate-500">Miembro desde</p>
                  <p className="text-sm text-slate-200">{createdAt}</p>
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
      </div>
    </div>
  );
}
