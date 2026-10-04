# Persistência da estimativa FutScout — preparação, sem aplicação

Modelo candidato: `potential-model-e-v1`, experimental e **não historicamente validado**.
Esta etapa define estrutura, não calcula nem publica valores. `Player.potential`
continua legado/importado. Não há writer, job, endpoint ou leitor conectado às tabelas novas.

## Padrões reutilizados e alternativas

O schema usa IDs `cuid()`, `createdAt`, snapshots JSON e hashes em observações EA,
revisões em `ClubOfficialLineupSnapshot` e FK composta para impedir associações entre
jogadores em Current Club V2. Migrations existentes já mantêm CHECKs, índices e
triggers SQL não representáveis em Prisma. Reutilizamos esses padrões, sem usar
SyncState como repositório de resultados e sem reinterpretar potencial legado.

| Alternativa | Leitura/simplicidade | Auditoria/versões/rollback | Custo e concorrência |
|---|---|---|---|
| A: campos Player | simples, sem join | sobrescreve contexto/histórico; mistura domínios | writes em Player/updatedAt, conflito com EA; rejeitada |
| B: 1:1 separado | join simples, isolamento | uma versão por vez; perde avaliações anteriores | barato, mas recomputação destrutiva; rejeitada |
| C: histórico 1:N + seletor | join por PK; explícito | versões e inputs coexistem; rollback por referência | mais armazenamento, unique key + CAS; escolhida |
| D: cópia atual + histórico | leitura direta da cópia | preserva histórico se sincronizado corretamente | duplica números/provenance, exige commit de duas cópias; desnecessária |

A escolha é C, não D: o seletor não duplica potencial, versão do modelo nem snapshot.
Um registro imutável de modelos vincula cada versão a um artefato/contrato, evitando
que duas execuções usem silenciosamente fórmulas diferentes sob o mesmo nome.

## Schema implementado

Definição exata: `prisma/schema.prisma`, modelos abaixo. SQL preparado em
`prisma/migrations/20260929120000_futscout_potential_estimates/migration.sql`.

### FutscoutPotentialModel (registro imutável)

- `version String @id`: versão não vazia, e-v1/e-v2 coexistem.
- `artifactHash String`: SHA-256 lowercase de um artefato imutável que contenha código,
  constantes e contrato numérico. Empacotamento/retenção do artefato são gate do futuro writer.
- `inputContractVersion String`: identifica adaptador/canonicalização dos inputs.
- `createdAt DateTime`: registro local; não é data da fonte nem validação científica.

A migration não insere nem mesmo o registro e-v1. Qualquer tentativa posterior de
UPDATE/DELETE/TRUNCATE do registro é bloqueada por trigger; alteração de semântica
exige nova versão. Não usar `upsert.update` para renovar timestamps.

### PlayerFutscoutPotentialEstimate (avaliação imutável 1:N)

| Campos | Tipo/semântica |
|---|---|
| id, playerId, modelVersion | String; ID cuid, FK Player e FK modelo, ambas Restrict |
| inputHash | String; SHA-256 determinístico dos inputs, formato verificado em SQL |
| inputSnapshot | Json obrigatório; objeto com entradas originais congeladas |
| inputAge, inputOverall | Float? / PostgreSQL DOUBLE PRECISION; não Decimal nem inteiro para o core |
| inputPosition | String?; posição primária normalizada usada |
| inputDateOfBirth | DateTime?; nascimento utilizado quando conhecido, sem inventar |
| referenceAt | DateTime; instante explícito usado como referência (asOf), não relógio oculto |
| provenance | Json; `kind: "FUTSCOUT_ESTIMATE"` obrigatório e evidências dos inputs |
| status | enum EXPERIMENTAL / INVALID, nunca aprovação jurídica/oficial/científica |
| invalidReason | String?; obrigatório/não vazio em INVALID, nulo em EXPERIMENTAL |
| potentialRaw | Float?; resultado bruto em [1,99] |
| potentialRounded | Int?; [1,99], arredondamento positivo Math.round, sem epsilon |
| peakSeason | Int?; primeira temporada do máximo em T1..T10 |
| computedAt | DateTime; momento real da execução, fornecido pelo job futuro |
| createdAt | DateTime default now; inserção local, separada de computedAt/referenceAt |

