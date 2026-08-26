'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmationModal } from '@/components/shared/confirmation-modal';
import { deleteMyAccount } from '@/app/perfil/actions';

/**
 * El bloque «Borrar la cuenta» de Ajustes → Perfil. El disparador es
 * deliberadamente discreto (`soft` + texto `bad`): el rojo fuerte queda para
 * la confirmación, y «Cerrar sesión», justo arriba, ya es un botón rojo.
 *
 * En éxito la action redirige a `/` (la promesa no vuelve con valor); si
 * vuelve, es porque hubo error y se muestra tal cual.
 */
export function BorrarCuenta() {
  const [abierto, setAbierto] = useState(false);
  const [borrando, setBorrando] = useState(false);

  const confirmar = async () => {
    setBorrando(true);
    const resultado = await deleteMyAccount();
    if (resultado?.error) {
      setBorrando(false);
      setAbierto(false);
      toast.error(resultado.error);
    }
  };

  return (
    <Card className="grid gap-3 p-5">
      <h2 className="font-display text-[18px] leading-[1.1] text-text">Borrar la cuenta</h2>
      <p className="text-[13.5px] leading-[1.5] text-muted">
        Se borran todos tus movimientos, medios de pago, cuotas, metas e inversiones, y tu acceso.
        Ahora, sin período de espera. No hay vuelta atrás.
      </p>
      <p className="text-[12.5px] text-faint">
        Qué guardamos y por qué:{' '}
        <a href="/privacidad" className="underline underline-offset-2 hover:text-text">
          política de privacidad
        </a>
        .
      </p>
      <Button variant="soft" className="w-full text-bad" onClick={() => setAbierto(true)}>
        <Trash2 className="mr-2 h-4 w-4" />
        Borrar mi cuenta
      </Button>
      <ConfirmationModal
        open={abierto}
        onOpenChange={setAbierto}
        title="¿Borrar tu cuenta?"
        description="Se borra todo lo que cargaste y tu acceso, ahora mismo. No hay vuelta atrás."
        onConfirm={confirmar}
        isLoading={borrando}
        confirmText="Sí, borrar todo"
        cancelText="No, dejar como está"
        variant="destructive"
      />
    </Card>
  );
}
