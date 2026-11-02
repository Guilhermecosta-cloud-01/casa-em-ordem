# Casa em Ordem

Aplicativo de organização familiar, começando pelas compras de supermercado:
listas compartilhadas em tempo real, calculadora de custo-benefício por
embalagem e histórico de preços. Funciona no navegador e pode ser instalado na
tela inicial do Android e do iPhone (PWA).

- **Listas de compras** compartilhadas pela família, com embalagens × conteúdo
  (3 pacotes de 5 kg = 15 kg), preço por embalagem ou por kg/L/unidade, totais,
  orçamento, filtros, busca e adição rápida ("3 arroz 5kg").
- **Calculadora** que compara 2 a 6 embalagens pelo preço por kg, L ou unidade,
  com simulação de quantidade equivalente em embalagens inteiras.
- **Catálogo e histórico de preços**, alimentados automaticamente ao finalizar
  uma compra.
- **Famílias com convites seguros**, papéis (administrador/integrante) e foto de
  perfil.
- **Uso offline limitado**: listas já abertas ficam no aparelho e alterações
  feitas sem internet entram numa fila, com aviso de "pendente" até o servidor
  confirmar.

## Tecnologias

React 19 + TypeScript + Vite · Tailwind CSS 4 · React Router · TanStack Query ·
Supabase (Postgres, Auth, Realtime) · vite-plugin-pwa (Workbox) · big.js ·
Vitest · Playwright.

## Rodar localmente

Pré-requisitos: Node.js 22.22 ou mais recente e um projeto Supabase (na nuvem
ou local).

```bash
npm install
cp .env.example .env.local      # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev                     # http://localhost:5173
```

Para criar o banco, siga [docs/SUPABASE.md](docs/SUPABASE.md). Para um Supabase
inteiro na sua máquina, use o Supabase CLI com Docker:

```bash
npx supabase start              # sobe Postgres, Auth, Realtime e Studio
npx supabase db reset           # aplica as migrações de supabase/migrations
npx supabase status             # mostra a URL e a chave anon para o .env.local
```

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Verifica tipos e gera a versão de produção em `dist/` |
| `npm run preview` | Serve a versão de produção (com service worker) |
| `npm test` | Testes unitários (cálculos, conversões, fila offline) |
| `npm run test:db` | Testes de segurança do banco (RLS) — requer `npm run stack:up` |
| `npm run test:e2e` | Testes ponta a ponta dos 18 itens da especificação |
| `npm run stack:up` / `stack:down` | Supabase local sem Docker, usado nos testes |
| `npm run icons` | Regenera os ícones do app |

Detalhes em [docs/TESTES.md](docs/TESTES.md).

## Estrutura

```
src/
  app/              rotas, layout, navegação, guardas de acesso, sincronização
  components/ui/    botões, campos, painéis, etiqueta de preço, avisos
  lib/              cliente Supabase, decimal exato, formatação, unidades,
                    erros, cache offline e fila de sincronização (sync/)
  modules/          um módulo por área do app
    auth/           entrar, criar conta, redefinir senha
    family/         família, integrantes, convites
    profile/        nome e foto
    home/           tela inicial
    shopping/       listas, itens, totais, histórico de compras
    calculator/     calculadora de custo-benefício
    catalog/        produtos frequentes e histórico de preços
    registry.ts     lista dos módulos (ativos e planejados)
  pwa/              aviso de atualização e instalação
supabase/
  migrations/       SQL versionado: tabelas, RLS, funções
  config.toml       configuração do Supabase CLI
tests/
  db/               segurança do banco (RLS) com usuários simulados
  e2e/              fluxos completos no navegador
scripts/
  local-stack/      Supabase local sem Docker (Postgres + Auth + PostgREST)
docs/               configuração, publicação, decisões e limitações
```

## Documentação

- [Configurar o Supabase](docs/SUPABASE.md)
- [Publicar o aplicativo](docs/PUBLICACAO.md)
- [Instalar no celular](docs/INSTALAR-NO-CELULAR.md) (para enviar à família)
- [Funcionalidades implementadas](docs/FUNCIONALIDADES.md)
- [Limitações conhecidas](docs/LIMITACOES.md)
- [Decisões técnicas](docs/DECISOES.md)
- [Como adicionar módulos](docs/MODULOS.md)
- [Testes](docs/TESTES.md)

## Segurança, em resumo

- Só a chave pública (anon/publishable) vai para o navegador. Nunca use a chave
  `service_role` no front-end.
- Todas as tabelas têm RLS: cada pessoa só lê e altera dados das famílias de que
  faz parte. As referências entre tabelas usam chaves compostas
  `(id, family_id)`, então nem um identificador forjado aponta para outra
  família.
- Ações sensíveis (criar família, convidar, aceitar convite, mudar papéis,
  finalizar compra) são funções SQL que conferem a permissão no banco.
- Convites usam token aleatório guardado só como hash, com validade, limite de
  usos e cancelamento.
