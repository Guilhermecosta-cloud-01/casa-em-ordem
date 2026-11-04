import { Plus } from 'lucide-react'
import { type FormEvent, useId, useMemo, useRef, useState } from 'react'
import { cn } from '@/components/ui/cn'
import { formatMoney } from '@/lib/format'
import { matchesSearch, normalizeText } from '@/lib/text'
import type { Product, ProductStats } from '@/modules/catalog/types'
import { getCategory } from '../categories'
import { parseQuickAdd, type QuickAddResult } from '../domain/quickAdd'

export type QuickAddChoice = { kind: 'text'; parsed: QuickAddResult } | { kind: 'product'; product: Product }

/**
 * Inclusão rápida: digite "3 arroz 5kg" e confirme, ou toque num produto do
 * catálogo. Fica presa ao rodapé para estar sempre à mão no mercado.
 */
export function QuickAddBar({
  products,
  stats,
  onAdd,
}: {
  products: Product[]
  stats: Map<string, ProductStats>
  onAdd: (choice: QuickAddChoice) => void
}) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  const parsed = useMemo(() => parseQuickAdd(text), [text])
  const suggestions = useMemo(() => {
    const query = parsed?.name ?? text
    if (normalizeText(query).length < 2) return []
    return products.filter((p) => matchesSearch(`${p.name} ${p.brand ?? ''}`, query)).slice(0, 5)
  }, [products, parsed, text])

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!parsed) return
    // Nome idêntico a um produto do catálogo: usa o cadastro.
    const exact = products.find(
      (p) => normalizeText(p.name) === normalizeText(parsed.name) && !p.brand,
    )
    if (exact && parsed.packages === null && parsed.quantity === null && parsed.unit === null) {
      onAdd({ kind: 'product', product: exact })
    } else {
      onAdd({ kind: 'text', parsed })
    }
    setText('')
    setOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 mt-4 lg:bottom-4">
      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Produtos do catálogo"
          className="mb-2 overflow-hidden rounded-[var(--radius-panel)] bg-card shadow-[var(--shadow-float)] ring-1 ring-line"
        >
          {suggestions.map((product) => {
            const s = stats.get(product.id)
            return (
              <li key={product.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left hover:bg-paper"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onAdd({ kind: 'product', product })
                    setText('')
                    setOpen(false)
                    inputRef.current?.focus()
                  }}
                >
                  <span aria-hidden>{getCategory(product.category).emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {product.name} {product.brand && <span className="font-normal text-ink-2">{product.brand}</span>}
                    </span>
                  </span>
                  {s && <span className="shrink-0 text-sm text-ink-2 tabular">{formatMoney(s.last_price)}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <form
        onSubmit={submit}
        className="flex items-center gap-2 rounded-full bg-card p-1.5 pl-5 shadow-[var(--shadow-float)] ring-1 ring-line"
      >
        <label className="sr-only" htmlFor={`${listId}-input`}>
          Adicionar item
        </label>
        <input
          id={`${listId}-input`}
          ref={inputRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          placeholder="Adicionar item, ex.: 3 arroz 5kg"
          autoComplete="off"
          enterKeyHint="done"
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={listId}
          className="min-h-12 min-w-0 flex-1 bg-transparent text-[1.0625rem] outline-none placeholder:text-ink-3"
        />
        <button
          type="submit"
          disabled={!parsed}
          aria-label="Adicionar"
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-full transition-colors',
            parsed ? 'bg-pen text-on-pen' : 'bg-line text-ink-3',
          )}
        >
          <Plus className="size-6" strokeWidth={2.6} />
        </button>
      </form>
    </div>
  )
}
