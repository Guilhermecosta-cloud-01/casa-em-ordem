// Gera as chaves "anon" e "service_role" (JWT HS256) do ambiente local,
// assinadas com o mesmo segredo usado pelo Auth e pelo PostgREST.
import { SignJWT } from 'jose'

const secret = process.env.JWT_SECRET
if (!secret || secret.length < 32) {
  console.error('JWT_SECRET ausente ou curto demais')
  process.exit(1)
}
const key = new TextEncoder().encode(secret)

async function sign(role) {
  return new SignJWT({ role, iss: 'supabase-local' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('10y')
    .sign(key)
}

const anon = await sign('anon')
const service = await sign('service_role')
console.log(`ANON_KEY=${anon}`)
console.log(`SERVICE_ROLE_KEY=${service}`)
