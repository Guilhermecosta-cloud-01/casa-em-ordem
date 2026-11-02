import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import { cn } from './cn'
import { Spinner } from './States'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet-danger'
type Size = 'md' | 'lg' | 'sm'

const base =
  'inline-flex items-center justify-center gap-2 rounded-[var(--radius-field)] font-semibold transition-colors select-none disabled:opacity-55 disabled:cursor-not-allowed'

const variants: Record<Variant, string> = {
  primary: 'bg-pen text-white hover:bg-pen-hover active:bg-pen-hover',
  secondary: 'bg-card text-pen border-[1.5px] border-pen-line hover:bg-pen-soft',
  ghost: 'bg-transparent text-pen hover:bg-pen-soft',
  danger: 'bg-alert text-white hover:brightness-95',
  'quiet-danger': 'bg-transparent text-alert hover:bg-alert-soft',
}

const sizes: Record<Size, string> = {
  sm: 'min-h-10 px-3 text-sm',
  md: 'min-h-12 px-4 text-base',
  lg: 'min-h-14 px-5 text-[1.0625rem]',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
  block?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(base, variants[variant], sizes[size], block && 'w-full', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner className="size-5" /> : icon}
      {children}
    </button>
  )
})

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  icon,
  block,
  className,
  children,
  ...rest
}: LinkProps & { variant?: Variant; size?: Size; icon?: ReactNode; block?: boolean }) {
  return (
    <Link className={cn(base, variants[variant], sizes[size], block && 'w-full', className)} {...rest}>
      {icon}
      {children}
    </Link>
  )
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  tone?: 'default' | 'pen' | 'danger'
  size?: 'md' | 'lg'
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, tone = 'default', size = 'md', className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40',
        size === 'lg' ? 'size-12' : 'size-11',
        tone === 'pen' && 'text-pen hover:bg-pen-soft',
        tone === 'danger' && 'text-alert hover:bg-alert-soft',
        tone === 'default' && 'text-ink-2 hover:bg-line/60',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
})
