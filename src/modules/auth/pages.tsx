import { type FormEvent, type ReactNode, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { BrandLockup } from '@/app/Brand'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { Notice } from '@/components/ui/States'
import { errorMessage } from '@/lib/errors'
import { useAuth } from './AuthProvider'

/** Só aceita destinos internos (evita redirecionar para outro site). */
export function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/'
  return value
}

function AuthLayout({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="safe-top flex min-h-dvh flex-col px-5 pb-10 pt-8">
      <div className="mx-auto w-full max-w-md">
        <BrandLockup />
        <h1 className="mt-10 text-[1.75rem] font-bold leading-tight">{title}</h1>
        <div className="mt-6">{children}</div>
        {footer && <div className="mt-8 text-ink-2">{footer}</div>}
      </div>
    </div>
  )
}

export function SignInPage() {
  const { signIn, status } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const next = safeNext(params.get('next'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (status === 'signed_in') return <Navigate to={next} replace />

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!email.trim() || !password) {
      setError('Informe e-mail e senha.')
      return
    }
    setBusy(true)
    try {
      await signIn(email, password)
      navigate(next, { replace: true })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Entrar"
      footer={
        <p>
          Ainda não tem conta?{' '}
          <Link className="font-semibold text-pen underline-offset-2 hover:underline" to={`/criar-conta?next=${encodeURIComponent(next)}`}>
            Criar conta
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <TextField
          label="E-mail"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <TextField
          label="Senha"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && (
          <Notice tone="danger">
            <span role="alert">{error}</span>
          </Notice>
        )}
        <Button type="submit" size="lg" block loading={busy}>
          Entrar
        </Button>
        <p className="text-center">
          <Link className="font-semibold text-pen underline-offset-2 hover:underline" to="/esqueci-senha">
            Esqueci minha senha
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}

export function SignUpPage() {
  const { signUp, status } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const next = safeNext(params.get('next'))
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)

  if (status === 'signed_in' && !sentTo) return <Navigate to={next} replace />

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const found: Record<string, string> = {}
    if (!name.trim()) found.name = 'Informe como você quer ser chamado.'
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) found.email = 'Informe um e-mail válido.'
    if (password.length < 8) found.password = 'Use pelo menos 8 caracteres.'
    setErrors(found)
    setError(null)
    if (Object.keys(found).length > 0) return
    setBusy(true)
    try {
      const { needsConfirmation } = await signUp(name, email, password)
      if (needsConfirmation) setSentTo(email.trim())
      else navigate(next, { replace: true })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (sentTo) {
    return (
      <AuthLayout title="Confirme seu e-mail">
        <p className="text-ink-2">
          Enviamos um link de confirmação para <strong className="text-ink">{sentTo}</strong>. Abra o e-mail neste
          aparelho e toque no link para ativar a conta.
        </p>
        <p className="mt-4 text-ink-2">Não chegou? Confira a caixa de spam ou promoções.</p>
        <Link
          to={`/entrar?next=${encodeURIComponent(next)}`}
          className="mt-8 inline-block font-semibold text-pen underline-offset-2 hover:underline"
        >
          Já confirmei, quero entrar
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Criar conta"
      footer={
        <p>
          Já tem conta?{' '}
          <Link className="font-semibold text-pen underline-offset-2 hover:underline" to={`/entrar?next=${encodeURIComponent(next)}`}>
            Entrar
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <TextField
          label="Seu nome"
          autoComplete="given-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          maxLength={60}
        />
        <TextField
          label="E-mail"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <TextField
          label="Senha"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          hint="Pelo menos 8 caracteres."
        />
        {error && (
          <Notice tone="danger">
            <span role="alert">{error}</span>
          </Notice>
        )}
        <Button type="submit" size="lg" block loading={busy}>
          Criar conta
        </Button>
      </form>
    </AuthLayout>
  )
}

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Informe um e-mail válido.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Redefinir senha"
      footer={
        <Link className="font-semibold text-pen underline-offset-2 hover:underline" to="/entrar">
          Voltar para entrar
        </Link>
      }
    >
      {sent ? (
        <Notice tone="success">
          Se houver uma conta com <strong>{email.trim()}</strong>, você vai receber um link para criar uma nova senha.
        </Notice>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <p className="text-ink-2">Informe o e-mail da sua conta. Enviaremos um link para criar uma nova senha.</p>
          <TextField
            label="E-mail"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={error}
          />
          <Button type="submit" size="lg" block loading={busy}>
            Enviar link
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}

export function ResetPasswordPage() {
  const { updatePassword, status } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (status === 'signed_out') {
    return (
      <AuthLayout title="Link expirado">
        <p className="text-ink-2">Este link de redefinição não é mais válido. Peça um novo.</p>
        <Link to="/esqueci-senha" className="mt-6 inline-block font-semibold text-pen underline-offset-2 hover:underline">
          Pedir novo link
        </Link>
      </AuthLayout>
    )
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (password.length < 8) {
      setError('Use pelo menos 8 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('As senhas não conferem.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await updatePassword(password)
      navigate('/', { replace: true })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Nova senha">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <TextField
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="Pelo menos 8 caracteres."
        />
        <TextField
          label="Repita a nova senha"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {error && (
          <Notice tone="danger">
            <span role="alert">{error}</span>
          </Notice>
        )}
        <Button type="submit" size="lg" block loading={busy}>
          Salvar nova senha
        </Button>
      </form>
    </AuthLayout>
  )
}
