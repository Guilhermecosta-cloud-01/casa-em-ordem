import { Award } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { PriceTag } from '@/components/ui/PriceTag'
import { Notice } from '@/components/ui/States'
import { formatMoney, formatNumber, formatPercent } from '@/lib/format'
import { type ComparisonResult, optionSubject } from '../domain/compare'
import type { SimulationResult } from '../domain/simulate'
import { describeAmount, describeBaseAmount } from '../domain/units'

const REF_WORD = { mass: 'kg', volume: 'litro', count: 'unidade' } as const

export function ComparisonResults({ result }: { result: ComparisonResult }) {
  if (result.status !== 'ready' || !result.dimension) {
    return (
      <Notice tone={result.status === 'incomplete' ? 'info' : 'warn'}>
        <span role="status">{result.message}</span>
      </Notice>
    )
  }
  const refWord = REF_WORD[result.dimension]
  return (
    <div className="space-y-4">
      <p
        role="status"
        className="rounded-[var(--radius-panel)] bg-ink px-4 py-4 text-[1.0625rem] font-semibold leading-snug text-white"
      >
        {result.message}
      </p>
      <ol className="space-y-3" aria-label="Opções do melhor para o pior custo-benefício">
        {result.rows.map((row) => {
          const o = row.option
          const subject = optionSubject(o, result.options)
          return (
            <li
              key={o.id}
              className={cn(
                'rounded-[var(--radius-panel)] bg-card p-4 ring-1',
                row.isBest ? 'ring-2 ring-tag-edge' : 'ring-line',
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-bold">
                    <span
                      className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-full font-tag text-base',
                        row.isBest ? 'bg-tag text-tag-ink' : 'bg-line text-ink',
                      )}
                    >
                      {o.letter}
                    </span>
                    <span className="truncate">{subject.charAt(0).toUpperCase() + subject.slice(1)}</span>
                  </p>
                  <p className="mt-1 text-sm text-ink-2 tabular">
                    {formatMoney(o.price!)} por {describeAmount(o.content!, o.input.unit, formatNumber)}
                    {o.convertedWithDensity && ` (≈ ${describeBaseAmount(o.contentBase!, 'mass', formatNumber)})`}
                  </p>
                </div>
                {row.isBest ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-tag px-2.5 py-1 text-sm font-bold text-tag-ink">
                    <Award className="size-4" aria-hidden />
                    {result.isTie ? 'Empate' : 'Melhor custo-benefício'}
                  </span>
                ) : (
                  <span className="text-sm font-semibold text-ink-2">{row.rank}º lugar</span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-3">
                <PriceTag
                  value={row.metrics[0]!.value}
                  caption={`por ${row.metrics[0]!.label}`}
                  size="md"
                  tone={row.isBest ? 'tag' : 'plain'}
                />
                <dl className="space-y-0.5 text-[0.9375rem]">
                  {row.metrics.slice(1).map((m) => (
                    <div key={m.label} className="flex gap-2">
                      <dt className="text-ink-2">por {m.label}</dt>
                      <dd className="font-semibold tabular">{formatMoney(m.value)}</dd>
                    </div>
                  ))}
                  {!row.isBest && (
                    <>
                      <div className="flex gap-2">
                        <dt className="text-ink-2">Diferença</dt>
                        <dd className="font-semibold text-alert tabular">
                          +{formatMoney(row.differencePerReference)} por {refWord}
                        </dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-ink-2">A melhor economiza</dt>
                        <dd className="font-semibold text-leaf tabular">{formatPercent(row.savingsPercent)}</dd>
                      </div>
                    </>
                  )}
                </dl>
              </div>
              {o.packages && o.packages.gt(1) && (
                <p className="mt-3 rounded-lg bg-paper px-3 py-2 text-[0.9375rem]">
                  Levando {formatNumber(o.packages)} embalagens: <strong className="tabular">{formatMoney(o.totalPrice!)}</strong> por{' '}
                  {describeBaseAmount(o.totalContentBase!, result.dimension!, formatNumber)}.
                </p>
              )}
            </li>
          )
        })}
      </ol>
      {result.notes.length > 0 && (
        <ul className="space-y-2 text-[0.9375rem] text-ink-2">
          {result.notes.map((note) => (
            <li key={note} className="rounded-[var(--radius-field)] bg-card px-4 py-3 ring-1 ring-line">
              {note}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function SimulationResults({ simulation, result }: { simulation: SimulationResult; result: ComparisonResult }) {
  if (simulation.status !== 'ready' || !result.dimension) {
    if (simulation.error) return <p className="text-sm font-medium text-alert">{simulation.error}</p>
    return simulation.message ? <p className="text-ink-2">{simulation.message}</p> : null
  }
  const dimension = result.dimension
  return (
    <div className="space-y-3">
      <p className="rounded-[var(--radius-panel)] bg-pen-soft px-4 py-3 font-semibold leading-snug">{simulation.message}</p>
      <div className="overflow-x-auto rounded-[var(--radius-panel)] bg-card ring-1 ring-line">
        <table className="w-full min-w-[34rem] text-left text-[0.9375rem]">
          <caption className="sr-only">Custo para comprar {simulation.targetLabel} com cada opção</caption>
          <thead className="text-sm text-ink-2">
            <tr className="border-b border-line">
              <th scope="col" className="px-4 py-2.5 font-semibold">Opção</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Proporcional</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Embalagens</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">No caixa</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Sobra</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {simulation.rows.map((row) => {
              const cheapest = simulation.cheapestRealIds.includes(row.option.id)
              return (
                <tr key={row.option.id} className={cn('border-b border-line last:border-0', cheapest && 'bg-leaf-soft/60')}>
                  <th scope="row" className="px-4 py-3 font-bold">
                    {row.option.letter}
                    {row.option.input.name && <span className="block text-sm font-normal text-ink-2">{row.option.input.name}</span>}
                  </th>
                  <td className="px-3 py-3">{formatMoney(row.theoreticalCost)}</td>
                  <td className="px-3 py-3">{row.packagesNeeded}</td>
                  <td className={cn('px-3 py-3 font-semibold', cheapest && 'text-leaf')}>{formatMoney(row.realCost)}</td>
                  <td className="px-4 py-3">
                    {row.leftoverBase.gt(0) ? describeBaseAmount(row.leftoverBase, dimension, formatNumber) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-ink-2">
        "Proporcional" é o custo teórico da quantidade exata. "No caixa" é o que se paga levando embalagens inteiras.
      </p>
    </div>
  )
}
