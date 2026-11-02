import { useQueryClient } from '@tanstack/react-query'
import { Bookmark, Eraser, Plus, Star } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { PageBody, PageHeader } from '@/app/AppLayout'
import { Button, ButtonLink } from '@/components/ui/Button'
import { DecimalField, SelectField, Switch, TextField } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/lib/errors'
import { newId } from '@/lib/id'
import { useActiveFamily } from '@/modules/family/FamilyProvider'
import { type ComparisonPayload, fetchComparison, sanitizePayload, saveComparison } from '../api'
import { OptionCard } from '../components/OptionCard'
import { ComparisonResults, SimulationResults } from '../components/Results'
import { compareOptions, type OptionInput } from '../domain/compare'
import { simulateEquivalent } from '../domain/simulate'
import { CALC_UNIT_INFO, CALC_UNITS, type CalcUnit, isCalcUnit } from '../domain/units'

interface CalcState {
  title: string
  productId: string | null
  options: OptionInput[]
  density: string
  target: { amount: string; unit: CalcUnit }
}

const STORAGE_KEY = 'casa-em-ordem-calculadora'
const MAX_OPTIONS = 6

function emptyOption(unit: CalcUnit = 'g'): OptionInput {
  return { id: newId(), name: '', brand: '', price: '', content: '', unit, packages: '' }
}

function defaultState(): CalcState {
  return { title: '', productId: null, options: [emptyOption(), emptyOption()], density: '', target: { amount: '', unit: 'g' } }
}

function readStored(): CalcState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CalcState & { payload?: unknown }
    const payload = sanitizePayload({ options: parsed.options, density: parsed.density, target: parsed.target })
    if (!payload) return null
    return { title: parsed.title ?? '', productId: parsed.productId ?? null, options: payload.options, density: payload.density, target: payload.target }
  } catch {
    return null
  }
}

function stateFromParams(params: URLSearchParams): CalcState | null {
  if (!params.has('nome') && !params.has('preco') && !params.has('conteudo')) return null
  const unitParam = params.get('unidade')
  const unit: CalcUnit = isCalcUnit(unitParam) ? unitParam : 'g'
  const first: OptionInput = {
    ...emptyOption(unit),
    name: params.get('nome') ?? '',
    brand: params.get('marca') ?? '',
    price: params.get('preco') ?? '',
    content: params.get('conteudo') ?? '',
  }
  return {
    title: params.get('nome') ?? '',
    productId: params.get('produto'),
    options: [first, emptyOption(unit)],
    density: '',
    target: { amount: '', unit },
  }
}

