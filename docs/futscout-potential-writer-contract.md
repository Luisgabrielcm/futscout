# FutScout Potential — contrato isolado v1

Congelado antes da implementação desta etapa, 29/09/2026. Sem autorização de rollout.
E continua `potential-model-e-v1`, experimental, não validado historicamente.

## Semântica recomendada (não conectada à API/UI)

A = futurePeakRaw = máximo bruto T1..T10, excluindo T0. Persistir esse resultado nos
campos existentes potentialRaw/potentialRounded/peakSeason; não reinterpretar E.
B = careerCeilingRaw = max(inputOverall, futurePeakRaw); arredondar só depois.
C conserva A e deriva B do snapshot imutável. É a recomendação: futura API nomeia
explicitamente ambos; UI pode chamar B de Potencial, com explicação experimental e
A disponível como pico futuro. B não é teto absoluto nem máximo de toda carreira:
considera apenas OVR de entrada + dez anos condicionais à continuidade em atividade.
Não duplicar B no banco: evita divergência e não exige mudar schema/migration.
Não usar OVR vivo para derivar B de uma avaliação antiga. Sem decisão de publicação aqui.

## Fingerprint congelado: futscout-potential-input-v1

Canonicalizar o objeto abaixo com regras JCS/RFC8785; UTF-8 e SHA-256 hex lowercase:

```
{
  contractVersion: "futscout-potential-input-v1",
  modelVersion: <versão>,
  modelArtifactHash: <SHA256 do artefato aprovado>,
  agePolicy: "utc-elapsed-365.2425-v1",
  inputs: { birthDate: <ISO UTC milissegundos>, referenceAt: <ISO UTC milissegundos>,
            overall: <Number finito 1..99>, primaryPosition: <código reconhecido> }
}
```

Somente representação ISO UTC exata YYYY-MM-DDTHH:mm:ss.sssZ é aceita; rejeitar datas
normalizadas pelo parser (ex. 30/02), futuras e idade fora de [0,100]. Idade derivada
internamente por (referenceAt-birthDate)/(365.2425*86400000), nunca fornecida em paralelo.
Snapshot recebe a idade derivada e o payload canônico; não há duas fontes de autoridade.
Dois pares de datas deslocados com a mesma idade podem produzir a mesma matemática,
mas são referências temporais auditadas diferentes e têm hashes diferentes por desenho.

playerId NÃO entra no hash: não determina E. Chave de persistência continua
(playerId,modelVersion,inputHash), impedindo compartilhar avaliação entre jogadores.
DOB/reference/policy entram para reproduzir a derivação temporal sem idade redundante.
Version/artifact entram para distinguir implementação imutável, não só nome de modelo.
Não entram nome, clube, IDs de fornecedores, atributos, legado, provenance arbitrária,
computedAt, createdAt, updatedAt ou relógio do processo. updatedAt é CAS, não fingerprint.

JCS: ordenação lexical de chaves por unidades UTF-16 (não localeCompare), arrays em
ordem original, serialização ECMAScript de números (incluindo -0 como 0), sem espaços,
sem normalização Unicode. Rejeitar NaN/Infinity, undefined, sparse arrays, ciclos,
surrogates isolados, tipos não JSON e accessors. Input recebido já é objeto: parser
de JSON externo deve rejeitar duplicate keys antes de chamá-lo, pois objeto JS perdeu-as.

Artefato E: SHA256 de JSON.stringify de uma lista ordenada de pares [caminho, fonte
UTF-8 com CRLF normalizado para LF] para modelEV1.ts e types.ts. Valor fixo no descriptor,
testado contra os fontes. Não ler filesystem dentro do writer/fingerprint.
Versão futura precisa descriptor/calculador aprovado novo; não relabelar E como v2.

## Writer isolado

Serviço recebe store transacional explicitamente; sem import de Prisma global, dotenv,
URLs, API, job ou consumidor público. Executa um jogador por transação Serializable,
timeout 30s, zero retries. Store deve resolver somente após commit confirmado e rejeitar
com estado explícito de rollback/commit incerto. Erro não classificado => indeterminado.

Plano: identidade local/EA esperada, DOB/OVR/posição/updatedAt esperados, referência,
CAS current (null ou estimateId+revision), instante operacional explícito e decisionRef.
Antes da transação: fingerprint+E determinísticos. Dentro dela: bloquear/reler Player
e current, validar que o estado ainda corresponde aos inputs e CAS, confirmar
registro imutável de modelo (ou criar), buscar estimate
pela chave, comparar conteúdo integral sem timestamps operacionais, inserir se novo,
selecionar por CAS, read-back integral de estimate/current antes do commit.

Repetição com preflight/CAS atual: mesmo estimate + current => NO_OP, zero touch.
Replay de plano com CAS antigo => conflito, mesmo se o alvo parece igual. Não ignorar
revisão para facilitar retry; após commit incerto, auditoria de leitura deve preceder
qualquer nova tentativa. Mesmo input/model em outro Player tem hash igual e linha distinta.
Novo input => história nova; mesma versão com artefato diferente => MODEL_CONFLICT.
Input inválido => INVALID sem iniciar transação, sem cadastrar modelo ou selecionar.
Estimate INVALID existente nunca é reutilizado/selecionado como válido.

Player inexistente, estado divergente, CAS stale, unique race, conteúdo/hash divergente
ou read-back mismatch => rollback integral. Nenhum UPDATE/DELETE de modelo/estimate,
nenhum write em Player/legado. Só current pode atualizar +1; não cria leitor público.
Lotes são externos: commits anteriores permanecem; execução parcial exige novo preflight
por jogador, não um checkpoint/cursor implicitamente implementado aqui.

Saída: COMMITTED/NO_OP/INVALID/REJECTED/COMMIT_INDETERMINATE, certeza transacional,
quantidades confirmadas ou null quando desconhecidas, IDs e motivo seguro. Sem SQL,
credenciais ou payload no diagnóstico. Commit confirmado não é rebaixado por etapa
posterior (não há auditoria externa automatizada neste writer).

## Limites e testes

Adapter SQL transacional só existe nos testes PGlite. Não há adapter Production nem
comando operacional. PostgreSQL WASM valida DDL, idempotência, CAS sequencial e rollback,
não concorrência multi-backend ou durabilidade/rede Production. Estes são gates futuros.
O timeout de 30s faz parte da interface obrigatória do store. O adapter de teste usa
statement_timeout=30s; não comprova um prazo total de transação de 30s. O futuro adapter
operacional deverá implementar esse prazo total e classificação segura de commit.
As leituras de timestamp sem timezone do schema explicitam AT TIME ZONE 'UTC':
evita interpretar DOB/CAS na timezone local do driver (regressão demonstrada no teste).
Drift histórico fora do domínio permanece sem correção. Nenhuma migration produtiva,
backfill, API/UI ou Player.potential será alterado nesta tarefa.
