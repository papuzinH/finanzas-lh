'use client';

import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface MotionCardProps extends React.ComponentProps<typeof Card> {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export function MotionCard({ children, className, delay = 0, ...props }: MotionCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      whileHover={{ y: -5, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.98 }}
    >
      <Card className={cn("h-full transition-shadow hover:shadow-lg", className)} {...props}>
        {children}
      </Card>
    </motion.div>
  );
}
