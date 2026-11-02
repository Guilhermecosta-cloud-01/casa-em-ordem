# Publicar o aplicativo

O app é um site estático (pasta `dist/`). Qualquer hospedagem de sites
estáticos com HTTPS serve; abaixo, as duas mais simples e gratuitas.

## Cloudflare Pages (recomendada)

1. Suba o código para um repositório no GitHub.
2. No painel da Cloudflare: *Workers & Pages → Create → Pages → Connect to Git* e
   escolha o repositório.
3. Configuração do build:
   - **Framework preset:** None (ou Vite)
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Variáveis de ambiente:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e
     `NODE_VERSION=22`
4. Publique. O endereço será algo como `https://casa-em-ordem.pages.dev`.

O arquivo `public/_headers` já define cabeçalhos de segurança (incluindo
Content-Security-Policy) e de cache. Como o projeto não tem `404.html`, o
Cloudflare Pages trata o app como SPA e entrega o `index.html` em qualquer
endereço, o que os links de convite precisam.

## Vercel

1. *Add New → Project* e importe o repositório.
2. O `vercel.json` já define comando de build, pasta `dist`, redirecionamento das
   rotas para o `index.html` e os cabeçalhos.
3. Em *Settings → Environment Variables*, cadastre `VITE_SUPABASE_URL` e
   `VITE_SUPABASE_ANON_KEY`.

## Depois de publicar

1. No Supabase, atualize **Site URL** e **Redirect URLs** com o endereço final
   (veja [SUPABASE.md](SUPABASE.md), passo 3).
2. Abra o app no celular e instale ([INSTALAR-NO-CELULAR.md](INSTALAR-NO-CELULAR.md)).

## Domínio próprio

Ao usar um domínio próprio (ex.: `compras.suafamilia.com.br`), cadastre-o também
nas Redirect URLs do Supabase. Se o Supabase tiver domínio personalizado (fora de
`*.supabase.co`), inclua-o em `connect-src` no `public/_headers` e no
`vercel.json`.

## Atualizações

A cada novo deploy, quem estiver com o app aberto vê o aviso "Nova versão do app
disponível" e escolhe quando atualizar — o app não recarrega sozinho no meio de
uma compra. O service worker verifica atualizações a cada hora e ao reabrir o app.
