-- =====================================================================
-- Casa em Ordem — 001: núcleo
-- Perfis, famílias, integrantes, convites, funções auxiliares e RLS.
--
-- Princípios:
--   * Todo dado compartilhado pertence a uma família (family_id).
--   * RLS habilitado em todas as tabelas; o acesso é concedido apenas a
--     integrantes autenticados da família correspondente.
--   * Operações que exigem várias verificações (criar família, convidar,
--     aceitar convite, sair, mudar papéis) acontecem em funções SQL que
--     validam as permissões no próprio banco.
--   * Funções auxiliares ficam no esquema app_private, que não é exposto
--     pela API.
-- =====================================================================

create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Gatilhos genéricos
-- ---------------------------------------------------------------------

-- Preenche created_at/created_by/updated_at/updated_by com o usuário
-- autenticado e impede que um registro seja movido para outra família.
create or replace function app_private.tg_audit_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := coalesce(uid, new.created_by);
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    if (to_jsonb(new) ->> 'family_id') is distinct from (to_jsonb(old) ->> 'family_id') then
      raise exception 'Não é permitido mover registros entre famílias.'
        using errcode = '42501', hint = 'FAMILY_IMMUTABLE';
    end if;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(uid, new.updated_by);
  return new;
end;
$$;

create or replace function app_private.tg_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Perfis (um por usuário do Supabase Auth)
-- ---------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  -- Foto reduzida (até ~150 KB) no formato data URL. Fica protegida pelas
  -- mesmas regras de RLS do perfil e dispensa configurar o Storage.
  avatar_data text check (
    avatar_data is null
    or (avatar_data ~ '^data:image/(jpeg|png|webp);base64,' and octet_length(avatar_data) <= 150000)
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Nome e foto de cada pessoa. Visível apenas para quem compartilha uma família com ela.';

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function app_private.tg_touch_updated_at();

create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(
      coalesce(
        nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
        split_part(coalesce(new.email, ''), '@', 1)
      ),
      60
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app_private.handle_new_user();

-- Usuários que já existiam antes desta migração também ganham perfil.
insert into public.profiles (id, display_name)
select u.id, left(split_part(coalesce(u.email, ''), '@', 1), 60)
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Famílias e integrantes
-- ---------------------------------------------------------------------

create type public.family_role as enum ('admin', 'member');

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger families_audit
  before insert or update on public.families
  for each row execute function app_private.tg_audit_fields();

create table public.family_members (
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.family_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);

create index family_members_user_idx on public.family_members (user_id);

-- ---------------------------------------------------------------------
-- Convites
-- O token é gerado no banco, entregue uma única vez a quem criou o
-- convite e armazenado apenas como hash SHA-256.
-- ---------------------------------------------------------------------

create table public.family_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  token_hash text not null unique,
  note text check (note is null or char_length(note) <= 60),
  max_uses int not null default 1 check (max_uses between 1 and 10),
  use_count int not null default 0 check (use_count >= 0),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index family_invites_family_idx on public.family_invites (family_id);

-- ---------------------------------------------------------------------
-- Funções auxiliares usadas nas políticas
-- ---------------------------------------------------------------------

create or replace function app_private.is_family_member(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.family_members m
    where m.family_id = p_family_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function app_private.is_family_admin(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.family_members m
    where m.family_id = p_family_id
      and m.user_id = (select auth.uid())
      and m.role = 'admin'
  );
$$;

create or replace function app_private.shares_family_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = (select auth.uid())
    or exists (
      select 1
      from public.family_members me
      join public.family_members other on other.family_id = me.family_id
      where me.user_id = (select auth.uid())
        and other.user_id = p_user_id
    );
$$;

-- Pode excluir: administradores da família ou quem criou o registro
-- (desde que ainda seja integrante).
create or replace function app_private.can_delete_record(p_family_id uuid, p_created_by uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.is_family_admin(p_family_id)
    or (
      p_created_by is not null
      and p_created_by = (select auth.uid())
      and app_private.is_family_member(p_family_id)
    );
$$;

create or replace function app_private.require_user()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = '28000', hint = 'NOT_AUTHENTICATED';
  end if;
  return uid;
end;
$$;

create or replace function app_private.invite_token_hash(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
$$;

revoke all on all functions in schema app_private from public;
grant execute on all functions in schema app_private to authenticated, service_role;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.family_invites enable row level security;

create policy "Perfis: ver o próprio e de quem está na mesma família"
  on public.profiles for select to authenticated
  using (app_private.shares_family_with(id));

create policy "Perfis: editar somente o próprio"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Famílias: integrantes podem ver"
  on public.families for select to authenticated
  using (app_private.is_family_member(id));

create policy "Famílias: administradores podem renomear"
  on public.families for update to authenticated
  using (app_private.is_family_admin(id))
  with check (app_private.is_family_admin(id));

create policy "Integrantes: visíveis para a própria família"
  on public.family_members for select to authenticated
  using (app_private.is_family_member(family_id));

create policy "Convites: visíveis para administradores"
  on public.family_invites for select to authenticated
  using (app_private.is_family_admin(family_id));

-- Privilégios: visitantes anônimos não acessam nada; usuários autenticados
-- só alteram as colunas previstas. Inserções e exclusões de famílias,
-- integrantes e convites acontecem apenas pelas funções abaixo.
revoke all on public.profiles, public.families, public.family_members, public.family_invites from anon;
revoke insert, update, delete, truncate, references, trigger on public.profiles, public.families, public.family_members, public.family_invites from authenticated;
grant select on public.profiles, public.families, public.family_members, public.family_invites to authenticated;
grant update (display_name, avatar_data) on public.profiles to authenticated;
grant update (name) on public.families to authenticated;

-- ---------------------------------------------------------------------
-- Funções públicas (RPC)
-- ---------------------------------------------------------------------

create or replace function public.create_family(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
  v_family_id uuid;
begin
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 60 then
    raise exception 'Informe um nome com até 60 caracteres.' using errcode = '22023', hint = 'INVALID_NAME';
  end if;
  if (select count(*) from public.family_members m where m.user_id = uid) >= 10 then
    raise exception 'Cada pessoa pode participar de até 10 famílias.' using errcode = '54000', hint = 'FAMILY_LIMIT';
  end if;

  insert into public.families (name, created_by, updated_by)
  values (btrim(p_name), uid, uid)
  returning id into v_family_id;

  insert into public.family_members (family_id, user_id, role)
  values (v_family_id, uid, 'admin');

  return v_family_id;
end;
$$;

create or replace function public.create_family_invite(
  p_family_id uuid,
  p_max_uses int default 1,
  p_valid_days int default 7,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
  v_token text;
  v_invite_id uuid;
  v_expires_at timestamptz;
begin
  if not app_private.is_family_admin(p_family_id) then
    raise exception 'Somente administradores podem convidar integrantes.' using errcode = '42501', hint = 'NOT_ADMIN';
  end if;
  if coalesce(p_max_uses, 0) not between 1 and 10 then
    raise exception 'O convite pode ser usado de 1 a 10 vezes.' using errcode = '22023', hint = 'INVALID_MAX_USES';
  end if;
  if coalesce(p_valid_days, 0) not between 1 and 30 then
    raise exception 'A validade do convite deve ser de 1 a 30 dias.' using errcode = '22023', hint = 'INVALID_VALIDITY';
  end if;
  if (
    select count(*) from public.family_invites i
    where i.family_id = p_family_id
      and i.revoked_at is null
      and i.expires_at > now()
      and i.use_count < i.max_uses
  ) >= 20 then
    raise exception 'Há muitos convites ativos. Revogue algum antes de criar outro.' using errcode = '54000', hint = 'INVITE_LIMIT';
  end if;

  -- 2 × 122 bits aleatórios (gen_random_uuid usa o gerador seguro do Postgres),
  -- codificados em base64url.
  v_token := translate(
    encode(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()), 'base64'),
    '+/=', '-_'
  );
  v_expires_at := now() + make_interval(days => p_valid_days);

  insert into public.family_invites (family_id, token_hash, note, max_uses, expires_at, created_by)
  values (
    p_family_id,
    app_private.invite_token_hash(v_token),
    nullif(btrim(left(coalesce(p_note, ''), 60)), ''),
    p_max_uses,
    v_expires_at,
    uid
  )
  returning id into v_invite_id;

  return jsonb_build_object('invite_id', v_invite_id, 'token', v_token, 'expires_at', v_expires_at);
end;
$$;

-- Prévia do convite (nome da família e de quem convidou). Pode ser chamada
-- antes do login: quem tem o link é quem recebeu o convite.
create or replace function public.get_invite_preview(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_invite record;
  v_inviter text;
  v_is_member boolean := false;
  v_status text;
begin
  if p_token is null or char_length(p_token) not between 20 and 128 then
    return jsonb_build_object('status', 'invalid');
  end if;

  select i.family_id, i.revoked_at, i.expires_at, i.use_count, i.max_uses, i.created_by, f.name as family_name
    into v_invite
  from public.family_invites i
  join public.families f on f.id = i.family_id
  where i.token_hash = app_private.invite_token_hash(p_token);

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  select p.display_name into v_inviter from public.profiles p where p.id = v_invite.created_by;

  if auth.uid() is not null then
    select exists (
      select 1 from public.family_members m
      where m.family_id = v_invite.family_id and m.user_id = auth.uid()
    ) into v_is_member;
  end if;

  v_status := case
    when v_is_member then 'already_member'
    when v_invite.revoked_at is not null then 'revoked'
    when v_invite.expires_at <= now() then 'expired'
    when v_invite.use_count >= v_invite.max_uses then 'used'
    else 'valid'
  end;

  return jsonb_build_object(
    'status', v_status,
    'family_name', v_invite.family_name,
    'invited_by', v_inviter,
    'expires_at', v_invite.expires_at,
    'family_id', case when v_is_member then v_invite.family_id end
  );
end;
$$;

create or replace function public.accept_family_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
  v_invite public.family_invites%rowtype;
begin
  select * into v_invite
  from public.family_invites i
  where i.token_hash = app_private.invite_token_hash(p_token)
  for update;

  if not found then
    raise exception 'Este convite não existe. Confira o link recebido.' using errcode = 'P0001', hint = 'INVITE_INVALID';
  end if;

  if exists (
    select 1 from public.family_members m
    where m.family_id = v_invite.family_id and m.user_id = uid
  ) then
    return v_invite.family_id;
  end if;

  if v_invite.revoked_at is not null then
    raise exception 'Este convite foi cancelado. Peça um novo link.' using errcode = 'P0001', hint = 'INVITE_REVOKED';
  end if;
  if v_invite.expires_at <= now() then
    raise exception 'Este convite expirou. Peça um novo link.' using errcode = 'P0001', hint = 'INVITE_EXPIRED';
  end if;
  if v_invite.use_count >= v_invite.max_uses then
    raise exception 'Este convite já foi usado. Peça um novo link.' using errcode = 'P0001', hint = 'INVITE_USED';
  end if;
  if (select count(*) from public.family_members m where m.user_id = uid) >= 10 then
    raise exception 'Cada pessoa pode participar de até 10 famílias.' using errcode = '54000', hint = 'FAMILY_LIMIT';
  end if;

  insert into public.family_members (family_id, user_id, role)
  values (v_invite.family_id, uid, 'member');

  update public.family_invites
  set use_count = use_count + 1, last_used_at = now()
  where id = v_invite.id;

  return v_invite.family_id;
end;
$$;

create or replace function public.revoke_family_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family_id uuid;
begin
  perform app_private.require_user();
  select i.family_id into v_family_id from public.family_invites i where i.id = p_invite_id;
  if v_family_id is null or not app_private.is_family_admin(v_family_id) then
    raise exception 'Convite não encontrado.' using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  update public.family_invites set revoked_at = coalesce(revoked_at, now()) where id = p_invite_id;
end;
$$;

create or replace function public.leave_family(p_family_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
  v_role public.family_role;
  v_members int;
  v_admins int;
begin
  -- Trava os integrantes da família para evitar que duas saídas
  -- simultâneas deixem a família sem administrador.
  perform 1 from public.family_members m where m.family_id = p_family_id for update;

  select m.role into v_role from public.family_members m
  where m.family_id = p_family_id and m.user_id = uid;
  if not found then
    raise exception 'Você não faz parte desta família.' using errcode = '42501', hint = 'NOT_MEMBER';
  end if;

  select count(*), count(*) filter (where m.role = 'admin')
    into v_members, v_admins
  from public.family_members m where m.family_id = p_family_id;

  if v_members = 1 then
    raise exception 'Você é o único integrante. Para sair, exclua a família.' using errcode = 'P0001', hint = 'LAST_MEMBER';
  end if;
  if v_role = 'admin' and v_admins = 1 then
    raise exception 'Você é o único administrador. Torne outro integrante administrador antes de sair.' using errcode = 'P0001', hint = 'LAST_ADMIN';
  end if;

  delete from public.family_members m where m.family_id = p_family_id and m.user_id = uid;
end;
$$;

create or replace function public.remove_family_member(p_family_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app_private.require_user();
begin
  if not app_private.is_family_admin(p_family_id) then
    raise exception 'Somente administradores podem remover integrantes.' using errcode = '42501', hint = 'NOT_ADMIN';
  end if;
  if p_user_id = uid then
    raise exception 'Para sair da família, use a opção "Sair da família".' using errcode = 'P0001', hint = 'USE_LEAVE';
  end if;
  delete from public.family_members m where m.family_id = p_family_id and m.user_id = p_user_id;
  if not found then
    raise exception 'Integrante não encontrado.' using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
end;
$$;

create or replace function public.set_family_member_role(p_family_id uuid, p_user_id uuid, p_role public.family_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admins int;
begin
  perform app_private.require_user();
  if not app_private.is_family_admin(p_family_id) then
    raise exception 'Somente administradores podem mudar papéis.' using errcode = '42501', hint = 'NOT_ADMIN';
  end if;

  perform 1 from public.family_members m where m.family_id = p_family_id for update;

  if p_role = 'member' then
    select count(*) into v_admins from public.family_members m
    where m.family_id = p_family_id and m.role = 'admin' and m.user_id <> p_user_id;
    if v_admins = 0 then
      raise exception 'A família precisa de pelo menos um administrador.' using errcode = 'P0001', hint = 'LAST_ADMIN';
    end if;
  end if;

  update public.family_members m set role = p_role
  where m.family_id = p_family_id and m.user_id = p_user_id;
  if not found then
    raise exception 'Integrante não encontrado.' using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
end;
$$;

-- Exclusão definitiva: exige que o administrador digite o nome da família.
create or replace function public.delete_family(p_family_id uuid, p_confirm_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  perform app_private.require_user();
  if not app_private.is_family_admin(p_family_id) then
    raise exception 'Somente administradores podem excluir a família.' using errcode = '42501', hint = 'NOT_ADMIN';
  end if;
  select f.name into v_name from public.families f where f.id = p_family_id;
  if lower(btrim(coalesce(p_confirm_name, ''))) <> lower(btrim(v_name)) then
    raise exception 'O nome digitado não confere com o nome da família.' using errcode = '22023', hint = 'CONFIRM_MISMATCH';
  end if;
  delete from public.families f where f.id = p_family_id;
end;
$$;

revoke execute on function
  public.create_family(text),
  public.create_family_invite(uuid, int, int, text),
  public.accept_family_invite(text),
  public.revoke_family_invite(uuid),
  public.leave_family(uuid),
  public.remove_family_member(uuid, uuid),
  public.set_family_member_role(uuid, uuid, public.family_role),
  public.delete_family(uuid, text),
  public.get_invite_preview(text)
from public, anon;

grant execute on function
  public.create_family(text),
  public.create_family_invite(uuid, int, int, text),
  public.accept_family_invite(text),
  public.revoke_family_invite(uuid),
  public.leave_family(uuid),
  public.remove_family_member(uuid, uuid),
  public.set_family_member_role(uuid, uuid, public.family_role),
  public.delete_family(uuid, text),
  public.get_invite_preview(text)
to authenticated;

-- A prévia do convite também pode ser vista antes do login.
grant execute on function public.get_invite_preview(text) to anon;
