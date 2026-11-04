-- =====================================================================
-- Etapa 6 — Tarefas domésticas
-- Responsável, prazo, prioridade, recorrência, conclusão e histórico.
-- =====================================================================

-- Data de hoje no fuso da família (o app é usado no Brasil).
create or replace function app_private.local_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- Ocorrência n de uma recorrência a partir da data-base. Usa sempre a base
-- original (base + n × intervalo) para não "escorregar" no fim do mês:
-- 31/01 + 1 mês = 28/02, + 2 meses = 31/03.
create or replace function app_private.add_recurrence(
  p_base date,
  p_recurrence text,
  p_interval int,
  p_n int
)
returns date
language sql
immutable
set search_path = ''
as $$
  select case p_recurrence
    when 'daily' then p_base + (p_interval * p_n)
    when 'weekly' then p_base + (7 * p_interval * p_n)
    when 'monthly' then (p_base + make_interval(months => p_interval * p_n))::date
    when 'yearly' then (p_base + make_interval(years => p_interval * p_n))::date
    else p_base
  end;
$$;

-- Verdadeiro se a pessoa faz parte da família (para validar responsáveis,
-- participantes de despesas etc.).
create or replace function app_private.is_member_of(p_family_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.family_members m
    where m.family_id = p_family_id and m.user_id = p_user_id
  );
$$;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  notes text check (notes is null or char_length(notes) <= 1000),
  assignee_id uuid,
  due_on date,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  recurrence text not null default 'none' check (recurrence in ('none', 'daily', 'weekly', 'monthly', 'yearly')),
  recurrence_interval smallint not null default 1 check (recurrence_interval between 1 and 99),
  status text not null default 'open' check (status in ('open', 'done')),
  completed_at timestamptz,
  completed_by uuid references public.profiles (id) on delete set null,
  -- Próxima ocorrência criada ao concluir uma tarefa recorrente.
  next_task_id uuid,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, family_id),
  -- O responsável precisa ser da família; se sair dela, a tarefa fica sem responsável.
  constraint tasks_assignee_fk foreign key (family_id, assignee_id)
    references public.family_members (family_id, user_id) on delete set null (assignee_id),
  constraint tasks_recurrence_needs_due check (recurrence = 'none' or due_on is not null)
);

create index tasks_family_status_idx on public.tasks (family_id, status, due_on);
create index tasks_assignee_idx on public.tasks (assignee_id) where status = 'open';

create trigger tasks_audit before insert or update on public.tasks
  for each row execute function app_private.tg_audit_fields();

alter table public.tasks enable row level security;

create policy "Tarefas: integrantes veem" on public.tasks
  for select to authenticated using (app_private.is_family_member(family_id));
create policy "Tarefas: integrantes criam" on public.tasks
  for insert to authenticated with check (app_private.is_family_member(family_id));
create policy "Tarefas: integrantes editam" on public.tasks
  for update to authenticated
  using (app_private.is_family_member(family_id))
  with check (app_private.is_family_member(family_id));
create policy "Tarefas: autor ou administrador exclui" on public.tasks
  for delete to authenticated using (app_private.can_delete_record(family_id, created_by));

revoke all on public.tasks from anon;
revoke insert, update, delete, truncate, references, trigger on public.tasks from authenticated;
grant select, delete on public.tasks to authenticated;
grant insert (id, family_id, title, notes, assignee_id, due_on, priority, recurrence, recurrence_interval)
  on public.tasks to authenticated;
grant update (title, notes, assignee_id, due_on, priority, recurrence, recurrence_interval)
  on public.tasks to authenticated;

-- Conclui a tarefa. Se for recorrente, cria a próxima ocorrência (sempre
-- depois de hoje, mantendo o ritmo do prazo original). Repetir a chamada não
-- cria uma segunda ocorrência.
create or replace function public.complete_task(p_task_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  v_next uuid;
  v_due date;
  v_n int := 1;
  v_today date := app_private.local_today();
begin
  perform app_private.require_user();
  select * into t from public.tasks where id = p_task_id for update;
  if not found or not app_private.is_family_member(t.family_id) then
    raise exception 'Esta tarefa não existe mais.' using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  if t.status = 'done' then
    return t.next_task_id;
  end if;

  if t.recurrence <> 'none' then
    loop
      v_due := app_private.add_recurrence(t.due_on, t.recurrence, t.recurrence_interval, v_n);
      exit when v_due > v_today or v_n >= 5000;
      v_n := v_n + 1;
    end loop;
    insert into public.tasks (family_id, title, notes, assignee_id, due_on, priority, recurrence, recurrence_interval)
    values (t.family_id, t.title, t.notes, t.assignee_id, v_due, t.priority, t.recurrence, t.recurrence_interval)
    returning id into v_next;
  end if;

  update public.tasks
  set status = 'done', completed_at = now(), completed_by = auth.uid(), next_task_id = v_next
  where id = p_task_id;

  return v_next;
end;
$$;

-- Reabre a tarefa. A próxima ocorrência criada na conclusão é desfeita se
-- ninguém mexeu nela.
create or replace function public.reopen_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
begin
  perform app_private.require_user();
  select * into t from public.tasks where id = p_task_id for update;
  if not found or not app_private.is_family_member(t.family_id) then
    raise exception 'Esta tarefa não existe mais.' using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  if t.status = 'open' then
    return;
  end if;

  if t.next_task_id is not null then
    delete from public.tasks n
    where n.id = t.next_task_id and n.status = 'open' and n.updated_at = n.created_at;
  end if;

  update public.tasks
  set status = 'open', completed_at = null, completed_by = null, next_task_id = null
  where id = p_task_id;
end;
$$;

revoke execute on function public.complete_task(uuid), public.reopen_task(uuid) from public, anon;
grant execute on function public.complete_task(uuid), public.reopen_task(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.tasks;
  end if;
end;
$$;
