# Limitações conhecidas

## O que não foi testado aqui

- **Realtime.** O ambiente local de testes não tem o servidor do Realtime; a
  sincronização entre duas pessoas (listas, tarefas, conversas, avisos) foi
  testada pelo modo de consulta periódica. O código do Realtime é o padrão do
  Supabase, mas precisa ser conferido no seu projeto.
- **Notificações no celular.** A função `api/push` foi testada contra o banco
  local com o envio simulado; a entrega real depende das chaves e da
  configuração de [NOTIFICACOES.md](NOTIFICACOES.md), e do celular (no iPhone,
  só com o app instalado).
- **Lembretes agendados** dependem do pg_cron e do pg_net no seu projeto
  Supabase (testados aqui chamando a função diretamente).
- **Excluir a própria conta** apaga o usuário em `auth.users` por uma função do
  banco. Testado no banco local; se o seu projeto recusar a exclusão, um
  administrador apaga o usuário em *Authentication → Users*.
- **E-mails** de confirmação de conta e de redefinição de senha (dependem do SMTP
  do projeto; o gratuito do Supabase manda poucos por hora).
- **Aparelhos reais.** Os testes rodaram em Chromium com tamanho de tela de
  celular e de computador.

## Comportamento

- **Offline:** funcionam sem internet os itens das listas, criar lista,
  tarefas, estoque, despesas, agenda e envio de mensagens (tudo entra na fila e
  sobe depois). Precisam de conexão: finalizar compra, catálogo e preços,
  convites e família, acertos de despesas, categorias, apagar mensagem e marcar
  avisos como lidos. Telas nunca abertas no aparelho não têm dados offline (o
  app avisa).
- **Conflitos:** quando duas pessoas mudam o mesmo campo do mesmo registro, vale
  a última gravação. Campos diferentes não se sobrescrevem e os "+"/"−" de listas
  e estoque se somam.
- **Exclusões no Realtime:** o Supabase envia o aviso de registro excluído a
  todos os aparelhos conectados, só com o identificador; cada aparelho ignora o
  que não é seu.
- **Conversas:** só texto (sem fotos, áudio ou edição de mensagem). Quem sai da
  família deixa de ver as conversas; o histórico fica para quem continua.
- **Despesas:** categorias fixas; uma pessoa que exclui a conta tem as partes
  dela removidas dos saldos.
- **Tarefas recorrentes:** cada ocorrência é uma tarefa, e a próxima só é criada
  ao concluir a atual; para encerrar a repetição, exclua a tarefa em aberto.
- **Agenda:** horários no fuso de Brasília; lembretes de "dia todo" usam 9h como
  referência.
- Sair da conta apaga os dados guardados no aparelho, inclusive alterações ainda
  não enviadas (o app avisa antes).
- Foto de perfil reduzida para 192 px e guardada no banco (até ~150 KB).
- Moeda e formatos apenas em reais e português do Brasil.

## Segurança

- Limite de tentativas de login e cadastro é o do Supabase Auth (ajustável no
  painel). As funções de convite não têm limite próprio de tentativas; a
  segurança vem do token, com 244 bits aleatórios (impossível de adivinhar).
- A política de segurança de conteúdo (CSP) aceita conexões com
  `*.supabase.co`. Com domínio próprio no Supabase, ajuste `public/_headers` e
  `vercel.json`.

## Testes locais sem Docker

- `npm run stack:up` baixa binários x86-64 para Linux. Em Mac (Apple Silicon) ou
  Windows sem WSL, use o Supabase CLI com Docker.
