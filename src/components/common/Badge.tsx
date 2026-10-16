import type { CSSProperties, ReactNode } from 'react'

import { cx } from '@/utils/cx'

import s from './common.module.css'

export type BadgeTone = 'neutral' | 'accent' | 'info' | 'warning' | 'danger'

interface BadgeProps {
  children: ReactNode
  tone?: BadgeTone
  /** Hex colour for label-specific badges (events, actions). Overrides `tone`. */
  color?: string
  dot?: boolean
  pulse?: boolean
  className?: string
  title?: string
}

export function Badge({ children, tone = 'neutral', color, dot = false, pulse = false, className, title }: BadgeProps) {
  const style = color ? ({ '--badge-color': color } as CSSProperties) : undefined
  return (
    <span className={cx(s.badge, color ? s.custom : tone !== 'neutral' && s[tone], className)} style={style} title={title}>
      {dot && <span className={cx(s.dot, pulse && s.pulse)} />}
      {children}
    </span>
  )
}
