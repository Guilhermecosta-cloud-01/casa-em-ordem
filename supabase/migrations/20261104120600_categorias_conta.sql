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
