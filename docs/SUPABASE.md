# Configurar o Supabase

O plano gratuito do Supabase atende bem uma família.

## 1. Criar o projeto

1. Em [supabase.com](https://supabase.com), crie um projeto (região: São Paulo,
   `sa-east-1`, para menor latência).
2. Guarde a senha do banco num gerenciador de senhas.

## 2. Aplicar as migrações

As migrações ficam em `supabase/migrations/` e devem ser aplicadas em ordem.

**Opção A — Supabase CLI (recomendada):**

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF   # o "ref" aparece na URL do painel
npx supabase db push                              # aplica as migrações pendentes
```

**Opção B — Editor SQL do painel:** abra *SQL Editor*, cole o conteúdo de cada
arquivo de `supabase/migrations/` (do mais antigo para o mais novo) e execute.
São quatro arquivos: famílias, compras e catálogo, a etapa 6 (tarefas, estoque,
despesas, agenda, conversas, notificações e categorias) e os lembretes
automáticos (ativa o pg_cron e agenda os lembretes a cada 5 minutos). O da
etapa 6 roda numa transação só: se der erro, nada fica pela metade.

As migrações criam as tabelas, as políticas RLS, as funções e já adicionam as
tabelas que precisam de tempo real (listas, itens, tarefas, estoque, despesas,
agenda, mensagens e avisos) à publicação do Realtime.

Para as notificações no celular, veja também [NOTIFICACOES.md](NOTIFICACOES.md).

## 3. Autenticação

Em *Authentication → URL Configuration*:

- **Site URL:** o endereço público do app (ex.: `https://casa-em-ordem.pages.dev`).
- **Redirect URLs:** inclua o mesmo endereço com `/**` (ex.:
  `https://casa-em-ordem.pages.dev/**`) e, se for desenvolver, `http://localhost:5173/**`.
  Sem isso, os links de confirmação de e-mail e de redefinição de senha não voltam
  para o app.

Em *Authentication → Providers → Email*:

- **Confirm email:** ligado por padrão (a pessoa confirma o e-mail antes de
  entrar). Para uso só da família, pode desligar; o app funciona dos dois jeitos.
- **Minimum password length:** recomendo 8 (o app já exige 8).

**E-mails:** o servidor de e-mail embutido do Supabase tem limite baixo de envios
por hora e serve para testes. Para confirmar contas e redefinir senhas com
tranquilidade, configure um SMTP próprio em *Project Settings → Auth → SMTP*
(ex.: Resend, Brevo, Amazon SES).

## 4. Chaves para o app

Em *Project Settings → API* (ou *API Keys*):

- **Project URL** → `VITE_SUPABASE_URL`
- **anon / publishable key** → `VITE_SUPABASE_ANON_KEY`

Nunca use a chave `service_role` / secret no app: ela ignora o RLS.

## 5. Conferir o Realtime

Em *Database → Publications → supabase_realtime*, confirme que `list_items` e
`shopping_lists` estão marcadas. Se o Realtime estiver indisponível, o app segue
funcionando com consulta periódica (a cada 15 s na tela da lista).

## 6. Conferência rápida

Depois de publicar, crie duas contas em navegadores diferentes, convide uma pela
outra e confira:

- os itens incluídos por uma aparecem na outra em segundos;
- uma terceira conta, de outra família, recebe "Lista não encontrada" ao abrir o
  endereço de uma lista que não é dela.

## Supabase na sua máquina (desenvolvimento)

Com Docker instalado:

```bash
npx supabase start       # usa supabase/config.toml
npx supabase db reset    # recria o banco local e aplica as migrações
npx supabase status      # URL e chave anon para o .env.local
```

O Studio local fica em http://localhost:54323. A confirmação de e-mail está
desligada no ambiente local (`supabase/config.toml`).

Sem Docker (Linux x86-64), `npm run stack:up` sobe um ambiente mínimo usado pelos
testes automatizados: Postgres do sistema + Supabase Auth + PostgREST, sem
Realtime e sem Studio. Veja [TESTES.md](TESTES.md).

## Novas migrações

Para alterar o banco, crie um arquivo novo (nunca edite uma migração já aplicada):

```bash
npx supabase migration new descricao_curta
```

e siga o modelo de RLS de [MODULOS.md](MODULOS.md).
