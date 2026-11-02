-- =====================================================================
-- Casa em Ordem — 002: compras, catálogo, preços e comparações
--
-- Modelo de quantidade dos itens (igual em itens, produtos e preços):
--   packages     quantidade de embalagens (ex.: 3)
--   quantity     conteúdo de cada embalagem na unidade "unit" (ex.: 5)
--   unit         unidade de medida (un, kg, g, L, mL, pacote, caixa, duzia)
--   unit_price   preço unitário estimado
--   price_basis  'package' = preço por embalagem
--                'measure' = preço por kg (g/kg), por L (mL/L) ou pela
--                            própria unidade (un, dúzia, pacote, caixa)
--
--   3 pacotes de arroz de 5 kg → packages 3, quantity 5, unit kg
--                               → 3 embalagens e 15 kg de conteúdo total.
--
-- As referências entre tabelas usam chaves compostas (id, family_id) para
-- que um registro nunca aponte para dados de outra família, mesmo que
-- alguém tente forjar um identificador.
-- =====================================================================

create domain public.measure_unit as text
  check (value in ('un', 'kg', 'g', 'L', 'mL', 'pacote', 'caixa', 'duzia'));

create domain public.price_basis as text
  check (value in ('package', 'measure'));

-- Total de uma linha, arredondado em centavos como no cupom fiscal.
-- A mesma regra está em src/modules/shopping/domain/totals.ts (testada).
create or replace function public.item_line_total(
  p_packages numeric,
  p_quantity numeric,
  p_unit text,
  p_unit_price numeric,
  p_price_basis text
)
returns numeric
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_unit_price is null then null
    when p_price_basis = 'measure' then round(
      p_packages * coalesce(p_quantity, 1)
        * (case when p_unit in ('g', 'mL') then 0.001 else 1 end)
        * p_unit_price,
      2)
    else round(p_packages * p_unit_price, 2)
  end;
$$;

-- ---------------------------------------------------------------------
-- Estabelecimentos
-- ---------------------------------------------------------------------

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, family_id)
);

create unique index stores_family_name_uidx on public.stores (family_id, lower(btrim(name)));

-- ---------------------------------------------------------------------
-- Catálogo de produtos frequentes
-- ---------------------------------------------------------------------

create table public.products (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  category text not null default 'outros' check (char_length(category) between 1 and 40),
  brand text check (brand is null or char_length(brand) <= 80),
  unit public.measure_unit not null default 'un',
  package_size numeric(12,3) check (package_size is null or (package_size > 0 and package_size <= 999999)),
  notes text check (notes is null or char_length(notes) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, family_id)
);

create unique index products_family_name_brand_uidx
  on public.products (family_id, lower(btrim(name)), lower(btrim(coalesce(brand, ''))));

-- ---------------------------------------------------------------------
-- Listas de compras e itens
-- ---------------------------------------------------------------------

create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text check (description is null or char_length(description) <= 300),
  list_date date,
  status text not null default 'active' check (status in ('active', 'archived')),
  is_featured boolean not null default false,
  budget numeric(12,2) check (budget is null or (budget >= 0 and budget <= 9999999)),
  completed_at timestamptz,
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, family_id)
);

-- No máximo uma lista em destaque por família.
create unique index shopping_lists_featured_uidx on public.shopping_lists (family_id) where is_featured;
create index shopping_lists_family_idx on public.shopping_lists (family_id, status, updated_at desc);

