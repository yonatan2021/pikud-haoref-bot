import { motion } from 'framer-motion'
import { type ReactNode, type KeyboardEvent } from 'react'
import { useReducedMotion } from 'framer-motion'

export type GlowVariant = 'amber' | 'blue' | 'green' | 'none'

interface GlassCardProps {
  children: ReactNode
  className?: string
  glow?: GlowVariant
  hoverable?: boolean
  onClick?: () => void
}

const glowBorderColor: Record<NonNullable<GlassCardProps['glow']>, string> = {
  amber: 'var(--color-border-glow)',
  blue:  'var(--color-border-glow-blue)',
  green: 'var(--color-border-glow-green)',
  none:  'var(--color-border)',
}

const glowBgColor: Record<NonNullable<GlassCardProps['glow']>, string> = {
  amber: 'var(--color-glow-amber)',
  blue:  'var(--color-glow-blue)',
  green: 'var(--color-glow-green)',
  none:  'var(--color-glass)',
}

export function GlassCard({
  children,
  className = '',
  glow = 'none',
  hoverable = false,
  onClick,
}: GlassCardProps) {
  const reducedMotion = useReducedMotion()

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      onClick()
    }
  }

  const accessibilityProps = onClick
    ? { role: 'button' as const, tabIndex: 0, onKeyDown: handleKeyDown }
    : {}

  const whileHoverProp =
    hoverable && !reducedMotion
      ? {
          scale: 1.015,
          borderColor: glowBorderColor[glow],
          backgroundColor: glowBgColor[glow],
        }
      : undefined

  return (
    <motion.div
      onClick={onClick}
      {...accessibilityProps}
      className={`backdrop-blur-md rounded-xl overflow-hidden ${className}`}
      style={{
        background: 'var(--color-glass)',
        border: '1px solid var(--color-border)',
      }}
      whileHover={whileHoverProp}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  )
}
