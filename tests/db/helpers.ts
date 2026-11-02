import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

function loadDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  try {
    const envFile = fileURLToPath(new URL('../../.local-stack/env', import.meta.url))
    const line = readFileSync(envFile, 'utf8')
      .split('\n')
      .find((l) => l.startsWith('DATABASE_URL='))
    if (line) return line.slice('DATABASE_URL='.length).trim()
  } catch {
    // segue para o padrão abaixo
  }
  return 'postgres://postgres@127.0.0.1:54322/postgres'
}

export const pool = new pg.Pool({ connectionString: loadDatabaseUrl(), max: 4 })

export interface TestUser {
  id: string
  email: string
  name: string
}

/** Cria um usuário diretamente em auth.users (o gatilho cria o perfil). */
export async function createUser(name: string): Promise<TestUser> {
  const id = randomUUID()
  const email = `${name.toLowerCase()}-${id.slice(0, 8)}@teste.local`
  await pool.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, '', now(),
       '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', $3::text), now(), now())`,
    [id, email, name],
  )
  return { id, email, name }
}

export class DbError extends Error {
  code?: string
  hint?: string
  constructor(message: string, code?: string, hint?: string) {
    super(message)
    this.code = code
    this.hint = hint
  }
}

/**
 * Executa SQL como um usuário autenticado (mesmo caminho do PostgREST:
 * papel "authenticated" + claims do JWT), dentro de uma transação.
 */
export async function asUser<T = Record<string, unknown>>(
  user: TestUser | null,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    if (user) {
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: user.id, role: 'authenticated', email: user.email }),
      ])
      await client.query('set local role authenticated')
    } else {
      await client.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`)
      await client.query('set local role anon')
    }
    const result = await client.query(sql, params)
    await client.query('commit')
    return result.rows as T[]
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    const e = error as { message: string; code?: string; hint?: string }
    throw new DbError(e.message, e.code, e.hint)
  } finally {
    client.release()
  }
}

export async function asUserOne<T = Record<string, unknown>>(
  user: TestUser | null,
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  const rows = await asUser<T>(user, sql, params)
  if (rows.length !== 1) throw new Error(`Esperava 1 linha, veio ${rows.length}`)
  return rows[0] as T
}

/** Espera que a operação falhe; devolve o erro para inspeção. */
export async function expectDbError(promise: Promise<unknown>): Promise<DbError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof DbError) return error
    throw error
  }
  throw new Error('A operação deveria ter falhado, mas foi aceita.')
}

export async function createFamily(user: TestUser, name: string): Promise<string> {
  const row = await asUserOne<{ id: string }>(user, 'select public.create_family($1) as id', [name])
  return row.id
}

export async function inviteAndJoin(admin: TestUser, familyId: string, joiner: TestUser): Promise<void> {
  const invite = await asUserOne<{ data: { token: string } }>(
    admin,
    'select public.create_family_invite($1) as data',
    [familyId],
  )
  await asUser(joiner, 'select public.accept_family_invite($1)', [invite.data.token])
}
