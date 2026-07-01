"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"

interface PullToRefreshProps {
  onRefresh: () => Promise<void>
  children: React.ReactNode
  threshold?: number // pixels para activar refresh (default 80)
}

export function PullToRefresh({ onRefresh, children, threshold = 80 }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isTriggered, setIsTriggered] = useState(false)
  const startY = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = useCallback((e: TouchEvent) => {
    // Solo activar si estamos en el top del scroll
    if (window.scrollY === 0) {
      startY.current = e.touches[0].clientY
    }
  }, [])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (startY.current === null || isRefreshing) return
    if (window.scrollY > 0) {
      startY.current = null
      return
    }

    const currentY = e.touches[0].clientY
    const distance = Math.max(0, currentY - startY.current)

    if (distance > 0) {
      e.preventDefault()
      // Resistencia: los primeros 80px son 1:1, después se frena
      const resistance = distance < threshold ? distance : threshold + (distance - threshold) * 0.3
      setPullDistance(Math.min(resistance, threshold * 1.5))
      setIsTriggered(distance >= threshold)
    }
  }, [isRefreshing, threshold])

  const handleTouchEnd = useCallback(async () => {
    if (startY.current === null) return

    if (isTriggered && !isRefreshing) {
      setIsRefreshing(true)
      setPullDistance(50) // Mantener indicador visible
      try {
        await onRefresh()
      } finally {
        setIsRefreshing(false)
        setIsTriggered(false)
      }
    }

    setPullDistance(0)
    startY.current = null
  }, [isTriggered, isRefreshing, onRefresh])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchmove', handleTouchMove, { passive: false })
    el.addEventListener('touchend', handleTouchEnd)

    return () => {
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', handleTouchEnd)
    }
  }, [handleTouchStart, handleTouchMove, handleTouchEnd])

  const indicatorOpacity = Math.min(pullDistance / threshold, 1)

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Indicador de pull */}
      <div
        className="absolute left-0 right-0 flex justify-center items-center pointer-events-none z-50 transition-all duration-200"
        style={{
          top: -48,
          transform: `translateY(${pullDistance}px)`,
          opacity: indicatorOpacity,
        }}
      >
        <div className={cn(
          "bg-surface border border-border rounded-full p-2 shadow-lg",
          isTriggered && "border-good"
        )}>
          <RefreshCw
            className={cn(
              "h-4 w-4 transition-colors",
              isTriggered ? "text-good" : "text-muted",
              isRefreshing && "animate-spin"
            )}
            style={{
              transform: isRefreshing ? undefined : `rotate(${Math.floor((pullDistance / threshold) * 360)}deg)`
            }}
          />
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined,
          transition: pullDistance === 0 ? 'transform 0.3s ease' : undefined,
        }}
      >
        {children}
      </div>
    </div>
  )
}