EXPERIMENTAL exige idade [0,100], OVR [1,99], posição reconhecida, resultado e
temporada presentes e válidos. A projeção JSON `age/overall/position` deve corresponder
aos campos tipados; CHECKs usam IS TRUE para rejeitar UNKNOWN em chaves ausentes.
NaN/Infinity não passam os intervalos do resultado válido. INVALID permite registrar
snapshot de dados ausentes/inválidos, exige motivo e **não permite números de resultado**.
Não converter ausências em zero. Valores não representáveis em JSON devem ter marcador
tipado pelo contrato de inputs, não números inventados.

Não guardar trajetórias mensais/anuais automaticamente. Os três inputs do core, a
versão imutável e o contrato permitem reconstruí-las. Sem nomes de jogadores nos
coeficientes. Datas da fonte e observações conhecidas pertencem à provenance por campo,
com referência verificável; desconhecido fica null/ausente. Uma observação EA de hash
não prova que seu payload contenha o valor atual. `Player.updatedAt` é data local,
não `sourceUpdatedAt`. `modelVersion/artifactHash` atribuem o resultado ao FutScout,
nunca à EA/API-Football.

### PlayerFutscoutPotentialCurrent (seletor, não autorização de publicação)

- `playerId String @id`: um slot por jogador, inclusive entre versões diferentes.
- `estimateId String? @unique`: referência composta com playerId; null retira seleção.
- `version Int default 1`: revisão CAS do seletor, **não** versão matemática.
- `selectedAt DateTime`, `decisionRef String`, `createdAt DateTime`: decisão auditável.
- FK composta `(estimateId,playerId)` impede selecionar avaliação de outro jogador.
- Trigger exige alvo EXPERIMENTAL, inserção na revisão 1 e atualização exatamente +1.
  Não aceita troca de playerId/createdAt nem update sem mudar estimateId.
- DELETE/TRUNCATE bloqueados para não reiniciar revisão e causar ABA. Retirar seleção
  faz CAS para estimateId=null. Histórico não muda. Tentativa idempotente não toca a linha.

Uma avaliação selecionada pode tornar-se stale; o ponteiro não comprova freshness,
compatibilidade da versão ou aprovação para exibição. **Nenhuma leitura pública passa
a usar o seletor automaticamente.** Política de lote global/publicação/cache ainda
precisa ser implementada antes da integração; não declarar atomicidade de catálogo
inteiro porque cada jogador tem seu próprio ponteiro.

## Constraints, índices e alcance das garantias

- UNIQUE `(playerId,modelVersion,inputHash)` torna replay concorrente do mesmo input
  uma colisão detectável, não segunda avaliação. O writer futuro deve comparar a linha
  existente inteira antes de NO_OP; divergência é conflito, não overwrite.
- UNIQUE `(id,playerId)` + FK composta preservam identidade. Unique composto do seletor
  é adicionalmente declarado para o contrato 1:1 exigido pelo Prisma 7.
- Histórico por `(playerId,computedAt DESC)`; filtro por
  `(modelVersion,status,potentialRounded,playerId)`. Leitura atual faz join via estimateId,
  sem buscar simplesmente “mais recente”. Ordenar/filtrar **antes** de paginar.
- CHECKs para versões não vazias, hashes de 64 hex lowercase, objetos JSON,
  domínios/resultados, arredondamento e projeção do snapshot.
- Triggers bloqueiam mutação de avaliações/modelos. São proteções contra DML normal,
  não contra administrador capaz de alterar/desativar DDL.
- O SQL não comprova hash criptográfico do conteúdo, fórmula, primeiro máximo ou
  vínculo de provenance. Isso exige o core/goldens e validação do futuro writer.
