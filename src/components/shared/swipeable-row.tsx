'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { motion, useMotionValue, useTransform, useReducedMotion, animate } from 'framer-motion';
import { Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const SWIPE_THRESHOLD = 80;
const PEEK_OFFSET = 46;

interface SwipeableRowProps {
  children: ReactNode;
  /** Deslizar a la derecha. Sin handler, ese lado no muestra fondo ni dispara nada. */
  onSwipeRight?: () => void;
  /** Deslizar a la izquierda (rojo, destructivo). */
  onSwipeLeft?: () => void;
  /** Con `false` renderiza los children pelados: en desktop el gesto no aplica. */
  enabled?: boolean;
  /** Redondeo del recorte y de los fondos. Default: `rounded-2xl`. */
  rounded?: string | false;
  rightLabel?: string;
  leftLabel?: string;
  /** Hint de descubribilidad: al montar se asoma solo una vez la acción destructiva. */
  peekOnMount?: boolean;
  className?: string;
}

/**
 * Fila deslizable con acciones detrás: a la derecha editar (acento), a la
 * izquierda eliminar (rojo). El gesto es un atajo — cada pantalla debe ofrecer
 * las mismas acciones por tap/menú, porque el swipe no es descubrible ni accesible.
 *
 * Extraído de `TransactionItem`, que fue el primero en tenerlo; lo comparten las
 * cards de Compromisos para que toda la app se maneje igual.
 */
export function SwipeableRow({
  children,
  onSwipeRight,
  onSwipeLeft,
  enabled = true,
  rounded = 'rounded-2xl',
  rightLabel = 'Editar',
  leftLabel = 'Eliminar',
  peekOnMount = false,
  className,
}: SwipeableRowProps) {
  const prefersReducedMotion = useReducedMotion();
  const hapticFired = useRef(false);
  const hasDraggedRef = useRef(false);

  const x = useMotionValue(0);
  const rightBgOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1]);
  const leftBgOpacity = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0]);

  const canPeek = peekOnMount && enabled && !prefersReducedMotion && !!onSwipeLeft;
  useEffect(() => {
    if (!canPeek) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      await animate(x, -PEEK_OFFSET, { duration: 0.35, ease: 'easeOut' });
      if (cancelled) return;
      await animate(x, 0, { duration: 0.35, ease: 'easeOut', delay: 0.5 });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!enabled || (!onSwipeRight && !onSwipeLeft)) return <>{children}</>;

  const handleDragStart = () => {
    hasDraggedRef.current = false;
  };

  const handleDrag = (_: unknown, info: { offset: { x: number } }) => {
    if (Math.abs(info.offset.x) > 5) hasDraggedRef.current = true;
    if (Math.abs(info.offset.x) > SWIPE_THRESHOLD && !hapticFired.current) {
      navigator.vibrate?.(10);
      hapticFired.current = true;
    } else if (Math.abs(info.offset.x) <= SWIPE_THRESHOLD) {
      hapticFired.current = false;
    }
  };

  const handleDragEnd = (_: unknown, info: { offset: { x: number } }) => {
    hapticFired.current = false;
    if (info.offset.x < -SWIPE_THRESHOLD) onSwipeLeft?.();
    else if (info.offset.x > SWIPE_THRESHOLD) onSwipeRight?.();
    animate(x, 0, prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 40 });
  };

  return (
    <div className={cn('relative overflow-hidden', rounded || undefined, className)}>
      {onSwipeRight && (
        <motion.div
          className={cn('absolute inset-0 flex items-center px-5 bg-accent', rounded || undefined)}
          style={{ opacity: rightBgOpacity }}
          aria-hidden
        >
          <Pencil className="h-5 w-5 text-accent-ink" />
          <span className="ml-2 text-sm font-bold text-accent-ink">{rightLabel}</span>
        </motion.div>
      )}

      {onSwipeLeft && (
        <motion.div
          className={cn('absolute inset-0 flex items-center justify-end px-5 bg-bad', rounded || undefined)}
          style={{ opacity: leftBgOpacity }}
          aria-hidden
        >
          <span className="mr-2 text-sm font-bold text-accent-ink">{leftLabel}</span>
          <Trash2 className="h-5 w-5 text-accent-ink" />
        </motion.div>
      )}

      <motion.div
        style={{ x }}
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: onSwipeLeft ? -150 : 0, right: onSwipeRight ? 150 : 0 }}
        dragElastic={0.15}
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        // Un swipe termina en click sintético sobre la fila: sin esto, soltar el
        // gesto abre además el menú de la fila que se acaba de arrastrar.
        onClickCapture={(e) => {
          if (!hasDraggedRef.current) return;
          hasDraggedRef.current = false;
          e.stopPropagation();
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}
