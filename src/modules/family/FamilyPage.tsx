import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronRight,
  Copy,
  DoorOpen,
  MessageCircle,
  Pencil,
  Plus,
  Share2,
  Shield,
  ShieldOff,
  Trash2,
  UserMinus,
  UserPlus,
} from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { PageBody, PageHeader } from '@/app/AppLayout'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/Confirm'
import { Badge } from '@/components/ui/Controls'
import { SelectField, TextField } from '@/components/ui/Field'
import { ActionSheet, Sheet } from '@/components/ui/Sheet'
import { Notice } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import { useUser } from '@/modules/auth/AuthProvider'
import {
  createFamily,
  createInvite,
  deleteFamily,
  fetchActiveInvites,
  inviteLink,
  leaveFamily,
  type Member,
  removeMember,
  renameFamily,
  revokeInvite,
  setMemberRole,
} from './api'
import { useActiveFamily, useFamily } from './FamilyProvider'
import { extractInviteToken } from './OnboardingPage'

export function FamilyPage() {
  const user = useUser()
  const family = useActiveFamily()
  const { memberships, members, isAdmin, nameOf, avatarOf, setActiveFamily, refetch } = useFamily()
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [sheet, setSheet] = useState<'rename' | 'invite' | 'new' | 'join' | null>(null)
  const [selected, setSelected] = useState<Member | null>(null)

  const invites = useQuery({
    queryKey: ['invites', family.id],
    queryFn: () => fetchActiveInvites(family.id),
    enabled: isAdmin,
  })

  const refreshFamily = async () => {
    await refetch()
    await queryClient.invalidateQueries({ queryKey: ['members', family.id] })
  }

  const roleMutation = useMutation({
    mutationFn: ({ member, role }: { member: Member; role: 'admin' | 'member' }) => setMemberRole(family.id, member.user_id, role),
    onSuccess: () => void refreshFamily(),
    onError: (e) => toast.error(errorMessage(e)),
  })

  async function onRemove(member: Member) {
    const ok = await confirm({
      title: `Remover ${nameOf(member.user_id, { you: false })} da família?`,
      message: 'A pessoa perde o acesso às listas, produtos e preços da família imediatamente.',
      confirmLabel: 'Remover',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await removeMember(family.id, member.user_id)
      await refreshFamily()
      toast.success('Integrante removido.')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  async function onLeave() {
    const ok = await confirm({
      title: `Sair de ${family.name}?`,
      message: 'Você deixa de ver as listas e os preços desta família. Para voltar, precisará de um novo convite.',
      confirmLabel: 'Sair da família',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await leaveFamily(family.id)
      const next = memberships.find((m) => m.family_id !== family.id)
      if (next) setActiveFamily(next.family_id)
      await queryClient.invalidateQueries({ queryKey: ['families'] })
      await refetch()
      toast.success('Você saiu da família.')
      navigate(next ? '/' : '/comecar', { replace: true })
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  async function onDelete() {
    const ok = await confirm({
      title: `Excluir ${family.name}?`,
      message:
        'Todas as listas, itens, produtos, preços e compras desta família serão apagados para todos os integrantes. Não dá para desfazer.',
      confirmLabel: 'Excluir definitivamente',
      tone: 'danger',
      requireText: family.name,
    })
    if (!ok) return
    try {
      await deleteFamily(family.id, family.name)
      const next = memberships.find((m) => m.family_id !== family.id)
      if (next) setActiveFamily(next.family_id)
      await queryClient.invalidateQueries({ queryKey: ['families'] })
      await refetch()
      toast.success('Família excluída.')
      navigate(next ? '/' : '/comecar', { replace: true })
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const adminCount = members.filter((m) => m.role === 'admin').length

  return (
    <>
      <PageHeader
        title="Família"
        actions={
          <Link to="/perfil" aria-label="Meu perfil" className="rounded-full">
            <Avatar name={nameOf(user.id, { you: false })} src={avatarOf(user.id)} seed={user.id} size="sm" />
          </Link>
        }
      />
      <PageBody className="space-y-8">
        <section className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-bold">{family.name}</h2>
            <p className="text-ink-2">
              {members.length} {members.length === 1 ? 'integrante' : 'integrantes'}. Você é {isAdmin ? 'administrador(a)' : 'integrante'}.
            </p>
          </div>
          {isAdmin && (
            <Button variant="secondary" size="sm" icon={<Pencil className="size-4" />} onClick={() => setSheet('rename')}>
              Renomear
            </Button>
          )}
        </section>

        {memberships.length > 1 && (
          <SelectField label="Família ativa" value={family.id} onChange={(e) => setActiveFamily(e.target.value)}>
            {memberships.map((m) => (
              <option key={m.family_id} value={m.family_id}>
                {m.family?.name}
              </option>
            ))}
          </SelectField>
        )}

        <section aria-labelledby="members-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="members-title" className="text-lg font-bold">
              Integrantes
            </h2>
            {isAdmin && (
              <Button size="sm" icon={<UserPlus className="size-4" />} onClick={() => setSheet('invite')}>
                Convidar
              </Button>
            )}
          </div>
          <ul className="mt-3 ruled overflow-hidden rounded-[var(--radius-panel)] bg-card ring-1 ring-line">
            {members.map((member) => {
              const isMe = member.user_id === user.id
              return (
                <li key={member.user_id}>
                  <button
                    type="button"
                    disabled={!isAdmin || isMe}
                    onClick={() => setSelected(member)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left enabled:hover:bg-paper"
                  >
                    <Avatar name={nameOf(member.user_id, { you: false })} src={member.profile?.avatar_data} seed={member.user_id} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {nameOf(member.user_id, { you: false })}
                        {isMe && <span className="font-normal text-ink-2"> (você)</span>}
                      </span>
                      <span className="text-sm text-ink-2">desde {formatDate(member.joined_at)}</span>
                    </span>
                    {member.role === 'admin' ? <Badge tone="pen">Administrador</Badge> : <Badge>Integrante</Badge>}
                    {isAdmin && !isMe && <ChevronRight className="size-5 text-ink-3" aria-hidden />}
                  </button>
                </li>
              )
            })}
          </ul>
          {!isAdmin && <p className="mt-2 text-sm text-ink-2">Para convidar mais pessoas, peça a um administrador.</p>}
        </section>

        {isAdmin && (invites.data ?? []).length > 0 && (
          <section aria-labelledby="invites-title">
            <h2 id="invites-title" className="text-lg font-bold">
              Convites ativos
            </h2>
            <ul className="mt-3 ruled overflow-hidden rounded-[var(--radius-panel)] bg-card ring-1 ring-line">
              {(invites.data ?? []).map((invite) => (
                <li key={invite.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{invite.note || 'Convite'}</span>
                    <span className="text-sm text-ink-2">
                      Vale até {formatDate(invite.expires_at)}, {invite.max_uses - invite.use_count} de {invite.max_uses}{' '}
                      {invite.max_uses === 1 ? 'uso' : 'usos'}
                    </span>
                  </span>
                  <Button
                    variant="quiet-danger"
                    size="sm"
                    onClick={async () => {
                      try {
                        await revokeInvite(invite.id)
                        void invites.refetch()
                        toast.success('Convite cancelado. O link deixou de funcionar.')
                      } catch (e) {
                        toast.error(errorMessage(e))
                      }
                    }}
                  >
                    Cancelar
                  </Button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-ink-2">Por segurança, o link só aparece na hora em que o convite é criado.</p>
          </section>
        )}

        <section aria-labelledby="more-title" className="space-y-2">
          <h2 id="more-title" className="text-lg font-bold">
            Outras famílias
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<Plus className="size-5" />} onClick={() => setSheet('new')}>
              Criar outra família
            </Button>
            <Button variant="secondary" icon={<UserPlus className="size-5" />} onClick={() => setSheet('join')}>
              Usar um convite
            </Button>
          </div>
        </section>

        <section aria-labelledby="danger-title" className="space-y-2 border-t border-line pt-6">
          <h2 id="danger-title" className="sr-only">
            Sair ou excluir
          </h2>
          <Button variant="quiet-danger" icon={<DoorOpen className="size-5" />} onClick={() => void onLeave()}>
            Sair desta família
          </Button>
          {isAdmin && (
            <Button variant="quiet-danger" icon={<Trash2 className="size-5" />} onClick={() => void onDelete()}>
              Excluir a família
            </Button>
          )}
        </section>
      </PageBody>

      <ActionSheet
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? nameOf(selected.user_id, { you: false }) : ''}
        actions={
          selected
            ? [
                selected.role === 'admin'
                  ? {
                      label: 'Tornar integrante comum',
                      description: adminCount <= 1 ? 'A família precisa de um administrador' : 'Deixa de gerenciar convites e integrantes',
                      icon: <ShieldOff className="size-5" />,
                      disabled: adminCount <= 1,
                      onSelect: () => roleMutation.mutate({ member: selected, role: 'member' }),
                    }
                  : {
                      label: 'Tornar administrador',
                      description: 'Pode convidar, remover integrantes e excluir registros',
                      icon: <Shield className="size-5" />,
                      onSelect: () => roleMutation.mutate({ member: selected, role: 'admin' }),
                    },
                {
                  label: 'Remover da família',
                  icon: <UserMinus className="size-5" />,
                  tone: 'danger' as const,
                  onSelect: () => void onRemove(selected),
                },
              ]
            : []
        }
      />

      <RenameSheet open={sheet === 'rename'} onClose={() => setSheet(null)} current={family.name} onSaved={() => void refreshFamily()} familyId={family.id} />
      <InviteSheet open={sheet === 'invite'} onClose={() => setSheet(null)} familyId={family.id} familyName={family.name} onCreated={() => void invites.refetch()} />
      <NewFamilySheet
        open={sheet === 'new'}
        onClose={() => setSheet(null)}
        onCreated={async (id) => {
          setActiveFamily(id)
          await queryClient.invalidateQueries({ queryKey: ['families'] })
          await refetch()
          setSheet(null)
          navigate('/')
        }}
      />
      <JoinSheet open={sheet === 'join'} onClose={() => setSheet(null)} />
    </>
  )
}

function RenameSheet({ open, onClose, current, familyId, onSaved }: { open: boolean; onClose: () => void; current: string; familyId: string; onSaved: () => void }) {
  const [name, setName] = useState(current)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  useEffect(() => {
    if (open) {
      setName(current)
      setError(null)
    }
  }, [open, current])
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setError('Informe um nome.')
      return
    }
    setBusy(true)
    try {
      await renameFamily(familyId, name)
      onSaved()
      toast.success('Nome da família atualizado.')
      onClose()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Renomear família" footer={<Button type="submit" form="rename-form" size="lg" block loading={busy}>Salvar</Button>}>
      <form id="rename-form" onSubmit={save} noValidate>
        <TextField label="Nome da família" value={name} onChange={(e) => setName(e.target.value)} error={error} maxLength={60} />
      </form>
    </Sheet>
  )
}

function InviteSheet({
  open,
  onClose,
  familyId,
  familyName,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  familyId: string
  familyName: string
  onCreated: () => void
}) {
  const toast = useToast()
  const [note, setNote] = useState('')
  const [uses, setUses] = useState('1')
  const [days, setDays] = useState('7')
  const [link, setLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setNote('')
      setUses('1')
      setDays('7')
      setLink(null)
    }
  }, [open])

  async function create() {
    setBusy(true)
    try {
      const invite = await createInvite(familyId, { maxUses: Number(uses), validDays: Number(days), note: note.trim() || undefined })
      setLink(inviteLink(invite.token))
      onCreated()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const message = `Entre na família "${familyName}" no Casa em Ordem para dividirmos as listas de compras: ${link ?? ''}`

  return (
    <Sheet open={open} onClose={onClose} title="Convidar integrante" description="O link funciona só para quem você enviar, até expirar ou ser usado.">
      {link ? (
        <div className="space-y-4">
          <Notice tone="success">Convite criado. Envie o link agora: por segurança, ele não fica guardado no app.</Notice>
          <div className="break-all rounded-[var(--radius-field)] bg-paper px-4 py-3 font-mono text-sm" aria-label="Link do convite">
            {link}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {'share' in navigator && (
              <Button
                icon={<Share2 className="size-5" />}
                onClick={() => void navigator.share({ title: 'Convite para o Casa em Ordem', text: message }).catch(() => undefined)}
              >
                Compartilhar
              </Button>
            )}
            <Button
              variant="secondary"
              icon={<MessageCircle className="size-5" />}
              onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener')}
            >
              WhatsApp
            </Button>
            <Button
              variant="secondary"
              icon={<Copy className="size-5" />}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link)
                  toast.success('Link copiado.')
                } catch {
                  toast.error('Não foi possível copiar. Selecione o link e copie manualmente.')
                }
              }}
            >
              Copiar link
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <TextField label="Para quem? (opcional)" placeholder="Ex.: Vó Maria" value={note} onChange={(e) => setNote(e.target.value)} maxLength={60} hint="Só para você lembrar a quem enviou." />
          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Pode ser usado" value={uses} onChange={(e) => setUses(e.target.value)}>
              <option value="1">1 vez</option>
              <option value="2">2 vezes</option>
              <option value="3">3 vezes</option>
              <option value="5">5 vezes</option>
            </SelectField>
            <SelectField label="Válido por" value={days} onChange={(e) => setDays(e.target.value)}>
              <option value="1">1 dia</option>
              <option value="3">3 dias</option>
              <option value="7">7 dias</option>
              <option value="30">30 dias</option>
            </SelectField>
          </div>
          <Button size="lg" block loading={busy} onClick={() => void create()}>
            Criar link de convite
          </Button>
        </div>
      )}
    </Sheet>
  )
}

function NewFamilySheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => Promise<void> }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) {
      setName('')
      setError(null)
    }
  }, [open])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setError('Informe um nome.')
      return
    }
    setBusy(true)
    try {
      const id = await createFamily(name)
      await onCreated(id)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Criar outra família" footer={<Button type="submit" form="new-family" size="lg" block loading={busy}>Criar</Button>}>
      <form id="new-family" onSubmit={submit} noValidate>
        <TextField label="Nome da família" placeholder="Ex.: Casa da praia" value={name} onChange={(e) => setName(e.target.value)} error={error} maxLength={60} />
      </form>
    </Sheet>
  )
}

function JoinSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (open) {
      setText('')
      setError(null)
    }
  }, [open])
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Usar um convite"
      footer={
        <Button
          size="lg"
          block
          onClick={() => {
            const token = extractInviteToken(text)
            if (!token) {
              setError('Cole o link de convite completo.')
              return
            }
            onClose()
            navigate(`/convite/${token}`)
          }}
        >
          Abrir convite
        </Button>
      }
    >
      <TextField label="Link do convite" value={text} onChange={(e) => setText(e.target.value)} error={error} placeholder="https://…/convite/…" />
    </Sheet>
  )
}

