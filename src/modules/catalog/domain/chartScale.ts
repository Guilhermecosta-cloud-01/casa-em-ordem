/**
 * Escala "redonda" para o eixo de preços do gráfico: em vez de marcas como
 * R$ 36,30 / R$ 42,80, usa passos de 1, 2, 2,5 ou 5 (× potência de 10), como
 * R$ 35 / R$ 40 / R$ 45 / R$ 50. Nunca abaixo de zero e nunca menor que um
 * centavo, para não repetir rótulos.
 */
export interface NiceScale {
  lo: number
  hi: number
  step: number
  ticks: number[]
}

const round2 = (v: number) => Math.round(v * 100) / 100

export function niceScale(values: number[], intervals = 3): NiceScale {
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { lo: 0, hi: 1, step: 1, ticks: [0, 1] }
  if (min === max) {
    const pad = Math.max(Math.abs(max) * 0.1, 1)
    min -= pad
    max += pad
  }
  const raw = (max - min) / intervals
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const normalized = raw / magnitude
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10
  const step = Math.max(round2(nice * magnitude), 0.01)
  const lo = Math.max(0, round2(Math.floor(round2(min / step)) * step))
  const hi = round2(Math.ceil(round2(max / step)) * step)
  const ticks: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(round2(v))
  return { lo, hi, step, ticks }
}

/** "R$ 35" quando todas as marcas são inteiras; "R$ 4,60" nos demais casos. */
export function axisMoneyFormatter(step: number): (value: number) => string {
  const decimals = Number.isInteger(step) ? 0 : 2
  const format = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return (value) => format.format(value)
}
