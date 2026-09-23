# Identidades históricas bloqueadas — validada em banco descartável e aplicada em staging

## Diagnóstico verificado em 23/09/2026

A leitura de `pg_indexes` confirmou a mesma estrutura declarada nas migrations: o índice único `BrandAssetIdentity_entityType_entityId_provider_key` cobre `(entityType, entityId, provider)` sem condição de status. Por isso a identidade `cmuczcaug0000dcuc8nlf6dn5` do Red Star, embora BLOCKED, ocupa a chave `(CLUB, cmt9g1wkq037v1sucum6ntyxn, api-football)` e impede um segundo registro com ID externo 104.

A outra chave, `BrandAssetIdentity_entityType_provider_providerEntityId_key`, protege `(entityType, provider, providerEntityId)` globalmente. Ela deve continuar única inclusive para registros BLOCKED: 4396 permanece reservado historicamente, sem ser reaproveitado ou transferido silenciosamente.

Não renomear o provedor, não alterar `entityId`, não transformar 4396 em 104 e não apagar a identidade ou seu escudo. O ID correto é uma identidade nova; a ligação histórica permanece íntegra.

## Menor mudança proposta

- Trocar a unicidade local absoluta por índice único parcial nas mesmas colunas, com `WHERE status <> 'BLOCKED'`. VERIFIED e REVIEW_REQUIRED continuam disputando a mesma chave; não se permite uma identidade verificada em paralelo a outra pendente.
- Manter um índice local não único no schema Prisma, para buscas que incluam o histórico. O índice parcial fica explicitamente no SQL, seguindo a convenção existente de `BrandAsset_one_active_per_identity_type_key`. Nenhuma preview feature ou dependência nova é necessária. Futuras migrations/introspecções devem preservar esse índice SQL; não usar `db push` como substituto.
- No adapter, trocar o `findUnique` pela chave antiga por `findFirst` com filtro `status != BLOCKED`. A unicidade parcial garante no máximo um resultado. Antes de aplicar a migration, a unicidade antiga continua sendo uma proteção mais restritiva.
- A consulta por identidade do provedor continua sem filtro de status. O writer rejeita dono de outro clube, identidade externa BLOCKED/REVIEW_REQUIRED e inconsistência entre a identidade local e a externa. Ele não desbloqueia histórico.
- O reader permanece inalterado: consulta exclusivamente identidades VERIFIED. O escudo antigo também continua inelegível por `REVOKED`/`DISPLAY_BLOCKED` no pipeline. Ausência de identidade nova produz fallback, nunca uma busca alternativa no histórico BLOCKED. Quando houver identidade nova, só ela pode ser não bloqueada para esse clube/provedor. Reativar 4396 enquanto 104 estiver vigente violaria o índice parcial; mesmo sem 104, o writer recusa 4396 bloqueado e sua allowlist o exclui.

A migration `20260923170000_brand_identity_blocked_history` foi validada no PostgreSQL descartável e depois aplicada **somente ao banco independente futscout-staging**, no bootstrap descrito abaixo. Não foi aplicada à Production nesta operação. Em transação explícita, obtém lock que impede gravações concorrentes no Registry de identidades, cria os índices substitutos e só então remove o índice local antigo. `lock_timeout=5s` e `statement_timeout=30s`: em falha, rollback integral do DDL. O SQL da migration não contém INSERT, UPDATE ou DELETE. Seu comentário original `PREPARED ONLY` registra a fase de preparação; o arquivo aplicado foi preservado integralmente para manter o checksum do histórico Prisma.

## Concorrência e recuperação

O writer mantém `Serializable`, comparação do estado esperado, inserção de identidade+asset na mesma transação e leitura de confirmação. Dois escritores concorrentes para a mesma chave local ou mesmo ID externo são arbitrados pelos índices únicos; violações/serialização causam conflito e rollback, sem retry automático. A transação nunca altera a identidade histórica ao criar a nova. Se a criação do asset falhar após inserir sua identidade, ambos os novos registros sofrem rollback; 4396 e seu escudo ficam intactos.

