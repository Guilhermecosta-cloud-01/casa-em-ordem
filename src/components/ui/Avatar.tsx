import { cn } from './cn'

const PALETTE = ['#2340a8', '#1d7549', '#8f5300', '#7a3e9d', '#b42318', '#0f6e7a', '#5b4636']

function colorFor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return PALETTE[Math.abs(hash) % PALETTE.length]!
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0]!.charAt(0)
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : ''
  return (first + last).toLocaleUpperCase('pt-BR')
}

export function Avatar({
  name,
  src,
  seed,
  size = 'md',
  className,
}: {
  name: string
  src?: string | null
  seed?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}) {
  const dims = {
    xs: 'size-6 text-[0.625rem]',
    sm: 'size-8 text-xs',
    md: 'size-10 text-sm',
    lg: 'size-14 text-lg',
    xl: 'size-24 text-3xl',
  }[size]
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={cn('shrink-0 rounded-full object-cover ring-2 ring-card', dims, className)}
        draggable={false}
      />
    )
  }
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ring-2 ring-card', dims, className)}
      style={{ backgroundColor: colorFor(seed ?? name) }}
    >
      {initials(name)}
    </span>
  )
}
