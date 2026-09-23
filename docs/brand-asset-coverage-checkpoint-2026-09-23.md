# Cobertura de logos e escudos — checkpoint 23/09/2026

## Resultado efetivo

Nenhuma gravação no banco, migration, alteração de allowlist, ID de clube, .env, Vercel, push ou deploy. Branch beta-next. As 25 logos receberam registro de decisão operacional para as identidades exatas; execução continua bloqueada pelo destino.

Leitura protegida em 2026-09-23T20:16:21.558Z: **11/45 logos (24,44%) e 573/582 escudos (98,45%) exibíveis pela política do reader**. Publicação habilitada no processo de leitura. Isso não é uma certificação de identidade dos 573 escudos ou teste visual de todas as páginas: há associações incorretas abaixo. Localhost Red Star foi aberto: fallback de clube e de Ligue 2, com 25 jogadores. Não houve acréscimo de cobertura. **36/45 somente após 25 commits com confirmação independente**; nesta rodada: zero.

## Destino e bloqueio concreto

Console acessado no workspace zgid79r99qbyucdg5d9dvhqi/projeto m0f43nhdf2ylv4i1nvo6pwsj/database rknsog8tmbl5u4xqbogxfux5, branch br_vs6n9nb4bdz6kw8rasx9f66k (Production identificado pelo proprietário). Tela Connection strings lista credenciais mascaradas; modal Connect fornece uma conexão oficial desse database ID. Comparação local por hash integral e hash da dupla usuário/senha não corresponde à DATABASE_URL/DIRECT_URL do .env. Não se inferiu separação: credenciais diferentes podem pertencer ao mesmo banco. Falta vínculo oficial entre a credencial existente do .env e um database ID. Nenhum segredo foi exibido ou alterado.

Staging conhecido: jj51gk17l30qv1uibsj3g46u, distinto de Production; bootstrap histórico documentado não identifica a conexão .env. Não trocar automaticamente para staging nem copiar as entidades para contornar o bloqueio. Próximo passo mínimo: obter identificação oficial da credencial existente pelo provedor/Console ou comparar conexão já vinculada ao banco exato em canal seguro; então reconferir IDs locais, hashes, versões e autorização do ambiente antes de qualquer escrita.

## Lote das 25

SHA-256 do manifesto confirmado: b86f64b18714736d2911692c7d6f74e15e258bee598b0ef1acded0854ddeb401. Correspondência integral com as 25 linhas da decisão proposta, 25 IDs locais existentes, 25 IDs externos únicos, 25 URLs exatas e 25 hashes dos arquivos arquivados conferidos. Sem identidade local/externa ou asset conflitante no Registry atual. Nenhuma nova requisição às 25 imagens: validade dos bytes arquivados, não afirmação de imutabilidade remota futura. Todas as 25 seguem faltantes na exibição pelo mesmo bloqueio de destino; lista completa no [manifesto](league-logos-25-manifest-2026-09-23.md).

Autorização posterior: [registro específico](league-logos-25-operational-authorization-2026-09-23.md), referência owner-decision:brand-assets-25-verified-leagues-2026-09-23; REVIEW_REQUIRED, storageUrl=null, revogação individual. Manifesto JSON preservado para manter seu hash.

## Nove ligas ainda REVIEW

### LALIGA HYPERMOTION — 141

League.id: `cmt9d4pi304mtukucja4z7u2q`. REVIEW: 9585 é Real Sociedad II, Espanha, Zubieta/Donostia-San Sebastián; participa de 141/2025 e está livre no Club/Registry. Fonte oficial confirma Sanse em Zubieta. Ainda falta fechar evidência EA 110711 ↔ equipe reserva com sinal independente além de nome/competição antes de associar; apiFootballId local permanece null. Logo não auditada.

### EFL League One — 41

League.id: `cmta7vu7o02496wucuxpwquwr`. REVIEW: 22652 é Wigan Athletic/England, mas sem fundação ou estádio; 61 no elenco arquivado tem fundação 1932 e DW Stadium/Wigan. País/nome coincidem e não resolvem duplicidade do provedor. Falta evidência oficial de identidade/categoria e confirmação do provedor sobre os dois IDs. 61 livre; não substituir automaticamente. Logo não auditada.

### 3. Liga — 80

League.id: `cmtad946t03lq9gucelzi806s`. REVIEW: 9364 Hoffenheim II (Sinsheim, Dietmar-Hopp-Stadion) e 12867 Stuttgart II (Stuttgart, Robert-Schlienz-Stadion) são reservas alemãs presentes em 80/2025; fontes oficiais confirmam U23/U21 na 3. Liga. IDs livres. Faltam vínculo EA 110685/110697 documentado por sinal independente e fechamento das duas associações locais null. Logo não auditada.

### A-League — 188

League.id: `cmt9i85450055q4ucarbpij51`. REVIEW — associação incompatível: 19008 é Central Coast de Solomon-Islands; 941 é Central Coast Mariners/Australia no elenco arquivado 188/2025. EA local 111396. Candidato 941 livre; exigir proposta de correção com identidade EA/oficial, bloqueio do histórico errado e versões, sem alteração automática. Logo da liga não auditada.

