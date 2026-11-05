import { Spinner } from '@/components/ui/States'
import { BrandMark } from './Brand'

export function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5" role="status" aria-label="Carregando">
      <BrandMark className="size-16" />
      <Spinner className="size-6 text-pen" />
    </div>
  )
}

export function ConfigMissing() {
  return (
    <div className="mx-auto max-w-lg px-5 py-16">
      <BrandMark className="size-14" />
      <h1 className="mt-6 text-2xl font-bold">Falta configurar o Supabase</h1>
      <p className="mt-3 text-ink-2">
        Crie o arquivo <code className="rounded bg-line/70 px-1">.env.local</code> a partir de{' '}
        <code className="rounded bg-line/70 px-1">.env.example</code> com <strong>VITE_SUPABASE_URL</strong> e{' '}
        <strong>VITE_SUPABASE_ANON_KEY</strong> do seu projeto e reinicie o servidor. Detalhes em docs/SUPABASE.md.
      </p>
      <p className="mt-3 text-ink-2">
        No app publicado (Vercel ou Cloudflare), cadastre essas duas variáveis nas configurações do projeto e publique de novo: elas entram no
        app na hora da publicação.
      </p>
    </div>
  )
}
