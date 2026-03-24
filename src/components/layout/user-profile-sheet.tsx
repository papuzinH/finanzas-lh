'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useFinanceStore } from '@/lib/store/financeStore';
import { signOut } from '@/app/perfil/actions';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

export function UserProfileSheet() {
  const { user, authEmail, authAvatarUrl } = useFinanceStore();
  const [open, setOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const createdAt = user?.created_at
    ? format(new Date(user.created_at), "d 'de' MMMM, yyyy", { locale: es })
    : null;

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await signOut();
  };

  return (
    <>
      {/* Botón avatar fijo en la esquina superior derecha */}
      <button
        onClick={() => setOpen(true)}
        className="fixed top-3 right-3 z-50 flex h-11 w-11 items-center justify-center rounded-full ring-2 ring-slate-700 hover:ring-emerald-500/60 transition-all focus-visible:outline-none focus-visible:ring-indigo-500"
        aria-label="Abrir perfil"
      >
        {authAvatarUrl ? (
          <Image
            src={authAvatarUrl}
            alt="Foto de perfil"
            width={36}
            height={36}
            className="rounded-full object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800">
            <User className="h-5 w-5 text-slate-400" />
          </div>
        )}
      </button>

      {/* Panel lateral desde la derecha */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-80 border-slate-800 bg-[var(--surface)] text-slate-50 p-0 overflow-y-auto"
        >
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-slate-800">
            <SheetTitle className="text-slate-50">Mi perfil</SheetTitle>
          </SheetHeader>

          <div className="px-6 py-6 space-y-6">
            {/* Avatar y nombre */}
            <div className="flex flex-col items-center gap-3">
              {authAvatarUrl ? (
                <Image
                  src={authAvatarUrl}
                  alt="Foto de perfil"
                  width={80}
                  height={80}
                  className="rounded-full ring-2 ring-emerald-500/40"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-800 ring-2 ring-emerald-500/40">
                  <User className="h-9 w-9 text-slate-400" />
                </div>
              )}
              <div className="text-center">
                <p className="text-lg font-bold">{user?.first_name || 'Usuario'}</p>
                {authEmail && (
                  <p className="text-xs text-slate-400">{authEmail}</p>
                )}
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
                    <Mail className="h-4 w-4 text-slate-500 shrink-0" />
                    <div>
                      <p className="text-xs text-slate-500">Email</p>
                      <p className="text-sm text-slate-200 break-all">{authEmail}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-4 w-4 text-slate-500 shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500">Autenticación</p>
                    <p className="text-sm text-slate-200">Google OAuth</p>
                  </div>
                </div>

                {user?.telegram_chat_id && (
                  <div className="flex items-center gap-3">
                    <MessageCircle className="h-4 w-4 text-slate-500 shrink-0" />
                    <div>
                      <p className="text-xs text-slate-500">Telegram Chat ID</p>
                      <p className="text-sm text-slate-200">{user.telegram_chat_id}</p>
                    </div>
                  </div>
                )}

                {createdAt && (
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-slate-500 shrink-0" />
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
        </SheetContent>
      </Sheet>
    </>
  );
}
