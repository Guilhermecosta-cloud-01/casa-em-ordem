import { Avatar } from '@/components/ui/Avatar'
import { SelectField } from '@/components/ui/Field'
import { cn } from '@/components/ui/cn'
import { useFamily } from './FamilyProvider'

/** Escolha de um integrante da família (ou ninguém). */
export function MemberSelect({
  label,
  value,
  onChange,
  emptyLabel,
  hint,
  error,
}: {
  label: string
  value: string | null
  onChange: (userId: string | null) => void
  /** Texto da opção vazia; sem ele a escolha é obrigatória. */
  emptyLabel?: string
  hint?: string
  error?: string | null
}) {
  const { members, nameOf } = useFamily()
  return (
    <SelectField
      label={label}
      hint={hint}
      error={error}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    >
      {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
      {emptyLabel === undefined && value === null && (
        <option value="" disabled>
          Escolha
        </option>
      )}
      {members.map((m) => (
        <option key={m.user_id} value={m.user_id}>
          {nameOf(m.user_id)}
        </option>
      ))}
    </SelectField>
  )
}

/** Foto pequena + nome ("Você" para a própria pessoa). */
export function MemberChip({ userId, className }: { userId: string; className?: string }) {
  const { nameOf, avatarOf } = useFamily()
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <Avatar name={nameOf(userId, { you: false })} src={avatarOf(userId)} seed={userId} size="xs" />
      <span className="truncate">{nameOf(userId)}</span>
    </span>
  )
}
