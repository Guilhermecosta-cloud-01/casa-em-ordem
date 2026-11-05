import { CheckCircle2, ListPlus } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/Confirm'
import { SelectField, Switch, TextArea, TextField } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/lib/errors'
import { formatDate, todayIso } from '@/lib/format'
import { describeRecurrence, RECURRENCE_OPTIONS, type Recurrence } from '@/lib/recurrence'
import { useFamily } from '@/modules/family/FamilyProvider'
import { guessCategory } from '@/modules/shopping/categories'
import { type ItemToSend, SendToListSheet } from '@/modules/shopping/components/SendToListSheet'
import { suggestedPackages } from '@/modules/stock/domain'
import { useStock } from '@/modules/stock/hooks'
import { KIND_INFO, REMINDER_OPTIONS } from './domain'
import { useEventActions, useEventLogs } from './hooks'
import type { AgendaEvent, EventFields, EventKind } from './types'

const KINDS: EventKind[] = ['appointment', 'important_date', 'maintenance', 'restock']

export function EventSheet({
  open,
  event,
  occursOn,
  defaultDate,
  onClose,
}: {
  open: boolean
  event: AgendaEvent | null
  /** Ocorrência tocada (para "marcar como feita"). */
  occursOn?: string | null
  defaultDate?: string
  onClose: () => void
}) {
  const actions = useEventActions()
  const confirm = useConfirm()
  const toast = useToast()
  const stock = useStock()
  const logs = useEventLogs(event?.kind === 'maintenance' ? event.id : null)
  const { nameOf } = useFamily()
  const [kind, setKind] = useState<EventKind>(event?.kind ?? 'appointment')
  const [title, setTitle] = useState(event?.title ?? '')
  const [date, setDate] = useState(event?.starts_on ?? defaultDate ?? todayIso())
  const [allDay, setAllDay] = useState(event ? event.start_time === null : true)
  const [start, setStart] = useState(event?.start_time?.slice(0, 5) ?? '09:00')
  const [end, setEnd] = useState(event?.end_time?.slice(0, 5) ?? '')
  const [recurrence, setRecurrence] = useState<Recurrence>(event?.recurrence ?? 'none')
  const [interval, setRepeatEvery] = useState(String(event?.recurrence_interval ?? 1))
  const [until, setUntil] = useState(event?.until_on ?? '')
  const [remind, setRemind] = useState(event?.remind_minutes === null || event?.remind_minutes === undefined ? '' : String(event.remind_minutes))
  const [location, setLocation] = useState(event?.location ?? '')
  const [notes, setNotes] = useState(event?.notes ?? '')
  const [stockItemId, setStockItemId] = useState(event?.stock_item_id ?? '')
  const [submitted, setSubmitted] = useState(false)
  const [sending, setSending] = useState<ItemToSend[] | null>(null)

  function changeKind(next: EventKind) {
    setKind(next)
    if (event) return
    // Sugestões de repetição para cada tipo (dá para mudar).
    if (next === 'important_date') {
      setRecurrence('yearly')
      setAllDay(true)
      setRemind('1440')
    } else if (next === 'maintenance') {
      setRecurrence('monthly')
      setRepeatEvery('6')
      setAllDay(true)
      setRemind('0')
    } else if (next === 'restock') {
      setRecurrence('weekly')
      setRepeatEvery('2')
      setAllDay(true)
      setRemind('0')
    } else {
      setRecurrence('none')
      setRepeatEvery('1')
    }
  }

  const intervalNumber = Number(interval)
  const errors = {
    title: !title.trim() ? 'Dê um nome.' : null,
    date: !date ? 'Escolha a data.' : null,
    end: !allDay && end && end <= start ? 'O fim precisa ser depois do início.' : null,
    interval:
      recurrence !== 'none' && (!Number.isInteger(intervalNumber) || intervalNumber < 1 || intervalNumber > 99)
        ? 'Use um número de 1 a 99.'
        : null,
    until: until && date && until < date ? 'Precisa ser depois da data inicial.' : null,
  }

  function save(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (Object.values(errors).some(Boolean)) return
    const stockItem = stock.items?.find((s) => s.id === stockItemId)
    const fields: EventFields = {
      kind,
      title: title.trim().slice(0, 120),
      notes: notes.trim() || null,
      location: location.trim() || null,
      starts_on: date,
      start_time: allDay ? null : `${start}:00`,
      end_time: allDay || !end ? null : `${end}:00`,
      recurrence,
      recurrence_interval: recurrence === 'none' ? 1 : intervalNumber,
      until_on: recurrence === 'none' ? null : until || null,
      remind_minutes: remind === '' ? null : Number(remind),
      stock_item_id: kind === 'restock' && stockItem ? stockItem.id : null,
      product_id: kind === 'restock' && stockItem ? stockItem.product_id : null,
    }
    if (event) {
      const patch: Partial<EventFields> = {}
      for (const key of Object.keys(fields) as (keyof EventFields)[]) {
        if (fields[key] !== event[key]) (patch as Record<string, unknown>)[key] = fields[key]
      }
      if (Object.keys(patch).length) actions.update(event, patch)
    } else {
      actions.create(fields)
    }
    onClose()
  }

  async function remove() {
    if (!event) return
    const ok = await confirm({
      title: `Excluir "${event.title}"?`,
      message: event.recurrence !== 'none' ? 'Todas as repetições saem da agenda.' : undefined,
      confirmLabel: 'Excluir',
      tone: 'danger',
    })
    if (!ok) return
    actions.remove(event)
    onClose()
  }

  function markDone() {
    if (!event) return
    actions.logDone.mutate(
      { event, occursOn: occursOn ?? null, doneOn: todayIso() },
      { onSuccess: () => toast.success('Registrado como feito hoje.'), onError: (err) => toast.error(errorMessage(err)) },
    )
  }

  function restockToList() {
    if (!event) return
    const item = stock.items?.find((s) => s.id === event.stock_item_id)
    setSending([
      item
        ? { name: item.name, category: item.category, product_id: item.product_id, packages: suggestedPackages(item) }
        : { name: event.title, category: guessCategory(event.title), product_id: event.product_id, packages: 1 },
    ])
  }

  const unit = { none: '', daily: 'dias', weekly: 'semanas', monthly: 'meses', yearly: 'anos' }[recurrence]

  return (
    <>
      <Sheet
        open={open && sending === null}
        onClose={onClose}
        title={event ? event.title : 'Novo na agenda'}
        description={event && occursOn ? `Ocorrência de ${formatDate(occursOn)}` : undefined}
        footer={
          <div className="flex gap-2">
            {event && (
              <Button type="button" variant="quiet-danger" onClick={() => void remove()}>
                Excluir
              </Button>
            )}
            <Button type="submit" form="event-form" className="ml-auto">
              {event ? 'Salvar' : 'Adicionar à agenda'}
            </Button>
          </div>
        }
      >
        {event && (event.kind === 'maintenance' || event.kind === 'restock') && (
          <div className="mb-4 space-y-2 rounded-[var(--radius-field)] bg-paper p-3">
            {event.kind === 'maintenance' && (
              <>
                <Button variant="secondary" icon={<CheckCircle2 className="size-5" />} loading={actions.logDone.isPending} onClick={markDone}>
                  Registrar que foi feita hoje
                </Button>
                {logs.data && logs.data.length > 0 ? (
                  <ul className="text-sm text-ink-2">
                    {logs.data.slice(0, 5).map((log) => (
                      <li key={log.id}>
                        Feita em {formatDate(log.done_on)}
                        {log.created_by ? ` por ${nameOf(log.created_by, { you: 'lower' })}` : ''}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-ink-2">Ainda não há registro de quando foi feita.</p>
                )}
              </>
            )}
            {event.kind === 'restock' && (
              <Button variant="secondary" icon={<ListPlus className="size-5" />} onClick={restockToList}>
                Pôr na lista de compras
              </Button>
            )}
          </div>
        )}
        <form id="event-form" onSubmit={save} className="space-y-4" noValidate>
          <SelectField label="Tipo" value={kind} onChange={(e) => changeKind(e.target.value as EventKind)} hint={KIND_INFO[kind].hint}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_INFO[k].emoji} {KIND_INFO[k].label}
              </option>
            ))}
          </SelectField>
          <TextField
            label={kind === 'restock' ? 'O que comprar' : 'Título'}
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            error={submitted ? errors.title : null}
          />
          {kind === 'restock' && (stock.items?.length ?? 0) > 0 && (
            <SelectField
              label="Item do estoque (opcional)"
              value={stockItemId}
              onChange={(e) => {
                setStockItemId(e.target.value)
                const item = stock.items?.find((s) => s.id === e.target.value)
                if (item && !title.trim()) setTitle(item.name)
              }}
            >
              <option value="">Nenhum</option>
              {(stock.items ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectField>
          )}
          <TextField
            label={recurrence === 'none' ? 'Data' : 'Primeira data'}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            error={submitted ? errors.date : null}
          />
          <Switch checked={allDay} onChange={setAllDay} label="Dia todo" />
          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Início" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
              <TextField label="Fim (opcional)" type="time" value={end} onChange={(e) => setEnd(e.target.value)} error={submitted ? errors.end : null} />
            </div>
          )}
          <div className="grid grid-cols-[1fr_auto] items-start gap-3">
            <SelectField label="Repetir" value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
              {RECURRENCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </SelectField>
            {recurrence !== 'none' && (
              <TextField
                label={`A cada (${unit})`}
                inputMode="numeric"
                value={interval}
                onChange={(e) => setRepeatEvery(e.target.value.replace(/\D/g, '').slice(0, 2))}
                error={submitted ? errors.interval : null}
                containerClassName="w-32"
              />
            )}
          </div>
          {recurrence !== 'none' && (
            <TextField
              label="Repetir até (opcional)"
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              error={submitted ? errors.until : null}
              hint={Number.isInteger(intervalNumber) && intervalNumber >= 1 ? describeRecurrence(recurrence, intervalNumber) : undefined}
            />
          )}
          <SelectField
            label="Lembrete"
            value={remind}
            onChange={(e) => setRemind(e.target.value)}
            hint={allDay && remind !== '' ? 'Para o dia todo, o horário de referência é 9h.' : 'O lembrete vai para todos da família.'}
          >
            {REMINDER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </SelectField>
          {kind === 'appointment' && (
            <TextField label="Local (opcional)" value={location} maxLength={120} onChange={(e) => setLocation(e.target.value)} />
          )}
          <TextArea label="Observações" value={notes} maxLength={1000} rows={2} onChange={(e) => setNotes(e.target.value)} />
        </form>
      </Sheet>
      <SendToListSheet open={sending !== null} onClose={() => setSending(null)} items={sending ?? []} />
    </>
  )
}
