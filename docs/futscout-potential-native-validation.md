# Potential — validação PostgreSQL nativa (29/09/2026)

Resultado: **READY_FOR_PRODUCTION_PREFLIGHT**, exclusivamente para preparar o próximo
preflight. Não autoriza migration, cadastro de modelo, backfill ou publicação.
Branch `beta-next`, HEAD `5008ff6339e1df8cc5c1687ba886c3db84a17b95`.

## Destino e isolamento

PostgreSQL **14.24**, Windows 64-bit, executáveis explícitos em
`C:/Program Files/PostgreSQL/14/bin`. `postgres`, `psql`, `pg_config` confirmados.
Serviço existente `postgresql-x64-14`: Running antes/depois, intocado.

O harness criou seu próprio cluster via initdb, sem registrar serviço, e escolheu
uma porta livre vinculada exclusivamente a 127.0.0.1. Não carregou `.env`, não leu
nem utilizou DATABASE_URL/DIRECT_URL e não aceitou connection string externa.
Cada conexão verificou host/porta, usuário, versão 140024, nome do banco,
data_directory e system_identifier. A prova não depende só do nome do banco:
é um cluster recém-criado em diretório temporário exclusivo, com identidade de
servidor verificada e banco inexistente antes do CREATE DATABASE.

Execução bem-sucedida:

- Host/porta: `127.0.0.1:60569`.
- Banco: `futscout_potential_test_3914c23365b241fcba0b9640a621d0d2`.
- System identifier: `7691078386402457900`.
- Cluster: `C:/Users/Antonio/AppData/Local/Temp/fs-pg14-ilLYwE` (removido).
- Criação UTC, PIDs, recibos e catálogo completos no report.json abaixo.
- Autenticação trust limitada ao cluster temporário/loopback, sem credencial de
  Production. Não é uma configuração proposta para o ambiente público.

## Compatibilidade e drift

Cadeia de migrations aplicada somente no banco descartável. Migration de potencial
aplicou sem modificação de DDL em PG14: 12 constraints (3 PK, 4 FK, 5 CHECK),
9 índices, 7 triggers, funções e gen_random_uuid compatíveis.
Comparação Prisma antes/depois confirmou drift histórico byte a byte idêntico:
BrandAsset FK/index e nome de índice EaCatalogObservation. Nenhum drift adicional
do domínio de potencial. Nenhuma correção do drift foi aplicada.

## Concorrência e resultados

Todos os writers usaram conexões independentes (PIDs diferentes), com barreira
para assegurar snapshots simultâneos antes da disputa. Isolamento confirmado por
SHOW transaction_isolation: **serializable**.

| Cenário | Resultado verificado |
|---|---|
| Mesmo jogador/input/current ausente | Um COMMITTED, um ROLLED_BACK/40001; 1 estimate e revision 1 |
| Replay com CAS atual | NO_OP, zero alterações |
| CAS obsoleto | CURRENT_CAS_CONFLICT e rollback |
| Inputs diferentes/current existente | Um vencedor; revision 2; histórico anterior e vencedor preservados |
| Versões diferentes | Duas versões históricas coexistem; um vencedor concorrente; revision 3 |
| Race no cadastro do modelo | Um registro, um commit, outro rollback/40001 |
| lock_timeout=200ms | 55P03 / LOCK_TIMEOUT, rollback, ~220ms |
| statement_timeout=200ms | 57014 / STATEMENT_TIMEOUT, rollback, ~209ms |
| Prazo total de 30s | TRANSACTION_TIMEOUT, ~30.009s incluindo rollback, nenhuma escrita parcial |
| Deadlock real | Locks advisory em ordem inversa; 40P01 aborta um, outro confirma |
| Confirmação perdida | COMMIT_INDETERMINATE; reconciliação em leitura confirma registro/current; sem replay |
| Semântica C | E preservado; caso em declínio: futurePeak 78.55679174924461, inputOverall/careerCeiling 80 |

Os perdedores concorrentes receberam **SERIALIZATION_CONFLICT (40001)**, não uma
falsa confirmação nem uma classificação inventada de unique violation. O CAS stale
sequencial foi também exercitado explicitamente. O snapshot serializável pode ser
abortado antes de o código comparar a revisão já alterada.

Inputs concorrentes não implicam persistir ambos novos estimates: o perdedor perde
toda a transação. Guardar sua avaliação apesar do CAS falhar quebraria o contrato
atômico atual. O histórico previamente confirmado e o novo vencedor coexistem.
Nenhum overwrite de histórico, update perdido ou retry automático ocorreu.

## Prazo total, rollback e commit

