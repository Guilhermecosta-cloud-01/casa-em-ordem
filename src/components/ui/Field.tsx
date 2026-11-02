import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from 'react'
import { cn } from './cn'

interface FieldShellProps {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  htmlFor: string
  className?: string
  children: ReactNode
  labelHidden?: boolean
}

export function FieldShell({ label, hint, error, htmlFor, className, children, labelHidden }: FieldShellProps) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className={cn('field-label', labelHidden && 'sr-only')}>
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="mt-1.5 text-sm font-medium text-alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="mt-1.5 text-sm text-ink-2">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

function describedBy(id: string, error?: string | null, hint?: ReactNode) {
  if (error) return `${id}-error`
  if (hint) return `${id}-hint`
  return undefined
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  labelHidden?: boolean
  containerClassName?: string
  prefix?: ReactNode
  suffix?: ReactNode
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, labelHidden, containerClassName, prefix, suffix, id, className, ...rest },
  ref,
) {
  const auto = useId()
  const inputId = id ?? auto
  const input = (
    <input
      ref={ref}
      id={inputId}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy(inputId, error, hint)}
      className={cn('field-input', prefix ? 'pl-11' : undefined, suffix ? 'pr-14' : undefined, className)}
      {...rest}
    />
  )
  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      htmlFor={inputId}
      className={containerClassName}
      labelHidden={labelHidden}
    >
      {prefix || suffix ? (
        <div className="relative">
          {prefix && (
            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center font-semibold text-ink-2">
              {prefix}
            </span>
          )}
          {input}
          {suffix && (
            <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-ink-2">
              {suffix}
            </span>
          )}
        </div>
      ) : (
        input
      )}
    </FieldShell>
  )
})

/** Campo numérico no padrão brasileiro (teclado numérico com vírgula no celular). */
export const DecimalField = forwardRef<HTMLInputElement, TextFieldProps>(function DecimalField(props, ref) {
  return <TextField ref={ref} inputMode="decimal" autoComplete="off" enterKeyHint="next" {...props} />
})

/** Valor em reais: prefixo "R$" e teclado numérico. */
export const MoneyField = forwardRef<HTMLInputElement, TextFieldProps>(function MoneyField(props, ref) {
  return <DecimalField ref={ref} prefix="R$" placeholder="0,00" {...props} />
})

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  containerClassName?: string
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, hint, error, containerClassName, id, className, rows = 3, ...rest },
  ref,
) {
  const auto = useId()
  const inputId = id ?? auto
  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={inputId} className={containerClassName}>
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, error, hint)}
        className={cn('field-input resize-y', className)}
        {...rest}
      />
    </FieldShell>
  )
})

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  labelHidden?: boolean
  containerClassName?: string
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, hint, error, labelHidden, containerClassName, id, className, children, ...rest },
  ref,
) {
  const auto = useId()
  const inputId = id ?? auto
  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      htmlFor={inputId}
      className={containerClassName}
      labelHidden={labelHidden}
    >
      <div className="relative">
        <select
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(inputId, error, hint)}
          className={cn('field-input appearance-none pr-10', className)}
          {...rest}
        >
          {children}
        </select>
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className="pointer-events-none absolute right-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-2"
        >
          <path d="M5.5 7.5 10 12l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>
    </FieldShell>
  )
})

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block font-semibold">{label}</span>
        {description && <span className="mt-0.5 block text-sm text-ink-2">{description}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
          checked ? 'bg-pen' : 'bg-line-strong',
        )}
      >
        <span
          className={cn(
            'inline-block size-6 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-7' : 'translate-x-1',
          )}
        />
      </button>
    </div>
  )
}