Após commit confirmado, uma eventual compensação deve bloquear a **nova** identidade e revogar/bloquear o **novo** asset com versões/estado esperados e decisão auditável. Preservar ambas as identidades, seus assets e o Club.apiFootballId=104; não restaurar 4396. Não reutilizar automaticamente o script de reversão da correção anterior, cujo escopo é outro. Commit indeterminado exige reconciliação de leitura, nunca repetição ou compensação automática. O writer genérico confirma o asset dentro da transação e faz auditoria de contagens após commit; um runner futuro deve acrescentar leitura independente por IDs e comparação dos hashes de todos os registros preexistentes, inclusive 4396.

Reverter o **schema** para a unicidade antiga só é possível sem perda enquanto não houver duas identidades para uma mesma chave local. Antes disso, uma migration compensatória revisada pode recriar o índice antigo antes de remover o parcial, também em transação. Depois de cadastrar 104 junto de 4396, até duas identidades BLOCKED violam a regra antiga: manter o schema novo e compensar operacionalmente. Nunca apagar histórico para viabilizar rollback de schema; não voltar ao adapter antigo que pressupõe a chave local única absoluta.

## Impacto e testes locais

Contagens reais da auditoria anterior, **não reconfirmadas nesta etapa**: **574 escudos de clubes no total**, sendo 573 ligados a identidades VERIFIED e autorizados operacionalmente, e 1 (Red Star 4396) ligado a identidade BLOCKED com decisão REVOKED; mais 11 logos de ligas VERIFIED. Portanto são 573 outros escudos, não 574 além do Red Star. A migration foi projetada para preservar esses registros, hashes, versões, URLs, direitos e políticas; a comparação no banco real permanece obrigatória antes/depois da aplicação autorizada. O bloqueio de escrita é restrito à construção dos índices de identidade; as leituras públicas continuam possíveis. A regra vale para clubes e ligas, sem alterar seus dados.

Os testes locais cobrem preservação de histórico bloqueado ao criar outra identidade, recusa de reativação do mesmo ID externo, reserva de REVIEW_REQUIRED, rollback após falha no asset, erros de unicidade/serialização sem retry, consultas do adapter e reader, e regressão de criação/idempotência para todos os 573 clubes ainda autorizados. Usam fixtures autorizadas já existentes como análogo; não introduzem 104 na allowlist nem publicam imagens. Além dos testes estruturais, concorrência e DDL foram validados no PostgreSQL descartável descrito abaixo.

## Resultado auditável do PostgreSQL descartável — 23/09/2026

Resultado: **PASS, 14 verificações**. PostgreSQL 18.4 nativo em `127.0.0.1:55439`, usuário `disposable_owner`, base final `brand_history_disposable_3`, diretório `C:\Users\Antonio\AppData\Local\Temp\futscout-pg-disposable-20260923\data`. A conexão foi explícita, sem dotenv, DATABASE_URL ou DIRECT_URL do projeto; usuário, endereço, porta e diretório do servidor foram verificados antes de criar a base. O servidor foi encerrado com sucesso após os testes.

Toda a população era **sintética**, sem cópia da base real. O ID local do Red Star, EA 111273 e os IDs externos 4396/104 foram usados como identificadores de cenário; nomes, ligas, jogadores e URLs eram fixtures. As URLs `example.invalid` não foram baixadas, e os assets de teste permaneceram DISPLAY_BLOCKED. Os cadastros de cenário exercitaram SQL e o adapter transacional; não autorizaram 104 no writer público nem na allowlist.

| Verificação no banco descartável | Resultado |
| --- | --- |
| Índice antigo e coexistência BLOCKED 4396 + VERIFIED 104 | Antes da migration: rejeição 23505; depois: coexistência aceita |
| Dois IDs VERIFIED ou VERIFIED + REVIEW_REQUIRED na mesma chave local | Rejeição 23505 pelo índice parcial |
| Mesmo ID externo em clubes distintos, inclusive 4396 BLOCKED | Rejeição 23505 pela unicidade externa preservada |
| Reativar 4396 enquanto 104 ocupa a chave local | Rejeição 23505 |
| Duas conexões Serializable concorrentes | Segunda conexão aguardou lock; um vencedor, outro rejeitado com 23505; sem retry |
| Reader real com cliente substituído pelo banco descartável | Selecionou 104, ignorou 4396; entrega de imagem continuou bloqueada |
| Falha real no asset depois de inserir a identidade pelo adapter Prisma | Trigger retornou P0001 / BRAND_ASSET_TYPE_MISMATCH; rollback da identidade nova e histórico íntegro |
| Falha injetada no DDL e timeout de lock | P0001 e 55P03; rollback integral dos índices |
| Catálogo antes/depois do SQL exato da migration | Somente remoção do índice local único antigo e criação do índice parcial e do índice local comum; demais índices, constraints e triggers idênticos |

