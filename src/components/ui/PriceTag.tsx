import type { ReactNode } from 'react'
import { type Decimalish, roundCents, toBig } from '@/lib/decimal'
import { cn } from './cn'

/**
 * Etiqueta de preço no estilo das gôndolas de supermercado: reais grandes,
 * centavos menores e elevados. É o elemento de destaque da identidade
 * visual — usado só para o valor que mais importa em cada tela.
 */
export function PriceTag({
  value,
  label,
  caption,
  size = 'md',
  tone = 'tag',
  className,
}: {
  value: Decimalish | null | undefined
  label?: ReactNode
  caption?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  tone?: 'tag' | 'plain' | 'leaf'
  className?: string
}) {
  const { integer, cents } = splitMoney(value)
  const big = size === 'lg' ? 'text-[3.25rem]' : size === 'md' ? 'text-[2.375rem]' : 'text-[1.75rem]'
  const small = size === 'lg' ? 'text-[1.5rem]' : size === 'md' ? 'text-[1.125rem]' : 'text-[0.9375rem]'
  return (
    <div
      className={cn(
        'inline-flex flex-col rounded-[4px] px-3 pb-1.5 pt-1',
        tone === 'tag' && 'bg-tag text-tag-ink shadow-[inset_0_-3px_0_var(--color-tag-edge)]',
        tone === 'plain' && 'bg-card text-ink ring-1 ring-line',
        tone === 'leaf' && 'bg-leaf-soft text-leaf',
        className,
      )}
    >
      {label && <span className="text-[0.8125rem] font-semibold leading-tight opacity-80">{label}</span>}
      <span className="flex items-start font-tag font-bold leading-none tabular" aria-label={label ? undefined : `R$ ${integer},${cents}`}>
        <span className={cn(small, 'mr-1 mt-[0.35em] font-semibold')}>R$</span>
        <span className={cn(big, 'tracking-tight')}>{integer}</span>
        <span className={cn(small, 'mt-[0.2em]')}>,{cents}</span>
      </span>
      {caption && <span className="mt-0.5 text-[0.8125rem] leading-tight opacity-80">{caption}</span>}
    </div>
  )
}

function splitMoney(value: Decimalish | null | undefined): { integer: string; cents: string } {
  if (value === null || value === undefined || value === '') return { integer: '0', cents: '00' }
  const rounded = roundCents(toBig(value))
  const negative = rounded.lt(0)
  const [intPart, decPart = ''] = rounded.abs().toFixed(2).split('.')
  const integer = new Intl.NumberFormat('pt-BR').format(Number(intPart))
  return { integer: `${negative ? '−' : ''}${integer}`, cents: decPart.padEnd(2, '0') }
}
