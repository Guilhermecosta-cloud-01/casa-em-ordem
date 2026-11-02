# Limitações conhecidas

## O que não foi testado aqui

- **Projeto Supabase real e hospedagem.** O desenvolvimento usou um Supabase
  local (Postgres + Supabase Auth + PostgREST reais). Antes de entregar à
  família, faça a conferência rápida de [SUPABASE.md](SUPABASE.md), passo 6.
- **Realtime.** O ambiente local de testes não tem o servidor do Realtime; a
  sincronização entre duas pessoas foi testada pelo modo de consulta periódica.
  O código do Realtime é o padrão do Supabase, mas precisa ser conferido no seu
  projeto.
- **E-mails** de confirmação de conta e de redefinição de senha (dependem do SMTP
  do projeto).
- **Aparelhos reais.** Os testes rodaram em Chromium com tamanho de tela de
  celular e de computador. Vale abrir em um Android e em um iPhone de verdade,
  principalmente a instalação no iPhone, que só funciona pelo Safari.

## Comportamento

- **Offline é limitado às listas.** Sem internet dá para ver o que já foi aberto
  antes e alterar itens. Criar ou excluir listas, finalizar compras, convidar,
  mexer no catálogo e salvar comparações exigem conexão (o app avisa).
- Os outros integrantes só veem uma alteração offline depois que ela é enviada.
- **Conflitos:** quando duas pessoas mudam o mesmo campo do mesmo item, vale a
  última gravação. Campos diferentes não se sobrescrevem, "+" simultâneos se
  somam e a tela de edição avisa se o item mudou enquanto estava aberta.
- **Exclusões no Realtime:** o Supabase envia o aviso de item excluído a todos
  os aparelhos conectados, contendo só o identificador do item (sem conteúdo);
  cada aparelho ignora o que não é da lista aberta. Com muitas famílias no mesmo
  projeto, isso gera tráfego extra.
- Sair da conta apaga os dados guardados no aparelho, inclusive alterações ainda
  não enviadas (o app avisa antes).
- Não há exclusão da própria conta pelo app; um administrador do projeto faz isso
  no painel do Supabase (*Authentication → Users*).
- Foto de perfil reduzida para 192 px e guardada no banco (até ~150 KB).
- Categorias são fixas (14). Personalizar categorias exige uma tabela nova.
- Sem modo escuro.
- Moeda e formatos apenas em reais e português do Brasil.

## Segurança

- Limite de tentativas de login e cadastro é o do Supabase Auth (ajustável no
  painel). As funções de convite não têm limite próprio de tentativas; a
  segurança vem do token, com 244 bits aleatórios (impossível de adivinhar).
- A política de segurança de conteúdo (CSP) aceita conexões com
  `*.supabase.co`. Com domínio próprio no Supabase, ajuste `public/_headers`.

## Testes locais sem Docker

- `npm run stack:up` baixa binários x86-64 para Linux. Em Mac (Apple Silicon) ou
  Windows sem WSL, use o Supabase CLI com Docker.