Os hashes abaixo são SHA-256 das linhas sintéticas ordenadas por ID, serializadas pelo script. **Não são hashes esperados do FutScout** e não podem substituir o preflight real. Em cada tabela, `beforeMigration = afterMigration = finalProtected`, incluindo o histórico 4396, suas versões e os vínculos dos 25 jogadores sintéticos.

| Tabela sintética protegida | Contagem | SHA-256 idêntico antes/depois |
| --- | ---: | --- |
| Club | 575 | `6f8e05903f95c8d82ea6a9aad5cba9d2d53174da5bc2bbe2b22002a395043def` |
| League | 12 | `36b10f02c6c1a0033fdb02c91d15ef651b9ba21f5d55e37a059048297158973b` |
| Player | 25 | `0b9d77f78afc15e9409f84e18020a1b71ebaeaca8ca357ec2e691fcacc3d4988` |
| BrandAssetIdentity | 585 | `993b9c7fafae2f6963789f61603c9559922f75229b51b2dd8175bae2ffc825c8` |
| BrandAsset | 585 | `20e43ca3d9d701153c503637844d4e7079fc58f383035d0868c0976f1fba5b04` |

Após os cenários de cadastro, os totais sintéticos de identidades e assets chegaram a 587 por tabela: um par para 104 e outro para o vencedor concorrente. Os 585 registros preexistentes de cada tabela permaneceram idênticos. A migration isoladamente não alterou contagem ou hash algum.

Evidências temporárias no computador da auditoria (não versionadas): `C:\Users\Antonio\AppData\Local\Temp\futscout-pg-disposable-20260923\audit.cjs`, `report.json` e `postgres.log`. O relatório final registra PASS, os catálogos completos e os hashes; versões preliminares do script exigiram apenas correções no formato do endereço loopback e no escape da falha SQL simulada, sem mudança na migration. Comandos usados: `initdb`, `pg_ctl` com diretório/porta exclusivos, `node --import tsx <diretório>\audit.cjs` e `pg_ctl -D <diretório>\data -m fast -w stop`. Nenhum teste descartável deve ser apontado para o banco real.

## Histórico: tentativa de preflight do FutScout — 23/09/2026

Resultado daquela tentativa: **STOP_DESTINATION_UNVERIFIED / NOT_APPLIED**. A autorização daquela etapa limitava a migration ao banco local do FutScout e exigia parar se o destino fosse incerto. A inspeção local da configuração, sem conexão ao banco e sem exibir URLs ou credenciais, encontrou:

- `prisma.config.ts` usa DIRECT_URL para operações administrativas.
- DATABASE_URL aponta para o endpoint pooled do runtime.
- Ambos os endpoints são remotos. Esses metadados não identificam o projeto/ambiente nem comprovam separação da Production; executar a aplicação no localhost não torna seu banco local.

A operação parou nesse controle, antes de qualquer consulta SQL ou migration. Índices, constraints, duplicidades, contagens/hashes reais e leitura do Registry **não foram reconfirmados nesta etapa**. Nada foi alterado no banco ou no histórico Prisma. Não foram executados `migrate deploy`, `migrate dev`, reset ou cadastro de asset. Para prosseguir, é necessário identificar inequivocamente o destino autorizado e sua separação da Production; depois refazer integralmente o preflight abaixo. A aplicação pelo fluxo Prisma deve ocorrer apenas se a única migration pendente for a revisada.