create table public.list_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  list_id uuid not null,
  product_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  category text not null default 'outros' check (char_length(category) between 1 and 40),
  brand text check (brand is null or char_length(brand) <= 80),
  packages numeric(10,3) not null default 1 check (packages > 0 and packages <= 9999),
  quantity numeric(12,3) check (quantity is null or (quantity > 0 and quantity <= 999999)),
  unit public.measure_unit not null default 'un',
  unit_price numeric(12,2) check (unit_price is null or (unit_price >= 0 and unit_price <= 9999999)),
  price_basis public.price_basis not null default 'package',
  notes text check (notes is null or char_length(notes) <= 500),
  is_purchased boolean not null default false,
  purchased_at timestamptz,
  purchased_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint list_items_list_fk foreign key (list_id, family_id)
    references public.shopping_lists (id, family_id) on delete cascade,
  constraint list_items_product_fk foreign key (product_id, family_id)
    references public.products (id, family_id) on delete set null (product_id)
);

create index list_items_list_idx on public.list_items (list_id);
create index list_items_family_idx on public.list_items (family_id);
create index list_items_product_idx on public.list_items (product_id) where product_id is not null;

-- ---------------------------------------------------------------------
-- Compras concluídas (retrato da lista no momento da finalização)
-- ---------------------------------------------------------------------

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  list_id uuid,
  store_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  purchased_on date not null default current_date,
  estimated_total numeric(12,2) not null default 0,
  paid_total numeric(12,2) check (paid_total is null or (paid_total >= 0 and paid_total <= 9999999)),
  items_count int not null default 0,
  purchased_count int not null default 0,
  notes text check (notes is null or char_length(notes) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, family_id),
  constraint purchases_list_fk foreign key (list_id, family_id)
    references public.shopping_lists (id, family_id) on delete set null (list_id),
  constraint purchases_store_fk foreign key (store_id, family_id)
    references public.stores (id, family_id) on delete set null (store_id)
);

create unique index purchases_list_uidx on public.purchases (list_id) where list_id is not null;
create index purchases_family_idx on public.purchases (family_id, purchased_on desc, created_at desc);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  purchase_id uuid not null,
  product_id uuid,
  name text not null,
  category text not null,
  brand text,
  packages numeric(10,3) not null,
  quantity numeric(12,3),
  unit public.measure_unit not null,
  unit_price numeric(12,2),
  price_basis public.price_basis not null,
  line_total numeric(12,2),
  created_at timestamptz not null default now(),
  constraint purchase_items_purchase_fk foreign key (purchase_id, family_id)
    references public.purchases (id, family_id) on delete cascade,
  constraint purchase_items_product_fk foreign key (product_id, family_id)
    references public.products (id, family_id) on delete set null (product_id)
);

create index purchase_items_purchase_idx on public.purchase_items (purchase_id);

-- ---------------------------------------------------------------------
-- Histórico de preços (somente inclusão; nada é substituído)
-- ---------------------------------------------------------------------

create table public.price_records (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  product_id uuid not null,
  store_id uuid,
  purchase_id uuid,
  price numeric(12,2) not null check (price >= 0 and price <= 9999999),
  price_basis public.price_basis not null default 'package',
  quantity numeric(12,3) check (quantity is null or (quantity > 0 and quantity <= 999999)),
  unit public.measure_unit not null default 'un',
  recorded_on date not null default current_date,
  source text not null default 'manual' check (source in ('manual', 'purchase')),
  notes text check (notes is null or char_length(notes) <= 300),
  -- Unidade de comparação: kg para g/kg, L para mL/L, a própria unidade nos demais.
  ref_unit text generated always as (
    case when unit in ('g', 'kg') then 'kg' when unit in ('mL', 'L') then 'L' else unit::text end
  ) stored,
  -- Preço por kg / L / unidade, para comparar registros de embalagens diferentes.
  normalized_price numeric generated always as (
    round(
      case
        when price_basis = 'measure' then price
        else price / (coalesce(quantity, 1) * (case when unit in ('g', 'mL') then 0.001 else 1 end))
      end,
      6)
  ) stored,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint price_records_product_fk foreign key (product_id, family_id)
    references public.products (id, family_id) on delete cascade,
  constraint price_records_store_fk foreign key (store_id, family_id)
    references public.stores (id, family_id) on delete set null (store_id),
  constraint price_records_purchase_fk foreign key (purchase_id, family_id)
    references public.purchases (id, family_id) on delete cascade
);

