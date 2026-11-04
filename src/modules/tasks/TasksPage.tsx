import { CalendarClock, Plus, Repeat, StickyNote } from 'lucide-react'
import { type FormEvent, useMemo, useState } from 'react'
import { PageBody, PageHeader } from '@/app/AppLayout'
import { Button } from '@/components/ui/Button'
import { CheckCircle, PendingMark } from '@/components/ui/CheckCircle'
import { useConfirm } from '@/components/ui/Confirm'
import { Badge, Chip, Segmented } from '@/components/ui/Controls'
import { SelectField, TextArea, TextField } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { EmptyState, ErrorState, LoadingBlock, Notice } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/components/ui/cn'
import { addDays } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { formatDate, formatDateTime } from '@/lib/format'
import { describeRecurrence, RECURRENCE_OPTIONS, type Recurrence } from '@/lib/recurrence'
import { useFamily } from '@/modules/family/FamilyProvider'
import { MemberChip, MemberSelect } from '@/modules/family/MemberSelect'
import { dueGroup, dueLabel, groupOpenTasks, PRIORITY_LABEL, sortDone } from './domain'
import { useTaskActions, useTasks } from './hooks'
import type { Task, TaskFields, TaskPriority } from './types'

type View = 'open' | 'mine' | 'done'

