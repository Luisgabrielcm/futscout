# Fila separada — nove ligas REVIEW

Não integram o manifesto das 25. Evidência reutilizada do checkpoint consolidado; nenhuma nova consulta ao provedor nesta preparação. Divergência de participante não autoriza corrigir IDs automaticamente. Todos os resultados continuam REVIEW.

## LALIGA HYPERMOTION — candidato 141

League.id: `cmt9d4pi304mtukucja4z7u2q`. Provedor: Segunda División; Spain; League; temporada 2025. Participantes: 17/18.

Motivo preservado: Real Sociedad B cmtaomvzv05wbtwucnpukho0o tem apiFootballId=null; candidato Real Sociedad II 9585 não associado por nome; ausência de evidência, não conflito.

- Real Sociedad B: Club.id `cmtaomvzv05wbtwucnpukho0o`, EA `110711`, API-Football `null`.

Evidência necessária: Confirmar Real Sociedad B (EA 110711; local cmtaomvzv05wbtwucnpukho0o, API null) contra registro exato 9585 (Real Sociedad II), identidade oficial EA, país, natureza de reserva e participantes de 2025. Verificar ocupação de 9585 no Club e Registry. A ausência atual não comprova associação errada.

Fonte arquivada: `audit/output/leagues34-20260923/round05/consolidated.json`, linha lógica `rows[providerCandidate=141]` (participantes, ausências e metadados). Logo ainda não validada: resolver identidade primeiro; então reutilizar arquivo existente ou permitir no máximo uma requisição pontual, sem retry, com HTTP/formato/dimensões/SHA-256 e inspeção visual.

## EFL League One — candidato 41

League.id: `cmta7vu7o02496wucuxpwquwr`. Provedor: EFL League One; England; League; temporada 2025. Participantes: 23/24.

Motivo preservado: Divergencia de participante: ID local 22652 ausente, Wigan 61 listado; nao inferir substituicao por nome.

- Wigan Athletic: Club.id `cmtaiv2mt00ovq0ucxcv1hdth`, EA `1917`, API-Football `22652`.

Evidência necessária: Comparar registros exatos 22652 e 61 (Wigan) por país, fundação, estádio/cidade, equipe principal/reserva e identidade EA 1917; conferir ocupação de 61 no Club e Registry e participação em 2025. Não substituir por semelhança de nome.

Fonte arquivada: `audit/output/leagues34-20260923/round05/consolidated.json`, linha lógica `rows[providerCandidate=41]` (participantes, ausências e metadados). Logo ainda não validada: resolver identidade primeiro; então reutilizar arquivo existente ou permitir no máximo uma requisição pontual, sem retry, com HTTP/formato/dimensões/SHA-256 e inspeção visual.

## 3. Liga — candidato 80

League.id: `cmtad946t03lq9gucelzi806s`. Provedor: 3. Liga; Germany; League; temporada 2025. Participantes: 14/16.

Motivo preservado: PARTICIPANT_ID_MISSING_OR_NOT_IN_SEASON.

- TSG Hoffenheim II: Club.id `cmtar6hia00o2dcuc2062khh9`, EA `110685`, API-Football `null`.
- VfB Stuttgart II: Club.id `cmtaroykv01tsdcucom3yilwa`, EA `110697`, API-Football `null`.

Evidência necessária: Confirmar registros exatos candidatos 9364 (Hoffenheim II) e 12867 (Stuttgart II), ambos presentes na resposta arquivada, contra identidades EA 110685 e 110697, país e natureza de reserva. Verificar unicidade no Club e Registry; os dois apiFootballId locais são null.

Fonte arquivada: `audit/output/leagues34-20260923/round05/consolidated.json`, linha lógica `rows[providerCandidate=80]` (participantes, ausências e metadados). Logo ainda não validada: resolver identidade primeiro; então reutilizar arquivo existente ou permitir no máximo uma requisição pontual, sem retry, com HTTP/formato/dimensões/SHA-256 e inspeção visual.

## A-League — candidato 188

League.id: `cmt9i85450055q4ucarbpij51`. Provedor: A-League; Australia; League; temporada 2025. Participantes: 11/12.

Motivo preservado: PARTICIPANT_ID_MISSING_OR_NOT_IN_SEASON.

- Central Coast: Club.id `cmtakuew205n6q0ucfkjqrmms`, EA `111396`, API-Football `19008`.

