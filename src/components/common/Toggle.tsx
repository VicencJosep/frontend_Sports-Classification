import type { ReactNode } from 'react'

import { cx } from '@/utils/cx'

import s from './common.module.css'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  hint?: ReactNode
  disabled?: boolean
  /** Small colour square shown before the label (layer colour). */
  swatch?: string
}

export function Toggle({ checked, onChange, label, hint, disabled = false, swatch }: ToggleProps) {
  return (
    <label className={cx(s.toggle, disabled && s.disabled)}>
      <input
        type="checkbox"
        role="switch"
        className={s.toggleInput}
        checked={checked}
        disabled={disabled}
        aria-checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={s.track} aria-hidden="true" />
      <span className={s.toggleText}>
        <span>
          {swatch && <span className={s.swatch} style={{ background: swatch }} aria-hidden="true" />}
          {label}
        </span>
        {hint && <span className={s.toggleHint}>{hint}</span>}
      </span>
    </label>
  )
}