Validação local desta revisão: `npx prisma validate`, `npx tsc --noEmit`, `npm run lint` e `git diff --check` concluídos com sucesso. Os cinco arquivos de testes pertinentes (`brandAssetWrite`, `brandIdentityHistory`, `brandAssetMigration`, `assetPipeline` e `brandAssetPresentation`) foram executados com `node --import tsx --test`: **55 testes passaram, zero falhas**. Nenhum consumidor do antigo seletor Prisma `entityType_entityId_provider` foi encontrado em services/lib/app. Os sete arquivos pendentes foram revisados; nesta etapa apenas este documento foi atualizado, sem alterações funcionais adicionais, allowlist, commit, push ou deploy.

## Bootstrap concluído em futscout-staging — 23/09/2026

O proprietário autorizou separadamente a criação e o bootstrap de um banco vazio independente. O Prisma Console confirmou os endpoints direct e pooled da configuração isolada contra o **database ID `jj51gk17l30qv1uibsj3g46u`**, nome `futscout-staging`, região `us-east-1`, projeto `m0f43nhdf2ylv4i1nvo6pwsj`, workspace `zgid79r99qbyucdg5d9dvhqi`. Esse ID difere do database ID de Production **`rknsog8tmbl5u4xqbogxfux5`**. A confirmação foi por identidade oficial do banco, não por hostname ou nome de variável.

O processo utilizou exclusivamente a configuração de `.env.futscout-staging`, com configuração Prisma temporária explícita, ambiente de processo isolado e guarda contra carregamento de `.env`, `prisma.config.ts` do projeto ou `dotenv/config`. O `.env` original e a Vercel foram preservados. Nenhuma conexão ou credencial integra este documento.

Preflight: schema validado; schema público vazio, sem tabelas; todas as migrations revisadas na ordem abaixo, sem dependência de linhas preexistentes ou backfill. `prisma migrate status` confirmou as 20 migrations pendentes. `prisma migrate deploy` foi executado uma única vez em staging, sem retry, reset, `db push`, seed ou cópia de dados.

As **20 migrations foram concluídas**, nesta ordem:

1. `20260824162442_init_core`
2. `20260824172031_add_player_attributes`
3. `20260824173125_add_playstyles`
4. `20260825223645_add_sync_state`
5. `20260825231836_add_sync_error`
6. `20260828155048_add_player_profile_data`
7. `20260829214241_add_real_life_player_data`
8. `20260831140509_add_api_football_club_id`
9. `20260831152310_add_api_football_match_attempt`
10. `20260831160053_add_api_football_team_roster_cache`
11. `20260911000000_add_official_lineup_snapshots`
12. `20260916000000_transfer_observations_current_club`
13. `20260917000000_current_club_model_v2`
14. `20260918000000_brand_asset_registry`
15. `20260919000000_ea_catalog_provenance`
16. `20260919120000_add_goalkeeper_attributes`
17. `20260921180000_brand_asset_operational_decision`
18. `20260921220000_brand_asset_risk_acceptance`
19. `20260922120000_brand_asset_display_policy`
20. `20260923170000_brand_identity_blocked_history`

Confirmação independente após aplicação:

| Verificação em staging | Resultado |
| --- | --- |
| `_prisma_migrations` | 20 registros concluídos, checksums iguais aos arquivos, nenhuma reversão registrada; última conclusão em `2026-09-23T18:07:38.577Z` |
| `prisma migrate status` | Banco atualizado, sem migrations pendentes |
| Catálogo PostgreSQL | 24 tabelas: 23 de domínio e o histórico Prisma; 115 índices, 64 constraints validadas e 4 triggers |
| Conteúdo | Todas as 23 tabelas de domínio vazias; somente o histórico contém as 20 linhas de migrations |
| Unicidade local | Índice parcial `BrandAssetIdentity_one_nonblocked_local_provider_key`, predicado `status <> 'BLOCKED'`, presente; índice único local antigo ausente; índice local comum presente |
| Proteções preservadas | Unicidade externa `BrandAssetIdentity_entityType_provider_providerEntityId_key` e índice parcial `BrandAsset_one_active_per_identity_type_key` presentes |
| Leitura direct e pooled | Snapshots somente leitura com contagens e índices equivalentes |
| Cliente Prisma e catálogo da aplicação | Cliente gerado; `findMany` limitado a uma linha em cada um dos 23 models, em transação somente leitura: sucesso, zero linhas em todos |