### Brack Super League — 207

League.id: `cmt9cdhm202ycukuc9eatc0la`. REVIEW visual: competição 207 e 11/11 participantes confirmados, mas arquivo arquivado exibe CREDIT SUISSE enquanto a SFL identifica a temporada 2025/26 como Brack Super League. Falta versão visual correspondente ou decisão específica sobre uso da marca histórica; não presumir que autorização das 25 inclua 207.

### ISL — 323

League.id: `cmtacvytc02r59guc438hbrlo`. REVIEW temporal/provedor: 3463 East Bengal (Kolkata, 1920), 7763 Hyderabad (Hyderabad, 2019) e 7179 Punjab (Panchkula, 2005) são da Índia. Resposta 323/2025 contém East Bengal II 21137, Minerva Punjab 3466 e SC Delhi 26963. A fonte oficial confirma East Bengal/Punjab como clubes ISL; falta resolver duplicidade/reserva, identidade Punjab e mudança temporal Hyderabad/Delhi. Não trocar equipe principal por II nem inferir continuidade por nome. Logo não auditada.

### Liga Cyprus — 318

League.id: `cmt9gj2es04801sucqqr7lpq7`. REVIEW: 557 Apoel/Cyprus não traz fundação ou estádio; 2247 Apoel Nicosia aparece em 318/2025. Candidato 2247 livre. País/nome não resolvem duplicidade: falta confirmação oficial/EA 100135 e evidência do provedor sobre 557 versus 2247. Logo não auditada.

### ROSHN Saudi League — 307

League.id: `cmt99f99p005gvsuclbx5elkf`. REVIEW — associação incompatível: 8097 é Al Hilal/Libya, Benghazi, fundação 1952; 2932 é Al-Hilal Saudi FC/Saudi-Arabia no elenco 307/2025. Candidato livre; falta plano de correção EA 605 com evidência oficial, versões e revogação do asset errado. Logo não auditada.

### LPF — 128

League.id: `cmt9b3q3i00alukuc087t3u4x`. REVIEW — três conflitos: 27751 Estudiantes é de Aruba; 21371 Union é da Latvia; 790 Central Cordoba é de Rosario, fundado em 1906 (Estadio Gabino Sosa). Candidatos arquivados 450/441/1065 são argentinos; 1065 é Central Cordoba de Santiago, 1919, coerente com a história oficial do clube. Todos livres no Club/Registry. Fechar ligações EA 101083/111716/112965 e preparar correções individualizadas; não substituir por nome. Logo não auditada.

## Red Star 104 — VERIFIED técnico, não publicado

Club.id cmt9g1wkq037v1sucum6ntyxn; apiFootballId=104; EA 111273; Ligue 2 cmt9ekar7005c1suckjql1hd7; 25 jogadores. API exata: RED Star FC 93, France, 1897, Stade de Paris (Stade Bauer), Saint-Ouen; participante de 62/2025 no cache. Fonte oficial confirma local/fundação. Nenhum outro Club possui 104 e não há identidade 104 no Registry.

Imagem https://media.api-sports.io/football/teams/104.png: HTTP 200, PNG, 150×150, SHA-256 `b73f17d20d59d3bf0bb060afdd572b82f3e297a1910038657750ddfc4159f2f7`, coleta 2026-09-23T20:19:29.790Z. Inspeção visual nesta rodada: estrela vermelha central, círculo verde, texto RED STAR FC e 1897; compatível com o clube. Um download, sem retry.

Histórico preservado: identidade cmuczcaug0000dcuc8nlf6dn5 BLOCKED/v2; asset cmuczcaz60001dcucwvus8unq tem status de ciclo ACTIVE/v2, mas operationalDecision=REVOKED e displayPolicy=DISPLAY_BLOCKED. Não confundir decisão REVOKED com o campo status. Reader ignora identidade BLOCKED; fallback confirmado no localhost.

Bloqueadores: destino da conexão incerto; índice único antigo BrandAssetIdentity_entityType_entityId_provider_key ainda sem predicado parcial, impedindo coexistir 104 com 4396; decisão operacional específica do escudo 104 ainda não registrada (não estender automaticamente a autorização das 25 ligas). Não executar migration ou apagar 4396 para contornar.

## Nove escudos faltantes

