'use client';

import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface ActionSheetAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  variant?: 'default' | 'destructive';
  disabled?: boolean;
  disabledHint?: string;
}

interface ActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  actions: ActionSheetAction[];
}

/**
 * Bottom sheet de acciones (mobile-first). Reutiliza Dialog/DialogContent:
 * foco atrapado, Escape y restauración del foco ya vienen de Radix.
 */
export function ActionSheet({ open, onOpenChange, title, actions }: ActionSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[380px] bg-surface border-border text-text p-4"
      >
        <DialogHeader className="px-2 pt-1 pb-2">
          <DialogTitle className="text-sm font-bold text-muted truncate">{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              disabled={action.disabled}
              onClick={() => {
                if (action.disabled) return;
                action.onClick();
                onOpenChange(false);
              }}
              className={cn(
                'flex items-center gap-3 min-h-11 w-full rounded-xl px-4 py-3 text-left text-sm font-semibold transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                action.disabled
                  ? 'text-muted cursor-not-allowed opacity-70'
                  : action.variant === 'destructive'
                    ? 'text-bad hover:bg-bad/10 active:bg-bad/15'
                    : 'text-text hover:bg-surface-2 active:bg-surface-2'
              )}
            >
              {action.icon}
              <span className="flex flex-col">
                {action.label}
                {action.disabled && action.disabledHint && (
                  <span className="text-xs font-normal text-muted">{action.disabledHint}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