create index price_records_product_idx on public.price_records (product_id, recorded_on desc, created_at desc);
create index price_records_family_idx on public.price_records (family_id);

-- ---------------------------------------------------------------------
-- Comparações salvas da calculadora
-- ---------------------------------------------------------------------

create table public.price_comparisons (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  product_id uuid,
  title text not null default '' check (char_length(title) <= 80),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 20000),
  summary text check (summary is null or char_length(summary) <= 400),
  is_favorite boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint price_comparisons_product_fk foreign key (product_id, family_id)
    references public.products (id, family_id) on delete set null (product_id)
);

create index price_comparisons_family_idx on public.price_comparisons (family_id, created_at desc);

-- ---------------------------------------------------------------------
-- Recibos de sincronização: garantem que um ajuste de quantidade enviado
-- de novo (por exemplo, depois de uma queda de conexão) seja aplicado
-- uma única vez.
-- ---------------------------------------------------------------------

create table public.sync_receipts (
  op_id uuid primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index sync_receipts_user_idx on public.sync_receipts (user_id, created_at);

-- ---------------------------------------------------------------------
-- Gatilhos
-- ---------------------------------------------------------------------

create trigger stores_audit before insert or update on public.stores
  for each row execute function app_private.tg_audit_fields();
create trigger products_audit before insert or update on public.products
  for each row execute function app_private.tg_audit_fields();
create trigger shopping_lists_audit before insert or update on public.shopping_lists
  for each row execute function app_private.tg_audit_fields();
create trigger list_items_audit before insert or update on public.list_items
  for each row execute function app_private.tg_audit_fields();
create trigger purchases_audit before insert or update on public.purchases
  for each row execute function app_private.tg_audit_fields();
create trigger price_records_audit before insert or update on public.price_records
  for each row execute function app_private.tg_audit_fields();
create trigger price_comparisons_audit before insert or update on public.price_comparisons
  for each row execute function app_private.tg_audit_fields();

-- Quem marcou e quando marcou como comprado.
create or replace function app_private.tg_list_item_purchased()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.is_purchased is distinct from old.is_purchased then
    if new.is_purchased then
      new.purchased_at := now();
      new.purchased_by := coalesce(auth.uid(), new.purchased_by);
    else
      new.purchased_at := null;
      new.purchased_by := null;
    end if;
  else
    new.purchased_at := old.purchased_at;
    new.purchased_by := old.purchased_by;
  end if;
  return new;
end;
$$;

create trigger list_items_purchased before insert or update on public.list_items
  for each row execute function app_private.tg_list_item_purchased();

-- Arquivar tira a lista do destaque e registra a data.
create or replace function app_private.tg_shopping_list_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.archived_at := case when new.status = 'archived' then now() end;
    if new.status = 'archived' then new.is_featured := false; end if;
  elsif new.status is distinct from old.status then
    if new.status = 'archived' then
      new.archived_at := now();
      new.is_featured := false;
    else
      new.archived_at := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger shopping_lists_status before insert or update on public.shopping_lists
  for each row execute function app_private.tg_shopping_list_status();

revoke all on all functions in schema app_private from public;
grant execute on all functions in schema app_private to authenticated, service_role;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

alter table public.stores enable row level security;
alter table public.products enable row level security;
alter table public.shopping_lists enable row level security;
alter table public.list_items enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.price_records enable row level security;
alter table public.price_comparisons enable row level security;
alter table public.sync_receipts enable row level security;

-- Estabelecimentos
create policy "Estabelecimentos: integrantes veem" on public.stores
  for select to authenticated using (app_private.is_family_member(family_id));
create policy "Estabelecimentos: integrantes cadastram" on public.stores
  for insert to authenticated with check (app_private.is_family_member(family_id));
create policy "Estabelecimentos: integrantes editam" on public.stores
  for update to authenticated
  using (app_private.is_family_member(family_id)) with check (app_private.is_family_member(family_id));
create policy "Estabelecimentos: autor ou administrador exclui" on public.stores
  for delete to authenticated using (app_private.can_delete_record(family_id, created_by));

-- Produtos
create policy "Produtos: integrantes veem" on public.products
  for select to authenticated using (app_private.is_family_member(family_id));
create policy "Produtos: integrantes cadastram" on public.products
  for insert to authenticated with check (app_private.is_family_member(family_id));
create policy "Produtos: integrantes editam" on public.products
  for update to authenticated
  using (app_private.is_family_member(family_id)) with check (app_private.is_family_member(family_id));
create policy "Produtos: autor ou administrador exclui" on public.products
  for delete to authenticated using (app_private.can_delete_record(family_id, created_by));

-- Listas
create policy "Listas: integrantes veem" on public.shopping_lists
  for select to authenticated using (app_private.is_family_member(family_id));
create policy "Listas: integrantes criam" on public.shopping_lists
  for insert to authenticated with check (app_private.is_family_member(family_id));
create policy "Listas: integrantes editam" on public.shopping_lists
  for update to authenticated
  using (app_private.is_family_member(family_id)) with check (app_private.is_family_member(family_id));
create policy "Listas: autor ou administrador exclui" on public.shopping_lists
  for delete to authenticated using (app_private.can_delete_record(family_id, created_by));

-- Itens (colaborativos: qualquer integrante inclui, altera e remove)
create policy "Itens: integrantes veem" on public.list_items
  for select to authenticated using (app_private.is_family_member(family_id));
create policy "Itens: integrantes incluem" on public.list_items
  for insert to authenticated with check (app_private.is_family_member(family_id));
create policy "Itens: integrantes editam" on public.list_items
  for update to authenticated
  using (app_private.is_family_member(family_id)) with check (app_private.is_family_member(family_id));
create policy "Itens: integrantes removem" on public.list_items
  for delete to authenticated using (app_private.is_family_member(family_id));

-- Compras concluídas (criadas pela função complete_shopping_list)
create policy "Compras: integrantes veem" on public.purchases
  for select to authenticated using (app_private.is_family_member(family_id));
create policy "Compras: integrantes editam" on public.purchases
  for update to authenticated
  using (app_private.is_family_member(family_id)) with check (app_private.is_family_member(family_id));
create policy "Compras: autor ou administrador exclui" on public.purchases
  for delete to authenticated using (app_private.can_delete_record(family_id, created_by));

create policy "Itens comprados: integrantes veem" on public.purchase_items
  for select to authenticated using (app_private.is_family_member(family_id));

-- Histórico de preços
create policy "Preços: integrantes veem" on public.price_records
  for select to authenticated using (app_private.is_family_member(family_id));
create policy "Preços: integrantes registram" on public.price_records
  for insert to authenticated
  with check (app_private.is_family_member(family_id) and source = 'manual' and purchase_id is null);
create policy "Preços: autor ou administrador exclui" on public.price_records
  for delete to authenticated using (app_private.can_delete_record(family_id, created_by));

-- Comparações
create policy "Comparações: integrantes veem" on public.price_comparisons
  for select to authenticated using (app_private.is_family_member(family_id));
create policy "Comparações: integrantes salvam" on public.price_comparisons
  for insert to authenticated with check (app_private.is_family_member(family_id));
create policy "Comparações: integrantes editam" on public.price_comparisons
  for update to authenticated
  using (app_private.is_family_member(family_id)) with check (app_private.is_family_member(family_id));
create policy "Comparações: autor ou administrador exclui" on public.price_comparisons
  for delete to authenticated using (app_private.can_delete_record(family_id, created_by));

-- Recibos: cada pessoa só enxerga e cria os próprios
create policy "Recibos: o próprio usuário" on public.sync_receipts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Recibos: o próprio usuário registra" on public.sync_receipts
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Recibos: o próprio usuário limpa" on public.sync_receipts
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Privilégios por coluna: além do RLS, o banco só aceita alterações nas
-- colunas que a interface realmente edita.
-- ---------------------------------------------------------------------

revoke all on
  public.stores, public.products, public.shopping_lists, public.list_items,
  public.purchases, public.purchase_items, public.price_records,
  public.price_comparisons, public.sync_receipts
from anon;

revoke insert, update, delete, truncate, references, trigger on
  public.stores, public.products, public.shopping_lists, public.list_items,
  public.purchases, public.purchase_items, public.price_records,
  public.price_comparisons, public.sync_receipts
from authenticated;

grant select on
  public.stores, public.products, public.shopping_lists, public.list_items,
  public.purchases, public.purchase_items, public.price_records,
  public.price_comparisons, public.sync_receipts
to authenticated;

grant insert, delete on public.stores to authenticated;
grant update (name) on public.stores to authenticated;

grant insert, delete on public.products to authenticated;
grant update (name, category, brand, unit, package_size, notes) on public.products to authenticated;

grant insert (id, family_id, name, description, list_date, budget, status) on public.shopping_lists to authenticated;
grant update (name, description, list_date, budget, status) on public.shopping_lists to authenticated;
grant delete on public.shopping_lists to authenticated;

grant insert (id, family_id, list_id, product_id, name, category, brand, packages, quantity, unit, unit_price, price_basis, notes, is_purchased)
  on public.list_items to authenticated;
grant update (product_id, name, category, brand, packages, quantity, unit, unit_price, price_basis, notes, is_purchased)
  on public.list_items to authenticated;
grant delete on public.list_items to authenticated;

grant update (store_id, name, purchased_on, paid_total, notes) on public.purchases to authenticated;
grant delete on public.purchases to authenticated;

grant insert (id, family_id, product_id, store_id, price, price_basis, quantity, unit, recorded_on, notes)
  on public.price_records to authenticated;
grant delete on public.price_records to authenticated;

grant insert (id, family_id, product_id, title, payload, summary, is_favorite) on public.price_comparisons to authenticated;
grant update (product_id, title, payload, summary, is_favorite) on public.price_comparisons to authenticated;
grant delete on public.price_comparisons to authenticated;

grant insert (op_id), delete on public.sync_receipts to authenticated;

-- ---------------------------------------------------------------------
-- Visões (security_invoker: respeitam o RLS de quem consulta)
-- ---------------------------------------------------------------------

create view public.shopping_list_summaries
with (security_invoker = true)
as
select
  l.id as list_id,
  l.family_id,
  count(i.id)::int as items_count,
  (count(i.id) filter (where i.is_purchased))::int as purchased_count,
  (count(i.id) filter (where i.unit_price is null))::int as unpriced_count,
  coalesce(sum(public.item_line_total(i.packages, i.quantity, i.unit, i.unit_price, i.price_basis)), 0)::numeric(12,2) as estimated_total,
  coalesce(sum(public.item_line_total(i.packages, i.quantity, i.unit, i.unit_price, i.price_basis)) filter (where i.is_purchased), 0)::numeric(12,2) as purchased_total,
  max(i.updated_at) as items_updated_at
from public.shopping_lists l
left join public.list_items i on i.list_id = l.id
group by l.id, l.family_id;

create view public.product_price_stats
with (security_invoker = true)
as
with ranked as (
  select
    r.*,
    row_number() over (partition by r.product_id order by r.recorded_on desc, r.created_at desc) as rn
  from public.price_records r
),
latest as (
  select * from ranked where rn = 1
),
previous as (
  select distinct on (r.product_id)
    r.product_id,
    r.normalized_price,
    r.price,
    r.recorded_on
  from ranked r
  join latest l on l.product_id = r.product_id and r.ref_unit = l.ref_unit and r.rn > 1
  order by r.product_id, r.rn
),
bounds as (
  select
    r.product_id,
    min(r.normalized_price) as min_normalized,
    max(r.normalized_price) as max_normalized,
    count(*)::int as comparable_count
  from public.price_records r
  join latest l on l.product_id = r.product_id and r.ref_unit = l.ref_unit
  group by r.product_id
)
select
  l.product_id,
  l.family_id,
  l.id as last_record_id,
  l.price as last_price,
  l.price_basis as last_price_basis,
  l.quantity as last_quantity,
  l.unit as last_unit,
  l.ref_unit,
  l.normalized_price as last_normalized,
  l.recorded_on as last_recorded_on,
  l.store_id as last_store_id,
  p.normalized_price as previous_normalized,
  p.price as previous_price,
  p.recorded_on as previous_recorded_on,
  b.min_normalized,
  b.max_normalized,
  b.comparable_count,
  (select count(*)::int from public.price_records x where x.product_id = l.product_id) as records_count
from latest l
left join previous p on p.product_id = l.product_id
left join bounds b on b.product_id = l.product_id;

revoke all on public.shopping_list_summaries, public.product_price_stats from anon;
grant select on public.shopping_list_summaries, public.product_price_stats to authenticated;

-- ---------------------------------------------------------------------
-- Funções (RPC)
-- ---------------------------------------------------------------------

-- Ajusta a quantidade de embalagens somando um delta. Duas pessoas que
-- tocam em "+" ao mesmo tempo somam as duas alterações (nenhuma se perde),
-- e o op_id evita aplicar duas vezes a mesma alteração reenviada.
create or replace function public.adjust_list_item_packages(
  p_item_id uuid,
  p_delta numeric,
  p_op_id uuid default null
)
returns numeric
language plpgsql
set search_path = ''
as $$
declare
  v_packages numeric;
  v_inserted int := 1;
begin
  perform app_private.require_user();
  if p_delta is null or p_delta = 0 or abs(p_delta) > 1000 then
    raise exception 'Ajuste de quantidade inválido.' using errcode = '22023', hint = 'INVALID_DELTA';
  end if;

  if p_op_id is not null then
    insert into public.sync_receipts (op_id) values (p_op_id) on conflict (op_id) do nothing;
    get diagnostics v_inserted = row_count;
  end if;

  if v_inserted = 1 then
    update public.list_items i
    set packages = i.packages + p_delta
    where i.id = p_item_id
      and i.packages + p_delta > 0
      and i.packages + p_delta <= 9999
    returning i.packages into v_packages;
  end if;

  if v_packages is null then
    select i.packages into v_packages from public.list_items i where i.id = p_item_id;
    if not found then
      raise exception 'Este item não está mais na lista.' using errcode = 'P0002', hint = 'NOT_FOUND';
    end if;
  end if;

  delete from public.sync_receipts r
  where r.user_id = auth.uid() and r.created_at < now() - interval '30 days';

  return v_packages;
end;
$$;

-- Definer porque a coluna is_featured não pode ser alterada diretamente
-- (garante uma única lista em destaque por família); a permissão é
-- conferida logo no início.
create or replace function public.set_featured_list(p_list_id uuid, p_featured boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family_id uuid;
  v_status text;
begin
  perform app_private.require_user();
  select l.family_id, l.status into v_family_id, v_status
  from public.shopping_lists l where l.id = p_list_id;
  if v_family_id is null or not app_private.is_family_member(v_family_id) then
    raise exception 'Lista não encontrada.' using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  -- Serializa por família para que dois toques simultâneos não deixem
  -- duas listas em destaque.
  perform pg_advisory_xact_lock(hashtextextended('featured:' || v_family_id::text, 0));

  if p_featured then
    if v_status <> 'active' then
      raise exception 'Somente listas ativas podem ficar em destaque.' using errcode = 'P0001', hint = 'LIST_ARCHIVED';
    end if;
    update public.shopping_lists l set is_featured = false
    where l.family_id = v_family_id and l.is_featured and l.id <> p_list_id;
    update public.shopping_lists l set is_featured = true where l.id = p_list_id;
  else
    update public.shopping_lists l set is_featured = false where l.id = p_list_id;
  end if;
end;
$$;

create or replace function public.duplicate_shopping_list(p_list_id uuid, p_name text default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_src public.shopping_lists%rowtype;
  v_new_id uuid;
begin
  perform app_private.require_user();
  select * into v_src from public.shopping_lists l where l.id = p_list_id;
  if not found then
    raise exception 'Lista não encontrada.' using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  insert into public.shopping_lists (family_id, name, description, list_date, budget)
  values (
    v_src.family_id,
    left(coalesce(nullif(btrim(p_name), ''), v_src.name), 80),
    v_src.description,
    current_date,
    v_src.budget
  )
  returning id into v_new_id;

  insert into public.list_items (
    family_id, list_id, product_id, name, category, brand,
    packages, quantity, unit, unit_price, price_basis, notes
  )
  select
    i.family_id, v_new_id, i.product_id, i.name, i.category, i.brand,
    i.packages, i.quantity, i.unit, i.unit_price, i.price_basis, i.notes
  from public.list_items i
  where i.list_id = p_list_id
  order by i.created_at;

  return v_new_id;
end;
$$;

-- Finaliza a compra: registra a compra concluída com os itens comprados,
-- (opcional) cadastra no catálogo os produtos que ainda não existem,
-- (opcional) grava os preços no histórico e arquiva a lista.
-- Roda como definer para gravar o retrato da compra, mas só depois de
-- confirmar que quem chamou é integrante da família dona da lista.
create or replace function public.complete_shopping_list(
  p_list_id uuid,
  p_purchased_on date default null,
  p_store_id uuid default null,
  p_paid_total numeric default null,
  p_notes text default null,
  p_record_prices boolean default true,
  p_save_to_catalog boolean default true,
  p_archive boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.shopping_lists%rowtype;
  v_purchase_id uuid;
  v_item record;
  v_product_id uuid;
  v_items int;
  v_bought int;
  v_estimated numeric;
  v_date date := coalesce(p_purchased_on, current_date);
begin
  perform app_private.require_user();

  select * into v_list from public.shopping_lists l where l.id = p_list_id for update;
  if not found or not app_private.is_family_member(v_list.family_id) then
    raise exception 'Lista não encontrada.' using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  if p_store_id is not null and not exists (
    select 1 from public.stores s where s.id = p_store_id and s.family_id = v_list.family_id
  ) then
    raise exception 'Estabelecimento não encontrado.' using errcode = 'P0002', hint = 'STORE_NOT_FOUND';
  end if;
  if p_paid_total is not null and (p_paid_total < 0 or p_paid_total > 9999999) then
    raise exception 'Valor pago inválido.' using errcode = '22023', hint = 'INVALID_AMOUNT';
  end if;
  if v_date > current_date + 1 then
    raise exception 'A data da compra não pode estar no futuro.' using errcode = '22023', hint = 'INVALID_DATE';
  end if;

  select count(*), count(*) filter (where i.is_purchased)
    into v_items, v_bought
  from public.list_items i where i.list_id = p_list_id;

  if v_bought = 0 then
    raise exception 'Marque pelo menos um item como comprado antes de finalizar.' using errcode = 'P0001', hint = 'NOTHING_PURCHASED';
  end if;

  if p_save_to_catalog then
    for v_item in
      select i.id, i.name, i.category, i.brand, i.unit, i.quantity
      from public.list_items i
      where i.list_id = p_list_id and i.is_purchased and i.product_id is null
      order by i.created_at
    loop
      v_product_id := null;
      insert into public.products (family_id, name, category, brand, unit, package_size)
      values (
        v_list.family_id,
        btrim(v_item.name),
        v_item.category,
        nullif(btrim(coalesce(v_item.brand, '')), ''),
        v_item.unit,
        v_item.quantity
      )
      on conflict (family_id, lower(btrim(name)), lower(btrim(coalesce(brand, '')))) do nothing
      returning id into v_product_id;

      if v_product_id is null then
        select p.id into v_product_id
        from public.products p
        where p.family_id = v_list.family_id
          and lower(btrim(p.name)) = lower(btrim(v_item.name))
          and lower(btrim(coalesce(p.brand, ''))) = lower(btrim(coalesce(v_item.brand, '')));
      end if;

      update public.list_items i set product_id = v_product_id where i.id = v_item.id;
    end loop;
  end if;

  -- Se a lista foi reaberta e finalizada de novo, o retrato anterior é
  -- substituído (os preços gravados por ele saem junto).
  delete from public.purchases pu where pu.list_id = p_list_id;

  select coalesce(sum(public.item_line_total(i.packages, i.quantity, i.unit, i.unit_price, i.price_basis)), 0)
    into v_estimated
  from public.list_items i
  where i.list_id = p_list_id and i.is_purchased;

  insert into public.purchases (
    family_id, list_id, store_id, name, purchased_on, estimated_total,
    paid_total, items_count, purchased_count, notes
  )
  values (
    v_list.family_id, p_list_id, p_store_id, v_list.name, v_date, v_estimated,
    p_paid_total, v_items, v_bought, nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning id into v_purchase_id;

  insert into public.purchase_items (
    family_id, purchase_id, product_id, name, category, brand,
    packages, quantity, unit, unit_price, price_basis, line_total
  )
  select
    i.family_id, v_purchase_id, i.product_id, i.name, i.category, i.brand,
    i.packages, i.quantity, i.unit, i.unit_price, i.price_basis,
    public.item_line_total(i.packages, i.quantity, i.unit, i.unit_price, i.price_basis)
  from public.list_items i
  where i.list_id = p_list_id and i.is_purchased
  order by i.category, i.name;

  if p_record_prices then
    insert into public.price_records (
      family_id, product_id, store_id, purchase_id, price, price_basis,
      quantity, unit, recorded_on, source
    )
    select
      i.family_id, i.product_id, p_store_id, v_purchase_id, i.unit_price, i.price_basis,
      i.quantity, i.unit, v_date, 'purchase'
    from public.list_items i
    where i.list_id = p_list_id
      and i.is_purchased
      and i.product_id is not null
      and i.unit_price is not null;
  end if;

  update public.shopping_lists l
  set completed_at = now(),
      status = case when p_archive then 'archived' else l.status end
  where l.id = p_list_id;

  return v_purchase_id;
end;
$$;

revoke execute on function
  public.item_line_total(numeric, numeric, text, numeric, text),
  public.adjust_list_item_packages(uuid, numeric, uuid),
  public.set_featured_list(uuid, boolean),
  public.duplicate_shopping_list(uuid, text),
  public.complete_shopping_list(uuid, date, uuid, numeric, text, boolean, boolean, boolean)
from public, anon;

grant execute on function
  public.item_line_total(numeric, numeric, text, numeric, text),
  public.adjust_list_item_packages(uuid, numeric, uuid),
  public.set_featured_list(uuid, boolean),
  public.duplicate_shopping_list(uuid, text),
  public.complete_shopping_list(uuid, date, uuid, numeric, text, boolean, boolean, boolean)
to authenticated;

-- ---------------------------------------------------------------------
-- Realtime: avisa os aparelhos da família quando listas e itens mudam.
-- (O Realtime respeita o RLS: cada pessoa só recebe eventos das próprias
-- famílias.)
-- ---------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.list_items, public.shopping_lists;
  end if;
end;
$$;
