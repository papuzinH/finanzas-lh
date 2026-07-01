import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] font-sans font-bold transition-all active:translate-y-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:pointer-events-none disabled:opacity-50 cursor-pointer touch-manipulation [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:     "bg-accent text-accent-ink border-accent-deep shadow-offset",
        accent:      "bg-accent text-accent-ink border-accent-deep shadow-offset",
        navy:        "bg-hero text-cream-light border-hero shadow-offset",
        soft:        "bg-surface-2 text-text border-border hover:bg-surface",
        ghost:       "bg-transparent text-muted border-transparent hover:bg-surface-2 active:translate-y-0",
        destructive: "bg-bad text-cream-light border-[color:var(--btn-destructive-border)] shadow-offset",
        outline:     "bg-surface-2 text-text border-border hover:bg-surface",
        secondary:   "bg-surface-2 text-text border-border",
        link:        "bg-transparent text-accent border-transparent underline-offset-4 hover:underline active:translate-y-0",
      },
      size: {
        sm:        "h-8 px-4 text-[12px]",
        default:   "h-10 px-5 text-[13.5px]",
        lg:        "h-12 px-6 text-[15px]",
        icon:      "h-10 w-10 p-0",
        "icon-sm": "h-8 w-8 p-0",
        "icon-lg": "h-12 w-12 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
