-- =====================================================================
-- Casa em Ordem — Etapa 6: módulos da família
--
-- Tarefas domésticas, estoque, despesas, agenda e lembretes, conversas,
-- notificações, categorias personalizadas e exclusão da própria conta.
--
-- Aplicar depois das migrações 20261102120000 e 20261102120100. No editor
-- SQL do Supabase, cole este arquivo inteiro e execute uma vez. Tudo roda numa
-- transação só: se algo der erro, nada fica pela metade.
-- =====================================================================

begin;

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

-- =====================================================================
-- Etapa 6 — Estoque doméstico
-- O que existe em casa, quantidade, estoque mínimo e alertas de reposição.
-- =====================================================================

create table public.stock_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  product_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  category text not null default 'outros' check (char_length(category) between 1 and 40),
  unit public.measure_unit not null default 'un',
  quantity numeric(12,3) not null default 0 check (quantity >= 0 and quantity <= 999999),
  min_quantity numeric(12,3) check (min_quantity is null or (min_quantity >= 0 and min_quantity <= 999999)),
  location text check (location is null or char_length(btrim(location)) between 1 and 40),
  notes text check (notes is null or char_length(notes) <= 500),
  -- Abaixo (ou no) mínimo: hora de repor.
  is_low boolean generated always as (min_quantity is not null and quantity <= min_quantity) stored,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, family_id),
  constraint stock_items_product_fk foreign key (product_id, family_id)
    references public.products (id, family_id) on delete set null (product_id)
);

create unique index stock_items_family_name_uidx on public.stock_items (family_id, lower(btrim(name)));
create index stock_items_low_idx on public.stock_items (family_id) where is_low;

create trigger stock_items_audit before insert or update on public.stock_items
  for each row execute function app_private.tg_audit_fields();

alter table public.stock_items enable row level security;

create policy "Estoque: integrantes veem" on public.stock_items
  for select to authenticated using (app_private.is_family_member(family_id));
create policy "Estoque: integrantes cadastram" on public.stock_items
  for insert to authenticated with check (app_private.is_family_member(family_id));
create policy "Estoque: integrantes editam" on public.stock_items
  for update to authenticated
  using (app_private.is_family_member(family_id))
  with check (app_private.is_family_member(family_id));
create policy "Estoque: autor ou administrador exclui" on public.stock_items
  for delete to authenticated using (app_private.can_delete_record(family_id, created_by));

revoke all on public.stock_items from anon;
revoke insert, update, delete, truncate, references, trigger on public.stock_items from authenticated;
grant select, delete on public.stock_items to authenticated;
grant insert (id, family_id, product_id, name, category, unit, quantity, min_quantity, location, notes)
  on public.stock_items to authenticated;
grant update (product_id, name, category, unit, quantity, min_quantity, location, notes)
  on public.stock_items to authenticated;

-- Soma (ou subtrai) da quantidade sem perder toques simultâneos. Nunca fica
-- abaixo de zero. Com p_op_id, repetir o mesmo ajuste não soma duas vezes.
create or replace function public.adjust_stock_quantity(
  p_item_id uuid,
  p_delta numeric,
  p_op_id uuid default null
)
returns numeric
language plpgsql
set search_path = ''
as $$
declare
  v_quantity numeric;
  v_inserted int := 1;
begin
  perform app_private.require_user();
  if p_delta is null or p_delta = 0 or abs(p_delta) > 100000 then
    raise exception 'Ajuste de quantidade inválido.' using errcode = '22023', hint = 'INVALID_DELTA';
  end if;

  if p_op_id is not null then
    insert into public.sync_receipts (op_id) values (p_op_id) on conflict (op_id) do nothing;
    get diagnostics v_inserted = row_count;
  end if;

  if v_inserted = 1 then
    update public.stock_items s
    set quantity = least(greatest(s.quantity + p_delta, 0), 999999)
    where s.id = p_item_id
    returning s.quantity into v_quantity;
  end if;

  if v_quantity is null then
    select s.quantity into v_quantity from public.stock_items s where s.id = p_item_id;
    if not found then
      raise exception 'Este item não está mais no estoque.' using errcode = 'P0002', hint = 'NOT_FOUND';
    end if;
  end if;
  return v_quantity;
end;
$$;