Esses resultados comprovam o schema e a leitura do **staging vazio**, não a preservação de dados reais em Production. Os cenários com 4396/104 e jogadores pertencem exclusivamente ao teste sintético descartável anterior. Nenhuma identidade, escudo 104, logo ou dado real foi cadastrado no bootstrap. A allowlist permanece sem 4396 e sem 104 para o Red Star.

Evidências locais não versionadas: `C:\Users\Antonio\AppData\Local\Temp\futscout-staging-bootstrap\preflight.json`, `before.json`, `after.json`, `deployed.json`, `deploy-migrate-deploy.txt` e `verify-migrate-status.txt`. O recibo foi emitido em `2026-09-23T18:07:39.039Z`. Os sete arquivos da mudança foram preservados durante o bootstrap. A revisão para commit atualiza somente este documento com essas evidências; não reaplica migrations nem acessa Production.

## Revisão para commit — 23/09/2026

Os sete arquivos foram revisados com escopo restrito à preservação de identidades bloqueadas: schema, migration, writer, adapter, dois arquivos de testes e este documento. A allowlist e o reader não foram alterados. Nesta revisão, os cinco arquivos de testes pertinentes foram executados com `node --import tsx --test`: **55 testes passaram, zero falhas**. `npx tsc --noEmit`, `npm run lint` e `git diff --check` passaram. Os resultados de staging foram recuperados dos artefatos do bootstrap, sem novas operações no banco. Não houve push, deploy ou aplicação em Production.

## Validação obrigatória antes de aplicar em banco populado

1. Obter autorização específica para o destino e identificá-lo inequivocamente; o bootstrap de staging não autoriza alteração em Production. Confirmar que somente a migration revisada está pendente, inclusive pelo histórico `_prisma_migrations` e `prisma migrate status`. Se os controles passarem, usar `prisma migrate deploy` com configuração explicitamente isolada para o destino autorizado; não usar reset, `migrate dev`, `db push` ou SQL avulso para contornar o histórico. Não executar nenhum comando de aplicação enquanto o destino estiver incerto. O bootstrap vazio de staging acima foi uma operação distinta, autorizada para todas as 20 migrations existentes, e não deve ser repetido.
2. Em leitura, confirmar índices e constraints reais, unicidade por provedor, ausência de múltiplas identidades não bloqueadas por chave local e contagens/hashes de Club, League, Player, BrandAssetIdentity e BrandAsset. Guardar snapshot dos registros 4396: identidade BLOCKED v2 e asset REVOKED/DISPLAY_BLOCKED v2.
3. Testar o SQL em PostgreSQL descartável: 4396 BLOCKED + 104 VERIFIED aceitos; dois VERIFIED, VERIFIED + REVIEW_REQUIRED, mesmo ID externo em outro clube e reativação de 4396 com 104 vigente rejeitados; falha/timeout reverte integralmente o DDL; duas inserções concorrentes resultam em um único vencedor. Comparar fingerprints das linhas antes/depois. Não executar esses testes no banco do localhost.
4. Validar schema, gerar o cliente local, rodar TypeScript, lint e testes; garantir ausência de consumidores do antigo seletor composto Prisma. Coordenar migration e adapter compatível; manter allowlist sem 104 durante essa fase. Após aplicação autorizada, conferir definições em `pg_indexes`, hashes idênticos, reader/fallback e os outros escudos/logos.
5. Cadastro de 104 será uma etapa separada: confirmar novamente Club.apiFootballId=104, EA 111273, mesma Ligue 2 e mesmos 25 jogadores; identidade externa 104 livre; chave local não bloqueada vazia; histórico 4396 íntegro. Reutilizar a auditoria técnica da imagem sem download automático. Obter decisão operacional específica (a correção de identidade não autorizou imagem), mantendo REVIEW_REQUIRED, storageUrl=null e revogação individual. Só então preparar allowlist e runner transacional com estado esperado, referência, confirmação independente e recibo reconciliável. A presente mudança não cadastra nem publica a imagem e não altera a logo da Ligue 2.