- O schema fixa o contrato de saída atual [1,99]/T1..T10. Se um modelo futuro mudar
  esse domínio/horizonte, exige revisão/migration, não só novo nome de versão.

## Idempotência, versões e recomputação

Mesmo jogador/modelVersion/inputHash: retornar linha existente sem touch após conferir
artefato, inputs, outputs e provenance. Não fazer ON CONFLICT DO UPDATE. Novo modelo:
nova linha referenciando outro registro de modelo, sem mudar a anterior. Mesma versão
com OVR/posição/nascimento/asOf/contrato relevante diferente: novo hash, nova avaliação.
`computedAt/createdAt` não entram no hash; reexecutar o mesmo plano não cria identidade nova.

Fingerprint não foi implementado nesta camada. Gate obrigatório da próxima etapa:
canonicalização versionada, JSON-safe, UTF-8 e SHA-256 lowercase; preservar tipos,
nulos/ausências, normalização de -0 e datas UTC; incluir playerId, inputs numéricos/posição,
nascimento usado, asOf, contrato e referências estáveis relevantes. Não incluir relógio
da execução, ordem acidental de propriedades ou metadados voláteis. Testar determinismo,
distinção de inputs e correspondência snapshot/colunas antes de habilitar inserts.

Mudança de fonte/dados: futuro job revalida Player e snapshot com CAS/Serializable;
leitor futuro deve detectar divergência ou asOf vencido e não servir como atual. Snapshot
inválido novo não torna a avaliação antiga novamente válida; retirar seleção se necessário
com CAS. Não há trigger em Player, job ou sync instalado nesta etapa.

## Concorrência, rollback e ciclo de vida

Futuro writer: registrar versão aprovada; reler inputs; inserir avaliação (ou comparar
replay); selecionar por playerId + revisão + estimateId esperados na mesma transação;
read-back; recibo com estado de commit; zero retry automático em conflito/erro/incerteza.
Trigger de revisão ajuda, mas não substitui WHERE CAS nem detecção de stale. Resultado
confirmado seguido de auditoria falha continua confirmado e exige parada/leitura.

Rollback funcional: com aprovação, selecionar uma avaliação anterior **ainda compatível**
via CAS, nova revisão/selectedAt/decisionRef, ou retirar seleção. Não reescrever histórico,
deletar dados nem preencher Player.potential. `decisionRef` deve apontar para recibo
durável com before/after; esta tabela conserva apenas a última decisão, não é um log
integral de ativações. Esse log/armazenamento durável e ativação global são gates futuros.

Player removido: FKs Restrict impedem hard delete que deixaria histórico órfão. O projeto
não tem um estado genérico de inatividade no Player: não inventamos coluna ou regra.
Futura política identificará inatividade e retirará seleção, preservando histórico.
Expurgo/anonymização exigem processo separado autorizado, não cascata automática.

Armazenamento cresce com novas referências/inputs; evitar recomputação por request.
Cadência, retenção e benchmark de índices/joins devem ser definidos no dry-run futuro.
Não há benchmark nem validação histórica nesta etapa. Rollback de schema não é necessário
agora: migration não aplicada. Após aplicação futura, preferir desativar consumidores a DROP.

## Validação desta etapa e limites

Migration estritamente aditiva preparada localmente: três tabelas, um enum,
índices/FKs/checks e guards. Nenhuma DML de cadastro, nem registro do modelo e-v1.
Prisma validate/generate e diff entre dois schemas locais usam config de auditoria
sem datasource e sem dotenv. Não executamos migrate dev/deploy/status, shadow DB ou db push.
Client gerado em app/generated/prisma é ignorado pelo Git.

Gates locais: Prisma validate/generate PASS; TypeScript e lint focado PASS;
testes novos de contrato e migrations GK/Brand Assets PASS (15 testes).
Foi corrigido P1012 inicialmente apontado para a relação composta 1:1, adicionando
o unique composto exigido pelo Prisma, também presente no SQL. Avisos LF/CRLF do
Git não são erros de whitespace.

