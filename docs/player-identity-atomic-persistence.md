# Lote 8 — Fase D: persistência atômica preparada, WRITE desabilitado

Esta fase altera somente código/testes/documentação. Nenhum runner operacional,
consulta ao banco real, escrita real, refresh ou API é necessário para validá-la.
O baseline de dados informado pela Fase C é 16.228 Players, 74 associados e 73
Attempts. Esses números NÃO são uma nova auditoria de banco nesta fase.

## Fluxo anterior, preservado fora do piloto

`resolveApiFootballPlayer` lê Player, retorna cedo se já associado, resolve clube,
carrega roster e avalia o core. Com save=true, consulta o dono do provider ID e
faz `player.update` condicionado apenas ao id local. O batch recebe saved e só
então chama `recordMatchedPlayer`, que faz upsert fora daquela operação.
Falha entre update e upsert deixa associação parcial; o SELECT anterior não
fecha a corrida. O batch trata conflitos por mensagem, erros genéricos com
attempt error/SyncError e fail-fast opcional. Rate-limit e cache-only miss param
antes de recorders. Nada disso foi redirecionado/reconfigurado nesta fase.

O helper geral databaseRetry tem retries e timeout via Promise.race; NÃO é usado
na nova operação. Também não usamos resolver/save, sync, fetch ou client singleton.

## Contrato novo

`persistPlayerApiFootballMatchAtomically(client, preparedMatch, clock)` usa o client
injetado e UMA transação Prisma Serializable por jogador:

1. Valida escopo, evidência, scores aprovados e validade antes de abrir transação.
2. Relê Player e owner global do provider ID na mesma transação.
3. Relê attempt e compara externalId EA, nome, nascimento, nacionalidade, posições,
   clube e updatedAt com a identidade aprovada. Nunca escreve externalId.
4. Reconfere pins do cache/snapshot e prazo, inclusive após eventual espera.
5. `updateMany` exige id, apiFootballId=null, clubId e updatedAt; count deve ser 1.
6. `create` do attempt matched na MESMA transação; nova checagem de prazo.
7. Commit conjunto. Exceções são capturadas FORA do callback, permitindo rollback.

Não há retry automático. P2034/40001/40P01 retornam CONCURRENT_MODIFICATION;
P2002 durante o update retorna CONFLICT_PROVIDER_ID_TAKEN; falha do create retorna
ATTEMPT_FAILURE. Count diferente de 1 aborta. Mensagens brutas de banco não saem.
Falha desconhecida na confirmação do commit retorna INDETERMINATE_COMMIT:
não é honesto garantir rollback se o servidor confirmou mas a resposta se perdeu.
Exige auditoria e intervenção antes de qualquer nova tentativa.

## Unicidade e idempotência

Schema: Player.apiFootballId tem @unique; migration
20260829214241_add_real_life_player_data contém Player_apiFootballId_key.
Attempt.playerId também tem @unique e índice na migration
20260831152310_add_api_football_match_attempt. Não é histórico append-only:
é um registro de controle por Player com contador/últimos dados.

Mesma associação com attempt matched coerente retorna ALREADY_MATCHED_SAME_ID,
sem writes nem incremento. Mesma associação sem attempt coerente falha para não
reparar silenciosamente estado parcial legado. Outro ID é conflito. Qualquer
attempt preexistente com Player null falha, mesmo que retry esteja vencido: este
piloto exige baseline sem attempt. A política geral de retry não foi alterada.

Novo attempt usa apenas colunas existentes: matched, attempts=1, lastApiFootballId,
lastConfidence, lastNameScore, flags de birth/nationality/club, lastReason,
lastTriedAt e nextRetryAt=null. Não há coluna provider nem payload bruto novo.

Serializable + predicado condicional + UNIQUE são defesas complementares. Fakes
testam as respostas e rollback, NÃO provam locks/conflitos reais do PostgreSQL.
Antes do write real, confirmar em preflight autorizado que os índices UNIQUE
esperados estão efetivamente aplicados. Não há alteração de schema nesta fase.

## Escopo, evidência e autorização futura

