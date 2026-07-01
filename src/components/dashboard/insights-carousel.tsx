'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  CreditCard,
  AlertCircle,
  Target,
  Lightbulb,
} from 'lucide-react';
import { useFinanceStore } from '@/lib/store/financeStore';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  CreditCard,
  AlertCircle,
  Target,
  Lightbulb,
};

const STYLE_MAP = {
  positive: {
    card: 'bg-good/8 border-good/25',
    icon: 'text-good',
    dot: 'bg-good',
    dotInactive: 'bg-good/30',
  },
  warning: {
    card: 'bg-warn/8 border-warn/25',
    icon: 'text-warn',
    dot: 'bg-warn',
    dotInactive: 'bg-warn/30',
  },
  info: {
    card: 'bg-accent/8 border-accent/25',
    icon: 'text-accent',
    dot: 'bg-accent',
    dotInactive: 'bg-accent/30',
  },
};

const ROTATION_INTERVAL = 5000;

export function InsightsCarousel() {
  const getInsights = useFinanceStore((s) => s.getInsights);
  const insights = getInsights();

  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    if (insights.length <= 1) return;
    const timer = setInterval(() => {
      setDirection(1);
      setCurrent((prev) => (prev + 1) % insights.length);
    }, ROTATION_INTERVAL);
    return () => clearInterval(timer);
  }, [insights.length]);

  if (insights.length === 0) return null;

  const insight = insights[current];
  const styles = STYLE_MAP[insight.type];
  const IconComponent = ICON_MAP[insight.icon] ?? Lightbulb;

  const goTo = (index: number) => {
    setDirection(index > current ? 1 : -1);
    setCurrent(index);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className={`relative overflow-hidden rounded-2xl border px-4 py-3 ${styles.card}`}>
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={current}
            custom={direction}
            initial={{ opacity: 0, y: direction * 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: direction * -12 }}
            transition={{ duration: 0.28, ease: 'easeInOut' }}
            className="flex items-center gap-3"
          >
            <div className={`flex-shrink-0 ${styles.icon}`}>
              <IconComponent className="w-4 h-4" />
            </div>
            <p className="text-sm text-text leading-snug">{insight.message}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      {insights.length > 1 && (
        <div className="flex items-center justify-center">
          {insights.map((ins, i) => {
            const dotStyles = STYLE_MAP[ins.type];
            return (
              <button
                key={i}
                onClick={() => goTo(i)}
                className="flex items-center justify-center w-11 h-6 focus-visible:outline-none"
                aria-label={`Insight ${i + 1}`}
                aria-current={i === current ? 'true' : undefined}
              >
                <span
                  className={`rounded-full transition-all duration-300 ${
                    i === current
                      ? `w-4 h-1.5 ${dotStyles.dot}`
                      : `w-1.5 h-1.5 ${dotStyles.dotInactive}`
                  }`}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
