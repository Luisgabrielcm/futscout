# Lote 9 — Fase B: adapter genérico guardado, sem execução real

Esta etapa implementa e testa a capacidade de escrita. NÃO é autorização para
executá-la. O core do matcher, pesos, thresholds e decisões da Fase A não mudaram.
Não houve schema/migration, API, refresh ou nova associação nesta fase.

## Camadas e entrada

`executeClubIdentityAutoWrite` recebe mode=AUTO_WRITE, config tipada, relatório
DRY_RUN, summary v1, confirmation e expectedHead, com dependências injetadas.
O core original continua rejeitando mode=AUTO_WRITE: sua única função é avaliar.
Não há fallback entre modos nem valor default que ative escrita.

`createPrismaClubIdentityWriteDependencies` usa somente PostgreSQL. Lê cache,
snapshot, catálogo/owners/attempts relevantes em bulk e auditoria global em
transações READ ONLY. Não importa resolver, sync, HTTP ou databaseRetry.
O executável bloqueia fetch e carrega a factory de escrita somente depois dos
gates de CLI, Git, envelope e confirmação. Dry-run/preflight não a importam.

## Uma única transação de persistência

`persistPlayerIdentityWithPolicy` contém o corpo transacional existente,
parametrizado por pins, clube/team, alvos e revalidação. O wrapper antigo
`persistPlayerApiFootballMatchAtomically` preserva os dois lotes fechados,
targets/pins e contrato anterior; tokens antigos não habilitam o adapter novo.

Uma transação Serializable por Player, maxWait=5s e timeout=15s, preserva:

1. Releitura da identidade completa, provider owner e Attempt.
2. Comparação de externalId EA, slug, nascimento, nacionalidade, posições, clube
   e expectedUpdatedAt; jamais altera externalId.
3. Pins/TTL de cache e snapshot. No adapter genérico, releitura do conjunto
   relevante e reexecução do matcher DENTRO da mesma transação antes do update.
4. Update condicional id + apiFootballId=null + clubId + updatedAt; count=1.
5. Attempt matched criado na mesma transação; validação de prazo antes do commit.
6. Catch fora do callback para rollback. Nenhum retry automático.

Snapshot ausente é permitido se a config não o exige/pina; participação não é
requisito global. Quando o ranking real contém um único provider, margin=null
é preservada, não convertida em score/margem fictícia. Somente a política genérica
com revalidação obrigatória permite esse caso; o wrapper legado continua exigindo
margem numérica. Para Eric a margem é 43, não null.

## Limite, conjunto e ordem

Limite padrão configurável: 10; política operacional deste piloto: **1**.
Um conjunto de 2 para limite 1, ou 11 para limite 10, é rejeitado por inteiro.
Não se selecionam silenciosamente os primeiros N. O plano da Fase A foi ajustado
para rejeitar excesso; não é truncado nem usado para autorizar execução parcial.

A ordem de execução é a ordem do summary, gerada pelo core em provider ID
ascendente. Não depende de OVR ou fama. Antes da primeira transação, todos os
candidatos atuais devem coincidir exatamente com os revisados. Antes das demais,
o conjunto restante precisa corresponder à lista autorizada menos os próprios
commits já confirmados e auditados. Novo candidato, retirada, alteração de versão
ou classificação aborta; o processo não recalcula uma autorização automaticamente.

## Summary v1 e token

O schema da Fase A foi preservado: versão/escopo, clube/slug/team/season,
generatedAt/validUntil, cacheRowHash, snapshotHash, inputHash, policy e lista
ordenada com playerId/slug/providerId/confidence/margin/expectedUpdatedAt.
maxAutoWrites permanece em policy. Lista e resumo usam JSON explícito UTF-8 +
SHA-256; a ordem dos campos do JSON recebido não importa semanticamente.

Formato: `AUTHORIZE_CLUB_IDENTITY_V1:<summaryHash>`.
É confirmação de evidência revisada, não segredo nem autorização humana por si só.
Prefixos legados não são aceitos. Toda alteração nos campos protegidos invalida
a confirmação; o limite também está vinculado. Ausência/extra de campo no summary
é incompatível com a versão esperada.

Validade: até 15 minutos, nunca além do cache. O generatedAt do envelope revisado
é preservado para verificar a confirmação; não se exige igualdade com o relógio
de uma releitura. Dados, candidatos e pins são revalidados com relógio atual.
Depois do primeiro commit, o inputHash original naturalmente muda. Só mudanças
dos commits deste próprio lote, aprovadas pela auditoria exata, atualizam o estado
esperado em memória. Nenhuma diferença externa é incorporada silenciosamente.

