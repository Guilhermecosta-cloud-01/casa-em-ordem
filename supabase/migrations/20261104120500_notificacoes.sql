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
