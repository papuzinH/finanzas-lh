'use client';

import { motion, useReducedMotion } from 'framer-motion';

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, damping: 20, stiffness: 200 },
  },
};

// Con movimiento reducido: solo fade (sin desplazamiento), respetando WCAG 2.3.3.
const reducedItemVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2 } },
};

interface StaggeredListProps {
  children: React.ReactNode;
  staggerDelay?: number;
  className?: string;
  id?: string;
}

export function StaggeredList({ children, staggerDelay = 0.05, className, id }: StaggeredListProps) {
  const reduceMotion = useReducedMotion();
  const containerVariants = {
    hidden: {},
    show: {
      transition: {
        staggerChildren: reduceMotion ? 0 : staggerDelay,
      },
    },
  };

  return (
    <motion.div
      id={id}
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface StaggeredItemProps {
  children: React.ReactNode;
  className?: string;
}

export function StaggeredItem({ children, className }: StaggeredItemProps) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      variants={reduceMotion ? reducedItemVariants : itemVariants}
      className={className}
    >
      {children}
    </motion.div>
  );
}
