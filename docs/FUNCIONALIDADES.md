# Funcionalidades implementadas (versão 1)

Organizadas pelas seções da especificação.

## 3. Interface

- Layout mobile-first com navegação inferior no celular e lateral no computador.
- Identidade própria: etiqueta de preço de gôndola para os valores principais,
  tinta azul de caneta para texto e ações, verde de feira para itens comprados.
- Alvos de toque de 40 px ou mais (48 px nos botões principais); fonte Atkinson
  Hyperlegible, feita para leitura fácil.
- Estados de carregamento, erro (com "Tentar de novo"), sucesso (avisos) e listas
  vazias com orientação.
- Confirmação antes de excluir lista, item (com "Desfazer"), produto, preço,
  compra, comparação, integrante e família (esta exige digitar o nome).
- Acessibilidade básica: rótulos em todos os campos, foco visível, painéis com
  `<dialog>` nativo, leitura correta de valores e do progresso, respeito a
  "reduzir movimento".
- Tela inicial com a lista em destaque (total, progresso e orçamento), atalhos,
  outras listas, preços que mudaram e última compra.

## 4. Família

- Criar família (quem cria é administrador).
- Convite por link seguro: token aleatório guardado só como hash, validade de 1 a
  30 dias, 1 a 10 usos, cancelamento; compartilhar pelo menu do celular,
  WhatsApp ou copiando o link.
- Prévia do convite antes de ter conta; cadastro e entrada na família no mesmo
  fluxo.
- Sair da família (com proteção para não deixar a família sem administrador),
  remover integrantes, tornar administrador ou integrante comum, renomear e
  excluir a família.
- Participar de mais de uma família e alternar entre elas.
- Nome e foto de perfil.
- "Incluído por", "alterado por" e "comprado por" em cada item; autoria em
  compras, preços e comparações.
- Permissões: todos os integrantes criam e editam listas, itens e produtos e
  registram preços; excluir lista, produto, preço, compra ou comparação criada
  por outra pessoa só o administrador (itens de lista qualquer integrante remove).
  Convidar, mudar papéis e remover integrantes também só o administrador.

## 5. Listas de compras

- Várias listas com nome, descrição, data e orçamento; sugestões de nome (Compra
  do mês, Compra semanal, Açougue, Feira, Produtos de limpeza, Farmácia,
  Churrasco).
- Duplicar (itens voltam como pendentes), arquivar, reativar, excluir.
- Lista em destaque na tela inicial (uma por família).
- Item: nome, categoria (sugerida pelo nome), marca, quantidade de embalagens,
  conteúdo de cada embalagem, unidade (unidade, kg, g, L, mL, pacote, caixa,
  dúzia), preço estimado por embalagem ou por kg/L/unidade, observações, autor e
  situação.
- Embalagens × conteúdo: "3 × 5 kg (15 kg)".
- Adição rápida que entende quantidades: "3 arroz 5kg", "1,5 kg carne",
  "2 pacotes de macarrão", "coca 2L"; sugestões do catálogo com o último preço.
- Marcar e desmarcar comprado com um toque; botões − e + na própria linha.
- Ordenar por categoria (ordem dos corredores), nome ou situação; filtrar todos,
  faltam ou comprados; buscar por nome, marca ou observação.
- Observações destacadas na linha do item.
- Totais recalculados na hora: estimado, no carrinho, falta comprar, itens
  comprados, progresso, orçamento (sobra ou quanto passou), itens sem preço e
  valor final pago depois da compra.
- Finalizar compra: data, estabelecimento, valor pago, observações; grava os
  preços no histórico, cadastra no catálogo os produtos novos e arquiva a lista
  (cada opção pode ser desligada).
- Histórico de compras por mês, com comparação com a compra anterior de mesmo
  nome e variação de preço de cada item.

## 5.5 e 11. Sincronização e offline

- Atualizações em tempo real pelo Supabase Realtime; sem Realtime, consulta
  periódica automática.
- Dois "+" simultâneos se somam no banco (nenhum toque se perde); edições enviam
  só os campos alterados; aviso quando outra pessoa alterou o item que você está
  editando.
- Listas abertas ficam salvas no aparelho (IndexedDB) e o app abre sem internet
  (service worker).
- Fila de alterações offline (incluir, editar, marcar, quantidade, remover) com
  indicador "pendente" no item e no topo; envio automático ao reconectar; uma
  alteração reenviada não é aplicada duas vezes.
- O app só mostra "Tudo salvo" depois da confirmação do servidor; recusas do
  servidor aparecem em "Não foram salvas".
- Aviso antes de sair da conta com alterações pendentes.

## 6. Calculadora

- 2 a 6 opções com nome, marca, preço da embalagem, conteúdo, unidade (g, kg,
  mL, L, unidade, dúzia) e quantidade de embalagens.
- Preço por kg e por 100 g, por L e por 100 mL, por unidade (e por dúzia).
- Melhor opção destacada, sem esconder as demais; diferença por kg/L/unidade e
  percentual de economia; empate reconhecido.
- Mensagem em linguagem simples e nota de que o menor preço unitário não é o
  menor gasto imediato.
- Simulação de quantidade equivalente: custo proporcional, embalagens inteiras
  necessárias, valor no caixa e sobra; aponta quando outra opção sai mais barata
  no caixa.
- Validações: preço negativo ou zero, conteúdo zero, campos vazios, casas
  decimais, padrão brasileiro ("1.234,56"); peso × volume só com densidade
  informada; sem vencedor quando há dados inválidos ou unidades incompatíveis.
- Aritmética decimal exata; arredondamento só na exibição.
- Salvar no histórico ou nos favoritos e reabrir depois.
- Aberta pelo menu, pelo item da lista e pelo produto do catálogo (já
  preenchida).

