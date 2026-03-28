import { motion } from 'framer-motion'
import { type ReactNode } from 'react'

interface GlassCardProps {
  children: ReactNode
  className?: string
  glow?: 'amber' | 'blue' | 'green' | 'none'
  hoverable?: boolean
  onClick?: () => void
}

const glowBorderColor: Record<NonNullable<GlassCardProps['glow']>, string> = {
  amber: 'var(--color-border-glow)',
  blue:  'rgba(59,130,246,0.35)',
  green: 'rgba(34,197,94,0.35)',
  none:  'var(--color-border)',
}

const glowBgColor: Record<NonNullable<GlassCardProps['glow']>, string> = {
  amber: 'var(--color-glow-amber)',
  blue:  'var(--color-glow-blue)',
  green: 'rgba(34,197,94,0.08)',
  none:  'var(--color-glass)',
}

export function GlassCard({
  children,
  className = '',
  glow = 'none',
  hoverable = false,
  onClick,
}: GlassCardProps) {
  return (
    <motion.div
      onClick={onClick}
      className={`backdrop-blur-md rounded-xl overflow-hidden ${className}`}
      style={{
        background: 'var(--color-glass)',
        border: '1px solid var(--color-border)',
      }}
      whileHover={
        hoverable
          ? {
              scale: 1.01,
              borderColor: glowBorderColor[glow],
              backgroundColor: glowBgColor[glow],
            }
          : { scale: 1 }
      }
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  )
}
