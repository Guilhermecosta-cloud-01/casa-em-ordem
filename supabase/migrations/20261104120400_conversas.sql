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