Evidência necessária: Identificar o registro exato 19008 e confrontá-lo com a equipe principal Central Coast do endpoint de participantes 188/2025; provar equipe principal versus reserva por fonte oficial EA 111396, país, cidade/estádio e registro exato do candidato. Confirmar ocupação antes de qualquer proposta de substituição.

Fonte arquivada: `audit/output/leagues34-20260923/round05/consolidated.json`, linha lógica `rows[providerCandidate=188]` (participantes, ausências e metadados). Logo ainda não validada: resolver identidade primeiro; então reutilizar arquivo existente ou permitir no máximo uma requisição pontual, sem retry, com HTTP/formato/dimensões/SHA-256 e inspeção visual.

## Brack Super League — candidato 207

League.id: `cmt9cdhm202ycukuc9eatc0la`. Provedor: Super League; Switzerland; League; temporada 2025. Participantes: 11/11.

Motivo preservado: LOGO_SPONSOR_DIFFERS_FROM_LOCAL_BRAND.


Evidência necessária: Identidade e participantes 11/11 confirmados. O arquivo arquivado diz CREDIT SUISSE Super League, mas o nome local é Brack. Obter evidência oficial datada da versão/patrocínio adequada ao catálogo e imagem correspondente ou decisão explícita sobre uso histórico. Documentar URL, hash e inspeção da versão escolhida; autorização operacional não substitui licença.

Fonte arquivada: `audit/output/leagues34-20260923/round05/consolidated.json`, linha lógica `rows[providerCandidate=207]` (participantes, ausências e metadados). Logo arquivada: https://media.api-sports.io/football/leagues/207.png; SHA-256 `ba4176d8beb7c6dd45ec8f900dc42cf58fa54cc4fff321802185ffa7ce6884c3`; inspeção: Imagem exibe CREDIT SUISSE Super League; título local BRACK. Revisar versão visual/patrocínio, sem negar a identidade da competição.

## ISL — candidato 323

League.id: `cmtacvytc02r59guc438hbrlo`. Provedor: Indian Super League; India; League; temporada 2025. Participantes: 8/11.

Motivo preservado: PARTICIPANT_ID_MISSING_OR_NOT_IN_SEASON.

- East Bengal: Club.id `cmtanjzzq035wtwucgpaok8fr`, EA `111629`, API-Football `3463`.
- Hyderabad FC: Club.id `cmtauvmrq02wlzsuceruvv04b`, EA `113301`, API-Football `7763`.
- Punjab FC: Club.id `cmtbpdgt2009zpkuc9j70jvc8`, EA `115202`, API-Football `7179`.

Evidência necessária: Consultar somente lacunas dos registros exatos 3463 (East Bengal), 7763 (Hyderabad) e 7179 (Punjab); confrontar identidade EA, país, equipe principal/reserva, temporada 2025 e eventuais mudanças de nome/participação com fonte oficial. Não presumir que sucessão ou mudança de temporada equivale a novo ID do mesmo clube. Confirmar unicidade de cada candidato.

Fonte arquivada: `audit/output/leagues34-20260923/round05/consolidated.json`, linha lógica `rows[providerCandidate=323]` (participantes, ausências e metadados). Logo ainda não validada: resolver identidade primeiro; então reutilizar arquivo existente ou permitir no máximo uma requisição pontual, sem retry, com HTTP/formato/dimensões/SHA-256 e inspeção visual.

## Liga Cyprus — candidato 318

League.id: `cmt9gj2es04801sucqqr7lpq7`. Provedor: 1. Division; Cyprus; League; temporada 2025. Participantes: 0/1.

Motivo preservado: PARTICIPANT_ID_MISSING_OR_NOT_IN_SEASON.

- APOEL FC: Club.id `cmt9gj2j404811suc2ug3rreg`, EA `100135`, API-Football `557`.

Evidência necessária: Confirmar registro exato 557 e identidade oficial do APOEL EA 100135; confrontar participantes arquivados de 318/2025, país/cidade/estádio e candidato exato. A competição retornada é 1. Division/Cyprus; explicar ausência do único clube local nessa temporada antes de validar o conjunto. Confirmar ocupação do candidato.