Ordem fixa: Pau/396623, Christensen/2282, Szczęsny/851, Gerard/181701, Gavi/296667.
Os cinco IDs locais e pares estão em BARCELONA_WRITE_TARGETS. Qualquer sexto,
Joan, outro ID/clube ou reordenação é rejeitado pelo runner. O parser puro antigo
de dry-run é preservado; o guard adicional do executável estreita o escopo.
O comando antigo com Joan em player-identity-coverage-phase-prep.md é histórico
e agora é rejeitado, não é instrução operacional atual.

Pins: Barcelona529/2026; cache cmtxh1inh0000xoucl26iyllv,
hash PostgreSQL da linha d80583525a6707b21e8ac7fbe5848290; snapshot
cmtxdolfu0000ckuc5xr4whbf, contentHash
1d82442da572f610d2565dec8010d44afbb044737dd5b6d4c31ff80068d1dd11.
TTL não é renovado. Qualquer mudança/expiração exige nova revisão/autorização,
não atualização automática dos pins. Snapshot também passa pelo decoder real.

O adapter preparado lê evidência em RepeatableRead READ ONLY, sem APIs. O core
existente é reexecutado antes de cada novo write: AUTO_MATCH, provider esperado,
roster e lineup corroborados, identidade global, ausência de attempt. Mantém
pesos 40/35/10/15, limiares 75/90, nameScore>=80, margem>=10 e demais gates.
Uma associação já existente segue apenas para checagem idempotente/conflito na
transação; não se fabrica AUTO_MATCH removendo IDs/attempts do catálogo.

`identityPreWriteSummary` fornece player, provider ID, decisão, confidence, margem,
cache hash/validade e snapshot hash. `identityWriteAuthorization` vincula um
argumento explícito a esse resumo; não é segredo nem substitui autorização humana.
`runPreparedBarcelonaIdentityWrites` rejeita confirmação ausente/divergente antes
de acessar dependências. O futuro CLI deverá imprimir o resumo e validar esse
argumento, sem prompt interativo.

**O runner atual rejeita --write INCONDICIONALMENTE antes de dotenv/Prisma.**
Nenhum token ou variável de ambiente pode habilitá-lo. O adapter de escrita e
o orquestrador não estão importados pelo runner. Sua conexão a um modo write
real e a abertura do guard exigem outra mudança revisada/autorização separada.
Não executar --write nem o dry-run operacional na Fase D.

## Lote futuro e auditoria

Uma transação por Player limita duração e escopo do rollback. STOP ON FIRST FAILURE:
se 3 falha, 1/2 podem estar committed, 3 rolled back (ou indeterminado se perder
confirmação), 4/5 untouched. Não existe rollback global retroativo de 1/2.
O resultado lista commits confirmados, falha e não processados.

O adapter prepara hashes para as nove tabelas. O orquestrador audita antes e após
cada resultado, parando também em falha de auditoria ou mudança não autorizada.
Para Players não alterados exige hash integral; para commits confirmados exige
hash de TODAS as colunas exceto apiFootballId e updatedAt, ID esperado e baseline
null. updatedAt é o efeito técnico explícito de @updatedAt, não dado inventado.
Exige exatamente um novo matched attempt com metadata esperada por sucesso e
preserva hashes de attempts anteriores. Club, League, Attributes, caches,
SyncState, SyncError e snapshots devem manter hash integral idêntico.
Auditoria pós-commit detecta mudanças externas, mas não desfaz commits anteriores.

## Testes e limites

Testes determinísticos executam o callback real da operação atômica sobre fake
copy-on-write, com rollback e concorrência otimista. Cobrem sucesso, falha de
attempt, count zero, conflito, idempotência, corrida do mesmo provider entre
Players, abort serializable, expiração, pins, matcher, allow-list, autorização,
cinco sucessos, segunda execução sem duplicação e parada no terceiro.
O decoder de snapshot é isolado nos cenários de orquestração, com teste separado
confirmando rejeição de payload forjado pelo decoder REAL; scoring não é mockado.
O adapter de leitura é testado com client fake, sem banco/driver/rede.

Próximo passo: revisão desta preparação + preflight READ ONLY autorizado de índices,
cinco identidades, hashes e TTL; somente depois autorizar a conexão/habilitação do
runner de escrita e uma execução operacional específica. Nenhum write autorizado
por este documento. Nunca expandir a lista para contornar falha.
