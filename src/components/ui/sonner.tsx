"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-good" />,
        info: <InfoIcon className="size-4 text-accent-deep" />,
        warning: <TriangleAlertIcon className="size-4 text-warn" />,
        error: <OctagonXIcon className="size-4 text-bad" />,
        loading: <Loader2Icon className="size-4 animate-spin text-accent-deep" />,
      }}
      style={
        {
          "--normal-bg": "var(--surface)",
          "--normal-text": "var(--text)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius-lg)",
          // richColors por tipo → tintes suaves de nuestros tokens (texto legible + ícono coloreado)
          "--success-bg": "color-mix(in srgb, var(--good) 10%, var(--surface))",
          "--success-border": "color-mix(in srgb, var(--good) 30%, var(--surface))",
          "--success-text": "var(--text)",
          "--error-bg": "color-mix(in srgb, var(--bad) 10%, var(--surface))",
          "--error-border": "color-mix(in srgb, var(--bad) 30%, var(--surface))",
          "--error-text": "var(--text)",
          "--warning-bg": "color-mix(in srgb, var(--warn) 12%, var(--surface))",
          "--warning-border": "color-mix(in srgb, var(--warn) 32%, var(--surface))",
          "--warning-text": "var(--text)",
          "--info-bg": "color-mix(in srgb, var(--accent) 10%, var(--surface))",
          "--info-border": "color-mix(in srgb, var(--accent) 30%, var(--surface))",
          "--info-text": "var(--text)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
