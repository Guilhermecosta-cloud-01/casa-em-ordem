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
