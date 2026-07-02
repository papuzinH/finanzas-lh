'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * Mini ícono de info que abre una explicación breve.
 * Desktop: hover. Mobile: tap. Se mantiene abierto al pasar al contenido.
 */
export function InfoHint({
  children,
  label = 'Más información',
  align = 'start',
  className,
}: {
  children: React.ReactNode;
  label?: string;
  align?: 'start' | 'center' | 'end';
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className={cn(
            'text-faint hover:text-muted transition-colors focus-visible:outline-none focus-visible:text-muted',
            className,
          )}
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        sideOffset={6}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="w-64 rounded-xl bg-surface border-[1.5px] border-border text-text p-3 shadow-card"
      >
        <p className="text-[11px] font-normal leading-relaxed text-muted">{children}</p>
      </PopoverContent>
    </Popover>
  );
}