| Clube | Club.id | Motivo atual |
|---|---|---|
| Bayer Leverkusen | `cmt7qsels0001ugucswpzr3dd` | externalId mock-bayer-leverkusen; identidade EA/provedor válida ausente; não associar automaticamente ao clube real. |
| Lombardia FC | `cmt987wb8005fxoucc0gdugcc` | API null; alias EA 131682 sem reconciliação oficial com clube/provedor e direitos. |
| Milano FC | `cmt998lop00ajt4ucd1plg0j2` | API null; alias EA 131681 sem reconciliação oficial com clube/provedor e direitos. |
| Real Sociedad B | `cmtaomvzv05wbtwucnpukho0o` | API null; candidato 9585 exige fechamento da identidade EA; imagem e decisão específicas ausentes. |
| TSG Hoffenheim II | `cmtar6hia00o2dcuc2062khh9` | API null; candidato 9364 exige fechamento da identidade EA; imagem e decisão específicas ausentes. |
| VfB Stuttgart II | `cmtaroykv01tsdcucom3yilwa` | API null; candidato 12867 exige fechamento da identidade EA; imagem e decisão específicas ausentes. |
| Latium | `cmt99mt09002quguc7ndm8llq` | API null; alias EA 115841 sem reconciliação oficial com clube/provedor e direitos. |
| Bergamo Calcio | `cmt99obde005vuguc7mu6u702` | API null; alias EA 115845 sem reconciliação oficial com clube/provedor e direitos. |
| Red Star FC | `cmt9g1wkq037v1sucum6ntyxn` | 104 técnico confirmado; destino, índice antigo e decisão específica impedem cadastro. |

## Escudos existentes com risco de identidade

Central Coast 19008, Al Hilal 8097, Estudiantes 27751 e Unión 21371 estão exibíveis no Registry, embora os IDs exatos retornem países incompatíveis. Central Córdoba 790 representa Rosario/1906, enquanto o candidato do elenco é Santiago/1919. Esses cinco casos exigem correção/revogação controlada individual, preservando histórico, depois de identificar o banco. Wigan 22652 e APOEL 557 continuam ambíguos; os três indianos exigem revisão temporal/duplicidade. Não declarar cobertura exibível como cobertura correta integral; nenhuma revogação foi executada em destino incerto.

## Chamadas e checkpoints

14 consultas API exatas em quatro lotes (4+4+4+2), um download do escudo 104; zero retries. Contador diário x-ratelimit-requests-remaining: 7403 na primeira resposta → 7390 na última (anterior arquivado: 7404). Cada queda observada foi 1; nenhum salto >1 nesta rodada. Contador por minuto x-ratelimit-remaining: 292–299. Chamadas locais são 14, não a diferença entre primeira e última resposta. Sete consultas de busca web em duas chamadas ao mecanismo de busca, separadas da quota API-Football. Sem 429 ou limite próximo.

Checkpoints locais (ignorados pelo Git): audit/output/coverage-20260923/batch-1.json a batch-4.json, team-ID.json, budget.json, registry.json, catalog.json, manifest-check.json e crest-104.json/png. Scripts locais somente leitura: coverage-review.cjs, coverage-read.ts e coverage-catalog.ts. As consultas ao banco destes scripts são exclusivamente withPrismaReadOnly e encerram com rollback.

## Fontes oficiais complementares

- [SFL: calendário Brack Super League 2025/26](https://sfl.ch/de/articles/sfl-setzt-die-letzten-funf-runden-der-brack-super-league-an).
- [Real Sociedad: partidas do Sanse](https://www.realsociedad.eus/es-ES/equipo/partidos/sanse).
- [VfB: U21 na 3. Liga 2025/26](https://www.vfb.de/de/vfb/aktuell/neues/junge-wilde/25-26/ansetzungen-3--liga-3---9/).
- [Hoffenheim: guia oficial 2025/26, U23](https://s3.tsg-hoffenheim.de/public/Uploads/Web_neu_13617_2025_TSG_Akademie_Guide_A4_2025_26.pdf).
- [ISL: East Bengal e Punjab no torneio de 2025](https://www.indiansuperleague.com/news/durand-cup-2025-squad-lists-from-isl-teams).
- [Central Córdoba de Santiago: fundação em 1919](https://www.cacentralcordoba.com/historia-del-club/).
- [Red Star: Bauer, Saint-Ouen e fundação em 1897](https://www.redstar.fr/bauer/).

## Validação

58 testes pertinentes passaram; `npx tsc --noEmit`, `npm run lint` e `git diff --check` passaram. Lint inicial detectou require em dois scripts locais; convertidos para imports dinâmicos, sem nova execução de consultas/downloads. O gerador documental posterior também passou no ESLint. Validação local adicional confirmou o hash original, as 25 linhas de autorização, ausência de espaços finais nos documentos e igualdade exata dos 25 IDs de jogadores do Red Star com o preflight anterior.

Arquivos pendentes no Git: os quatro documentos do manifesto/rascunho/fila já existentes, mais `docs/league-logos-25-operational-authorization-2026-09-23.md` e este relatório. O JSON original não foi alterado. Scripts e checkpoints em `audit/output/` permanecem locais, ignorados pelo Git. Nenhum commit foi solicitado ou executado nesta rodada.

## Resultado posterior — execução autorizada em Production

As 25 transações foram concluídas com confirmação independente no database ID `rknsog8tmbl5u4xqbogxfux5`, usando conexão isolada obtida no Console. Cobertura pública confirmada: **36/45**, preservando as 11 anteriores. O bloqueio/estado pendente descrito acima é histórico. Consulte [resultado por liga e recibos](league-logos-25-production-result-2026-09-23.md). Nenhuma migration foi aplicada; Red Star 104 continua fora desta operação.
