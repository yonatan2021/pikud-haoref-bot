import { useEffect } from 'react'
import { useMotionValue, useTransform, animate, motion, useReducedMotion } from 'framer-motion'

interface AnimatedCounterProps {
  value: number
  duration?: number
  className?: string
  formatter?: (n: number) => string
  'aria-label'?: string
}

const defaultFormatter = (n: number) => Math.round(n).toLocaleString()

export function AnimatedCounter({
  value,
  duration = 1.2,
  className,
  formatter = defaultFormatter,
  'aria-label': ariaLabel,
}: AnimatedCounterProps) {
  const reducedMotion = useReducedMotion()

  const motionValue = useMotionValue(0)
  const formatted = useTransform(motionValue, (n) => formatter(n))

  useEffect(() => {
    if (reducedMotion) {
      motionValue.set(value)
      return
    }
    const controls = animate(motionValue, value, { duration, ease: 'easeOut' })
    return () => controls.stop()
  }, [value, duration, reducedMotion, motionValue])

  return <motion.span className={className} aria-label={ariaLabel}>{formatted}</motion.span>
}
