import type { ReactNode } from 'react'

import { errorMessage } from '@/hooks/useAsync'
import { cx } from '@/utils/cx'

import { Button } from './Button'
import { IconAlert, IconInfo } from './icons'
import s from './common.module.css'

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span role="status" aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span className={s.spinner} />
      <span className="visually-hidden">{label}</span>
    </span>
  )
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className={s.state}>
      <span className={s.spinner} />
      <span>{label}</span>
    </div>
  )
}

export function EmptyState({ title, children, icon }: { title: ReactNode; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className={s.state}>
      <span className={s.stateIcon}>{icon ?? <IconInfo size={22} />}</span>
      <span className={s.stateTitle}>{title}</span>
      {children && <span>{children}</span>}
    </div>
  )
}

export function ErrorState({ error, title = 'Could not load data', onRetry }: { error: unknown; title?: ReactNode; onRetry?: () => void }) {
  return (
    <div className={s.state} role="alert">
      <span className={cx(s.stateIcon, s.error)}>
        <IconAlert size={22} />
      </span>
      <span className={s.stateTitle}>{title}</span>
      <span>{errorMessage(error)}</span>
      {onRetry && (
        <Button size="sm" onClick={onRetry} style={{ marginTop: 8 }}>
          Retry
        </Button>
      )}
    </div>
  )
}
