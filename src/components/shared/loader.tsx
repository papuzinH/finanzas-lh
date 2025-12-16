'use client';

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface LoaderProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  centered?: boolean;
  text?: string;
}

const sizes = {
  sm: "h-4 w-4 border-2",
  md: "h-8 w-8 border-3",
  lg: "h-12 w-12 border-4",
  xl: "h-16 w-16 border-4",
};

export function Loader({ 
  className, 
  size = "md", 
  centered = false,
  text
}: LoaderProps) {
  const spinner = (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        {/* Background ring */}
        <div 
          className={cn(
            "rounded-full border-slate-800",
            sizes[size]
          )} 
        />
        {/* Spinning ring */}
        <motion.div
          className={cn(
            "absolute inset-0 rounded-full border-t-emerald-500 border-r-transparent border-b-transparent border-l-transparent",
            sizes[size],
            className
          )}
          animate={{ rotate: 360 }}
          transition={{
            duration: 1,
            repeat: Infinity,
            ease: "linear"
          }}
        />
      </div>
      {text && (
        <p className="text-sm text-slate-400 animate-pulse font-medium">
          {text}
        </p>
      )}
    </div>
  );

  if (centered) {
    return (
      <div className="flex h-full w-full min-h-[200px] items-center justify-center p-4">
        {spinner}
      </div>
    );
  }

  return spinner;
}

export function FullPageLoader({ text = "Cargando..." }: { text?: string }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 backdrop-blur-md">
      <Loader size="xl" text={text} />
    </div>
  );
}