Limitação da ferramenta: `prisma migrate diff` entre os dois arquivos locais
encerrou com código 0 sem SQL, inclusive com --output/--exit-code; não produziu o
arquivo solicitado. Isso **não** foi considerado prova de diff vazio ou validação
da migration. SQL foi preparado explicitamente e revisado pelos contratos estáticos.
Comparação automática de DDL e execução real dos CHECKs/triggers permanecem gates
antes de qualquer aplicação. Nenhuma configuração de rede ou datasource foi alterada
para tentar resolver essa limitação.

Testes de contrato SQL/schema são estáticos e de tipagem; não equivalem a executar as
constraints em PostgreSQL. Integração real de constraints/concorrência precisa de banco
descartável autorizado antes de produção. Nenhum teste importa ou chama o núcleo para
calcular potenciais nesta etapa.

Campos/consultas legados, API/UI/filtros/importers seguem intactos. Apenas relações
Prisma inversas são adicionadas a Player; nenhum scalar nem Player.potential muda.
**Zero registros FutScout gravados por esta tarefa.** Não consultamos o banco para
afirmar uma contagem global atual. Migration não aplicada, sem dry-run/backfill/commit/push/deploy.

## Validação posterior em PostgreSQL descartável — 29/09/2026

Esta seção atualiza os gates pendentes acima; não autoriza aplicação em banco real.
O SQL e o schema preparados permaneceram byte a byte iguais. Nenhum defeito de DDL
foi encontrado nesta validação e nenhuma correção de migration foi feita.

### Saída silenciosa do Prisma

Reprodução em Node 24.19.0 / Prisma 7.9.1, capturando os códigos diretamente do
subprocesso (não o status agregado do shell):

- Config sem datasource: código 0, stdout vazio; somente mensagem de carregamento
  da config em stderr. A reprodução fora do sandbox teve o mesmo comportamento.
- Mesmos dois schemas, config com datasource fictício `127.0.0.1:1`, sem dotenv:
  código 2 e 3.304 bytes de SQL. Comparação schema/schema não consulta esse destino.
- O binário nativo invocado sem datasource rejeita a inicialização: código 1,
  `The following required arguments were not provided: --datasource <JSON>`.

A causa operacional reproduzida é a ausência de datasource nessa configuração do
Prisma/engine instalado, acompanhada de falha silenciosa de propagação no CLI.
Não era equivalência dos schemas, necessidade de shadow DB ou SQL inexistente.
O teste reutilizável exige controle positivo com código 2/CREATE TABLE e exige
`-- This is an empty migration.` com código 0 para reconhecer um diff vazio.

### Isolamento e execução

Sem PostgreSQL nativo, Docker/Podman ou WSL instalado. Foi usado o PostgreSQL 17.5
compilado para WASM do PGlite já instalado como dependência transitiva do Prisma.
É execução real de SQL, catálogos, PL/pgSQL e constraints, não um mock de queries.
Não equivale a validação de concorrência em PostgreSQL nativo multi-backend.

O runner cria `new PGlite()` sem caminho e sem configuração de conexão: instância
nova, exclusivamente em memória. Antes das migrations, exige zero tabelas públicas,
insere um marcador aleatório em schema de teste separado e compara esse marcador
por conexão de loopback com porta efêmera. Nenhuma URL pode ser fornecida ao runner.
O subprocesso Prisma recebe apenas a conexão dessa instância via variável própria;
não herda DATABASE_URL/DIRECT_URL nem carrega dotenv. Nenhum arquivo de credencial é lido.

Foram verificadas duas estratégias, em instâncias distintas:

1. Replay das migrations versionadas desde o schema vazio, seguido pela migration
   preparada, sem alterar seu conteúdo.
2. Base anterior derivada do schema esperado, removendo apenas os três modelos,
   enum e relações inversas novos; DDL-base gerado pelo Prisma, seguido pelo mesmo SQL.

