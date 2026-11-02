/**
 * Marca: uma casa desenhada como etiqueta de preço — telhado azul-caneta,
 * corpo amarelo-etiqueta com o furo do barbante — e um visto de "comprado".
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="16" fill="#2340A8" />
      <path d="M32 11 10 29.5h6V51h32V29.5h6L32 11Z" fill="#FFD84A" />
      <circle cx="32" cy="27" r="3.4" fill="#2340A8" />
      <path
        d="m23.5 39.5 6 5.5 11-12"
        fill="none"
        stroke="#16213B"
        strokeWidth="4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function BrandLockup() {
  return (
    <div className="flex items-center gap-3">
      <BrandMark className="size-12" />
      <div className="leading-tight">
        <p className="text-xl font-bold">Casa em Ordem</p>
        <p className="text-sm text-ink-2">Compras da família, em dia</p>
      </div>
    </div>
  )
}