-- Quanto de um item comprado entra no estoque, na unidade do estoque:
-- g ↔ kg e mL ↔ L são convertidos; dúzia vira 12 unidades; nos demais casos
-- conta-se o número de embalagens.
create or replace function app_private.stock_amount(
  p_packages numeric,
  p_quantity numeric,
  p_item_unit text,
  p_stock_unit text
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_quantity is not null and p_item_unit in ('g', 'kg') and p_stock_unit in ('g', 'kg') then
      p_packages * p_quantity
        * (case when p_item_unit = 'kg' then 1000 else 1 end)
        / (case when p_stock_unit = 'kg' then 1000 else 1 end)
    when p_quantity is not null and p_item_unit in ('mL', 'L') and p_stock_unit in ('mL', 'L') then
      p_packages * p_quantity
        * (case when p_item_unit = 'L' then 1000 else 1 end)
        / (case when p_stock_unit = 'L' then 1000 else 1 end)
    when p_item_unit = 'duzia' and p_stock_unit = 'un' then p_packages * 12
    else p_packages
  end;
$$;

alter table public.purchases add column stock_applied_at timestamptz;

-- Soma ao estoque o que foi comprado (itens já cadastrados no estoque, pelo
-- produto do catálogo ou pelo nome). Vale uma vez por compra.
create or replace function public.add_purchase_to_stock(p_purchase_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.purchases;
  v_count int := 0;
  r record;
begin
  perform app_private.require_user();
  select * into p from public.purchases where id = p_purchase_id for update;
  if not found or not app_private.is_family_member(p.family_id) then
    raise exception 'Compra não encontrada.' using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  if p.stock_applied_at is not null then
    raise exception 'Esta compra já foi somada ao estoque.' using errcode = 'P0001', hint = 'ALREADY_APPLIED';
  end if;

  -- Cada item comprado vai para um item do estoque (de preferência o do
  -- mesmo produto do catálogo); itens repetidos na compra se somam.
  for r in
    select m.stock_id, sum(app_private.stock_amount(i.packages, i.quantity, i.unit, m.stock_unit)) as amount
    from public.purchase_items i
    cross join lateral (
      select s.id as stock_id, s.unit::text as stock_unit
      from public.stock_items s
      where s.family_id = i.family_id
        and (s.product_id = i.product_id or lower(btrim(s.name)) = lower(btrim(i.name)))
      order by (s.product_id is not distinct from i.product_id) desc
      limit 1
    ) m
    where i.purchase_id = p_purchase_id
    group by m.stock_id
  loop
    update public.stock_items
    set quantity = least(quantity + r.amount, 999999)
    where id = r.stock_id;
    v_count := v_count + 1;
  end loop;

  update public.purchases set stock_applied_at = now() where id = p_purchase_id;
  return v_count;
end;
$$;

revoke execute on function
  public.adjust_stock_quantity(uuid, numeric, uuid),
  public.add_purchase_to_stock(uuid)
from public, anon;
grant execute on function
  public.adjust_stock_quantity(uuid, numeric, uuid),
  public.add_purchase_to_stock(uuid)
to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.stock_items;
  end if;
end;
$$;

-- =====================================================================
-- Etapa 6 — Despesas familiares
-- Lançamentos com categoria, valor, data, quem pagou, divisão entre
-- integrantes, acertos e saldos.
-- =====================================================================

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  description text not null check (char_length(btrim(description)) between 1 and 120),
  category text not null default 'outros' check (category in (
    'mercado', 'moradia', 'contas', 'transporte', 'saude', 'educacao', 'lazer', 'pets', 'vestuario', 'outros'
  )),
  amount numeric(12,2) not null check (amount > 0 and amount <= 9999999),
  spent_on date not null default current_date,
  paid_by uuid,
  -- none: despesa da casa, sem divisão; equal/custom: dividida entre integrantes.
  split_mode text not null default 'none' check (split_mode in ('none', 'equal', 'custom')),
  purchase_id uuid,
  notes text check (notes is null or char_length(notes) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, family_id),
  constraint expenses_paid_by_fk foreign key (family_id, paid_by)
    references public.family_members (family_id, user_id) on delete set null (paid_by),
  constraint expenses_purchase_fk foreign key (purchase_id, family_id)
    references public.purchases (id, family_id) on delete set null (purchase_id)
);

create index expenses_family_date_idx on public.expenses (family_id, spent_on desc);

-- Parte de cada integrante numa despesa dividida. Fica guardada mesmo se a
-- pessoa sair da família (o histórico de saldos não muda).
create table public.expense_shares (
  expense_id uuid not null,
  family_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0 and amount <= 9999999),
  primary key (expense_id, user_id),
  constraint expense_shares_expense_fk foreign key (expense_id, family_id)
    references public.expenses (id, family_id) on delete cascade
);

create index expense_shares_family_idx on public.expense_shares (family_id, user_id);

-- Acerto: alguém pagou a outro integrante para quitar a diferença.
create table public.expense_settlements (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  from_user uuid not null references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0 and amount <= 9999999),
  settled_on date not null default current_date,
  notes text check (notes is null or char_length(notes) <= 300),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_user <> to_user)
);

create index expense_settlements_family_idx on public.expense_settlements (family_id, settled_on desc);

create trigger expenses_audit before insert or update on public.expenses
  for each row execute function app_private.tg_audit_fields();
create trigger expense_settlements_audit before insert or update on public.expense_settlements
  for each row execute function app_private.tg_audit_fields();

alter table public.expenses enable row level security;
alter table public.expense_shares enable row level security;
alter table public.expense_settlements enable row level security;

create policy "Despesas: integrantes veem" on public.expenses
  for select to authenticated using (app_private.is_family_member(family_id));
create policy "Despesas: autor ou administrador exclui" on public.expenses
  for delete to authenticated using (app_private.can_delete_record(family_id, created_by));
create policy "Divisões: integrantes veem" on public.expense_shares
  for select to authenticated using (app_private.is_family_member(family_id));
create policy "Acertos: integrantes veem" on public.expense_settlements
  for select to authenticated using (app_private.is_family_member(family_id));
create policy "Acertos: integrantes registram" on public.expense_settlements
  for insert to authenticated with check (
    app_private.is_family_member(family_id)
    and app_private.is_member_of(family_id, from_user)
    and app_private.is_member_of(family_id, to_user)
  );
create policy "Acertos: autor ou administrador exclui" on public.expense_settlements
  for delete to authenticated using (app_private.can_delete_record(family_id, created_by));

-- Despesas e divisões são gravadas só pela função save_expense (confere a
-- soma das partes); acertos podem ser inseridos direto.
revoke all on public.expenses, public.expense_shares, public.expense_settlements from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.expenses, public.expense_shares, public.expense_settlements from authenticated;
grant select on public.expenses, public.expense_shares, public.expense_settlements to authenticated;
grant delete on public.expenses, public.expense_settlements to authenticated;
grant insert (id, family_id, from_user, to_user, amount, settled_on, notes) on public.expense_settlements to authenticated;