Os testes usam jogadores/valores sintéticos fixos, sem invocar o modelo matemático.
Cada caso é protegido por savepoint; o conjunto termina com ROLLBACK e confirmação
de zero linhas nas três tabelas e em Player. Depois o socket e o banco em memória
são fechados. Não há banco persistente para apagar. Recibos preservam inclusive
falhas de preparação do harness, sem tratá-las como falhas da migration.

### Constraints e introspecção

55 casos positivos/negativos passaram em cada estratégia: registro de modelo,
EXPERIMENTAL/INVALID, unique de input, FKs, snapshot/projeções/provenance, intervalos,
NaN/Infinity, arredondamento, seleção válida/inválida/cruzada, revisão inicial,
CAS bem-sucedido e CAS stale com zero linhas afetadas, retirada da seleção,
imutabilidade UPDATE/DELETE/TRUNCATE e delete/update Restrict do Player.

A FK composta também foi testada independentemente do guard: apenas esse trigger
foi desabilitado dentro de savepoint no banco descartável, a FK rejeitou a associação
cruzada e o rollback restaurou o trigger. Nenhuma proteção de banco real foi alterada.
Isso não é um teste de corrida entre transações nativas concorrentes.

Catálogo inspecionado: três tabelas, 28 colunas, três PKs, quatro FKs Restrict,
cinco CHECKs, nove índices (incluindo PKs/uniques) e sete triggers de usuário.
Definições SQL, tipos, nulabilidade, defaults e precisão temporal constam dos recibos.
Prisma não representa todos os CHECKs/triggers; sua validação foi feita no PostgreSQL,
não inferida do diff vazio.

### Drift: novo domínio versus histórico existente

Na base do schema esperado: diff explicitamente vazio, código 0.
No replay do histórico: código 2, com **o mesmo SQL antes e depois** da migration
de potencial. As divergências preexistentes são:

- `BrandAsset_identityId_fkey`: histórico usa ON UPDATE RESTRICT, schema espera CASCADE;
- índice extra `BrandAsset_operatorRiskAccepted_status_idx` no histórico;
- nome truncado do índice longo de EaCatalogObservation diferente do nome esperado
  pelo Prisma (`...requestOff` versus `...reques_idx`).

Não foram corrigidas nem aplicadas as sugestões de DROP/ALTER desse diff.
Logo, o novo domínio é coerente, mas **o histórico completo não tem drift zero**.
Essas diferenças exigem revisão separada antes de afirmar alinhamento integral ou
planejar aplicação real; o resultado desta tarefa não é autorização de Production.

### Reexecutar sem banco externo

```sh
node tests/integration/futscoutPotentialMigration.mjs
node tests/integration/futscoutPotentialMigration.mjs --schema-base
```

O arquivo `.mjs` não entra no glob `*.test.ts`; a suíte unitária comum continua sem
dependência de banco. Requer PGlite/pglite-socket já disponíveis no node_modules desta
instalação. Se essas dependências transitivas deixarem de existir, o teste falha antes
de conectar: não instala dependências nem substitui por uma conexão externa.
Relatórios únicos ficam em `audit/output/potential-persistence-validation-20260929/`,
já ignorado. Nenhum payload real, potencial calculado ou segredo é gerado.

Prisma validate/generate usam config explícita sem dotenv; cliente gerado é ignorado.
Gates finais: validate PASS, generate PASS, TypeScript PASS, lint do runner PASS,
9 testes estáticos de persistência PASS e diff-check PASS. O lint detectou inicialmente
imports CommonJS no runner novo; ele foi convertido para ESM, sem desabilitar regras.
Git emitiu apenas os avisos preexistentes de normalização LF/CRLF. Verificação de
preservação: 13 arquivos protegidos e 108 artefatos experimentais com hashes intactos.
Não foi adicionado consumidor, writer, fingerprint, job, API ou UI. Zero acesso,
consulta ou escrita em Production. Aplicação apenas nas instâncias descartáveis.
