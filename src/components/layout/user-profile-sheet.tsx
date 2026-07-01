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

interface UserProfileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserProfileSheet({ open, onOpenChange }: UserProfileSheetProps) {
  const { user, authEmail, authAvatarUrl } = useFinanceStore();
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
      {/* Panel lateral desde la derecha */}
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-80 border-border bg-surface text-text p-0 overflow-y-auto"
        >
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
            <SheetTitle className="text-text">Mi perfil</SheetTitle>
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
                  className="rounded-full ring-2 ring-accent/40"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-surface-2 ring-2 ring-accent/40">
                  <User className="h-9 w-9 text-muted" />
                </div>
              )}
              <div className="text-center">
                <p className="text-lg font-bold">{user?.first_name || 'Usuario'}</p>
                {authEmail && (
                  <p className="text-xs text-muted">{authEmail}</p>
                )}
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
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