-- Cria ou altera uma despesa com a divisão, tudo de uma vez.
-- p_participants: ids dos integrantes que dividem (modo equal) ou
-- [{"user_id": "...", "amount": 12.34}] (modo custom).
-- Na divisão igual, os centavos que sobram vão para os primeiros da lista.
create or replace function public.save_expense(
  p_id uuid,
  p_family_id uuid,
  p_description text,
  p_category text,
  p_amount numeric,
  p_spent_on date,
  p_paid_by uuid,
  p_split_mode text,
  p_participants jsonb default '[]'::jsonb,
  p_notes text default null,
  p_purchase_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.expenses;
  v_users uuid[];
  v_count int;
  v_cents bigint;
  v_base bigint;
  v_rest int;
  v_sum numeric := 0;
  v_user uuid;
  v_share numeric;
  v_i int := 0;
  v_entry jsonb;
begin
  perform app_private.require_user();
  if not app_private.is_family_member(p_family_id) then
    raise exception 'Família não encontrada.' using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 9999999 or p_amount <> round(p_amount, 2) then
    raise exception 'Informe um valor maior que zero, com até 2 casas decimais.' using errcode = '22023', hint = 'INVALID_AMOUNT';
  end if;
  if p_paid_by is not null and not app_private.is_member_of(p_family_id, p_paid_by) then
    raise exception 'Quem pagou precisa ser da família.' using errcode = '22023', hint = 'INVALID_MEMBER';
  end if;
  if p_split_mode not in ('none', 'equal', 'custom') then
    raise exception 'Divisão inválida.' using errcode = '22023', hint = 'INVALID_SPLIT';
  end if;
  if p_split_mode <> 'none' and p_paid_by is null then
    raise exception 'Para dividir, diga quem pagou.' using errcode = '22023', hint = 'PAYER_REQUIRED';
  end if;

  select * into v_existing from public.expenses where id = p_id for update;
  if found then
    if v_existing.family_id <> p_family_id or not app_private.is_family_member(v_existing.family_id) then
      raise exception 'Despesa não encontrada.' using errcode = 'P0002', hint = 'NOT_FOUND';
    end if;
    update public.expenses
    set description = btrim(p_description), category = p_category, amount = p_amount,
        spent_on = coalesce(p_spent_on, spent_on), paid_by = p_paid_by, split_mode = p_split_mode,
        notes = nullif(btrim(coalesce(p_notes, '')), ''), purchase_id = p_purchase_id
    where id = p_id;
  else
    insert into public.expenses (id, family_id, description, category, amount, spent_on, paid_by, split_mode, notes, purchase_id)
    values (p_id, p_family_id, btrim(p_description), p_category, p_amount, coalesce(p_spent_on, app_private.local_today()),
            p_paid_by, p_split_mode, nullif(btrim(coalesce(p_notes, '')), ''), p_purchase_id);
  end if;

  delete from public.expense_shares where expense_id = p_id;

  if p_split_mode = 'equal' then
    -- Sem repetições, na ordem recebida.
    select array_agg(value::uuid order by ord) into v_users
    from (select distinct on (value) value, ord from jsonb_array_elements_text(p_participants) with ordinality as t(value, ord) order by value, ord) x;
    v_count := coalesce(array_length(v_users, 1), 0);
    if v_count < 1 then
      raise exception 'Escolha quem divide a despesa.' using errcode = '22023', hint = 'NO_PARTICIPANTS';
    end if;
    v_cents := (p_amount * 100)::bigint;
    v_base := v_cents / v_count;
    v_rest := (v_cents - v_base * v_count)::int;
    foreach v_user in array v_users loop
      v_i := v_i + 1;
      if not app_private.is_member_of(p_family_id, v_user) then
        raise exception 'Todos que dividem precisam ser da família.' using errcode = '22023', hint = 'INVALID_MEMBER';
      end if;
      v_share := (v_base + case when v_i <= v_rest then 1 else 0 end)::numeric / 100;
      insert into public.expense_shares (expense_id, family_id, user_id, amount) values (p_id, p_family_id, v_user, v_share);
    end loop;
  elsif p_split_mode = 'custom' then
    for v_entry in select * from jsonb_array_elements(p_participants) loop
      v_user := (v_entry ->> 'user_id')::uuid;
      v_share := (v_entry ->> 'amount')::numeric;
      if v_share is null or v_share < 0 or v_share <> round(v_share, 2) then
        raise exception 'Valor de divisão inválido.' using errcode = '22023', hint = 'INVALID_SHARE';
      end if;
      if not app_private.is_member_of(p_family_id, v_user) then
        raise exception 'Todos que dividem precisam ser da família.' using errcode = '22023', hint = 'INVALID_MEMBER';
      end if;
      insert into public.expense_shares (expense_id, family_id, user_id, amount) values (p_id, p_family_id, v_user, v_share);
      v_sum := v_sum + v_share;
    end loop;
    if v_sum <> p_amount then
      raise exception 'A soma das partes (%) precisa ser igual ao valor da despesa (%).', v_sum, p_amount
        using errcode = '22023', hint = 'SHARES_MISMATCH';
    end if;
  end if;

  return p_id;
end;
$$;

revoke execute on function
  public.save_expense(uuid, uuid, text, text, numeric, date, uuid, text, jsonb, text, uuid)
from public, anon;
grant execute on function
  public.save_expense(uuid, uuid, text, text, numeric, date, uuid, text, jsonb, text, uuid)
to authenticated;

-- Saldo de cada integrante nas despesas divididas: positivo = tem a receber.
-- (pagou − sua parte + acertos que pagou − acertos que recebeu)
create view public.expense_balances with (security_invoker = true) as
select family_id, user_id,
       sum(paid) as paid,
       sum(owed) as owed,
       sum(sent) as sent,
       sum(received) as received,
       sum(paid - owed + sent - received) as balance
from (
  select e.family_id, e.paid_by as user_id, e.amount as paid, 0::numeric as owed, 0::numeric as sent, 0::numeric as received
  from public.expenses e
  where e.split_mode <> 'none' and e.paid_by is not null
  union all
  select s.family_id, s.user_id, 0, s.amount, 0, 0 from public.expense_shares s
  union all
  select t.family_id, t.from_user, 0, 0, t.amount, 0 from public.expense_settlements t
  union all
  select t.family_id, t.to_user, 0, 0, 0, t.amount from public.expense_settlements t
) movements
group by family_id, user_id;

grant select on public.expense_balances to authenticated;
revoke all on public.expense_balances from anon;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.expenses, public.expense_settlements;
  end if;
end;
$$;

-- =====================================================================
-- Etapa 6 — Agenda e lembretes
-- Compromissos, datas importantes, manutenção de equipamentos e reposição
-- de produtos, com recorrência e lembrete. As tarefas com prazo aparecem
-- na agenda a partir da própria tabela de tarefas.
-- =====================================================================

create table public.events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  kind text not null default 'appointment'
    check (kind in ('appointment', 'important_date', 'maintenance', 'restock')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  notes text check (notes is null or char_length(notes) <= 1000),
  location text check (location is null or char_length(btrim(location)) between 1 and 120),
  starts_on date not null,
  start_time time,
  end_time time,
  recurrence text not null default 'none' check (recurrence in ('none', 'daily', 'weekly', 'monthly', 'yearly')),
  recurrence_interval smallint not null default 1 check (recurrence_interval between 1 and 99),
  until_on date,
  -- Minutos antes do horário (ou das 9h, quando é o dia todo).
  remind_minutes int check (remind_minutes is null or remind_minutes between 0 and 40320),
  product_id uuid,
  stock_item_id uuid,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, family_id),
  constraint events_time_order check (end_time is null or (start_time is not null and end_time > start_time)),
  constraint events_until_after_start check (until_on is null or until_on >= starts_on),
  constraint events_product_fk foreign key (product_id, family_id)
    references public.products (id, family_id) on delete set null (product_id),
  constraint events_stock_fk foreign key (stock_item_id, family_id)
    references public.stock_items (id, family_id) on delete set null (stock_item_id)
);

