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
