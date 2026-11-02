import { type FormEvent, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Controls'
import { MoneyField, SelectField, Switch, TextArea, TextField } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { Notice } from '@/components/ui/States'
import { numberErrorMessage, parseBrNumber } from '@/lib/decimal'
import { errorMessage } from '@/lib/errors'
import { formatMoney, formatMoneyInput, todayIso } from '@/lib/format'
import { useActiveFamily } from '@/modules/family/FamilyProvider'
import { ensureStore, type ListPatch } from '../api'
import type { ListTotals } from '../domain/totals'
import { useListMutations, useStores } from '../hooks'
import type { ShoppingList } from '../types'

export const LIST_TEMPLATES = [
  'Compra do mês',
  'Compra semanal',
  'Açougue',
  'Feira',
  'Produtos de limpeza',
  'Farmácia',
  'Churrasco',
]

const MONEY = { maxDecimals: 2, max: 9999999 }

export function ListFormSheet({
  open,
  onClose,
  list,
  initialName,
  onSubmit,
  busy,
}: {
  open: boolean
  onClose: () => void
  /** Ausente = nova lista. */
  list?: ShoppingList | null
  /** Nome sugerido para uma lista nova. */
  initialName?: string
  onSubmit: (values: { name: string; description: string | null; list_date: string | null; budget: string | null }) => void
  busy?: boolean
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [budget, setBudget] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setName(list?.name ?? initialName ?? '')
    setDescription(list?.description ?? '')
    setDate(list?.list_date ?? (list ? '' : todayIso()))
    setBudget(formatMoneyInput(list?.budget ?? null))
    setErrors({})
  }, [open, list, initialName])

  function submit(event: FormEvent) {
    event.preventDefault()
    const found: Record<string, string> = {}
    if (!name.trim()) found.name = 'Dê um nome para a lista.'
    let budgetValue: string | null = null
    if (budget.trim()) {
      const parsed = parseBrNumber(budget, MONEY)
      if (parsed.ok) budgetValue = parsed.value.toString()
      else found.budget = numberErrorMessage(parsed.error, MONEY)
    }
    setErrors(found)
    if (Object.keys(found).length > 0) return
    onSubmit({
      name: name.trim(),
      description: description.trim() || null,
      list_date: date || null,
      budget: budgetValue,
    })
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={list ? 'Editar lista' : 'Nova lista'}
      footer={
        <Button type="submit" form="list-form" size="lg" block loading={busy}>
          {list ? 'Salvar' : 'Criar lista'}
        </Button>
      }
    >
      <form id="list-form" onSubmit={submit} className="space-y-5" noValidate>
        <TextField
          label="Nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          maxLength={80}
          placeholder="Compra do mês"
        />
        {!list && (
          <div className="-mt-2 flex flex-wrap gap-2" aria-label="Sugestões de nome">
            {LIST_TEMPLATES.map((template) => (
              <Chip key={template} active={name === template} onClick={() => setName(template)}>
                {template}
              </Chip>
            ))}
          </div>
        )}
        <TextArea
          label="Descrição (opcional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          maxLength={300}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Data" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <MoneyField
            label="Orçamento (opcional)"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            error={errors.budget}
          />
        </div>
      </form>
    </Sheet>
  )
}

export function BudgetSheet({
  open,
  onClose,
  list,
  estimated,
  onSave,
  busy,
}: {
  open: boolean
  onClose: () => void
  list: ShoppingList
  estimated: string
  onSave: (budget: string | null) => void
  busy?: boolean
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (open) {
      setValue(formatMoneyInput(list.budget))
      setError(null)
    }
  }, [open, list.budget])

  function save(event: FormEvent) {
    event.preventDefault()
    if (!value.trim()) {
      onSave(null)
      return
    }
    const parsed = parseBrNumber(value, MONEY)
    if (!parsed.ok) {
      setError(numberErrorMessage(parsed.error, MONEY))
      return
    }
    onSave(parsed.value.toString())
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Orçamento da lista"
      description={`Total estimado agora: ${formatMoney(estimated)}`}
      footer={
        <Button type="submit" form="budget-form" size="lg" block loading={busy}>
          Salvar orçamento
        </Button>
      }
    >
      <form id="budget-form" onSubmit={save} noValidate>
        <MoneyField
          label="Quanto a família quer gastar"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          error={error}
          hint="Deixe vazio para remover o orçamento."
          autoFocus
        />
      </form>
    </Sheet>
  )
}