## Gates Git e CLI

Write exige beta-next, árvore limpa incluindo untracked, HEAD completo esperado
e arquivo de preflight cujo head corresponde ao atual. HEAD é gate separado,
não novo campo do summary v1. Os gates são repetidos antes de cada transação e
na revalidação transacional. Não há merge/push de master nem deploy Production.

O dispatcher operacional só aceita FC Barcelona/2026. Sua política permite
unicamente Eric García/619 como novo candidato, mantendo Joan em REVIEW.
Um preflight posterior com Eric já ALREADY_MATCHED e zero AUTO_MATCH pode
autorizar uma execução no-op, sem duplicar Attempts. City/Real são somente fakes;
seus IDs não estão no adapter/persistência genéricos.

Preflight autorizado em leitura, depois de commit/push e com árvore limpa:

```sh
npx tsx scripts/runClubPlayerIdentityPipeline.ts --preflight --club fc-barcelona --season 2026
```

O JSON impresso inclui relatório, summary, token e estado explícito dos candidatos:
apiFootballId, Attempt, provider owners e expectedUpdatedAt. Preserve o envelope
em um JSON local ignorado sob audit/reports, sem modificar seu conteúdo.
Não redirecione saída bruta com logs para um arquivo de autorização.

Sintaxe FUTURA, **NÃO executar nesta fase**:

```sh
npx tsx scripts/runClubPlayerIdentityPipeline.ts --write --club fc-barcelona --season 2026 --summary-file audit/reports/club-identity-eric-authorization.json --confirmation "AUTHORIZE_CLUB_IDENTITY_V1:<HASH_DO_PREFLIGHT_FINAL>" --expected-head <HEAD_COMPLETO_REVISADO>
```

O token final só deve ser gerado após commit/push e novo preflight. Não reutilizar
token expirado nem regenerá-lo automaticamente no comando de write. Se a análise
ou autorização humana levar mais de 15 minutos, realizar novo preflight autorizado.

## Decisões, falhas e auditoria

ALREADY_MATCHED → NO_OP; REVIEW (inclusive stale club) e UNRESOLVED → SKIP.
CONFLICT → STOP. Somente AUTO_MATCH constante no conjunto confirmado pode escrever.
Nome/confidence altos não superam REVIEW; Joan e os seis casos stale continuam fora.

STOP em autorização/conjunto divergente, cache inválido, provider ocupado, versão
alterada, matcher não-auto, falha de Attempt/concorrência, schema/state mismatch,
audit mismatch e INDETERMINATE_COMMIT. Sem retry ou compensação destrutiva.

BEFORE/AFTER reutilizam o auditor existente para nove áreas. Permite somente
apiFootballId + updatedAt dos Players com MATCHED confirmado e os novos Attempts
matched correspondentes. Todo outro Player/campo/Attempt e as demais sete tabelas
devem ser idênticos. Logs operacionais ficam no relatório, não criam SyncError.

Se o quarto candidato falhar com rollback conhecido, 1–3 continuam commitados,
4 não foi associado e 5+ não iniciam. Se o resultado do commit for indeterminado,
**não se afirma rollback de 4**: `indeterminatePlayerIds` exige auditoria manual,
mesmo que a releitura encontre o ID. Uma auditoria falha nunca desfaz commits prévios.
O resultado informa commits confirmados, indeterminados, não iniciados, motivo
de parada e auditFailure. Consultas externas concorrentes podem fazer a auditoria
global abortar conservadoramente; hashes não equivalem a locks de todo o banco.

## Testes e limites da evidência

Fakes executam o callback transacional REAL, com copy-on-write, não uma transação
alternativa de produção. Cobrem Eric, Joan, stale club, decisões, limites, campos
do token, concorrência entre leitura e transação, partial success, audit mismatch,
idempotência e perda de resposta de commit com e sem commit no servidor fake.
Os testes legados continuam cobrindo unicidade/rollback dos dois pilotos prévios.

Fakes não provam latência ou locks reais. A revalidação adicional pode atingir
o timeout de 15s; isso exige diagnóstico, não retry agressivo. Nenhuma transação
de escrita real foi executada para medir essa latência na Fase B.
