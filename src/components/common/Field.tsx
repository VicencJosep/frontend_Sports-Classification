import type { ComponentPropsWithoutRef, ReactNode } from 'react'

import { cx } from '@/utils/cx'

import s from './common.module.css'

interface FieldProps {
  label: ReactNode
  hint?: ReactNode
  htmlFor?: string
  children: ReactNode
  className?: string
}

export function Field({ label, hint, htmlFor, children, className }: FieldProps) {
  return (
    <div className={cx(s.field, className)}>
      <label className={s.fieldLabel} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <span className={s.fieldHint}>{hint}</span>}
    </div>
  )
}

export function TextInput({ className, ...rest }: ComponentPropsWithoutRef<'input'>) {
  return <input className={cx(s.input, className)} {...rest} />
}

export function Select({ className, ...rest }: ComponentPropsWithoutRef<'select'>) {
  return <select className={cx(s.select, className)} {...rest} />
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className={s.kbd}>{children}</kbd>
}