create index events_family_idx on public.events (family_id, starts_on);

-- Registro do que foi feito (ex.: "filtro trocado em 03/11").
create table public.event_logs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  event_id uuid not null,
  occurs_on date,
  done_on date not null default current_date,
  notes text check (notes is null or char_length(notes) <= 300),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_logs_event_fk foreign key (event_id, family_id)
    references public.events (id, family_id) on delete cascade
);

create index event_logs_event_idx on public.event_logs (event_id, done_on desc);

create trigger events_audit before insert or update on public.events
  for each row execute function app_private.tg_audit_fields();
create trigger event_logs_audit before insert or update on public.event_logs
  for each row execute function app_private.tg_audit_fields();

alter table public.events enable row level security;
alter table public.event_logs enable row level security;

create policy "Agenda: integrantes veem" on public.events
  for select to authenticated using (app_private.is_family_member(family_id));
create policy "Agenda: integrantes criam" on public.events
  for insert to authenticated with check (app_private.is_family_member(family_id));
create policy "Agenda: integrantes editam" on public.events
  for update to authenticated
  using (app_private.is_family_member(family_id))
  with check (app_private.is_family_member(family_id));
create policy "Agenda: autor ou administrador exclui" on public.events
  for delete to authenticated using (app_private.can_delete_record(family_id, created_by));

create policy "Registros da agenda: integrantes veem" on public.event_logs
  for select to authenticated using (app_private.is_family_member(family_id));
create policy "Registros da agenda: integrantes criam" on public.event_logs
  for insert to authenticated with check (app_private.is_family_member(family_id));
create policy "Registros da agenda: autor ou administrador exclui" on public.event_logs
  for delete to authenticated using (app_private.can_delete_record(family_id, created_by));

revoke all on public.events, public.event_logs from anon;
revoke insert, update, delete, truncate, references, trigger on public.events, public.event_logs from authenticated;
grant select, delete on public.events, public.event_logs to authenticated;
grant insert (id, family_id, kind, title, notes, location, starts_on, start_time, end_time, recurrence,
              recurrence_interval, until_on, remind_minutes, product_id, stock_item_id)
  on public.events to authenticated;
grant update (kind, title, notes, location, starts_on, start_time, end_time, recurrence,
              recurrence_interval, until_on, remind_minutes, product_id, stock_item_id)
  on public.events to authenticated;
grant insert (id, family_id, event_id, occurs_on, done_on, notes) on public.event_logs to authenticated;

