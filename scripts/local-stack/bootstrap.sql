-- Recria, num Postgres comum, a base que o Supabase já entrega pronta:
-- papéis da API, esquemas auth/extensions, privilégios padrão e a
-- publicação do Realtime. Usado apenas pelo ambiente local de testes
-- (scripts/local-stack). Em um projeto Supabase de verdade, nada disto é
-- necessário.

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticator') then
    create role authenticator login password 'postgres' noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin login password 'postgres' noinherit createrole;
  end if;
end;
$$;

grant anon, authenticated, service_role to authenticator;
alter role supabase_auth_admin set search_path = auth;
alter role authenticator set statement_timeout = '8s';

create schema if not exists auth authorization supabase_auth_admin;
create schema if not exists extensions;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
grant create on database postgres to supabase_auth_admin;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

do $$
begin
  if not exists (select from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  name text,
  applied_at timestamptz not null default now()
);
