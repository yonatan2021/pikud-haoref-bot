import { type CSSProperties } from 'react'

interface LiveDotProps {
  color?: 'green' | 'red' | 'amber'
  size?: 'sm' | 'md'
  className?: string
  'aria-label'?: string
}

const colorMap: Record<NonNullable<LiveDotProps['color']>, { bg: string; shadow: string }> = {
  green: { bg: 'bg-green',    shadow: '0 0 6px rgba(34,197,94,0.6)' },
  red:   { bg: 'bg-red-500',  shadow: '0 0 6px rgba(239,68,68,0.6)' },
  amber: { bg: 'bg-amber',    shadow: '0 0 6px rgba(245,158,11,0.6)' },
}

const defaultAriaLabel: Record<NonNullable<LiveDotProps['color']>, string> = {
  green: 'פעיל',
  red:   'לא פעיל',
  amber: 'אזהרה',
}

const sizeMap: Record<NonNullable<LiveDotProps['size']>, string> = {
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
}

export function LiveDot({ color = 'green', size = 'md', className = '', 'aria-label': ariaLabel }: LiveDotProps) {
  const { bg, shadow } = colorMap[color]
  const sizeClass = sizeMap[size]
  const style: CSSProperties = { boxShadow: shadow }

  const resolvedAriaLabel = ariaLabel !== undefined ? ariaLabel : defaultAriaLabel[color]
  const ariaProps = resolvedAriaLabel === ''
    ? { 'aria-hidden': true as const }
    : { 'aria-label': resolvedAriaLabel }

  return (
    <span
      className={`inline-block rounded-full animate-pulse ${bg} ${sizeClass} ${className}`}
      style={style}
      {...ariaProps}
    />
  )
}
