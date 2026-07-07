'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from 'framer-motion';
import {
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  CreditCard,
  AlertCircle,
  Target,
  Lightbulb,
  Flame,
} from 'lucide-react';
import { useFinanceStore } from '@/lib/store/financeStore';
import { cn } from '@/lib/utils';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  CreditCard,
  AlertCircle,
  Target,
  Lightbulb,
  Flame,
};

const STYLE_MAP = {
  positive: { card: 'bg-good/8 border-good/25', icon: 'text-good' },
  warning: { card: 'bg-warn/8 border-warn/25', icon: 'text-warn' },
  info: { card: 'bg-accent/8 border-accent/25', icon: 'text-accent' },
};

const ROTATION_INTERVAL = 5000;
const SWIPE_OFFSET_THRESHOLD = 60;
const SWIPE_VELOCITY_THRESHOLD = 300;

export function InsightsCarousel({ className }: { className?: string }) {
  const getInsights = useFinanceStore((s) => s.getInsights);
  const insights = getInsights();
  const reduceMotion = useReducedMotion();

  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(1);
  const [paused, setPaused] = useState(false);

  const count = insights.length;

  // Mantener el índice en rango si cambia la cantidad de insights.
  useEffect(() => {
    if (current > count - 1) setCurrent(0);
  }, [count, current]);

  const goRelative = (delta: number) => {
    if (count <= 1) return;
    setDirection(delta);
    setCurrent((prev) => (prev + delta + count) % count);
  };

  // Auto-rotado derecha→izquierda. Se reinicia con `current` (nav manual),
  // se pausa on hover/focus/drag y se desactiva con reduced-motion.
  useEffect(() => {
    if (count <= 1 || paused || reduceMotion) return;
    const timer = setTimeout(() => goRelative(1), ROTATION_INTERVAL);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, count, paused, reduceMotion]);

  if (count === 0) return null;

  const insight = insights[Math.min(current, count - 1)];
  const styles = STYLE_MAP[insight.type];
  const IconComponent = ICON_MAP[insight.icon] ?? Lightbulb;

  const handleDragEnd = (_e: unknown, info: PanInfo) => {
    if (info.offset.x < -SWIPE_OFFSET_THRESHOLD || info.velocity.x < -SWIPE_VELOCITY_THRESHOLD) {
      goRelative(1);
    } else if (info.offset.x > SWIPE_OFFSET_THRESHOLD || info.velocity.x > SWIPE_VELOCITY_THRESHOLD) {
      goRelative(-1);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      goRelative(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goRelative(-1);
    }
  };

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
        styles.card,
        className
      )}
      role="group"
      aria-roledescription="carrusel"
      aria-label="Novedades de tus finanzas"
      tabIndex={count > 1 ? 0 : -1}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={current}
          custom={direction}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: direction * 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: direction * -40 }}
          transition={{ duration: 0.28, ease: 'easeInOut' }}
          drag={count > 1 ? 'x' : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragStart={() => setPaused(true)}
          onDragEnd={handleDragEnd}
          style={{ touchAction: 'pan-y' }}
          className={cn('flex items-center gap-3', count > 1 && 'cursor-grab active:cursor-grabbing')}
        >
          <div className={cn('flex-shrink-0', styles.icon)}>
            <IconComponent className="w-4 h-4" />
          </div>
          <p className="text-sm text-text leading-snug">{insight.message}</p>
        </motion.div>
      </AnimatePresence>

      {/* Región viva estable para lectores de pantalla (fuera de AnimatePresence). */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {insight.message}
      </p>
    </div>
  );
}
