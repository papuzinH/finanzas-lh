'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { parseLocalDate } from '@/lib/utils/dates';
import { CicloFechasField, type FechasDeCiclo } from './ciclo-fechas-field';

const corto = (d: string) => format(parseLocalDate(d), 'd MMM', { locale: es });

/**
 * El paso OPCIONAL de cargar las fechas del proximo resumen mientras se marca un pago.
 *
 * Arranca cerrado a proposito: el usuario marca los pagos de memoria y sin el resumen a mano, y
 * una friccion aca pega justo en la accion que (E11) es lo unico que impide que el disponible se
 * infle solo.
 *
 * No escribe nada por su cuenta: avisa por `onDeclarar` y el dialogo que lo contiene decide
 * cuando guardar. Si el usuario nunca lo abre, `onDeclarar` nunca se llama y la estimacion sigue
 * siendo una estimacion -- ese es el requisito de "confirmar exige un gesto".
 *
 * `fechas` se inicializa desde la prop `estimado` (estado derivado de props, igual que
 * EditarCicloDialog). A diferencia de aquel, ESTE componente no queda montado indefinidamente
 * detras de un `open` que solo cambia de visibilidad: los dos lugares que lo usan
 * (credit-card-cycle-card.tsx, register-card-payment-dialog.tsx) le pasan `key={cicloId}`, asi
 * que un cambio de tarjeta/ciclo -- p.ej. el usuario elige otra tarjeta en el selector del
 * dialogo de "Registrar pago" mientras el dialogo sigue abierto -- lo remonta en limpio en vez
 * de dejarlo mostrando las fechas de la tarjeta anterior.
 */
export function DeclararProximoCiclo({
  estimado,
  onDeclarar,
}: {
  methodId: string;
  estimado: FechasDeCiclo;
  onDeclarar: (fechas: FechasDeCiclo | null) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [fechas, setFechas] = useState<FechasDeCiclo>(estimado);

  if (!abierto) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-xs text-muted">
          Estimado: cierra {corto(estimado.closingDate)} · vence {corto(estimado.dueDate)}
        </p>
        <Button
          type="button"
          variant="ghost"
          className="min-h-[44px] self-start"
          onClick={() => {
            setAbierto(true);
            onDeclarar(fechas);
          }}
        >
          Lo tengo a mano, lo cargo
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">Copialas del resumen del banco.</p>
      <CicloFechasField
        value={fechas}
        onChange={(v) => {
          setFechas(v);
          onDeclarar(v);
        }}
      />
    </div>
  );
}
