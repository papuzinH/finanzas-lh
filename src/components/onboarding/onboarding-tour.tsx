'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useFinanceStore } from '@/lib/store/financeStore'
import {
  useOnboardingStore,
  TOUR_ROUTE_ORDER,
  TOUR_STEPS_BY_ROUTE,
  TOUR_TOTAL_STEPS,
} from '@/lib/store/onboardingStore'

const SPOTLIGHT_PADDING = 8
const TOOLTIP_GAP = 12

function getTargetSelector(target: string): string {
  return `[data-tour="${target}"]`
}

function useTargetRect(target: string, active: boolean) {
  const [rect, setRect] = useState<DOMRect | null>(null)

  const update = useCallback(() => {
    const el = document.querySelector(getTargetSelector(target))
    if (el) {
      setRect(el.getBoundingClientRect())
    } else {
      setRect(null)
    }
  }, [target])

  useEffect(() => {
    if (!active) return

    let rafId: number
    const handleUpdate = () => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(update)
    }

    // Initial measurement via rAF to avoid sync setState in effect
    rafId = requestAnimationFrame(update)

    window.addEventListener('resize', handleUpdate)
    window.addEventListener('scroll', handleUpdate, true)

    // Poll while active; cleaned up when tour completes/skips/navigates
    const interval = setInterval(update, 200)

    return () => {
      window.removeEventListener('resize', handleUpdate)
      window.removeEventListener('scroll', handleUpdate, true)
      cancelAnimationFrame(rafId)
      clearInterval(interval)
    }
  }, [target, active, update])

  return rect
}

function buildClipPath(rect: DOMRect | null): string {
  if (!rect) return 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)'

  const p = SPOTLIGHT_PADDING
  const top = rect.top - p
  const left = rect.left - p
  const bottom = rect.bottom + p
  const right = rect.right + p

  return `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${left}px ${top}px, ${left}px ${bottom}px, ${right}px ${bottom}px, ${right}px ${top}px, ${left}px ${top}px)`
}

interface TooltipPosition {
  top: number
  left: number
  arrowSide: 'top' | 'bottom'
}

function computeTooltipPosition(
  rect: DOMRect,
  preferredPosition: 'top' | 'bottom',
  tooltipWidth: number,
  tooltipHeight: number
): TooltipPosition {
  const vw = window.innerWidth
  const vh = window.innerHeight

  let arrowSide: 'top' | 'bottom' = preferredPosition === 'top' ? 'bottom' : 'top'
  let top: number

  if (preferredPosition === 'top') {
    top = rect.top - SPOTLIGHT_PADDING - TOOLTIP_GAP - tooltipHeight
    if (top < 8) {
      top = rect.bottom + SPOTLIGHT_PADDING + TOOLTIP_GAP
      arrowSide = 'top'
    }
  } else {
    top = rect.bottom + SPOTLIGHT_PADDING + TOOLTIP_GAP
    if (top + tooltipHeight > vh - 8) {
      top = rect.top - SPOTLIGHT_PADDING - TOOLTIP_GAP - tooltipHeight
      arrowSide = 'bottom'
    }
  }

  let left = rect.left + rect.width / 2 - tooltipWidth / 2
  left = Math.max(12, Math.min(left, vw - tooltipWidth - 12))

  return { top, left, arrowSide }
}

/** Calcula el número de paso global (1-indexed) para mostrar "X de N" */
function getGlobalStepNumber(routeIndex: number, stepInRoute: number): number {
  let count = 0
  for (let i = 0; i < routeIndex; i++) {
    count += TOUR_STEPS_BY_ROUTE[TOUR_ROUTE_ORDER[i]].length
  }
  return count + stepInRoute + 1
}

