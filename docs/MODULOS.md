# Como adicionar um módulo

Os próximos módulos (conversas, tarefas, despesas, agenda, estoque) já estão
registrados em `src/modules/registry.ts` com `status: 'planned'`: aparecem no
planejamento, mas não na navegação.

## 1. Banco de dados

Crie uma migração nova:

```bash
npx supabase migration new tarefas
```

Modelo para uma tabela da família (troque `tasks` e as colunas):

```sql
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  assignee_id uuid references public.profiles (id) on delete set null,
  due_on date,
  done boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, family_id)
);

create index tasks_family_idx on public.tasks (family_id);

-- Autor e datas preenchidos pelo banco; impede mover para outra família.
create trigger tasks_audit before insert or update on public.tasks
  for each row execute function app_private.tg_audit_fields();

alter table public.tasks enable row level security;

create policy "Tarefas: integrantes veem" on public.tasks
  for select to authenticated using (app_private.is_family_member(family_id));
create policy "Tarefas: integrantes criam" on public.tasks
  for insert to authenticated with check (app_private.is_family_member(family_id));
create policy "Tarefas: integrantes editam" on public.tasks
  for update to authenticated
  using (app_private.is_family_member(family_id)) with check (app_private.is_family_member(family_id));
create policy "Tarefas: autor ou administrador exclui" on public.tasks
  for delete to authenticated using (app_private.can_delete_record(family_id, created_by));

-- Privilégios: nada para visitantes; só as colunas editáveis para usuários.
revoke all on public.tasks from anon;
revoke insert, update, delete, truncate, references, trigger on public.tasks from authenticated;
grant select, delete on public.tasks to authenticated;
grant insert (id, family_id, title, assignee_id, due_on, done) on public.tasks to authenticated;
grant update (title, assignee_id, due_on, done) on public.tasks to authenticated;
```

Regras que valem para qualquer tabela nova:

- Todo dado compartilhado tem `family_id` e política RLS usando
  `app_private.is_family_member`.
- Referência a outro registro da família: chave composta
  `foreign key (outro_id, family_id) references public.outra (id, family_id)`.
- Funções que precisam de `security definer` vão com `set search_path = ''` e
  conferem a permissão logo no início.
- Se a tabela precisar de tempo real:
  `alter publication supabase_realtime add table public.tasks;`

Acrescente casos em `tests/db/` provando que outra família não lê nem altera os
dados novos.

## 2. Código

Crie a pasta `src/modules/<modulo>/` seguindo os módulos existentes:

```
src/modules/tasks/
  api.ts          chamadas ao Supabase (use unwrap() de lib/errors)
  hooks.ts        useQuery/useMutation (chaves começando com o nome do módulo)
  types.ts        tipos das linhas
  domain/         regras puras (+ testes *.test.ts)
  components/
  pages/
```

- Família ativa: `useActiveFamily()`; nomes e fotos: `useFamily().nameOf(id)`.
- Componentes de interface prontos em `src/components/ui/`.
- Para funcionar offline, registre operações na fila (`src/lib/sync/outbox.ts`)
  como em `src/modules/shopping/offline.ts`; para leitura offline, inclua a chave
  da consulta em `PERSISTED_KEYS` (`src/lib/queryClient.ts`).

## 3. Rotas e navegação

1. Adicione as rotas em `src/app/router.tsx` (com `lazy` para carregar sob demanda).
2. Em `src/modules/registry.ts`, mude o módulo para `status: 'active'`.
3. A navegação inferior já usa os 5 espaços que cabem bem no celular. Ao ativar
   o primeiro módulo novo, troque o último item por "Mais": uma tela com
   Família e os demais módulos ativos.

## 4. Testes

- Regras de negócio: Vitest em `src/modules/<modulo>/**/*.test.ts`.
- Segurança: `tests/db/`.
- Fluxo principal: Playwright em `tests/e2e/`.
