import { useLayoutEffect, useMemo, useState } from 'react'
import { toBig } from '@/lib/decimal'
import { formatDate, formatDateShort, formatMoney, parseLocalDate } from '@/lib/format'
import { axisMoneyFormatter, niceScale } from '../domain/chartScale'
import { refUnitLabel } from '../domain/priceStats'
import type { PriceRecord } from '../types'

const HEIGHT = 200
const FONT = 12
const PAD = { top: 12, right: 12, bottom: 30 }

/** Largura real do elemento, para desenhar o gráfico em pixels (texto sempre com 12 px). */
function useElementWidth(element: HTMLElement | null) {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    if (!element) return
    setWidth(Math.round(element.getBoundingClientRect().width))
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width
      if (next) setWidth(Math.round(next))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])
  return width
}

/**
 * Evolução do preço (por kg, L ou unidade) ao longo do tempo. Uma série só:
 * o título já diz o que é, então não há legenda. O histórico logo abaixo
 * funciona como tabela com os mesmos dados.
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
  // Ref por estado: a medição acontece sempre que a área do gráfico aparece.
  const [box, setBox] = useState<HTMLDivElement | null>(null)
  const width = useElementWidth(box)
  const [active, setActive] = useState<number | null>(null)

  const series = useMemo(() => {
    const ordered = [...records]
      .filter((r) => r.ref_unit === refUnit)
      .sort((a, b) => (a.recorded_on === b.recorded_on ? (a.created_at < b.created_at ? -1 : 1) : a.recorded_on < b.recorded_on ? -1 : 1))
    // Vários registros no mesmo dia viram um ponto só: o último anotado.
    const byDay = new Map<string, PriceRecord>()
    for (const record of ordered) byDay.set(record.recorded_on, record)
    return [...byDay.values()].map((record) => ({
      record,
      time: parseLocalDate(record.recorded_on).getTime(),
      value: Number(toBig(record.normalized_price).toString()),
    }))
  }, [records, refUnit])

  if (series.length < 2) return null

  const scale = niceScale(series.map((p) => p.value))
  const label = axisMoneyFormatter(scale.step)
  const tickLabels = scale.ticks.map(label)
  // Espaço à esquerda para o rótulo mais longo (estimativa de 7 px por caractere).
  const left = Math.max(...tickLabels.map((t) => t.length)) * 7 + 10
  const plotRight = Math.max(width - PAD.right, left + 1)
  const tMin = series[0]!.time
  const tMax = series[series.length - 1]!.time
  const x = (t: number) => (tMax === tMin ? (left + plotRight) / 2 : left + ((t - tMin) / (tMax - tMin)) * (plotRight - left))
  const y = (v: number) => PAD.top + (1 - (v - scale.lo) / (scale.hi - scale.lo)) * (HEIGHT - PAD.top - PAD.bottom)
  const points = series.map((p) => ({ ...p, x: x(p.time), y: y(p.value) }))
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const first = points[0]!
  const last = points[points.length - 1]!
  const shown = active !== null ? points[active] : null

  function pick(clientX: number) {
    if (!box) return
    const px = clientX - box.getBoundingClientRect().left
    let best = 0
    for (let i = 1; i < points.length; i += 1) {
      if (Math.abs(points[i]!.x - px) < Math.abs(points[best]!.x - px)) best = i
    }
    setActive(best)
  }

  const summary = `Preço por ${refUnitLabel(refUnit)} de ${formatMoney(first.value)} em ${formatDate(first.record.recorded_on)} para ${formatMoney(last.value)} em ${formatDate(last.record.recorded_on)}, em ${points.length} datas.`

  return (
    <figure className="rounded-[var(--radius-panel)] bg-card p-4 ring-1 ring-line">
      <figcaption className="font-semibold">Evolução do preço por {refUnitLabel(refUnit)}</figcaption>
      <div ref={setBox} className="relative mt-3" style={{ height: HEIGHT }}>
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            viewBox={`0 0 ${width} ${HEIGHT}`}
            className="block touch-pan-y select-none"
            role="img"
            aria-label={summary}
            onPointerMove={(e) => pick(e.clientX)}
            onPointerDown={(e) => pick(e.clientX)}
            onPointerLeave={(e) => {
              if (e.pointerType === 'mouse') setActive(null)
            }}
          >
            {scale.ticks.map((v, i) => (
              <g key={v}>
                <line x1={left} x2={plotRight} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth={1} />
                <text x={left - 8} y={y(v) + 4} textAnchor="end" fontSize={FONT} fill="var(--color-ink-2)" className="tabular">
                  {tickLabels[i]}
                </text>
              </g>
            ))}
            <text x={first.x} y={HEIGHT - 8} textAnchor="start" fontSize={FONT} fill="var(--color-ink-2)">
              {formatDateShort(first.record.recorded_on)}
            </text>
            <text x={last.x} y={HEIGHT - 8} textAnchor="end" fontSize={FONT} fill="var(--color-ink-2)">
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
                r={i === active ? 7 : 5}
                fill="var(--color-pen)"
                stroke="var(--color-card)"
                strokeWidth={2}
              />
            ))}
          </svg>
        )}
        {shown && (
          <div
            className="pointer-events-none absolute top-0 rounded-[var(--radius-field)] bg-night px-3 py-2 text-sm text-white shadow-[var(--shadow-float)]"
            style={{
              left: shown.x,
              transform: `translateX(${shown.x > width / 2 ? 'calc(-100% - 12px)' : '12px'})`,
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