export function TasksPage() {
  const { tasks, pendingIds, isLoading, error, refetch, offlineNoData } = useTasks()
  const actions = useTaskActions()
  const [view, setView] = useState<View>('open')
  const [editing, setEditing] = useState<Task | 'new' | null>(null)
  const [quick, setQuick] = useState('')
  const toast = useToast()

  const open = useMemo(() => (tasks ?? []).filter((t) => t.status === 'open'), [tasks])
  const mine = useMemo(() => open.filter((t) => t.assignee_id === actions.userId), [open, actions.userId])
  const done = useMemo(() => sortDone((tasks ?? []).filter((t) => t.status === 'done')), [tasks])

  function addQuick(e: FormEvent) {
    e.preventDefault()
    const title = quick.trim()
    if (!title) return
    actions.create({
      title: title.slice(0, 120),
      notes: null,
      assignee_id: view === 'mine' ? actions.userId : null,
      due_on: null,
      priority: 'normal',
      recurrence: 'none',
      recurrence_interval: 1,
    })
    setQuick('')
  }

  function toggle(task: Task) {
    if (task.status === 'open') {
      actions.complete(task)
      toast.success(task.recurrence !== 'none' ? 'Feita. A próxima já está na lista.' : 'Tarefa feita.', {
        label: 'Desfazer',
        onClick: () => actions.reopen(task),
      })
    } else {
      actions.reopen(task)
    }
  }

  const list = view === 'mine' ? mine : open

  return (
    <>
      <PageHeader
        title="Tarefas"
        actions={
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            Nova
          </Button>
        }
      />
      <PageBody className="space-y-5">
        <Segmented
          label="Mostrar"
          value={view}
          onChange={setView}
          options={[
            { value: 'open', label: 'A fazer', count: open.length },
            { value: 'mine', label: 'Minhas', count: mine.length },
            { value: 'done', label: 'Feitas' },
          ]}
        />

        {view !== 'done' && (
          <form onSubmit={addQuick} className="flex gap-2">
            <TextField
              label="Nova tarefa"
              labelHidden
              placeholder={view === 'mine' ? 'Nova tarefa para mim…' : 'Nova tarefa, ex.: levar o lixo'}
              value={quick}
              maxLength={120}
              onChange={(e) => setQuick(e.target.value)}
              containerClassName="flex-1"
            />
            <Button type="submit" variant="secondary" disabled={!quick.trim()}>
              Adicionar
            </Button>
          </form>
        )}

        {offlineNoData && !tasks ? (
          <Notice tone="info">Sem internet, e estes dados ainda não estão guardados neste aparelho. Eles aparecem quando a conexão voltar.</Notice>
        ) : isLoading && !tasks ? (
          <LoadingBlock />
        ) : error && !tasks ? (
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : view === 'done' ? (
          <DoneList tasks={done} onReopen={(t) => actions.reopen(t)} onOpen={setEditing} pendingIds={pendingIds} />
        ) : list.length === 0 ? (
          <EmptyState title={view === 'mine' ? 'Nada com você agora' : 'Nenhuma tarefa por fazer'}>
            {view === 'mine'
              ? 'Tarefas atribuídas a você aparecem aqui.'
              : 'Escreva acima para adicionar, ou toque em "Nova" para escolher responsável, prazo e repetição.'}
          </EmptyState>
        ) : (
          groupOpenTasks(list, actions.today).map((group) => (
            <section key={group.key} aria-labelledby={`grupo-${group.key}`}>
              <h2
                id={`grupo-${group.key}`}
                className={cn('mb-2 text-sm font-bold', group.key === 'overdue' ? 'text-alert' : 'text-ink-2')}
              >
                {group.title} <span className="font-semibold">· {group.tasks.length}</span>
              </h2>
              <ul className="divide-y divide-line rounded-[var(--radius-panel)] bg-card px-3 ring-1 ring-line">
                {group.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    today={actions.today}
                    pending={pendingIds.has(task.id)}
                    onToggle={() => toggle(task)}
                    onOpen={() => setEditing(task)}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </PageBody>

      <TaskSheet
        key={editing === 'new' ? 'new' : editing?.id ?? 'none'}
        open={editing !== null}
        task={editing === 'new' ? null : editing}
        defaultAssignee={view === 'mine' ? actions.userId : null}
        onClose={() => setEditing(null)}
      />
    </>
  )
}

function TaskRow({
  task,
  today,
  pending,
  onToggle,
  onOpen,
}: {
  task: Task
  today: string
  pending: boolean
  onToggle: () => void
  onOpen: () => void
}) {
  const overdue = task.due_on !== null && dueGroup(task.due_on, today) === 'overdue'
  return (
    <li className="flex items-start gap-3 py-3">
      <CheckCircle
        checked={task.status === 'done'}
        onToggle={onToggle}
        label={task.status === 'done' ? `Reabrir ${task.title}` : `Marcar ${task.title} como feita`}
      />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className={cn('block font-semibold', task.status === 'done' && 'text-ink-2 line-through')}>
          {task.title}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
          {task.due_on && (
            <span className={cn('inline-flex items-center gap-1', overdue && 'font-semibold text-alert')}>
              <CalendarClock className="size-4" aria-hidden />
              {dueLabel(task.due_on, today)}
            </span>
          )}
          {task.recurrence !== 'none' && (
            <span className="inline-flex items-center gap-1">
              <Repeat className="size-4" aria-hidden />
              {describeRecurrence(task.recurrence, task.recurrence_interval)}
            </span>
          )}
          {task.assignee_id && <MemberChip userId={task.assignee_id} />}
          {task.priority === 'high' && <Badge tone="alert">Prioridade alta</Badge>}
          {task.priority === 'low' && <Badge>Prioridade baixa</Badge>}
          {task.notes && (
            <span className="inline-flex items-center gap-1">
              <StickyNote className="size-4" aria-hidden />
              <span className="sr-only">Tem observações</span>
            </span>
          )}
          <PendingMark pending={pending} />
        </span>
      </button>
    </li>
  )
}

function DoneList({
  tasks,
  onReopen,
  onOpen,
  pendingIds,
}: {
  tasks: Task[]
  onReopen: (task: Task) => void
  onOpen: (task: Task) => void
  pendingIds: Set<string>
}) {
  const { nameOf } = useFamily()
  if (tasks.length === 0) {
    return <EmptyState title="Nenhuma tarefa feita ainda">As tarefas concluídas nos últimos 6 meses aparecem aqui.</EmptyState>
  }
  return (
    <section aria-label="Histórico de tarefas feitas">
      <ul className="divide-y divide-line rounded-[var(--radius-panel)] bg-card px-3 ring-1 ring-line">
        {tasks.map((task) => (
          <li key={task.id} className="flex items-start gap-3 py-3">
            <CheckCircle checked onToggle={() => onReopen(task)} label={`Reabrir ${task.title}`} />
            <button type="button" onClick={() => onOpen(task)} className="min-w-0 flex-1 text-left">
              <span className="block font-semibold text-ink-2 line-through">{task.title}</span>
              <span className="mt-1 block text-sm text-ink-2">
                {task.completed_by ? `Feita por ${nameOf(task.completed_by, { you: 'lower' })}` : 'Feita'}
                {task.completed_at ? ` em ${formatDateTime(task.completed_at)}` : ''}
              </span>
              <PendingMark pending={pendingIds.has(task.id)} />
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-ink-2">Mostrando as tarefas feitas nos últimos 6 meses.</p>
    </section>
  )
}

const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: PRIORITY_LABEL.low },
  { value: 'normal', label: PRIORITY_LABEL.normal },
  { value: 'high', label: PRIORITY_LABEL.high },
]

function TaskSheet({
  open,
  task,
  defaultAssignee,
  onClose,
}: {
  open: boolean
  task: Task | null
  defaultAssignee: string | null
  onClose: () => void
}) {
  const actions = useTaskActions()
  const confirm = useConfirm()
  const { nameOf } = useFamily()
  const [title, setTitle] = useState(task?.title ?? '')
  const [notes, setNotes] = useState(task?.notes ?? '')
  const [assignee, setAssignee] = useState<string | null>(task ? task.assignee_id : defaultAssignee)
  const [dueOn, setDueOn] = useState(task?.due_on ?? '')
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'normal')
  const [recurrence, setRecurrence] = useState<Recurrence>(task?.recurrence ?? 'none')
  const [interval, setRepeatEvery] = useState(String(task?.recurrence_interval ?? 1))
  const [submitted, setSubmitted] = useState(false)

  const intervalNumber = Number(interval)
  const errors = {
    title: !title.trim() ? 'Dê um nome para a tarefa.' : null,
    due: recurrence !== 'none' && !dueOn ? 'Tarefas que se repetem precisam de um prazo.' : null,
    interval:
      recurrence !== 'none' && (!Number.isInteger(intervalNumber) || intervalNumber < 1 || intervalNumber > 99)
        ? 'Use um número de 1 a 99.'
        : null,
  }
  const valid = !errors.title && !errors.due && !errors.interval

  function save(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (!valid) return
    const fields: TaskFields = {
      title: title.trim().slice(0, 120),
      notes: notes.trim() || null,
      assignee_id: assignee,
      due_on: dueOn || null,
      priority,
      recurrence,
      recurrence_interval: recurrence === 'none' ? 1 : intervalNumber,
    }
    if (task) {
      const patch: Partial<TaskFields> = {}
      for (const key of Object.keys(fields) as (keyof TaskFields)[]) {
        if (fields[key] !== task[key]) (patch as Record<string, unknown>)[key] = fields[key]
      }
      if (Object.keys(patch).length > 0) actions.update(task, patch)
    } else {
      actions.create(fields)
    }
    onClose()
  }

  async function remove() {
    if (!task) return
    const ok = await confirm({
      title: `Excluir "${task.title}"?`,
      message: task.recurrence !== 'none' ? 'Só esta ocorrência é excluída.' : undefined,
      confirmLabel: 'Excluir',
      tone: 'danger',
    })
    if (!ok) return
    actions.remove(task)
    onClose()
  }

  const unit = { none: '', daily: 'dias', weekly: 'semanas', monthly: 'meses', yearly: 'anos' }[recurrence]

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={task ? 'Editar tarefa' : 'Nova tarefa'}
      description={
        task?.status === 'done' && task.completed_at
          ? `Feita por ${nameOf(task.completed_by, { you: 'lower' })} em ${formatDateTime(task.completed_at)}.`
          : undefined
      }
      footer={
        <div className="flex flex-wrap gap-2">
          {task && (
            <Button type="button" variant="quiet-danger" onClick={() => void remove()}>
              Excluir
            </Button>
          )}
          <Button type="submit" form="task-form" className="ml-auto">
            {task ? 'Salvar' : 'Adicionar tarefa'}
          </Button>
        </div>
      }
    >
      <form id="task-form" onSubmit={save} className="space-y-4" noValidate>
        <TextField
          label="Tarefa"
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          error={submitted ? errors.title : null}
          autoFocus={!task}
        />
        <MemberSelect label="Responsável" value={assignee} onChange={setAssignee} emptyLabel="Qualquer pessoa" />
        <div>
          <TextField
            label="Prazo"
            type="date"
            value={dueOn}
            onChange={(e) => setDueOn(e.target.value)}
            error={submitted ? errors.due : null}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip active={dueOn === actions.today} onClick={() => setDueOn(actions.today)}>
              Hoje
            </Chip>
            <Chip active={dueOn === addDays(actions.today, 1)} onClick={() => setDueOn(addDays(actions.today, 1))}>
              Amanhã
            </Chip>
            <Chip active={dueOn === addDays(actions.today, 7)} onClick={() => setDueOn(addDays(actions.today, 7))}>
              Em uma semana
            </Chip>
            {dueOn && <Chip onClick={() => setDueOn('')}>Sem prazo</Chip>}
          </div>
          {dueOn && <p className="mt-1 text-sm text-ink-2">{formatDate(dueOn)}</p>}
        </div>
        <div>
          <p className="mb-1.5 text-sm font-semibold">Prioridade</p>
          <Segmented label="Prioridade" value={priority} onChange={setPriority} options={PRIORITIES} />
        </div>
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
          <p className="-mt-2 text-sm text-ink-2">
            Ao marcar como feita, a próxima ocorrência é criada sozinha
            {Number.isInteger(intervalNumber) && intervalNumber >= 1
              ? ` (${describeRecurrence(recurrence, intervalNumber).toLowerCase()})`
              : ''}
            .
          </p>
        )}
        <TextArea label="Observações" value={notes} maxLength={1000} rows={3} onChange={(e) => setNotes(e.target.value)} />
      </form>
    </Sheet>
  )
}
