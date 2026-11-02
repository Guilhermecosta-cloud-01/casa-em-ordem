import { useMemo, useRef, useState } from 'react'
import { toBig } from '@/lib/decimal'
import { formatDate, formatDateShort, formatMoney, parseLocalDate } from '@/lib/format'
import { refUnitLabel } from '../domain/priceStats'
import type { PriceRecord } from '../types'

const WIDTH = 640
const HEIGHT = 200
const PAD = { top: 16, right: 16, bottom: 28, left: 56 }

/**
 * Evolução do preço (por kg, L ou unidade) ao longo do tempo. Uma série só:
 * o título já diz o que é, então não há legenda. A lista de registros logo
 * abaixo funciona como tabela com os mesmos dados.
 */
export function PriceChart({
  records,
  refUnit,
  storeName,
}: {
  records: PriceRecord[]
  refUnit: string
  storeName: (id: string | null) => string | null
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [active, setActive] = useState<number | null>(null)

  const points = useMemo(() => {
    const sorted = [...records]
      .filter((r) => r.ref_unit === refUnit)
      .sort((a, b) => (a.recorded_on === b.recorded_on ? (a.created_at < b.created_at ? -1 : 1) : a.recorded_on < b.recorded_on ? -1 : 1))
    if (sorted.length < 2) return []
    const times = sorted.map((r) => parseLocalDate(r.recorded_on).getTime())
    const values = sorted.map((r) => Number(toBig(r.normalized_price).toString()))
    const tMin = Math.min(...times)
    const tMax = Math.max(...times)
    const vMin = Math.min(...values)
    const vMax = Math.max(...values)
    const vPad = vMax === vMin ? Math.max(vMax * 0.1, 1) : (vMax - vMin) * 0.15
    const lo = Math.max(0, vMin - vPad)
    const hi = vMax + vPad
    const x = (t: number) =>
      tMax === tMin ? (PAD.left + WIDTH - PAD.right) / 2 : PAD.left + ((t - tMin) / (tMax - tMin)) * (WIDTH - PAD.left - PAD.right)
    const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (HEIGHT - PAD.top - PAD.bottom)
    return sorted.map((record, i) => ({
      record,
      x: x(times[i]!),
      y: y(values[i]!),
      value: values[i]!,
      ticks: { lo, hi, y },
    }))
  }, [records, refUnit])

  if (points.length < 2) return null
  const { lo, hi, y } = points[0]!.ticks
  const gridValues = [lo, (lo + hi) / 2, hi]
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const first = points[0]!
  const last = points[points.length - 1]!
  const shown = active !== null ? points[active] : null

  function pick(clientX: number) {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const vx = ((clientX - rect.left) / rect.width) * WIDTH
    let best = 0
    for (let i = 1; i < points.length; i += 1) {
      if (Math.abs(points[i]!.x - vx) < Math.abs(points[best]!.x - vx)) best = i
    }
    setActive(best)
  }

  const summary = `Preço por ${refUnitLabel(refUnit)} de ${formatMoney(first.value)} em ${formatDate(first.record.recorded_on)} para ${formatMoney(last.value)} em ${formatDate(last.record.recorded_on)}, em ${points.length} registros.`

  return (
    <figure className="rounded-[var(--radius-panel)] bg-card p-4 ring-1 ring-line">
      <figcaption className="font-semibold">Evolução do preço por {refUnitLabel(refUnit)}</figcaption>
      <div className="relative mt-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-auto w-full touch-pan-y select-none"
          role="img"
          aria-label={summary}
          onPointerMove={(e) => pick(e.clientX)}
          onPointerDown={(e) => pick(e.clientX)}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') setActive(null)
          }}
        >
          {gridValues.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" fontSize={12} fill="var(--color-ink-2)" className="tabular">
                {formatMoney(v)}
              </text>
            </g>
          ))}
          <text x={first.x} y={HEIGHT - 8} textAnchor="start" fontSize={12} fill="var(--color-ink-2)">
            {formatDateShort(first.record.recorded_on)}
          </text>
          <text x={last.x} y={HEIGHT - 8} textAnchor="end" fontSize={12} fill="var(--color-ink-2)">
            {formatDateShort(last.record.recorded_on)}
          </text>
          {shown && (
            <line x1={shown.x} x2={shown.x} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke="var(--color-ink-3)" strokeWidth={1} strokeDasharray="3 3" />
          )}
          <path d={path} fill="none" stroke="var(--color-pen)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => (
            <circle
              key={p.record.id}
              cx={p.x}
              cy={p.y}
              r={i === active ? 6 : 4.5}
              fill="var(--color-pen)"
              stroke="var(--color-card)"
              strokeWidth={2}
            />
          ))}
        </svg>
        {shown && (
          <div
            className="pointer-events-none absolute top-0 rounded-[var(--radius-field)] bg-ink px-3 py-2 text-sm text-white shadow-[var(--shadow-float)]"
            style={{
              left: `${(shown.x / WIDTH) * 100}%`,
              transform: `translateX(${shown.x > WIDTH / 2 ? 'calc(-100% - 10px)' : '10px'})`,
            }}
            role="status"
          >
            <p className="font-semibold tabular">
              {formatMoney(shown.value)}/{refUnitLabel(refUnit)}
            </p>
            <p className="opacity-85">
              {formatDate(shown.record.recorded_on)}
              {storeName(shown.record.store_id) ? `, ${storeName(shown.record.store_id)}` : ''}
            </p>
          </div>
        )}
      </div>
    </figure>
  )
}
