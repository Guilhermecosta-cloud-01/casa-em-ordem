// Proxy que imita o endereço único do Supabase (http://localhost:54321):
//   /auth/v1/*  → Supabase Auth (GoTrue)
//   /rest/v1/*  → PostgREST
// O Realtime não faz parte do ambiente local; o app percebe e passa a
// consultar periodicamente.
import http from 'node:http'

const PORT = Number(process.env.PROXY_PORT ?? 54321)
const ROUTES = [
  ['/auth/v1', Number(process.env.AUTH_PORT ?? 9999)],
  ['/rest/v1', Number(process.env.REST_PORT ?? 3000)],
]

function corsHeaders(req) {
  return {
    'access-control-allow-origin': req.headers.origin ?? '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': req.headers['access-control-request-headers'] ?? '*',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-expose-headers': 'content-range, content-profile, preference-applied, x-supabase-api-version',
    'access-control-max-age': '600',
    vary: 'Origin',
  }
}

const server = http.createServer((req, res) => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors)
    res.end()
    return
  }
  const url = req.url ?? '/'
  const route = ROUTES.find(([prefix]) => url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`))
  if (!route) {
    res.writeHead(404, { ...cors, 'content-type': 'application/json' })
    res.end(JSON.stringify({ message: 'Serviço não disponível no ambiente local' }))
    return
  }
  const [prefix, port] = route
  const path = url.slice(prefix.length) || '/'
  const upstream = http.request(
    {
      host: '127.0.0.1',
      port,
      method: req.method,
      path: path.startsWith('/') ? path : `/${path}`,
      headers: { ...req.headers, host: `127.0.0.1:${port}` },
    },
    (up) => {
      const headers = { ...up.headers }
      for (const key of Object.keys(headers)) {
        if (key.startsWith('access-control-')) delete headers[key]
      }
      res.writeHead(up.statusCode ?? 502, { ...headers, ...cors })
      up.pipe(res)
    },
  )
  upstream.on('error', (error) => {
    if (!res.headersSent) res.writeHead(502, { ...cors, 'content-type': 'application/json' })
    res.end(JSON.stringify({ message: String(error) }))
  })
  req.pipe(upstream)
})

// Recusa conexões WebSocket (Realtime) de forma limpa.
server.on('upgrade', (_req, socket) => {
  socket.end('HTTP/1.1 404 Not Found\r\n\r\n')
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`proxy local do Supabase em http://localhost:${PORT}`)
})
