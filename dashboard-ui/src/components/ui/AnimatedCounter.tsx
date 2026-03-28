import { useEffect } from 'react'
import { useMotionValue, useTransform, animate, motion } from 'framer-motion'

interface AnimatedCounterProps {
  value: number
  duration?: number
  className?: string
  formatter?: (n: number) => string
}

const defaultFormatter = (n: number) => Math.round(n).toLocaleString()

export function AnimatedCounter({
  value,
  duration = 1.2,
  className,
  formatter = defaultFormatter,
}: AnimatedCounterProps) {
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const motionValue = useMotionValue(0)
  const formatted = useTransform(motionValue, (n) => formatter(n))

  useEffect(() => {
    if (prefersReducedMotion) {
      motionValue.set(value)
      return
    }
    const controls = animate(motionValue, value, { duration, ease: 'easeOut' })
    return () => controls.stop()
  }, [value, duration, prefersReducedMotion, motionValue])

  return <motion.span className={className}>{formatted}</motion.span>
}