export function CalculatorPage() {
  const family = useActiveFamily()
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [state, setState] = useState<CalcState>(() => stateFromParams(params) ?? readStored() ?? defaultState())
  const [saving, setSaving] = useState(false)

  // Prefill vindo de um item/produto: aplica uma vez e limpa o endereço.
  useEffect(() => {
    const fromParams = stateFromParams(params)
    if (fromParams) {
      setState(fromParams)
      setParams({}, { replace: true })
      return
    }
    const savedId = params.get('salva')
    if (savedId) {
      setParams({}, { replace: true })
      fetchComparison(savedId)
        .then((saved) => {
          const payload = saved ? sanitizePayload(saved.payload) : null
          if (!saved || !payload) {
            toast.error('Comparação não encontrada.')
            return
          }
          setState({ title: saved.title, productId: saved.product_id, ...payload })
        })
        .catch((e) => toast.error(errorMessage(e)))
    }
  }, [params, setParams, toast])

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // ignore
    }
  }, [state])

  const result = useMemo(() => compareOptions({ options: state.options, density: state.density }), [state.options, state.density])
  const simulation = useMemo(
    () => simulateEquivalent(result, { amount: state.target.amount, unit: state.target.unit, density: state.density }),
    [result, state.target, state.density],
  )
  const evaluationById = useMemo(() => new Map(result.options.map((o) => [o.id, o])), [result.options])

  const setOption = (id: string, next: OptionInput) =>
    setState((s) => {
      const options = s.options.map((o) => (o.id === id ? next : o))
      // Mantém a unidade da simulação compatível com as opções.
      const firstUnit = options[0]!.unit
      const sameDimension = CALC_UNIT_INFO[s.target.unit].dimension === CALC_UNIT_INFO[firstUnit].dimension
      return { ...s, options, target: sameDimension || s.target.amount ? s.target : { ...s.target, unit: firstUnit } }
    })

  function clear() {
    const previous = state
    setState(defaultState())
    toast.info('Campos limpos.', { label: 'Desfazer', onClick: () => setState(previous) })
  }

  const payload: ComparisonPayload = { version: 1, options: state.options, density: state.density, target: state.target }

  return (
    <>
      <PageHeader
        title="Calculadora"
        subtitle="Preço por quantidade e custo-benefício"
        actions={
          <ButtonLink to="/calculadora/salvas" variant="ghost" size="sm" icon={<Bookmark className="size-5" />}>
            Salvas
          </ButtonLink>
        }
      />
      <PageBody className="space-y-6">
        <TextField
          label="O que vocês estão comparando? (opcional)"
          placeholder="Ex.: café, sabão em pó"
          value={state.title}
          onChange={(e) => setState((s) => ({ ...s, title: e.target.value }))}
          maxLength={80}
        />

        <section aria-label="Opções" className="space-y-3">
          {state.options.map((option) => (
            <OptionCard
              key={option.id}
              option={option}
              evaluation={evaluationById.get(option.id)}
              canRemove={state.options.length > 2}
              onChange={(next) => setOption(option.id, next)}
              onRemove={() => setState((s) => ({ ...s, options: s.options.filter((o) => o.id !== option.id) }))}
            />
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={<Plus className="size-5" />}
              disabled={state.options.length >= MAX_OPTIONS}
              onClick={() =>
                setState((s) => ({ ...s, options: [...s.options, emptyOption(s.options[s.options.length - 1]?.unit)] }))
              }
            >
              Adicionar opção
            </Button>
            <Button variant="ghost" icon={<Eraser className="size-5" />} onClick={clear}>
              Limpar
            </Button>
          </div>
        </section>

        {result.needsDensity && (
          <section className="rounded-[var(--radius-panel)] bg-amber-soft p-4">
            <DecimalField
              label="Densidade do produto (g por mL)"
              hint="Só preencha se souber o valor exato (consta em alguns rótulos). Ex.: óleo de soja ≈ 0,92."
              value={state.density}
              onChange={(e) => setState((s) => ({ ...s, density: e.target.value }))}
              error={result.densityError}
            />
          </section>
        )}

        <section aria-labelledby="result-title" className="space-y-3">
          <h2 id="result-title" className="text-lg font-bold">
            Resultado
          </h2>
          <ComparisonResults result={result} />
        </section>

        {result.status === 'ready' && (
          <section aria-labelledby="sim-title" className="space-y-3">
            <h2 id="sim-title" className="text-lg font-bold">
              Quanto custa a quantidade que vocês precisam?
            </h2>
            <div className="grid grid-cols-[1fr_auto] items-start gap-2">
              <DecimalField
                label="Quantidade desejada"
                placeholder="Ex.: 500"
                value={state.target.amount}
                onChange={(e) => setState((s) => ({ ...s, target: { ...s.target, amount: e.target.value } }))}
                error={simulation.status === 'invalid' || simulation.status === 'incompatible' ? simulation.error : undefined}
              />
              <SelectField
                label="Unidade"
                className="w-[5.5rem]"
                value={state.target.unit}
                onChange={(e) => setState((s) => ({ ...s, target: { ...s.target, unit: e.target.value as CalcUnit } }))}
              >
                {CALC_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {CALC_UNIT_INFO[u].option}
                  </option>
                ))}
              </SelectField>
            </div>
            <SimulationResults simulation={simulation} result={result} />
          </section>
        )}

        <div className="flex flex-wrap gap-2 border-t border-line pt-5">
          <Button
            icon={<Star className="size-5" />}
            disabled={result.status !== 'ready'}
            onClick={() => setSaving(true)}
          >
            Salvar comparação
          </Button>
        </div>
      </PageBody>

      <SaveComparisonSheet
        open={saving}
        onClose={() => setSaving(false)}
        defaultTitle={state.title}
        onSave={async (title, favorite) => {
          try {
            await saveComparison({
              familyId: family.id,
              title,
              payload,
              summary: result.message,
              favorite,
              productId: state.productId,
            })
            void queryClient.invalidateQueries({ queryKey: ['comparisons'] })
            setSaving(false)
            toast.success(favorite ? 'Comparação salva nos favoritos.' : 'Comparação salva no histórico.', {
              label: 'Ver salvas',
              onClick: () => navigate('/calculadora/salvas'),
            })
          } catch (e) {
            toast.error(errorMessage(e))
          }
        }}
      />
    </>
  )
}

function SaveComparisonSheet({
  open,
  onClose,
  defaultTitle,
  onSave,
}: {
  open: boolean
  onClose: () => void
  defaultTitle: string
  onSave: (title: string, favorite: boolean) => Promise<void>
}) {
  const [title, setTitle] = useState(defaultTitle)
  const [favorite, setFavorite] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) {
      setTitle(defaultTitle || `Comparação de ${new Intl.DateTimeFormat('pt-BR').format(new Date())}`)
      setFavorite(false)
    }
  }, [open, defaultTitle])
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Salvar comparação"
      footer={
        <Button
          size="lg"
          block
          loading={busy}
          disabled={!title.trim()}
          onClick={async () => {
            setBusy(true)
            await onSave(title.trim(), favorite)
            setBusy(false)
          }}
        >
          Salvar
        </Button>
      }
    >
      <div className="space-y-4">
        <TextField label="Nome" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
        <Switch checked={favorite} onChange={setFavorite} label="Marcar como favorita" description="Favoritas ficam no topo das comparações salvas." />
      </div>
    </Sheet>
  )
}
