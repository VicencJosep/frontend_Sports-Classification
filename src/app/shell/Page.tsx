import type { ReactNode } from 'react'

import { cx } from '@/utils/cx'

import s from './AppShell.module.css'

interface PageProps {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}

/** Standard page frame: centred column with a title row. */
export function Page({ title, subtitle, actions, children, className }: PageProps) {
  return (
    <div className={cx(s.page, className)}>
      <header className={s.pageHeader}>
        <div className={s.pageTitle}>
          <h1>{title}</h1>
          {subtitle && <p className={s.pageSubtitle}>{subtitle}</p>}
        </div>
        {actions}
      </header>
      {children}
    </div>
  )
}