-- Ocorrências de todos os compromissos entre duas datas (usada pelos
-- lembretes). Mesma regra do app: base + n × intervalo.
create or replace function app_private.event_occurrences(p_from date, p_to date)
returns table (event_id uuid, family_id uuid, occurs_on date)
language sql
stable
set search_path = ''
as $$
  select e.id, e.family_id, e.starts_on
  from public.events e
  where e.recurrence = 'none' and e.starts_on between p_from and p_to
  union all
  select e.id, e.family_id, o.d
  from public.events e
  cross join lateral (
    select app_private.add_recurrence(e.starts_on, e.recurrence, e.recurrence_interval, n) as d
    from generate_series(
      greatest(0, case e.recurrence
        when 'daily' then (p_from - e.starts_on) / e.recurrence_interval - 1
        when 'weekly' then (p_from - e.starts_on) / (7 * e.recurrence_interval) - 1
        when 'monthly' then ((extract(year from p_from) - extract(year from e.starts_on)) * 12
                             + extract(month from p_from) - extract(month from e.starts_on))::int / e.recurrence_interval - 1
        else (extract(year from p_from) - extract(year from e.starts_on))::int / e.recurrence_interval - 1
      end),
      greatest(0, case e.recurrence
        when 'daily' then (p_to - e.starts_on) / e.recurrence_interval + 1
        when 'weekly' then (p_to - e.starts_on) / (7 * e.recurrence_interval) + 1
        when 'monthly' then ((extract(year from p_to) - extract(year from e.starts_on)) * 12
                             + extract(month from p_to) - extract(month from e.starts_on))::int / e.recurrence_interval + 1
        else (extract(year from p_to) - extract(year from e.starts_on))::int / e.recurrence_interval + 1
      end)
    ) as n
  ) o
  where e.recurrence <> 'none'
    and e.starts_on <= p_to
    and o.d between greatest(p_from, e.starts_on) and least(p_to, coalesce(e.until_on, p_to));
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.events;
  end if;
end;
$$;

-- =====================================================================
-- Etapa 6 — Conversas da família
-- Grupo geral da família e conversas entre dois integrantes, com histórico
-- e contagem de mensagens não lidas.
-- =====================================================================

create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  kind text not null check (kind in ('group', 'direct')),
  -- Conversa a dois: member_a < member_b. Se alguém sair da família, o
  -- histórico continua para quem ficou.
  member_a uuid,
  member_b uuid,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, family_id),
  constraint chat_conversations_kind_members check (
    (kind = 'group' and member_a is null and member_b is null)
    or (kind = 'direct' and (member_a is null or member_b is null or member_a < member_b))
  ),
  constraint chat_conversations_a_fk foreign key (family_id, member_a)
    references public.family_members (family_id, user_id) on delete set null (member_a),
  constraint chat_conversations_b_fk foreign key (family_id, member_b)
    references public.family_members (family_id, user_id) on delete set null (member_b)
);

create unique index chat_conversations_group_uidx on public.chat_conversations (family_id) where kind = 'group';
create unique index chat_conversations_direct_uidx on public.chat_conversations (family_id, member_a, member_b) where kind = 'direct';

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  conversation_id uuid not null,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null default '',
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chat_messages_conversation_fk foreign key (conversation_id, family_id)
    references public.chat_conversations (id, family_id) on delete cascade,
  constraint chat_messages_body check (deleted_at is not null or char_length(btrim(body)) between 1 and 4000)
);

create index chat_messages_conversation_idx on public.chat_messages (conversation_id, created_at desc);
create index chat_messages_family_idx on public.chat_messages (family_id, created_at desc);

create table public.chat_reads (
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create or replace function app_private.can_access_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.chat_conversations c
    join public.family_members m on m.family_id = c.family_id and m.user_id = (select auth.uid())
    where c.id = p_conversation_id
      and (c.kind = 'group' or (select auth.uid()) in (c.member_a, c.member_b))
  );
$$;

-- Autor e horário vêm do servidor (ninguém escreve em nome de outra pessoa).
create or replace function app_private.tg_chat_message_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.author_id := coalesce(auth.uid(), new.author_id);
  new.created_at := now();
  new.deleted_at := null;
  return new;
end;
$$;

create or replace function app_private.tg_chat_message_touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chat_conversations
  set last_message_at = new.created_at
  where id = new.conversation_id and (last_message_at is null or last_message_at < new.created_at);
  return null;
end;
$$;

create trigger chat_messages_defaults before insert on public.chat_messages
  for each row execute function app_private.tg_chat_message_defaults();
create trigger chat_messages_touch after insert on public.chat_messages
  for each row execute function app_private.tg_chat_message_touch_conversation();

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reads enable row level security;

create policy "Conversas: participantes veem" on public.chat_conversations
  for select to authenticated using (app_private.can_access_conversation(id));
create policy "Mensagens: participantes veem" on public.chat_messages
  for select to authenticated using (app_private.can_access_conversation(conversation_id));
create policy "Mensagens: participantes enviam" on public.chat_messages
  for insert to authenticated
  with check (author_id = (select auth.uid()) and app_private.can_access_conversation(conversation_id));
create policy "Leituras: a própria pessoa vê" on public.chat_reads
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.chat_conversations, public.chat_messages, public.chat_reads from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.chat_conversations, public.chat_messages, public.chat_reads from authenticated;
grant select on public.chat_conversations, public.chat_messages, public.chat_reads to authenticated;
grant insert (id, family_id, conversation_id, body) on public.chat_messages to authenticated;