## 7 e 8. Catálogo e preços

- Produto: nome, categoria, marca, unidade de referência, embalagem habitual,
  observações, último preço, último local, histórico e data de atualização.
- Adicionar produto a qualquer lista (com o último preço pago).
- Histórico de preços somente inclusão (o banco não permite alterar um preço
  registrado), com data, estabelecimento e origem (compra ou manual).
- Comparação justa entre embalagens diferentes (preço por kg, L ou unidade).
- Indicadores: último preço, menor e maior registrados, variação entre os dois
  últimos registros, produtos que subiram e que caíram; gráfico da evolução.
- O app não elege "estabelecimento mais barato"; mostra os últimos preços
  anotados em cada lugar e avisa quando os dados são poucos.

## 9. Módulos da família (etapa 6)

Todos aparecem no menu: Início, Listas, Conversas e Tarefas na barra inferior
do celular; Calculadora, Agenda, Estoque, Despesas, Produtos e Família em
**Mais** (no computador, tudo fica na barra lateral). O Início ganhou o quadro
"Hoje na casa", com tarefas do dia, próximos compromissos, itens acabando,
mensagens e avisos novos.

### 9.1 Conversas

- Grupo geral da família e conversas entre dois integrantes.
- Mensagens de texto com data e horário, agrupadas por dia.
- Indicador de não lidas na lista de conversas e na navegação.
- Histórico guardado no banco, com "ver mensagens anteriores".
- Apagar a própria mensagem (fica "Mensagem apagada").
- Mensagens escritas sem internet vão quando a conexão voltar.
- Notificações no celular (ver 9.6).

### 9.2 Tarefas domésticas

- Cadastro rápido ou completo: responsável, prazo, prioridade (baixa,
  normal, alta), observações.
- Recorrência diária, semanal, mensal ou anual, a cada N períodos: ao concluir,
  a próxima ocorrência é criada no mesmo ritmo do prazo original.
- Grupos por prazo: atrasadas, hoje, amanhã, próximos 7 dias, mais adiante e
  sem prazo; filtro "Minhas".
- Histórico das feitas (quem fez e quando) e "Desfazer".
- Quem recebe uma tarefa é avisado; tarefas do dia geram lembrete.
- Funciona sem internet.

### 9.3 Despesas familiares

- Lançamento com descrição, categoria (mercado, moradia, contas, transporte,
  saúde, educação, lazer, pets, roupas, outros), valor, data, quem pagou e
  quem lançou.
- Divisão entre integrantes: não dividir, igual (os centavos que sobram vão
  para os primeiros) ou valores diferentes (a soma precisa fechar).
- "Quem deve a quem": saldos de todos os lançamentos divididos, com sugestão
  de acertos e registro do pagamento.
- Resumo mensal: total, comparação com o mês anterior, gastos por categoria e
  por pessoa.
- Na compra finalizada: "Lançar nas despesas" já preenchido.
- Funciona sem internet (os acertos precisam de conexão).

### 9.4 Agenda e lembretes

- Compromissos (com horário, fim e local), datas importantes (repetem todo ano
  e mostram quantos anos fazem), manutenção de equipamentos (com registro de
  quando foi feita) e reposição de produtos (com "Pôr na lista de compras").
- Recorrência com intervalo e data final; lembrete na hora, 15 min, 1 h, 1 dia,
  2 dias ou 1 semana antes.
- Tarefas com prazo aparecem na agenda, e dá para concluí-las de lá.
- Visões "Próximos dias" (60 dias) e "Mês" (calendário).

### 9.5 Estoque doméstico

- Itens com quantidade, unidade, estoque mínimo, local (despensa, geladeira…),
  categoria e observações; ligação automática com o produto do catálogo de
  mesmo nome.
- Botões − e + (somam no banco, sem perder toques simultâneos).
- Alerta "Acabando"/"Acabou" e aviso para a família quando um item chega ao
  mínimo.
- "Pôr na lista": um item ou todos os que estão acabando, na quantidade que
  falta.
- Na compra finalizada: "Somar ao estoque" (com conversão g/kg e mL/L; vale uma
  vez por compra).
- Funciona sem internet.

### 9.6 Notificações

- Central de avisos no app (Mais → Notificações): tarefa atribuída, tarefa do
  dia, item acabando, despesa dividida e lembretes da agenda.
- No celular (Web Push), com o app fechado, depois da configuração descrita em
  [NOTIFICACOES.md](NOTIFICACOES.md); cada pessoa escolhe o que receber.

### 9.7 Outros

- **Categorias personalizadas** (Mais → Categorias): criar, renomear,
  reordenar e excluir; aparecem em listas, catálogo e estoque.
- **Modo escuro**: automático (segue o celular), claro ou escuro, em Meu perfil.
- **Excluir a própria conta**, em Meu perfil, com confirmação.
- **Lista nova sem internet**: a lista e os itens incluídos nela sobem quando a
  conexão voltar.

## 10. Banco de dados

- Tabelas: profiles, families, family_members, family_invites, stores, products,
  shopping_lists, list_items, purchases, purchase_items, price_records,
  price_comparisons, sync_receipts, tasks, stock_items, expenses,
  expense_shares, expense_settlements, events, event_logs, chat_conversations,
  chat_messages, chat_reads, notifications, push_subscriptions,
  notification_preferences e item_categories.
- RLS em todas as tabelas; privilégios por coluna; chaves compostas
  `(id, family_id)`; funções auxiliares em esquema não exposto.
- Auditoria automática: created_by/updated_by e datas preenchidos pelo banco.
- Migrações versionadas e configuração do Supabase CLI.
