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