create or replace function public.open_group_conversation(p_family_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform app_private.require_user();
  if not app_private.is_family_member(p_family_id) then
    raise exception 'Família não encontrada.' using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  insert into public.chat_conversations (family_id, kind) values (p_family_id, 'group')
  on conflict (family_id) where kind = 'group' do nothing;
  select id into v_id from public.chat_conversations where family_id = p_family_id and kind = 'group';
  return v_id;
end;
$$;

create or replace function public.open_direct_conversation(p_family_id uuid, p_other_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := app_private.require_user();
  v_a uuid;
  v_b uuid;
  v_id uuid;
begin
  if not app_private.is_family_member(p_family_id) or not app_private.is_member_of(p_family_id, p_other_user) then
    raise exception 'Integrante não encontrado.' using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  if p_other_user = v_me then
    raise exception 'Escolha outra pessoa da família.' using errcode = '22023', hint = 'SAME_USER';
  end if;
  v_a := least(v_me, p_other_user);
  v_b := greatest(v_me, p_other_user);
  insert into public.chat_conversations (family_id, kind, member_a, member_b) values (p_family_id, 'direct', v_a, v_b)
  on conflict (family_id, member_a, member_b) where kind = 'direct' do nothing;
  select id into v_id from public.chat_conversations
  where family_id = p_family_id and kind = 'direct' and member_a = v_a and member_b = v_b;
  return v_id;
end;
$$;

-- Apaga a própria mensagem (fica "Mensagem apagada" no histórico).
create or replace function public.delete_chat_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.require_user();
  update public.chat_messages
  set body = '', deleted_at = now()
  where id = p_message_id and author_id = auth.uid() and deleted_at is null;
  if not found then
    raise exception 'Mensagem não encontrada.' using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
end;
$$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.require_user();
  if not app_private.can_access_conversation(p_conversation_id) then
    raise exception 'Conversa não encontrada.' using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  insert into public.chat_reads (conversation_id, user_id, last_read_at)
  values (p_conversation_id, auth.uid(), now())
  on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;
end;
$$;

-- Conversas da família com a última mensagem e quantas não foram lidas.
create or replace function public.chat_overview(p_family_id uuid)
returns table (
  conversation_id uuid,
  kind text,
  other_user_id uuid,
  last_message_at timestamptz,
  last_body text,
  last_author_id uuid,
  last_deleted boolean,
  unread_count int
)
language sql
stable
set search_path = ''
as $$
  select c.id,
         c.kind,
         case when c.kind = 'direct' then case when c.member_a = (select auth.uid()) then c.member_b else c.member_a end end,
         c.last_message_at,
         m.body,
         m.author_id,
         m.deleted_at is not null,
         (select count(*)::int
          from public.chat_messages x
          where x.conversation_id = c.id
            and x.author_id is distinct from (select auth.uid())
            and x.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz))
  from public.chat_conversations c
  left join public.chat_reads r on r.conversation_id = c.id and r.user_id = (select auth.uid())
  left join lateral (
    select y.body, y.author_id, y.deleted_at
    from public.chat_messages y
    where y.conversation_id = c.id
    order by y.created_at desc
    limit 1
  ) m on true
  where c.family_id = p_family_id
  order by c.last_message_at desc nulls last, c.created_at;
$$;

revoke execute on function
  public.open_group_conversation(uuid),
  public.open_direct_conversation(uuid, uuid),
  public.delete_chat_message(uuid),
  public.mark_conversation_read(uuid),
  public.chat_overview(uuid)
from public, anon;
grant execute on function
  public.open_group_conversation(uuid),
  public.open_direct_conversation(uuid, uuid),
  public.delete_chat_message(uuid),
  public.mark_conversation_read(uuid),
  public.chat_overview(uuid)
to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end;
$$;

-- =====================================================================
-- Etapa 6 — Notificações
-- Avisos dentro do app (mensagens, tarefas, estoque, despesas e lembretes
-- da agenda) e, se configurado, envio para o celular (Web Push) por uma
-- função na Vercel. Ver docs/NOTIFICACOES.md.
-- =====================================================================

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references public.families (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('chat', 'task', 'stock', 'expense', 'event')),
  title text not null check (char_length(title) between 1 and 160),
  body text check (body is null or char_length(body) <= 300),
  url text check (url is null or (url like '/%' and char_length(url) <= 200)),
  ref_id uuid,
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  pushed_at timestamptz
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;
create policy "Notificações: a própria pessoa vê" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Notificações: a própria pessoa marca como lida" on public.notifications
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Notificações: a própria pessoa apaga" on public.notifications
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.notifications from anon;
revoke insert, update, delete, truncate, references, trigger on public.notifications from authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Aparelhos que recebem notificações (Web Push).
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.push_subscriptions enable row level security;
create policy "Aparelhos: a própria pessoa vê" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Aparelhos: a própria pessoa remove" on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.push_subscriptions from anon;
revoke insert, update, delete, truncate, references, trigger on public.push_subscriptions from authenticated;
grant select, delete on public.push_subscriptions to authenticated;

-- Registra (ou passa para a pessoa atual) o aparelho deste navegador.
create or replace function public.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.require_user();
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now();
end;
$$;

-- O que cada pessoa quer receber no celular (dentro do app aparece tudo).
create table public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  chat boolean not null default true,
  tasks boolean not null default true,
  stock boolean not null default true,
  expenses boolean not null default true,
  agenda boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;
create policy "Preferências: a própria pessoa vê" on public.notification_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Preferências: a própria pessoa cria" on public.notification_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Preferências: a própria pessoa altera" on public.notification_preferences
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.notification_preferences from anon;
revoke insert, update, delete, truncate, references, trigger on public.notification_preferences from authenticated;
grant select on public.notification_preferences to authenticated;
grant insert (user_id, chat, tasks, stock, expenses, agenda) on public.notification_preferences to authenticated;
grant update (chat, tasks, stock, expenses, agenda) on public.notification_preferences to authenticated;

-- Configuração do envio para o celular (preenchida por quem administra o
-- projeto; ninguém do app lê esta tabela).
create table app_private.settings (
  key text primary key,
  value text not null
);
revoke all on app_private.settings from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Criação das notificações
-- ---------------------------------------------------------------------

create or replace function app_private.notify(
  p_family_id uuid,
  p_user_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_url text,
  p_ref_id uuid default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (family_id, user_id, kind, title, body, url, ref_id, actor_id)
  values (p_family_id, p_user_id, p_kind, left(p_title, 160), left(p_body, 300), p_url, p_ref_id, auth.uid());
$$;

create or replace function app_private.display_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(btrim(p.display_name), ''), 'Alguém') from public.profiles p where p.id = p_user_id;
$$;

-- Nova mensagem: avisa quem participa da conversa (menos quem escreveu).
create or replace function app_private.tg_notify_chat_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.chat_conversations;
  v_author text := coalesce(app_private.display_name(new.author_id), 'Alguém');
  v_user uuid;
begin
  select * into c from public.chat_conversations where id = new.conversation_id;
  for v_user in
    select m.user_id from public.family_members m
    where m.family_id = new.family_id
      and m.user_id is distinct from new.author_id
      and (c.kind = 'group' or m.user_id in (c.member_a, c.member_b))
  loop
    perform app_private.notify(
      new.family_id, v_user, 'chat',
      case when c.kind = 'group' then v_author || ' no grupo da família' else v_author end,
      new.body, '/conversas/' || new.conversation_id, new.conversation_id
    );
  end loop;
  return null;
end;
$$;

create trigger chat_messages_notify after insert on public.chat_messages
  for each row execute function app_private.tg_notify_chat_message();

-- Tarefa atribuída a alguém (que não seja quem atribuiu).
create or replace function app_private.tg_notify_task_assigned()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assignee_id is not null
     and new.status = 'open'
     and new.assignee_id is distinct from auth.uid()
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    perform app_private.notify(
      new.family_id, new.assignee_id, 'task',
      'Nova tarefa para você',
      new.title || case when new.due_on is not null then ' (até ' || to_char(new.due_on, 'DD/MM') || ')' else '' end,
      '/tarefas', new.id
    );
  end if;
  return null;
end;
$$;

create trigger tasks_notify after insert or update of assignee_id on public.tasks
  for each row execute function app_private.tg_notify_task_assigned();

-- Item do estoque chegou ao mínimo: avisa a família (menos quem mexeu).
create or replace function app_private.tg_notify_stock_low()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if new.is_low and (tg_op = 'INSERT' or not old.is_low) then
    for v_user in
      select m.user_id from public.family_members m
      where m.family_id = new.family_id and m.user_id is distinct from auth.uid()
    loop
      perform app_private.notify(
        new.family_id, v_user, 'stock',
        'Acabando: ' || new.name,
        'Restam ' || replace(rtrim(to_char(new.quantity, 'FM999999990.###'), '.'), '.', ',') || ' ' ||
          case new.unit::text when 'duzia' then 'dúzia(s)' when 'un' then 'unidade(s)' else new.unit::text end ||
          '. Toque para pôr na lista de compras.',
        '/estoque', new.id
      );
    end loop;
  end if;
  return null;
end;
$$;

create trigger stock_items_notify after insert or update of quantity, min_quantity on public.stock_items
  for each row execute function app_private.tg_notify_stock_low();

-- Despesa dividida (só na criação): avisa quem tem parte nela.
create or replace function app_private.tg_notify_expense_share()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.expenses;
begin
  select * into e from public.expenses where id = new.expense_id;
  if e.created_at = now() and new.user_id is distinct from auth.uid() and new.amount > 0 then
    perform app_private.notify(
      new.family_id, new.user_id, 'expense',
      'Despesa dividida com você',
      e.description || ': sua parte é R$ ' || replace(to_char(new.amount, 'FM9999999990.00'), '.', ','),
      '/despesas', e.id
    );
  end if;
  return null;
end;
$$;

create trigger expense_shares_notify after insert on public.expense_shares
  for each row execute function app_private.tg_notify_expense_share();

-- Ao ler a conversa, os avisos dela também ficam como lidos.
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.require_user();
  if not app_private.can_access_conversation(p_conversation_id) then
    raise exception 'Conversa não encontrada.' using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  insert into public.chat_reads (conversation_id, user_id, last_read_at)
  values (p_conversation_id, auth.uid(), now())
  on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;
  update public.notifications
  set read_at = now()
  where user_id = auth.uid() and kind = 'chat' and ref_id = p_conversation_id and read_at is null;
end;
$$;

-- ---------------------------------------------------------------------
-- Lembretes (agenda e tarefas do dia). Rodar a cada 5 minutos com o
-- pg_cron (ver docs/NOTIFICACOES.md).
-- ---------------------------------------------------------------------

create table app_private.reminder_log (
  kind text not null,
  ref_id uuid not null,
  occurs_on date not null,
  created_at timestamptz not null default now(),
  primary key (kind, ref_id, occurs_on)
);

create or replace function app_private.enqueue_reminders()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := app_private.local_today();
  v_count int := 0;
  r record;
  v_user uuid;
begin
  -- Compromissos com lembrete cuja hora chegou (até 1 dia de atraso).
  for r in
    select e.id, e.family_id, e.title, e.kind, e.start_time, o.occurs_on,
           ((o.occurs_on + coalesce(e.start_time, time '09:00'))::timestamp at time zone 'America/Sao_Paulo')
             - make_interval(mins => e.remind_minutes) as remind_at
    from app_private.event_occurrences(v_today - 1, v_today + 29) o
    join public.events e on e.id = o.event_id
    where e.remind_minutes is not null
  loop
    continue when r.remind_at > now() or r.remind_at < now() - interval '1 day';
    insert into app_private.reminder_log (kind, ref_id, occurs_on) values ('event', r.id, r.occurs_on)
    on conflict do nothing;
    continue when not found;
    for v_user in select m.user_id from public.family_members m where m.family_id = r.family_id loop
      perform app_private.notify(
        r.family_id, v_user, 'event',
        case r.kind
          when 'important_date' then 'Data importante: '
          when 'maintenance' then 'Manutenção: '
          when 'restock' then 'Reposição: '
          else 'Lembrete: '
        end || r.title,
        case when r.occurs_on = v_today then 'Hoje' when r.occurs_on = v_today + 1 then 'Amanhã'
             else to_char(r.occurs_on, 'DD/MM') end
          || case when r.start_time is not null then ' às ' || to_char(r.start_time, 'HH24:MI') else '' end,
        '/agenda', r.id
      );
      v_count := v_count + 1;
    end loop;
  end loop;

  -- Tarefas com prazo hoje (a partir das 9h): avisa o responsável, ou a
  -- família toda quando não há responsável.
  if (now() at time zone 'America/Sao_Paulo')::time >= time '09:00' then
    for r in
      select t.id, t.family_id, t.title, t.assignee_id from public.tasks t
      where t.status = 'open' and t.due_on = v_today
    loop
      insert into app_private.reminder_log (kind, ref_id, occurs_on) values ('task', r.id, v_today)
      on conflict do nothing;
      continue when not found;
      for v_user in
        select m.user_id from public.family_members m
        where m.family_id = r.family_id and (r.assignee_id is null or m.user_id = r.assignee_id)
      loop
        perform app_private.notify(r.family_id, v_user, 'task', 'Tarefa para hoje', r.title, '/tarefas', r.id);
        v_count := v_count + 1;
      end loop;
    end loop;
  end if;

  delete from app_private.reminder_log where created_at < now() - interval '60 days';
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- Envio para o celular: cada notificação nova chama a função da Vercel
-- (api/push), se o pg_net estiver ativo e a configuração preenchida.
-- ---------------------------------------------------------------------

create or replace function app_private.tg_dispatch_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_net') then
    return null;
  end if;
  select value into v_url from app_private.settings where key = 'push_webhook_url';
  select value into v_secret from app_private.settings where key = 'push_webhook_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('notification_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 8000
  );
  return null;
