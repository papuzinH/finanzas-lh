import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border-[1.5px] px-2.5 py-0.5 text-xs font-semibold font-sans transition-colors",
  {
    variants: {
      variant: {
        default:     "bg-accent text-accent-ink border-accent-deep",
        secondary:   "bg-surface-2 text-muted border-border",
        destructive: "bg-bad/10 text-bad border-bad/20",
        outline:     "bg-transparent text-text border-border",
        good:        "bg-good/10 text-good border-good/20",
        warn:        "bg-warn/10 text-warn border-warn/20",
        bad:         "bg-bad/10 text-bad border-bad/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
