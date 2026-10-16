import type { ReactNode } from 'react'

import { cx } from '@/utils/cx'

import s from './common.module.css'

interface PanelProps {
  title: ReactNode
  actions?: ReactNode
  children: ReactNode
  /** Remove body padding (for lists that manage their own). */
  flush?: boolean
  className?: string
  bodyClassName?: string
}

export function Panel({ title, actions, children, flush = false, className, bodyClassName }: PanelProps) {
  return (
    <section className={cx(s.panel, className)}>
      <header className={s.panelHeader}>
        <h3 className={s.panelTitle}>{title}</h3>
        {actions}
      </header>
      <div className={cx(s.panelBody, flush && s.flush, bodyClassName)}>{children}</div>
    </section>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(s.card, className)}>{children}</div>
}
