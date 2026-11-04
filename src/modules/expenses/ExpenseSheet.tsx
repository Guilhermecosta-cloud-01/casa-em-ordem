import { type FormEvent, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/Confirm'
import { Segmented } from '@/components/ui/Controls'
import { MoneyField, SelectField, TextArea, TextField } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { Notice } from '@/components/ui/States'
import { cn } from '@/components/ui/cn'
import { Big, numberErrorMessage, parseBrNumber, toBig } from '@/lib/decimal'
import { formatMoney, formatMoneyInput, todayIso } from '@/lib/format'
import { useAuth } from '@/modules/auth/AuthProvider'
import { useFamily } from '@/modules/family/FamilyProvider'
import { MemberSelect } from '@/modules/family/MemberSelect'
import { EXPENSE_CATEGORIES, splitEqually, sumAmounts } from './domain'
import { useExpenseActions } from './hooks'
import type { Expense, SplitMode } from './types'

const MONEY = { maxDecimals: 2, allowZero: false, max: 9999999 }
const SHARE = { maxDecimals: 2, allowZero: true, max: 9999999 }

export interface ExpenseDraft {
  description?: string
  amount?: string
  spent_on?: string
  category?: string
  purchase_id?: string | null
}

export function ExpenseSheet({
  open,
  expense,
  draft,
  onClose,
}: {
  open: boolean
  expense: Expense | null
  draft?: ExpenseDraft
  onClose: () => void
}) {
  const { user } = useAuth()
  const { members, nameOf } = useFamily()
  const actions = useExpenseActions()
  const confirm = useConfirm()

  const [description, setDescription] = useState(expense?.description ?? draft?.description ?? '')
  const [amount, setAmount] = useState(expense ? formatMoneyInput(expense.amount) : draft?.amount ? formatMoneyInput(draft.amount) : '')
  const [spentOn, setSpentOn] = useState(expense?.spent_on ?? draft?.spent_on ?? todayIso())
  const [category, setCategory] = useState(expense?.category ?? draft?.category ?? 'outros')
  const [paidBy, setPaidBy] = useState<string | null>(expense ? expense.paid_by : user?.id ?? null)
  const [mode, setMode] = useState<SplitMode>(expense?.split_mode ?? 'none')
  const [selected, setSelected] = useState<string[]>(() =>
    expense && expense.split_mode !== 'none' ? expense.expense_shares.map((s) => s.user_id) : members.map((m) => m.user_id),
  )
  const [custom, setCustom] = useState<Record<string, string>>(() =>
    Object.fromEntries((expense?.expense_shares ?? []).map((s) => [s.user_id, formatMoneyInput(s.amount)])),
  )
  const [notes, setNotes] = useState(expense?.notes ?? '')
  const [submitted, setSubmitted] = useState(false)

  const parsedAmount = parseBrNumber(amount, MONEY)
  const total = parsedAmount.ok ? parsedAmount.value : null
  // Mantém a ordem dos integrantes (a mesma que o banco usa para os centavos).
  const participants = members.map((m) => m.user_id).filter((id) => selected.includes(id))
  const equalShares = total && participants.length > 0 ? splitEqually(total, participants.length) : []
  const customParsed = participants.map((id) => ({ id, parsed: parseBrNumber(custom[id] || '0', SHARE) }))
  const customSum = sumAmounts(customParsed.map((c) => (c.parsed.ok ? c.parsed.value : new Big(0))))
  const customDiff = total ? total.minus(customSum) : null

  const errors = {
    description: !description.trim() ? 'Descreva a despesa.' : null,
    amount: parsedAmount.ok ? null : numberErrorMessage(parsedAmount.error, MONEY),
    payer: mode !== 'none' && !paidBy ? 'Para dividir, diga quem pagou.' : null,
    participants: mode !== 'none' && participants.length === 0 ? 'Escolha quem divide.' : null,
    custom:
      mode === 'custom' && customParsed.some((c) => !c.parsed.ok)
        ? 'Confira os valores de cada pessoa.'
        : mode === 'custom' && customDiff && !customDiff.eq(0)
          ? customDiff.gt(0)
            ? `Faltam ${formatMoney(customDiff)} para fechar o valor.`
            : `As partes passam ${formatMoney(customDiff.abs())} do valor.`
          : null,
  }
  const valid = Object.values(errors).every((e) => !e)

  const memberName = useMemo(() => (id: string) => nameOf(id), [nameOf])

  function toggle(id: string) {
    setSelected((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))
  }

  function save(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (!valid || !total) return
    actions.save({
      id: expense?.id,
      description: description.trim().slice(0, 120),
      category,
      amount: total.toFixed(2),
      spent_on: spentOn || todayIso(),
      paid_by: paidBy,
      split_mode: mode,
      participants:
        mode === 'equal'
          ? participants
          : mode === 'custom'
            ? customParsed.map((c) => ({ user_id: c.id, amount: (c.parsed.ok ? c.parsed.value : new Big(0)).toFixed(2) }))
            : [],
      notes: notes.trim() || null,
      purchase_id: expense?.purchase_id ?? draft?.purchase_id ?? null,
    })
    onClose()
  }

  async function remove() {
    if (!expense) return
    const ok = await confirm({ title: `Excluir "${expense.description}"?`, confirmLabel: 'Excluir', tone: 'danger' })
    if (!ok) return
    actions.remove(expense)
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={expense ? 'Editar despesa' : 'Nova despesa'}
      footer={
        <div className="flex gap-2">
          {expense && (
            <Button type="button" variant="quiet-danger" onClick={() => void remove()}>
              Excluir
            </Button>
          )}
          <Button type="submit" form="expense-form" className="ml-auto">
            {expense ? 'Salvar' : 'Lançar despesa'}
          </Button>
        </div>
      }
    >
      <form id="expense-form" onSubmit={save} className="space-y-4" noValidate>
        <TextField
          label="Descrição"
          value={description}
          maxLength={120}
          onChange={(e) => setDescription(e.target.value)}
          error={submitted ? errors.description : null}
          autoFocus={!expense && !draft?.description}
        />
        <div className="grid grid-cols-2 gap-3">
          <MoneyField label="Valor" value={amount} onChange={(e) => setAmount(e.target.value)} error={submitted ? errors.amount : null} />
          <TextField label="Data" type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />
        </div>
        <SelectField label="Categoria" value={category} onChange={(e) => setCategory(e.target.value)}>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {c.label}
            </option>
          ))}
        </SelectField>
        <MemberSelect
          label="Quem pagou"
          value={paidBy}
          onChange={setPaidBy}
          emptyLabel="Ninguém em especial (dinheiro da casa)"
          error={submitted ? errors.payer : null}
        />

        <fieldset className="space-y-3">
          <legend className="mb-1.5 text-sm font-semibold">Divisão entre integrantes</legend>
          <Segmented
            label="Divisão"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'none', label: 'Não dividir' },
              { value: 'equal', label: 'Igual' },
              { value: 'custom', label: 'Valores' },
            ]}
          />
          {mode === 'none' && <p className="text-sm text-ink-2">Despesa da casa: entra no resumo do mês, sem gerar dívida entre as pessoas.</p>}
          {mode !== 'none' && (
            <ul className="divide-y divide-line rounded-[var(--radius-field)] ring-1 ring-line">
              {members.map((m) => {
                const checked = selected.includes(m.user_id)
                const index = participants.indexOf(m.user_id)
                return (
                  <li key={m.user_id} className="flex min-h-14 items-center gap-3 px-3 py-2">
                    <label className="flex min-w-0 flex-1 items-center gap-3">
                      <input
                        type="checkbox"
                        className="size-5 accent-[var(--color-pen)]"
                        checked={checked}
                        onChange={() => toggle(m.user_id)}
                      />
                      <span className="truncate font-semibold">{memberName(m.user_id)}</span>
                    </label>
                    {checked && mode === 'equal' && (
                      <span className="tabular text-ink-2">{equalShares[index] ? formatMoney(equalShares[index]) : '—'}</span>
                    )}
                    {checked && mode === 'custom' && (
                      <MoneyField
                        label={`Parte de ${memberName(m.user_id)}`}
                        labelHidden
                        value={custom[m.user_id] ?? ''}
                        onChange={(e) => setCustom((c) => ({ ...c, [m.user_id]: e.target.value }))}
                        containerClassName="w-36"
                      />
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {mode !== 'none' && submitted && (errors.participants || errors.custom) && (
            <Notice tone="danger">{errors.participants ?? errors.custom}</Notice>
          )}
          {mode === 'custom' && !submitted && customDiff && !customDiff.eq(0) && (
            <p className={cn('text-sm', customDiff.gt(0) ? 'text-ink-2' : 'text-alert')}>
              {customDiff.gt(0) ? `Faltam ${formatMoney(customDiff)} para fechar.` : `Passou ${formatMoney(toBig(customDiff).abs())}.`}
            </p>
          )}
        </fieldset>

        <TextArea label="Observações" value={notes} maxLength={500} rows={2} onChange={(e) => setNotes(e.target.value)} />
      </form>
    </Sheet>
  )
}
