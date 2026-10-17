# Value: preparação de um lote staging

PR #3 integrado em beta-next (`31f9f73`). O menor elo ausente era passar um lote
offline já preparado ao executor existente sem refazer search/profile.
`runPreparedStagingBatch` faz essa composição; não substitui o executor, writer,
matcher, motor econômico ou validação das evidências privadas.

## Contrato e uso futuro

API sem CLI, leitura de ambiente ou conexão padrão, em `staging-import.ts`.
Executá-la exige chamada explícita com `authorization: 'ISOLATED_STAGING_BATCH'`,
geração válida, snapshot de `valueBindings`, resultado de `prepareOfflineImport`,
um de seus lotes, contexto congelado dos jogadores, journal local exclusivo e
`sharedLockRoot` comum aos executores cooperantes desse host.
Receber hashes não dispensa validar os recibos/journal originais com
`prepareOfflineImport`; não construir lotes de dados reais manualmente.

O caller fornece `gate` com `preflight`, `existing`, `write`, `readBack` e
`checkpoint`. Em um ensaio futuro, compor o writer já existente de
`generationConnections` (verificação obrigatória de roles antes de escrever) e
o `postgresGate` já existente com a mesma `stagingGeneration`. O preflight deve
comprovar destino isolado autorizado e contexto congelado antes de delegar ao
gate de reconciliação. A string de autorização não comprova identidade do banco.
Não usar o binding de coleta Live Football, que consulta saldo; este caminho
não requer API key, transporte ou probe de saldo.

O destino futuro precisa estar previamente provisionado com schema candidato,
contexto dos jogadores e geração/token/roles adequados, sem atividade concorrente.
Esta entrega não instala SQL nem muda privilégios. O gate existente exige o
snapshot completo de jogadores e reconcilia a geração inteira: o primeiro ensaio
deve usar uma geração isolada vazia, com um único lote e journal exclusivo.
Não trocar a geração nem o journal para contornar uma tentativa incerta.

## Garantias preservadas

- Até 100 itens, um lote por chamada; não há laço para importar a seleção global.
- As verificações econômicas de `prepareOfflineImport` são reutilizadas no envio:
  identidade HIGH/MATCHED, hashes de input/conteúdo, valor EUR positivo ou null,
  proveniência original e `selectCurrent=false`.
- Vínculo exato a seleção privada, pai, journal de origem, hash do lote, contexto
  dos jogadores e geração. Alterações bloqueiam a reutilização do journal.
- O lock compartilhado existente exclui chamadas concorrentes mesmo com journals
  diferentes; não substitui a comprovação de quiescência do banco nem seu fence.
- `runGlobal` continua responsável pelo lock do journal, intenção durável WRITE antes do
  writer, read-back, DONE, checkpoints e retomada. Não existe um segundo journal
  ou executor de importação. O orçamento de coleta é zero e a coleta é bloqueada.
- Replay confirmado não duplica escrita. Após confirmação perdida, read-back
  confirmado permite reconciliar; ausência, UNKNOWN ou CONFLICT não autorizam
  reenviar uma tentativa incerta nem avançar ao próximo jogador.
- O writer existente mantém transação Serializable, geração/token e restrição de
  publicação. Não há alteração em `PlayerEconomicCurrent` por este modo.

## Validação e dependência restante

Fixtures inteiramente sintéticas, writer/read-back em memória e arquivos temporários
exercitam VALUE/null, retomada, perda de confirmação, bloqueio por incerteza,
rejeição de dados inválidos antes do preflight, alteração de geração/fonte e
journal adulterado. Nenhuma importação PostgreSQL, coleta, migration ou API é
executada nos testes. `npm run test:value` inclui os testes novos e é chamado
por `npm run validate:cloud`.

A única etapa externa restante para comprovar este incremento é o ensaio
controlado de um lote no destino isolado autorizado e previamente provisionado,
usando as evidências e configuração que permanecem no host local. Não enviar
recibos, journals ou credenciais ao GitHub/Cloud para satisfazer os testes.
Testes mockados não substituem essa comprovação nem autorizam Production ou a
importação dos resultados globais. Os números globais informados pelo proprietário
são contexto; não foram recontados nesta tarefa.