Adapter exclusivo de teste, não integrado ao runtime. Prazo monotônico começa antes
do BEGIN, depois da conexão/verificação de destino. Inclui trabalho/transação e
COMMIT, não aquisição/verificação da conexão. Consultas recebem o menor valor entre
statement_timeout configurado e orçamento restante. Um timer independente cancela
o backend ao vencer o prazo; queries tardias são bloqueadas. Rollback é aguardado.

O teste fez as gravações do writer e depois várias consultas pg_sleep(1), cada uma
abaixo do limite individual. O limite acumulado de 30s abortou a transação e os
snapshots das três tabelas ficaram exatamente iguais ao BEFORE. Isso não é apenas
um teste de uma instrução de 30s. Cleanup/rollback pode acrescentar milissegundos ao
prazo; não se promete interrupção de CPU/rede com precisão de tempo real.

COMMIT enviado sem confirmação não é considerado desfeito só porque um ROLLBACK
posterior respondeu. Erros não classificáveis permanecem indeterminados. A perda de
ack foi uma injeção segura depois de commit real, não uma falha destrutiva de rede.
O recibo não declarou sucesso, não repetiu, e a chave (playerId,modelVersion,inputHash)
mais read-back reconciliou o resultado. O trace interno do harness sabe que a injeção
ocorreu após commit; isso não é evidência de transporte que o writer receberia.

Serializable continua recomendado: snapshots coerentes, locks e conflitos explícitos
complementam constraints únicas, imutabilidade e CAS. Os testes demonstram suficiência
para estes interleavings, não que seja o único nível possível nem prova formal de
todas as falhas de infraestrutura. Não se enfraqueceu o isolamento.

## Preservação e gates

- Sentinela Player.potential=93 nos 12 jogadores sintéticos: intacta após todos os
  testes; comparação textual de todas as linhas Player também idêntica.
- Inspeção do writer: nenhuma instrução escreve Player.
- 383 testes PASS, 0 FAIL, 0 skipped: E (356, incluindo 349 golden/boundary e erro
  máximo zero), fingerprint (7), persistência (9), writer PGlite (11).
- 10 cenários nativos PASS.
- Reexecução da migration/constraints PGlite: 55 PASS, drift adicional zero.
- Prisma validate/generate PASS com config sem dotenv/datasource.
- TypeScript, lint focado e diff-check PASS. Avisos Git somente LF→CRLF.
- Núcleo E, fingerprint, writer existente, schema e migration: hashes intactos.
- Conferidos ainda 13 arquivos preexistentes e 108 artefatos experimentais; preservados
  Na vida real, manifesto GK e trabalhos locais. Nenhum acesso a Production.

## Correções do harness e cleanup

Nenhuma correção necessária no writer ou no modelo. Apenas no harness novo:

1. Windows mantém pipes herdados pelo servidor; aguardar exit do pg_ctl em vez de
   close dos pipes. A primeira inicialização foi interrompida/encerrada sem DDL.
2. inet::text no PG14 retornou 127.0.0.1/32; usar host(inet_server_addr()) para a
   comparação exata de endereço. A segunda parou no preflight, sem DDL.
3. Tipo de ambiente dos subprocessos recebeu NODE_ENV=test; nenhum segredo herdado.

Não houve retry de uma transação writer falha. Foram inicializações de harness
corrigidas antes de qualquer cenário. O terceiro run executou os dez cenários.

Banco de teste removido via DROP DATABASE, ausência confirmada em pg_database.
Conexões fechadas, cluster parado e pg_ctl status=3. Três diretórios de clusters
criados nesta tarefa foram removidos somente após validação individual de caminho,
ausência de reparse point e status parado. Recibos/logs preservados no audit/output.
O serviço do usuário continuou Running; nenhum serviço adicional foi instalado.

## Arquivos e reprodução

Novos arquivos desta etapa:

- `tests/integration/nativePotentialStore.ts`
- `tests/integration/futscoutPotentialNative.ts`
- `docs/futscout-potential-native-validation.md`

Execução explícita (cria/escreve/remove apenas cluster/banco descartável):
`node --import tsx tests/integration/futscoutPotentialNative.ts`.
Não é executado automaticamente pela descoberta de *.test.ts.

Artefatos locais ignorados:

- `audit/output/potential-native-20260929/3914c233-65b2-41fc-ba0b-9640a621d0d2/report.json`
- `audit/output/potential-native-20260929/2d6cb67b-cc97-4ef6-b662-010d2991e756/report.json` (preflight interrompido)
- `audit/output/potential-native-20260929/7a413ab6-11e5-42a4-8ec0-47dde7d14edc/server.log` (primeira inicialização)
- `audit/output/potential-persistence-validation-20260929/a34df6bc-d664-4b3e-bffb-85e56bf8de56/report.json`

Git continua sujo por alterações preexistentes e estes três arquivos novos. Staging
vazio, HEAD preservado. Nenhum commit, push, deploy ou backfill.