export function CompleteSheet({
  open,
  onClose,
  list,
  totals,
  onCompleted,
}: {
  open: boolean
  onClose: () => void
  list: ShoppingList
  totals: ListTotals
  onCompleted: (purchaseId: string) => void
}) {
  const family = useActiveFamily()
  const stores = useStores()
  const { complete } = useListMutations()
  const [date, setDate] = useState(todayIso())
  const [storeId, setStoreId] = useState('')
  const [newStore, setNewStore] = useState('')
  const [paid, setPaid] = useState('')
  const [notes, setNotes] = useState('')
  const [recordPrices, setRecordPrices] = useState(true)
  const [saveToCatalog, setSaveToCatalog] = useState(true)
  const [archive, setArchive] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setDate(todayIso())
      setErrors({})
    }
  }, [open])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const found: Record<string, string> = {}
    let paidValue: string | null = null
    if (paid.trim()) {
      const parsed = parseBrNumber(paid, MONEY)
      if (parsed.ok) paidValue = parsed.value.toString()
      else found.paid = numberErrorMessage(parsed.error, MONEY)
    }
    if (!date) found.date = 'Informe a data da compra.'
    else if (date > todayIso()) found.date = 'A data não pode estar no futuro.'
    if (storeId === '__new' && !newStore.trim()) found.store = 'Informe o nome do estabelecimento.'
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setBusy(true)
    try {
      let resolvedStore: string | null = storeId && storeId !== '__new' ? storeId : null
      if (storeId === '__new') resolvedStore = (await ensureStore(family.id, newStore)).id
      const purchaseId = await complete.mutateAsync({
        listId: list.id,
        purchasedOn: date,
        storeId: resolvedStore,
        paidTotal: paidValue,
        notes: notes.trim() || null,
        recordPrices,
        saveToCatalog,
        archive,
      })
      void stores.refetch()
      onCompleted(purchaseId)
    } catch (e) {
      setErrors({ form: errorMessage(e) })
    } finally {
      setBusy(false)
    }
  }

  const nothing = totals.purchasedCount === 0

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Finalizar compra"
      description={`${totals.purchasedCount} de ${totals.itemsCount} itens comprados. Estimado dos comprados: ${formatMoney(totals.purchased)}.`}
      footer={
        <Button type="submit" form="complete-form" size="lg" block loading={busy} disabled={nothing}>
          Finalizar compra
        </Button>
      }
    >
      {nothing ? (
        <Notice tone="warn">Marque os itens que foram comprados antes de finalizar.</Notice>
      ) : (
        <form id="complete-form" onSubmit={submit} className="space-y-5" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Data" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} error={errors.date} />
            <MoneyField
              label="Valor pago (opcional)"
              value={paid}
              onChange={(e) => setPaid(e.target.value)}
              error={errors.paid}
              hint="Total do cupom."
            />
          </div>
          <SelectField label="Onde vocês compraram (opcional)" value={storeId} onChange={(e) => setStoreId(e.target.value)} error={storeId === '__new' ? undefined : errors.store}>
            <option value="">Não informar</option>
            {(stores.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value="__new">+ Novo estabelecimento</option>
          </SelectField>
          {storeId === '__new' && (
            <TextField
              label="Nome do estabelecimento"
              value={newStore}
              onChange={(e) => setNewStore(e.target.value)}
              error={errors.store}
              maxLength={80}
              placeholder="Ex.: Supermercado do bairro"
            />
          )}
          <TextArea label="Observações (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} />
          <div className="space-y-3 rounded-[var(--radius-panel)] bg-paper p-4">
            <Switch
              checked={recordPrices}
              onChange={setRecordPrices}
              label="Guardar os preços no histórico"
              description="Os preços dos itens comprados entram no histórico de cada produto."
            />
            <Switch
              checked={saveToCatalog}
              onChange={setSaveToCatalog}
              label="Cadastrar produtos novos no catálogo"
              description="Itens que ainda não estão no catálogo passam a estar."
            />
            <Switch checked={archive} onChange={setArchive} label="Arquivar a lista" description="Ela continua disponível em Arquivadas." />
          </div>
          {errors.form && (
            <Notice tone="danger">
              <span role="alert">{errors.form}</span>
            </Notice>
          )}
        </form>
      )}
    </Sheet>
  )
}

export function DuplicateSheet({
  open,
  onClose,
  list,
  onSubmit,
  busy,
}: {
  open: boolean
  onClose: () => void
  list: ShoppingList
  onSubmit: (name: string) => void
  busy?: boolean
}) {
  const [name, setName] = useState(list.name)
  useEffect(() => {
    if (open) setName(list.name)
  }, [open, list.name])
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Duplicar lista"
      description="Cria uma nova lista com os mesmos itens, todos pendentes."
      footer={
        <Button size="lg" block loading={busy} disabled={!name.trim()} onClick={() => onSubmit(name.trim())}>
          Duplicar
        </Button>
      }
    >
      <TextField label="Nome da nova lista" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
    </Sheet>
  )
}

export type { ListPatch }