exception when others then
  -- Falha no envio nunca impede a ação principal (mensagem, tarefa...).
  return null;
end;
$$;

create trigger notifications_dispatch_push after insert on public.notifications
  for each row execute function app_private.tg_dispatch_push();

revoke execute on function
  public.save_push_subscription(text, text, text, text),
  public.mark_conversation_read(uuid)
from public, anon;
grant execute on function
  public.save_push_subscription(text, text, text, text),
  public.mark_conversation_read(uuid)
to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

-- =====================================================================
-- Etapa 6 — Categorias personalizadas e exclusão da própria conta
-- =====================================================================

-- Categorias criadas pela família, além das 14 do app. Itens, produtos e
-- estoque guardam o id da categoria no campo "category".
create table public.item_categories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 40),
  emoji text check (emoji is null or char_length(emoji) between 1 and 8),
  position int not null default 0 check (position between 0 and 1000),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, family_id)
);

create unique index item_categories_family_label_uidx on public.item_categories (family_id, lower(btrim(label)));

create trigger item_categories_audit before insert or update on public.item_categories
  for each row execute function app_private.tg_audit_fields();

-- Ao excluir uma categoria, o que estava nela vai para "Outros".
create or replace function app_private.tg_item_category_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.list_items set category = 'outros' where family_id = old.family_id and category = old.id::text;
  update public.products set category = 'outros' where family_id = old.family_id and category = old.id::text;
  update public.stock_items set category = 'outros' where family_id = old.family_id and category = old.id::text;
  return null;
