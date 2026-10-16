import type { ComponentPropsWithoutRef } from 'react'
import { Link, type LinkProps } from 'react-router'

import { cx } from '@/utils/cx'

import s from './common.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

interface StyleProps {
  variant?: ButtonVariant
  size?: ButtonSize
  iconOnly?: boolean
}

function buttonClass({ variant = 'secondary', size = 'md', iconOnly = false }: StyleProps, className?: string): string {
  return cx(s.btn, s[variant], size === 'sm' && s.sm, iconOnly && s.iconOnly, className)
}

export type ButtonProps = ComponentPropsWithoutRef<'button'> & StyleProps

export function Button({ variant, size, iconOnly, className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={buttonClass({ variant, size, iconOnly }, className)} {...rest} />
}

export type LinkButtonProps = LinkProps & StyleProps

export function LinkButton({ variant, size, iconOnly, className, ...rest }: LinkButtonProps) {
  return <Link className={buttonClass({ variant, size, iconOnly }, className)} {...rest} />
}
