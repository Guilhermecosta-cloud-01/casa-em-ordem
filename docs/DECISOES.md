# Decisões técnicas

Escolhas feitas onde a especificação deixava margem, sempre pela alternativa mais
simples, segura e de baixo custo.

## Modelo de quantidade dos itens

Cada item tem **embalagens** (quantas levar), **conteúdo de cada embalagem**
(opcional) com **unidade**, e **preço** que pode ser **por embalagem** ou **por
medida** (kg para g/kg, L para mL/L, a própria unidade para un, dúzia, pacote e
caixa).

| Exemplo | Embalagens | Conteúdo | Preço | Total |
|---|---|---|---|---|
| 3 pacotes de arroz de 5 kg a R$ 25,90 | 3 | 5 kg | R$ 25,90 por embalagem | R$ 77,70 (15 kg) |
| 1,5 kg de carne a R$ 39,90/kg | 1 | 1,5 kg | R$ 39,90 por kg | R$ 59,85 |
| 2 bandejas de 500 g a R$ 39,90/kg | 2 | 500 g | R$ 39,90 por kg | R$ 39,90 (1 kg) |
| 2 dúzias de banana a R$ 6,00 | 2 | — (dúzia) | R$ 6,00 por dúzia | R$ 12,00 |

O mesmo modelo é usado nos produtos e no histórico de preços, o que permite
comparar registros de embalagens diferentes pelo preço por kg/L/unidade.

## Dinheiro e arredondamento

- Toda conta usa decimal exato (`big.js` no app, `numeric` no banco).
- **Listas:** cada linha é arredondada em centavos (meio para cima), como no
  cupom fiscal, e o total é a soma das linhas. A função SQL `item_line_total` e
  `lineTotal` (TypeScript) seguem a mesma regra e os testes conferem as duas.
- **Calculadora:** nenhum arredondamento interno; só na exibição.

## Entrada de números

Aceita vírgula decimal e ponto de milhar ("1.234,56"), "R$" e espaços. Ponto
sozinho segue o costume brasileiro: "1.299" é mil duzentos e noventa e nove;
"12.5" e "0.250" são decimais. Preços aceitam até 2 casas; quantidades, até 3.

## Segurança do banco

- RLS em todas as tabelas, com funções auxiliares `security definer` no esquema
  `app_private` (não exposto pela API).
- Chaves estrangeiras compostas `(id, family_id)`: um item só pode apontar para
  uma lista ou produto da mesma família.
- Privilégios por coluna: além do RLS, o banco só aceita alteração nas colunas
  que o app edita (ninguém troca o autor de um registro, por exemplo).
- Um gatilho impede mover um registro de uma família para outra.
- Ações com várias verificações são funções SQL (criar família, convites, papéis,
  sair, excluir família, destaque, finalizar compra).

## Convites

Token de 2 × 122 bits gerado no banco e entregue uma única vez a quem convida. O
banco guarda apenas o hash SHA-256. Padrão: 7 dias e 1 uso. A prévia (nome da
família e de quem convidou) pode ser vista antes do login, porque quem tem o link
é o convidado.

## Foto de perfil

Reduzida no aparelho para 192 × 192 px (JPEG) e guardada no próprio perfil.
Evita configurar o Storage e suas políticas, e a foto fica protegida pelo mesmo
RLS do perfil. Para fotos maiores, migrar para o Supabase Storage.

## Sincronização e conflitos

- O Realtime funciona como aviso: ao receber um evento, a lista é recarregada do
  servidor. Sem conexão com o Realtime (ou se ele cair), a tela consulta a cada
  15 s.
- "+" e "−" chamam a função `adjust_list_item_packages`, que soma no banco.
  Cada ajuste leva um identificador (`sync_receipts`), então reenviar o mesmo
  ajuste depois de uma queda de conexão não soma duas vezes.
- Edições enviam só os campos alterados.
- Itens novos recebem o id no aparelho (UUID), então reenviar uma inclusão não
  duplica o item.

## Offline

- **Cache de leitura:** TanStack Query salvo no IndexedDB (7 dias), gravado também
  quando o app vai para segundo plano. Ao abrir, o cache aparece na hora e é
  conferido com o servidor; nunca é tratado como atualizado só por ser recente.
- **Fila de escrita:** alterações de itens entram numa fila no IndexedDB, são
  enviadas em ordem e só saem da fila depois da confirmação. Edições redundantes
  são juntadas (vários "+" viram um ajuste; editar um item que ainda não subiu
  altera a própria inclusão; excluir um item que nunca subiu não envia nada).
- **Service worker:** guarda o app (HTML, JS, CSS, fontes, ícones) para abrir sem
  internet. As chamadas ao Supabase não passam pelo cache do service worker.
- Atualização do app com aviso ("Nova versão disponível"), sem recarregar no meio
  de uma compra.

## Hospedagem

Cloudflare Pages (estático e gratuito), com Vercel documentado como alternativa.
Cabeçalhos de segurança, incluindo CSP, em `public/_headers` e `vercel.json`.

## Testes sem Docker

O ambiente de desenvolvimento não tinha Docker, então os testes usam um "Supabase
local" montado com os binários oficiais do Supabase Auth e do PostgREST sobre o
Postgres do sistema (`scripts/local-stack`). No dia a dia, o Supabase CLI com
Docker continua sendo o caminho recomendado.

## Versões

React 19, React Router 8, Vite 8, Tailwind CSS 4, TanStack Query 5,
supabase-js 2, TypeScript 6, Vitest 5, Playwright 1.63.
