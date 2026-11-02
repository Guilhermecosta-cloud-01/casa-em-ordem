import { useQueryClient } from '@tanstack/react-query'
import { Camera, Download, LogOut, Share, SquarePlus } from 'lucide-react'
import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { PageBody, PageHeader } from '@/app/AppLayout'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/Confirm'
import { TextField } from '@/components/ui/Field'
import { Notice } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { env } from '@/lib/env'
import { errorMessage } from '@/lib/errors'
import { pendingCountFor } from '@/lib/sync/outbox'
import { useAuth, useUser } from '@/modules/auth/AuthProvider'
import { updateProfile } from '@/modules/family/api'
import { useFamily } from '@/modules/family/FamilyProvider'
import { useInstallPrompt } from '@/pwa/install'
import { resizeAvatar } from './avatar'

export function ProfilePage() {
  const user = useUser()
  const { signOut } = useAuth()
  const { nameOf, avatarOf } = useFamily()
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const install = useInstallPrompt()
  const fileRef = useRef<HTMLInputElement>(null)
  const currentName = nameOf(user.id, { you: false })
  const [name, setName] = useState(currentName === 'Você' ? '' : currentName)
  const [busy, setBusy] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)

  useEffect(() => {
    if (currentName !== 'Você') setName(currentName)
  }, [currentName])

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['members'] }),
      queryClient.invalidateQueries({ queryKey: ['profile'] }),
    ])

  async function saveName(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      toast.error('Informe um nome.')
      return
    }
    setBusy(true)
    try {
      await updateProfile(user.id, { display_name: name.trim().slice(0, 60) })
      await refresh()
      toast.success('Nome atualizado.')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function onPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setPhotoBusy(true)
    try {
      const data = await resizeAvatar(file)
      await updateProfile(user.id, { avatar_data: data })
      await refresh()
      toast.success('Foto atualizada.')
    } catch (e) {
      toast.error(e instanceof Error && !('code' in e) ? e.message : errorMessage(e))
    } finally {
      setPhotoBusy(false)
    }
  }

  async function removePhoto() {
    setPhotoBusy(true)
    try {
      await updateProfile(user.id, { avatar_data: null })
      await refresh()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setPhotoBusy(false)
    }
  }

  async function onSignOut() {
    const pending = pendingCountFor(user.id)
    const ok = await confirm({
      title: 'Sair da conta?',
      message:
        pending > 0
          ? `Há ${pending} ${pending === 1 ? 'alteração que ainda não foi enviada' : 'alterações que ainda não foram enviadas'} ao servidor. Se sair agora, elas serão perdidas. Conecte-se à internet e espere sincronizar antes de sair.`
          : 'Os dados guardados neste aparelho serão apagados. Tudo continua salvo na sua conta.',
      confirmLabel: pending > 0 ? 'Sair mesmo assim' : 'Sair',
      tone: pending > 0 ? 'danger' : 'default',
    })
    if (!ok) return
    await signOut()
    navigate('/entrar', { replace: true })
  }

  const avatar = avatarOf(user.id)

  return (
    <>
      <PageHeader title="Meu perfil" back="/familia" />
      <PageBody className="space-y-8">
        <section className="flex items-center gap-4">
          <Avatar name={currentName} src={avatar} seed={user.id} size="xl" />
          <div className="space-y-2">
            <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => void onPhoto(e)} />
            <Button variant="secondary" size="sm" icon={<Camera className="size-4" />} loading={photoBusy} onClick={() => fileRef.current?.click()}>
              {avatar ? 'Trocar foto' : 'Adicionar foto'}
            </Button>
            {avatar && (
              <Button variant="ghost" size="sm" onClick={() => void removePhoto()} disabled={photoBusy}>
                Remover foto
              </Button>
            )}
          </div>
        </section>

        <form onSubmit={saveName} className="space-y-3" noValidate>
          <TextField label="Seu nome" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} hint="É assim que a família vê você." />
          <TextField label="E-mail" value={user.email} disabled readOnly />
          <Button type="submit" loading={busy}>
            Salvar nome
          </Button>
        </form>

        {!install.installed && (
          <section aria-labelledby="install-title" className="rounded-[var(--radius-panel)] bg-card p-4 ring-1 ring-line">
            <h2 id="install-title" className="text-lg font-bold">
              Instalar no celular
            </h2>
            {install.canPrompt ? (
              <>
                <p className="mt-1 text-ink-2">Coloque o Casa em Ordem na tela inicial e abra como um aplicativo.</p>
                <Button className="mt-3" icon={<Download className="size-5" />} onClick={() => void install.prompt()}>
                  Instalar aplicativo
                </Button>
              </>
            ) : install.ios ? (
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink-2">
                <li>
                  No Safari, toque em <Share className="inline size-4 align-text-bottom" aria-label="Compartilhar" />{' '}
                  Compartilhar.
                </li>
                <li>
                  Escolha <SquarePlus className="inline size-4 align-text-bottom" aria-hidden /> "Adicionar à Tela de Início".
                </li>
                <li>Toque em "Adicionar".</li>
              </ol>
            ) : (
              <p className="mt-1 text-ink-2">
                No Chrome do Android, abra o menu (⋮) e toque em "Instalar app" ou "Adicionar à tela inicial".
              </p>
            )}
          </section>
        )}

        <section className="space-y-3">
          <Button variant="secondary" icon={<LogOut className="size-5" />} onClick={() => void onSignOut()}>
            Sair da conta
          </Button>
          <Notice>Versão {env.appVersion}</Notice>
        </section>
      </PageBody>
    </>
  )
}