end;
$$;

create trigger item_categories_deleted after delete on public.item_categories
  for each row execute function app_private.tg_item_category_deleted();

alter table public.item_categories enable row level security;
create policy "Categorias: integrantes veem" on public.item_categories
  for select to authenticated using (app_private.is_family_member(family_id));
create policy "Categorias: integrantes criam" on public.item_categories
  for insert to authenticated with check (app_private.is_family_member(family_id));
create policy "Categorias: integrantes editam" on public.item_categories
  for update to authenticated
  using (app_private.is_family_member(family_id))
  with check (app_private.is_family_member(family_id));
create policy "Categorias: autor ou administrador exclui" on public.item_categories
  for delete to authenticated using (app_private.can_delete_record(family_id, created_by));

revoke all on public.item_categories from anon;
revoke insert, update, delete, truncate, references, trigger on public.item_categories from authenticated;
grant select, delete on public.item_categories to authenticated;
grant insert (id, family_id, label, emoji, position) on public.item_categories to authenticated;
grant update (label, emoji, position) on public.item_categories to authenticated;

-- Exclui a conta de quem está conectado. Famílias em que a pessoa era a
-- única integrante são apagadas junto; se ela for a única administradora
-- de uma família com outras pessoas, precisa passar a administração antes.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := app_private.require_user();
  r record;
begin
  for r in
    select f.id, f.name
    from public.family_members m
    join public.families f on f.id = m.family_id
    where m.user_id = v_me and m.role = 'admin'
  loop
    if exists (select 1 from public.family_members o where o.family_id = r.id and o.user_id <> v_me)
       and not exists (select 1 from public.family_members o where o.family_id = r.id and o.user_id <> v_me and o.role = 'admin') then
      raise exception 'Antes de excluir a conta, torne outra pessoa administradora de "%".', r.name
        using errcode = 'P0001', hint = 'LAST_ADMIN';
    end if;
  end loop;

  delete from public.families f
  where exists (select 1 from public.family_members m where m.family_id = f.id and m.user_id = v_me)
    and not exists (select 1 from public.family_members o where o.family_id = f.id and o.user_id <> v_me);

  delete from public.family_members where user_id = v_me;
  delete from auth.users where id = v_me;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

commit;
