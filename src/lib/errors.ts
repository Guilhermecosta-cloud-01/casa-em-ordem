// Tradução de erros do Supabase/Postgres para mensagens claras em português.

export class AppError extends Error {
  readonly code: string
  readonly hint: string
  readonly status: number
  readonly network: boolean

  constructor(message: string, options: { code?: string; hint?: string; status?: number; network?: boolean } = {}) {
    super(message)
    this.name = 'AppError'
    this.code = options.code ?? ''
    this.hint = options.hint ?? ''
    this.status = options.status ?? 0
    this.network = options.network ?? false
  }
}

interface ErrorLike {
  message?: string
  code?: string
  hint?: string | null
  details?: string | null
  status?: number
  name?: string
}

const NETWORK_PATTERNS = [
  /failed to fetch/i,
  /networkerror/i,
  /network request failed/i,
  /load failed/i,
  /fetcherror/i,
  /econnrefused/i,
  /the internet connection appears to be offline/i,
  /authretryablefetcherror/i,
]

export function isNetworkError(error: unknown): boolean {
  if (!error) return false
  if (error instanceof AppError) return error.network
  const e = error as ErrorLike
  if (e.name === 'AuthRetryableFetchError') return true
  if (e.status === 0 && (e.code === '' || e.code === undefined)) return true
  const text = `${e.name ?? ''} ${e.message ?? ''}`
  return NETWORK_PATTERNS.some((p) => p.test(text))
}

/** Token expirado ou sessão inválida (precisa renovar ou entrar de novo). */
export function isAuthError(error: unknown): boolean {
  const e = error as ErrorLike
  return (
    e?.code === 'PGRST301' ||
    e?.code === 'PGRST302' ||
    e?.code === 'PGRST303' ||
    e?.status === 401 ||
    e?.hint === 'NOT_AUTHENTICATED'
  )
}

// Mensagens para os códigos (hint) definidos nas funções SQL. As próprias
// funções já devolvem textos em português; aqui ficam ajustes e fallbacks.
const HINT_MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: 'Entre na sua conta para continuar.',
  NOT_FOUND: 'Não encontramos este registro. Ele pode ter sido removido por outra pessoa.',
}

const POSTGRES_MESSAGES: Record<string, string> = {
  '23505': 'Já existe um registro com esses dados.',
  '23503': 'Este registro depende de outro que não existe mais.',
  '23514': 'Algum valor está fora do permitido. Confira os campos.',
  '42501': 'Você não tem permissão para fazer isso nesta família.',
  '22P02': 'Algum valor está em formato inválido.',
  PGRST116: 'Não encontramos este registro.',
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error
  const e = (error ?? {}) as ErrorLike
  if (isNetworkError(e)) {
    return new AppError('Sem conexão com o servidor. Verifique a internet e tente de novo.', {
      network: true,
      code: e.code,
    })
  }
  const code = e.code ?? ''
  const hint = e.hint ?? ''
  let message = HINT_MESSAGES[hint] ?? ''
  // Mensagens que as funções SQL escreveram para o usuário (raise exception
  // com hint): usamos como vieram.
  if (!message && hint && /^[A-Z_]+$/.test(hint) && e.message) message = e.message
  if (!message) message = POSTGRES_MESSAGES[code] ?? ''
  if (!message && isAuthError(e)) message = 'Sua sessão expirou. Entre novamente.'
  if (!message) message = translateAuthMessage(e.message ?? '') ?? 'Algo deu errado. Tente de novo.'
  return new AppError(message, { code, hint, status: e.status })
}

/** Mensagens do Supabase Auth. */
function translateAuthMessage(message: string): string | null {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.'
  if (m.includes('user already registered') || m.includes('already been registered'))
    return 'Já existe uma conta com este e-mail. Tente entrar.'
  if (m.includes('password should be at least') || m.includes('password is too short'))
    return 'A senha precisa ter pelo menos 8 caracteres.'
  if (m.includes('weak password') || m.includes('password is known to be weak'))
    return 'Escolha uma senha mais forte (evite senhas comuns).'
  if (m.includes('unable to validate email') || m.includes('invalid format') || (m.includes('email address') && m.includes('invalid')))
    return 'Informe um e-mail válido.'
  if (m.includes('rate limit') || m.includes('too many requests') || m.includes('security purposes'))
    return 'Muitas tentativas seguidas. Aguarde um pouco e tente de novo.'
  if (m.includes('same password') || m.includes('different from the old'))
    return 'A nova senha precisa ser diferente da atual.'
  if (m.includes('auth session missing') || m.includes('jwt expired')) return 'Sua sessão expirou. Entre novamente.'
  if (m.includes('signups not allowed') || m.includes('signup is disabled'))
    return 'O cadastro de novas contas está desativado neste projeto.'
  if (m.includes('error sending') && m.includes('email'))
    return 'Não foi possível enviar o e-mail agora. Confira a configuração de e-mail do Supabase ou tente mais tarde.'
  return null
}

export function errorMessage(error: unknown): string {
  return toAppError(error).message
}

/** Lança AppError se a resposta do Supabase tiver erro; senão devolve os dados. */
export function unwrap<T>(response: { data: T; error: unknown }): T {
  if (response.error) throw toAppError(response.error)
  return response.data
}