Fonte arquivada: `audit/output/leagues34-20260923/round05/consolidated.json`, linha lógica `rows[providerCandidate=318]` (participantes, ausências e metadados). Logo ainda não validada: resolver identidade primeiro; então reutilizar arquivo existente ou permitir no máximo uma requisição pontual, sem retry, com HTTP/formato/dimensões/SHA-256 e inspeção visual.

## ROSHN Saudi League — candidato 307

League.id: `cmt99f99p005gvsuclbx5elkf`. Provedor: Pro League; Saudi-Arabia; League; temporada 2025. Participantes: 14/15.

Motivo preservado: PARTICIPANT_ID_MISSING_OR_NOT_IN_SEASON.

- Al Hilal: Club.id `cmt99ho3e00aivsuchz4fddri`, EA `605`, API-Football `8097`.

Evidência necessária: Confirmar o registro exato 8097 e a identidade oficial do Al Hilal EA 605, país e cidade/estádio; comparar com candidato exato do elenco de 307/2025, sem confundir homônimos de outros países. Verificar unicidade local/Registry antes de propor qualquer ID.

Fonte arquivada: `audit/output/leagues34-20260923/round05/consolidated.json`, linha lógica `rows[providerCandidate=307]` (participantes, ausências e metadados). Logo ainda não validada: resolver identidade primeiro; então reutilizar arquivo existente ou permitir no máximo uma requisição pontual, sem retry, com HTTP/formato/dimensões/SHA-256 e inspeção visual.

## LPF — candidato 128

League.id: `cmt9b3q3i00alukuc087t3u4x`. Provedor: Liga Profesional Argentina; Argentina; League; temporada 2025. Participantes: 25/28.

Motivo preservado: PARTICIPANT_ID_MISSING_OR_NOT_IN_SEASON.

- Estudiantes: Club.id `cmt9by8hf021jukucpa6u2ifp`, EA `101083`, API-Football `27751`.
- Unión: Club.id `cmta7is7w01ao6wuchv2tf1x7`, EA `111716`, API-Football `21371`.
- Central Córdoba: Club.id `cmtaby9ul00jq9gucapdbciar`, EA `112965`, API-Football `790`.

Evidência necessária: Confrontar registros exatos 27751, 21371 e 790 com candidatos arquivados 450 (Estudiantes L.P.), 441 (Union Santa Fe) e 1065 (Central Cordoba de Santiago). Confirmar EA, país, cidade/estádio e equipe principal/reserva; checar ocupação. Confirmar abrangência de Liga Profesional Argentina 128/2025 e fases, sem inferir país/tipo a partir da sigla LPF.

Fonte arquivada: `audit/output/leagues34-20260923/round05/consolidated.json`, linha lógica `rows[providerCandidate=128]` (participantes, ausências e metadados). Logo ainda não validada: resolver identidade primeiro; então reutilizar arquivo existente ou permitir no máximo uma requisição pontual, sem retry, com HTTP/formato/dimensões/SHA-256 e inspeção visual.

## Critério de encerramento

Evidência exata deve ligar EA, clube local, registro do provedor, país/natureza e participação temporal. Nomes servem apenas para localizar candidatos. Resolver lacunas por leitura, registrar fontes e resultados e manter REVIEW enquanto houver ambiguidade. Separar eventual correção de clube (autorização e transação próprias) da decisão da logo. Revalidar Registry e unicidade antes de qualquer futura escrita. Preservar cache, não repetir consultas já documentadas e parar em HTTP 429, falha operacional ou perda da proteção de leitura.

## Atualização da investigação — 23/09/2026

As nove continuam REVIEW, agora com registros exatos adicionais, ocupação de candidatos conferida e fontes oficiais. Ver [checkpoint detalhado](brand-asset-coverage-checkpoint-2026-09-23.md). Os resultados novos distinguem país incompatível, duplicidade do provedor, lacuna EA, temporada e versão visual; nenhum ID foi alterado.

## Novas lacunas consultadas após o cadastro das 25

Wigan 22652 retornou FA Women’s Cup 698/2023; Punjab 7179 retornou Santosh Trophy 325/2025; East Bengal 3463 retornou AIFF Super Cup 545 e Calcutta Premier Division 1020/2025; APOEL 557 retornou nenhuma competição. As nove ligas permanecem REVIEW; nenhuma associação de clube ou escudo foi feita. Fontes exatas, checkpoints e interpretação no [relatório da operação](league-logos-25-production-result-2026-09-23.md).