export function OnboardingTour() {
  const router = useRouter()
  const pathname = usePathname()

  const transactions = useFinanceStore((s) => s.transactions)
  const isInitialized = useFinanceStore((s) => s.isInitialized)

  const {
    tourCompleted,
    tourSkipped,
    tourRouteIndex,
    tourStepInRoute,
    advanceTour,
    skipTour,
  } = useOnboardingStore()

  const tooltipRef = useRef<HTMLDivElement>(null)
  const [tooltipSize, setTooltipSize] = useState({ width: 288, height: 160 })
  const [isNavigating, setIsNavigating] = useState(false)

  const isNewUser = isInitialized && transactions.length === 0
  const isActive = isNewUser && !tourCompleted && !tourSkipped && !isNavigating

  // Ruta actual del tour
  const currentRoute = TOUR_ROUTE_ORDER[tourRouteIndex]
  const stepsForRoute = TOUR_STEPS_BY_ROUTE[currentRoute] ?? []
  const currentStepData = stepsForRoute[tourStepInRoute] ?? null

  // Sincronizar cuando el pathname cambia (después de navegación)
  useEffect(() => {
    if (!isNewUser || tourCompleted || tourSkipped) return
    const expectedRoute = TOUR_ROUTE_ORDER[tourRouteIndex]
    if (pathname === expectedRoute && isNavigating) {
      setIsNavigating(false)
    }
  }, [pathname, tourRouteIndex, isNewUser, tourCompleted, tourSkipped, isNavigating])

  const targetRect = useTargetRect(currentStepData?.target ?? '', isActive)

  useEffect(() => {
    if (tooltipRef.current) {
      const { offsetWidth, offsetHeight } = tooltipRef.current
      setTooltipSize({ width: offsetWidth, height: offsetHeight })
    }
  }, [tourStepInRoute, tourRouteIndex, targetRect])

  useEffect(() => {
    if (isActive) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [isActive])

  // Auto-scroll al elemento target
  useEffect(() => {
    if (!isActive || !currentStepData) return

    const el = document.querySelector(getTargetSelector(currentStepData.target))
    if (el) {
      const r = el.getBoundingClientRect()
      const inViewport = r.top >= 0 && r.bottom <= window.innerHeight
      if (!inViewport) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, [isActive, tourStepInRoute, tourRouteIndex, currentStepData])

  const handleNext = useCallback(() => {
    const nextRoute = advanceTour()
    if (nextRoute) {
      // Necesitamos navegar a otra ruta
      setIsNavigating(true)
      router.push(nextRoute)
    }
  }, [advanceTour, router])

  const handleSkip = useCallback(() => {
    skipTour()
  }, [skipTour])

  if (!isActive || !currentStepData) return null

  const clipPath = buildClipPath(targetRect)
  const globalStep = getGlobalStepNumber(tourRouteIndex, tourStepInRoute)
  const isLastStep = globalStep === TOUR_TOTAL_STEPS

  const tooltipPos = targetRect
    ? computeTooltipPosition(targetRect, currentStepData.position, tooltipSize.width, tooltipSize.height)
    : null

  return (
    <div className="fixed inset-0 z-9999" aria-live="polite">
      <motion.div
        className="absolute inset-0 bg-black/70"
        style={{ clipPath }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      />

      <AnimatePresence mode="wait">
        {targetRect && tooltipPos && (
          <motion.div
            key={`${tourRouteIndex}-${tourStepInRoute}`}
            ref={tooltipRef}
            initial={{ opacity: 0, y: tooltipPos.arrowSide === 'top' ? -10 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: tooltipPos.arrowSide === 'top' ? 10 : -10 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="absolute w-72 bg-indigo-600 text-white rounded-xl p-4 shadow-2xl"
            style={{
              top: tooltipPos.top,
              left: tooltipPos.left,
            }}
          >
            <div
              className="absolute w-3 h-3 bg-indigo-600 rotate-45"
              style={{
                ...(tooltipPos.arrowSide === 'top'
                  ? { top: -6 }
                  : { bottom: -6 }),
                left: targetRect
                  ? Math.min(
                      Math.max(
                        targetRect.left + targetRect.width / 2 - tooltipPos.left - 6,
                        16
                      ),
                      tooltipSize.width - 28
                    )
                  : '50%',
              }}
            />

            <p className="text-sm font-medium leading-snug mb-3">
              {currentStepData.text}
            </p>

            <div className="flex items-center justify-between">
              <span className="text-xs text-indigo-200">
                {globalStep} de {TOUR_TOTAL_STEPS}
              </span>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSkip}
                  className="text-xs text-indigo-300 hover:text-white transition-colors underline underline-offset-2"
                >
                  Saltar tour
                </button>
                <button
                  onClick={handleNext}
                  className="bg-white text-indigo-600 rounded-lg px-4 py-1.5 text-sm font-semibold hover:bg-indigo-50 transition-colors"
                >
                  {isLastStep ? 'Entendido' : 'Siguiente'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
