import { ChevronDown, X } from 'lucide-react'
import { useState } from 'react'
import { IconButton } from '@/components/ui/Button'
import { cn } from '@/components/ui/cn'
import { DecimalField, MoneyField, SelectField, TextField } from '@/components/ui/Field'
import type { OptionEvaluation, OptionInput } from '../domain/compare'
import { CALC_UNIT_INFO, CALC_UNITS, type CalcUnit } from '../domain/units'

export function OptionCard({
  option,
  evaluation,
  canRemove,
  onChange,
  onRemove,
}: {
  option: OptionInput
  evaluation: OptionEvaluation | undefined
  canRemove: boolean
  onChange: (next: OptionInput) => void
  onRemove: () => void
}) {
  const [details, setDetails] = useState(Boolean(option.name || option.brand || option.packages))
  const letter = evaluation?.letter ?? '?'
  const set = <K extends keyof OptionInput>(key: K, value: OptionInput[K]) => onChange({ ...option, [key]: value })

  return (
    <fieldset
      className={cn(
        'rounded-[var(--radius-panel)] bg-card p-4 ring-1',
        evaluation?.state === 'invalid' ? 'ring-alert/40' : 'ring-line',
      )}
    >
      <legend className="sr-only">Opção {letter}</legend>
      <div className="flex items-center gap-3">
        <p className="flex min-w-0 items-center gap-2 text-lg font-bold" aria-hidden>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-pen font-tag text-lg text-white">{letter}</span>
          Opção {letter}
          {option.name && <span className="truncate text-base font-normal text-ink-2">{option.name}</span>}
        </p>
        {canRemove && (
          <IconButton label={`Remover opção ${letter}`} className="ml-auto -mr-2" onClick={onRemove}>
            <X className="size-5" />
          </IconButton>
        )}
      </div>
      <div className="mt-3 grid grid-cols-[1.1fr_1fr_auto] items-start gap-2">
        <MoneyField
          label="Preço da embalagem"
          value={option.price}
          onChange={(e) => set('price', e.target.value)}
          error={evaluation?.errors.price}
        />
        <DecimalField
          label="Conteúdo"
          value={option.content}
          onChange={(e) => set('content', e.target.value)}
          error={evaluation?.errors.content}
          placeholder="250"
        />
        <SelectField
          label="Unidade"
          value={option.unit}
          onChange={(e) => set('unit', e.target.value as CalcUnit)}
          className="w-[5.5rem]"
        >
          {CALC_UNITS.map((u) => (
            <option key={u} value={u}>
              {CALC_UNIT_INFO[u].option}
            </option>
          ))}
        </SelectField>
      </div>
      <button
        type="button"
        onClick={() => setDetails((v) => !v)}
        aria-expanded={details}
        className="mt-3 inline-flex min-h-10 items-center gap-1 font-semibold text-pen"
      >
        <ChevronDown className={cn('size-5 transition-transform', details && 'rotate-180')} aria-hidden />
        Nome, marca e quantidade de embalagens
      </button>
      {details && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <TextField label="Nome (opcional)" value={option.name} onChange={(e) => set('name', e.target.value)} maxLength={60} />
          <TextField label="Marca (opcional)" value={option.brand} onChange={(e) => set('brand', e.target.value)} maxLength={60} />
          <DecimalField
            containerClassName="col-span-2"
            label="Quantidade de embalagens (opcional)"
            hint="Para simular quanto custa levar várias."
            value={option.packages}
            onChange={(e) => set('packages', e.target.value)}
            error={evaluation?.errors.packages}
            inputMode="numeric"
            placeholder="1"
          />
        </div>
      )}
    </fieldset>
  )
}
