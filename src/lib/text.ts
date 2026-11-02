/** Minúsculas e sem acentos, para buscas e comparações ("Feijão" → "feijao"). */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Todas as palavras da busca aparecem no texto (em qualquer ordem). */
export function matchesSearch(haystack: string, query: string): boolean {
  const q = normalizeText(query)
  if (!q) return true
  const h = normalizeText(haystack)
  return q.split(' ').every((word) => h.includes(word))
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })

export function compareText(a: string, b: string): number {
  return collator.compare(a, b)
}

export function capitalize(value: string): string {
  const trimmed = value.trim()
  return trimmed.charAt(0).toLocaleUpperCase('pt-BR') + trimmed.slice(1)
}
