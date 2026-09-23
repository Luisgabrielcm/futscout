# Reconciliação das 34 ligas — 23/09/2026

## Resultado final da retomada das 16 — contadores separados

**34 decisões consolidadas: 25 VERIFIED, 9 REVIEW, 0 não avaliadas.** Nesta retomada, 13 das 16 foram verificadas e 3 ficaram em revisão por participantes. As seis revisões anteriores e os 12 resultados VERIFIED anteriores foram preservados integralmente, verificados por igualdade dos objetos com o checkpoint anterior. Nenhum ID foi corrigido e nenhuma logo foi cadastrada.

### Auditoria do contador e possível uso concorrente

O salto **7451 → 7441** veio de `x-ratelimit-requests-remaining`, salvo pelo runner anterior em `remaining`, entre `teams-265-2025.json` (19:11:15.354Z) e `league-318.json` (19:12:06.045Z), em 23/09/2026. É o contador **diário**, não o contador por minuto. A documentação oficial distingue `x-ratelimit-requests-limit/remaining` (diário) de `X-RateLimit-Limit/Remaining` (por minuto): [API-Football — How ratelimit works](https://www.api-football.com/news/post/how-ratelimit-works). Os nomes dos headers não diferenciam maiúsculas/minúsculas.

A rodada anterior fez exatamente **32 chamadas API + 12 GETs de imagens** pelo ledger local. O contador por minuto anterior **não foi arquivado** e não pode ser reconstruído pelo diário. A diferença de dez na quota diária não foi atribuída à única chamada corrente; foi reclassificada como **possível uso concorrente ou comportamento do contador compartilhado**, sem comprovar a causa.

Na inspeção atual de processos Node, não foi observado sincronizador API-Football ativo. O next dev PID 2252 e seus processos 29492/14188 foram iniciados em 22/09/2026, portanto já existiam antes da auditoria. Isso não demonstra que estivessem fazendo chamadas à API. O runtime público consultado não referencia os sincronizadores examinados; o log `.next/dev/logs/next-development.log`, cuja última escrita é 23/09/2026 15:57:38.451Z, não comprova chamadas no intervalo 19:08–19:12Z. As duas menções à API no log não eram mensagens de carregamento de elenco.

Os scripts de integração e o auditor podem usar a mesma variável API_FOOTBALL_KEY; não foi presumida igualdade do valor em memória de processos já iniciados. Não há histórico completo de processos encerrados nem telemetria de requisição por chave disponível nesta inspeção. **Uso concorrente por outro processo FutScout não foi comprovado nem descartado.** Nenhum processo foi encerrado e nenhuma chave, argumento sensível ou variável foi exibida.

### Chamadas desta retomada e limites

| Medida | Resultado |
| --- | --- |
| Chamadas novas API-Football autenticadas pelo auditor | **30** |
| GETs novos de imagens, sem chave | **13** |
| Total de novas requisições do auditor à API/CDN | **43** |
| Respostas reutilizadas sem requisição | **2**: metadados 419 e 318 |
| Quota diária observada | limite 7500; primeira resposta 7433, última 7404 |
| Quota por minuto observada | limite 300; restantes entre 292 e 299 |
| Limites locais | até 8 chamadas API e 4 imagens por lote; até 30 chamadas API e 16 imagens nesta retomada |
| Parada por quota próxima | diário ≤100 ou por minuto ≤10; ou qualquer 429 |
| Falha operacional ou teto excedido | parada imediata, sem retry automático |

Lotes: 1 = 6 API + 3 imagens + 2 caches; 2 = 8 API + 3 imagens; 3 = 8 API + 4 imagens; 4 = 8 API + 3 imagens. Todos foram concluídos dentro do teto. Cada intenção, resposta, ordinal local, quatro headers de quota, hash e checkpoint foi arquivado. Não houve 429, quota próxima do limite, falha operacional ou chamada repetida. Imagens são contabilizadas à parte e não recebem a chave.

Na primeira chamada nova, o diário passou do último valor histórico 7441 para 7433. Registrou-se possível uso concorrente nesse intervalo; o auditor contabilizou **uma**, não oito chamadas. Entre a primeira e a última resposta desta retomada houve queda 7433→7404, compatível com as 29 chamadas seguintes. Isso não permite atribuir retrospectivamente qualquer outra utilização.

### Grupo 1 — identidade e logo tecnicamente verificadas

| Liga | League.id | Provedor | País ou abrangência / tipo / divisão | Participantes locais / temporada |
| --- | --- | --- | --- | --- |
| Ligue 2 BKT | `cmt9ekar7005c1suckjql1hd7` | 62 | France / League / 2 | 16/16; season=2025 |
| EFL League Two | `cmtaeiyxf06iv9gucrl6c0tgf` | 42 | England / League / 4 | 22/22; season=2025 |
| 1A Pro League | `cmt9bm48f01cyukuceuen03tr` | 144 | Belgium / League / 1 | 15/15; season=2025 |
| 3F Superliga | `cmt9ctsxc03xvukucfasxm83t` | 119 | Denmark / League / 1 | 10/10; season=2025 |
| Allsvenskan | `cmt9fu0ae02rd1sucnoizd50d` | 113 | Sweden / League / 1 | 13/13; season=2025 |
| Česká Liga | `cmt9c5bdm02gkukucb8hsabf1` | 345 | Czech-Republic / League / 1 | 3/3; season=2025 |
| CSL | `cmt9f016a011q1suczc7j6xy8` | 169 | China / League / 1 | 16/16; season=2025 |
| Eliteserien | `cmt9coo6003nbukuc6lkgnwmb` | 103 | Norway / League / 1 | 13/13; season=2025 |
| Finnliiga | `cmtacixca01ve9gucjr6aozya` | 244 | Finland / League / 1 | 1/1; season=2025 |
| Hellas Liga | `cmt9blzhv01clukucvic0ft70` | 197 | Greece / League / 1 | 4/4; season=2025 |
| K League 1 | `cmt9eyo4u00y41suczayaz18g` | 292 | South-Korea / League / 1 | 10/10; season=2025 |
| Liga Azerbaijan | `cmtaask4c006bgguc2j5lxa3m` | 419 | Azerbaijan / League / 1 | 1/1; season=2025 |
| Liga Chile | `cmt9gmvaa04g41suc5iyzcop4` | 265 | Chile / League / 1 | 1/1; season=2025 |
| Liga Hrvatska | `cmt9bga6b00zkukucbiqk0hj7` | 210 | Croatia / League / 1 | 2/2; season=2025 |
| Magyar Liga | `cmt9cgwsv0362ukuc54mlun2o` | 271 | Hungary / League / 1 | 1/1; season=2025 |
| Ö. Bundesliga | `cmt9f4vwv01c91suc25b5ctd1` | 218 | Austria / League / 1 | 12/12; season=2025 |
| PKO BP Ekstraklasa | `cmt9fwhb402wv1suchlrareu6` | 106 | Poland / League / 1 | 15/15; season=2025 |
| Scottish Prem | `cmt9bqcur01lrukucj5mdg07t` | 179 | Scotland / League / 1 | 12/12; season=2025 |
| SSE Airtricity PD | `cmtakrz8k05hlq0ucue6rdb9a` | 357 | Ireland / League / 1 | 10/10; season=2025 |
| Trendyol Süper Lig | `cmt99979i00brt4uc8h2cv0d2` | 203 | Turkey / League / 1 | 15/15; season=2025 |
| Ukrayina Liha | `cmt9c5mh102hfukucxmmcjf8z` | 333 | Ukraine / League / 1 | 2/2; season=2025 |
| United Emirates League | `cmt9bx8dt01yvukuc00bxtnka` | 301 | United-Arab-Emirates / League / 1 | 1/1; season=2025 |
| SUPERLIGA | `cmt9gcakd03tm1sucmbno6tuo` | 283 | Romania / League / 1 | 13/13; season=2025 |
| Libertadores | `cmt9c3i3502dgukuc28vz7prp` | 13 | CONMEBOL / América do Sul, clubes de múltiplos países; country=World é classificação do provedor, não um país / Cup / não se aplica (copa continental) | 18/18; season=2025 |
| Sudamericana | `cmtdae90p04wlogucj7s3c2in` | 11 | CONMEBOL / América do Sul, clubes de múltiplos países; country=World é classificação do provedor, não um país / Cup / não se aplica (copa continental) | 18/18; season=2025 |

O campo season=2025 é o ano exato consultado; datas start/end e temporadas atuais estão nos JSONs. A certificação refere-se à competição e à composição histórica do catálogo, não à presença dos mesmos clubes em 2026/27. Divisão é a competição reconciliada, não um campo numérico devolvido pela API. O Registry não apresentou identidade/asset conflitante para os candidatos avaliados. Country=World para as copas é categoria do provedor; as competições são continentais CONMEBOL, não ligas nacionais. Seus 18 clubes locais coincidiram por ID exato em cada caso.

### Grupo 2 — revisão, sem associação por nome

| Liga | League.id | Candidato | Motivo específico |
| --- | --- | --- | --- |
| LALIGA HYPERMOTION | `cmt9d4pi304mtukucja4z7u2q` | 141 | Real Sociedad B cmtaomvzv05wbtwucnpukho0o tem apiFootballId=null; candidato Real Sociedad II 9585 não associado por nome; ausência de evidência, não conflito |
| EFL League One | `cmta7vu7o02496wucuxpwquwr` | 41 | Wigan Athletic local 22652 ausente; participante 61 presente. Resultado anterior preservado, sem substituição automática. |
| 3. Liga | `cmtad946t03lq9gucelzi806s` | 80 | TSG Hoffenheim II: ID ausente; VfB Stuttgart II: ID ausente |
| A-League | `cmt9i85450055q4ucarbpij51` | 188 | Central Coast: 19008 |
| Brack Super League | `cmt9cdhm202ycukuc9eatc0la` | 207 | Identidade 11/11, mas logo contém Credit Suisse e o nome local contém Brack; revisão visual anterior preservada. |
| ISL | `cmtacvytc02r59guc438hbrlo` | 323 | East Bengal: 3463; Hyderabad FC: 7763; Punjab FC: 7179 |
| Liga Cyprus | `cmt9gj2es04801sucqqr7lpq7` | 318 | APOEL FC: 557 |
| ROSHN Saudi League | `cmt99f99p005gvsuclbx5elkf` | 307 | Al Hilal: 8097 |
| LPF | `cmt9b3q3i00alukuc087t3u4x` | 128 | Estudiantes: 27751; Unión: 21371; Central Córdoba: 790 |

As três novas revisões são Cyprus (APOEL 557 ausente), ROSHN Saudi League (Al Hilal 8097 ausente) e LPF (Estudiantes 27751, Unión 21371 e Central Córdoba 790 ausentes). LPF foi consultada como ID 128: o provedor confirmou Argentina / League, com 25/28 participantes locais encontrados. Não foi inferida a Argentina apenas pelo nome LPF. SUPERLIGA foi confirmada pelo ID 283: Romania / League e 13/13 participantes; não foi presumida equivalência com outra Superliga.

### Grupo 3 — não avaliadas

**Nenhuma.** Revisão por identidade ou logo não foi convertida em falha operacional. As seis revisões anteriores permaneceram na fila separada; não houve novas consultas para tentar resolvê-las.

### Logos inspecionadas nesta retomada

Todos os arquivos abaixo: um GET HTTP 200, MIME image/png, assinatura PNG, dimensões e SHA-256 dos bytes originais; inspeção visual local. URLs exatas seguem `https://media.api-sports.io/football/leagues/ID.png` e estão nos JSONs. Direitos continuam separados da verificação técnica: nenhuma licença, autorização de publicação ou atualização de rightsStatus foi inferida. Branding servido pode ser histórico e não certifica patrocinador vigente. A revisão visual anterior da Brack Super League foi preservada, sem promoção automática.

| ID | Dimensões | SHA-256 | Inspeção |
| --- | --- | --- | --- |
| 106 | 150 × 150 | `1868f09416b6b480ae2dcede4a9b3423921aeb40c2a59a853d810fb21458b787` | Ekstraklasa, símbolo azul/cinza e texto |
| 11 | 189 × 150 | `db2862a3ac724b607cffd43fa032108b4ff36e2d742d334c4057778d8f5d3d0e` | Troféu prateado da CONMEBOL Sudamericana |
| 13 | 192 × 150 | `f5386009ae51e26e8f065d21a417cad3cce9f43a825a8c559d049db6c3d36e6d` | Troféu dourado da CONMEBOL Libertadores |
| 179 | 243 × 150 | `f074d64381a26d9504d2c88285f9f6cc6e9d268d6cbca6de854d6ba28a2ec485` | Leão e CINCH PREMIERSHIP; branding servido pela API, sem certificação do patrocinador vigente |
| 203 | 378 × 150 | `7e97717c5a1d945b046f2fc5f1dcbc50d710288699b29d09593cd8599fdef900` | Símbolo estilizado vermelho/preto da Süper Lig; baixo contraste sobre fundo escuro |
| 210 | 150 × 150 | `313c6a39eab6285c1d07ec31992c4d9803fcd4eae9b31039701e4460c53bf6c8` | SuperSport HNL, símbolo SHNL |
| 218 | 113 × 150 | `4ca146edfbf86335e8917eadc3c77a41f8d776fd3fc00d600d0c12a290279e5f` | Escudo Bundesliga austríaca com bola vermelha |
| 271 | 549 × 150 | `f3c93101d0b6f04d4617d94c071903b3307f76b65486cd89f3de78e2a46deaac` | OTP Bank Liga, verde |
| 283 | 125 × 150 | `70f78cfe91df3fb44a30cf8f37b986325689c21c7241c3e9238708383c4ed2d5` | Escudo CASA LIGA 1; identidade visual histórica da primeira divisão romena servida pelo ID 283. Não certifica nome/patrocinador vigente |
| 301 | 229 × 150 | `b8d4eab8f4e61d064cdd9c48811721800b0342842bc27ba09396501d1391d599` | Símbolo vermelho/preto/verde da liga dos Emirados; baixo contraste em fundo escuro |
| 333 | 107 × 150 | `e66eaece710d1a2dbde2adc5ba8dad8b0645d5e13a2ec18f790efcd100161afb` | Українська Премʼєр-Ліга, emblema azul/amarelo |
| 357 | 342 × 150 | `b45972a4df11590bfded6ef9e0d4e792a3cb9151ccaeb86fb17544b1afb0c65b` | League of Ireland, símbolo e texto institucionais; o arquivo não escreve Premier Division, mas é o asset do endpoint exato 357 |
| 419 | 345 × 150 | `e4f3962d7a2099e84c8a4f4614cc3e6462abf07de22a653de994ab9f0759e500` | Emblema e texto AZERBAYCAN PREMYER LIQASI |

### Evidências, segurança e validação

Validação final desta retomada: **70 testes passaram**, `npx tsc --noEmit`, `npm run lint` e `git diff --check` passaram. Os quatro arquivos novos pendentes foram revisados e verificados quanto a whitespace e ausência de URLs de conexão. Os novos testes separam quota diária, quota por minuto e contagem local; a queda 7451→7441 gera aviso de possível concorrência, sem inflar a contagem do auditor ou disparar uma parada por si só. Tetos locais, quota próxima do limite e 429 mantêm controles independentes. Git permanece com os mesmos quatro arquivos pendentes, sem commit.

Artefatos: `audit/output/leagues34-20260923/round05/`, incluindo `budget.json`, `batch-1.json` a `batch-4.json`, `concurrency-investigation.json`, `consolidated.json`, intenções e respostas completas. Nenhum artefato de evidência das rodadas anteriores foi substituído. Preflight: `round05-snapshot.json`, obtido exclusivamente por `withPrismaReadOnly`, com SET/SHOW de READ ONLY e rollback. A identidade do banco continua indeterminada sob a autorização expressa de leitura; migrations, cadastros, atualizações e correções permanecem proibidos nesse destino. Não houve escrita no banco, alteração de `.env`/Vercel, commit, push ou deploy.

Checkpoint anterior preservado, SHA-256: `2bd0a22cb8348edd88019efd58e460d20ae4468afad669c71ebbc485045d88b8`.


## Histórico da rodada anterior — leitura autorizada em destino indeterminado

**12 tecnicamente verificadas, 6 em revisão, 16 não avaliadas/concluídas por parada operacional.** Nesta rodada foram acrescentadas 11 verificações. Ligue 2, LALIGA HYPERMOTION e EFL League One mantêm os resultados anteriores, reutilizados sem novas consultas ou downloads.

O proprietário autorizou explicitamente leitura no destino ainda indeterminado. Isso foi registrado no controle `round04-control.json`, sem declarar o destino conhecido ou autorizar qualquer escrita. O preflight usou o Prisma do runtime exclusivamente dentro de `withPrismaReadOnly`, com SET/SHOW de READ ONLY e rollback; retornou READ_CONFIRMED. Não houve conexão própria, migration, cadastro, atualização, correção de ID, alteração de `.env`/Vercel, push ou deploy.

Limites explícitos: lotes de até quatro ligas; no máximo duas consultas API por liga, um GET de imagem por candidata, 62 consultas API e 31 imagens nesta rodada; nenhum retry automático. Cada chamada teve arquivo de intenção antes da requisição, resposta/hash depois, resultado individual e checkpoint do lote. Duas falhas operacionais consecutivas ou HTTP 429 interrompem; divergências individuais continuam como REVIEW. O controle de consumo interrompe diante de queda de quota maior que três entre chamadas adjacentes.

Consumo observado pelo runner: **32 consultas API e 12 imagens**; quatro lotes concluídos e o quinto interrompido. Nenhum HTTP 429. Em leagues?id=318, HTTP 200, o header de quota caiu de 7451 para 7441 em uma chamada, às 2026-09-23T19:12:06.052Z. Houve aumentos anteriores no mesmo header; a sequência não é monotônica e não prova dez cobranças novas ou estouro do orçamento. O detector conservador acionou UNEXPECTED_PROVIDER_CONSUMPTION; não foi relaxado para prosseguir. Nenhuma nova chamada foi feita depois da parada.

### Grupo 1 — identidade e logo tecnicamente verificadas

| Liga | League.id | API-Football | País/abrangência · tipo · divisão | Temporada · correspondência local |
| --- | --- | --- | --- | --- |
| Ligue 2 BKT | `cmt9ekar7005c1suckjql1hd7` | 62 | France · League · 2 | 2025/26 · 16/16 |
| EFL League Two | `cmtaeiyxf06iv9gucrl6c0tgf` | 42 | England · League · 4 | 2025/26 · 22/22 |
| 1A Pro League | `cmt9bm48f01cyukuceuen03tr` | 144 | Belgium · League · 1 | 2025 · 15/15 |
| 3F Superliga | `cmt9ctsxc03xvukucfasxm83t` | 119 | Denmark · League · 1 | 2025/26 · 10/10 |
| Allsvenskan | `cmt9fu0ae02rd1sucnoizd50d` | 113 | Sweden · League · 1 | 2025 · 13/13 |
| Česká Liga | `cmt9c5bdm02gkukucb8hsabf1` | 345 | Czech-Republic · League · 1 | 2025 · 3/3 |
| CSL | `cmt9f016a011q1suczc7j6xy8` | 169 | China · League · 1 | 2025 · 16/16 |
| Eliteserien | `cmt9coo6003nbukuc6lkgnwmb` | 103 | Norway · League · 1 | 2025 · 13/13 |
| Finnliiga | `cmtacixca01ve9gucjr6aozya` | 244 | Finland · League · 1 | 2025 · 1/1 |
| Hellas Liga | `cmt9blzhv01clukucvic0ft70` | 197 | Greece · League · 1 | 2025/26 · 4/4 |
| K League 1 | `cmt9eyo4u00y41suczayaz18g` | 292 | South-Korea · League · 1 | 2025 · 10/10 |
| Liga Chile | `cmt9gmvaa04g41suc5iyzcop4` | 265 | Chile · League · 1 | 2025 · 1/1 |

O ano usado nas consultas foi season=2025, compatível com o catálogo EA observado. Ano-calendário e temporada cruzada são preservados pelos campos start/end do provedor nos JSONs. Não é certificação dos participantes atuais de 2026/27. A divisão representa a competição candidata reconciliada, não um campo numérico retornado pela API. Os jogos/campos EA não foram substituídos. Todos os IDs locais consultados estão sem identidade/asset de liga conflitante no snapshot do Registry; igualdade de League.externalId não foi usada.

### Grupo 2 — revisão, sem correções automáticas

| Liga | League.id | Candidato | Motivo específico |
| --- | --- | --- | --- |
| LALIGA HYPERMOTION | `cmt9d4pi304mtukucja4z7u2q` | 141 | Resultado anterior preservado: 17/18; Real Sociedad B sem ID. |
| EFL League One | `cmta7vu7o02496wucuxpwquwr` | 41 | Resultado anterior preservado: 23/24; Wigan 22652 versus participante 61. |
| 3. Liga | `cmtad946t03lq9gucelzi806s` | 80 | 14/16: TSG Hoffenheim II (ID ausente); VfB Stuttgart II (ID ausente) |
| A-League | `cmt9i85450055q4ucarbpij51` | 188 | 11/12: Central Coast (19008) |
| Brack Super League | `cmt9cdhm202ycukuc9eatc0la` | 207 | 11/11: Imagem exibe CREDIT SUISSE Super League; título local BRACK. Revisar versão visual/patrocínio, sem negar a identidade da competição |
| ISL | `cmtacvytc02r59guc438hbrlo` | 323 | 8/11: East Bengal (3463); Hyderabad FC (7763); Punjab FC (7179) |

A revisão da Brack Super League é visual: os 11 clubes coincidem, mas a imagem contém Credit Suisse. Não há alegação de identidade de liga incorreta. Os demais motivos são ausência/divergência dos IDs exatos dos participantes na temporada escolhida, sem concluir automaticamente qual ID seria substituto seguro. Não foram consultados endpoints extras de clubes para tentar corrigir esses registros.

### Grupo 3 — não avaliadas/concluídas por parada operacional

| Liga | League.id | Ponto de parada |
| --- | --- | --- |
| Liga Azerbaijan | `cmtaask4c006bgguc2j5lxa3m` | Metadados 419 confirmam Azerbaijan / Premyer Liqa / League; controle local usava grafia Azer​baidjan. Comparação corrigida offline, mas participantes e logo ficaram sem consulta após a parada. |
| Liga Cyprus | `cmt9gj2es04801sucqqr7lpq7` | Metadados 318 recebidos HTTP 200 e arquivados; anomalia da quota impediu completar a avaliação. |
| Liga Hrvatska | `cmt9bga6b00zkukucbiqk0hj7` | Não iniciada após a anomalia de quota. |
| Magyar Liga | `cmt9cgwsv0362ukuc54mlun2o` | Não iniciada após a anomalia de quota. |
| Ö. Bundesliga | `cmt9f4vwv01c91suc25b5ctd1` | Não iniciada após a anomalia de quota. |
| PKO BP Ekstraklasa | `cmt9fwhb402wv1suchlrareu6` | Não iniciada após a anomalia de quota. |
| ROSHN Saudi League | `cmt99f99p005gvsuclbx5elkf` | Não iniciada após a anomalia de quota. |
| Scottish Prem | `cmt9bqcur01lrukucj5mdg07t` | Não iniciada após a anomalia de quota. |
| SSE Airtricity PD | `cmtakrz8k05hlq0ucue6rdb9a` | Não iniciada após a anomalia de quota. |
| Trendyol Süper Lig | `cmt99979i00brt4uc8h2cv0d2` | Não iniciada após a anomalia de quota. |
| Ukrayina Liha | `cmt9c5mh102hfukucxmmcjf8z` | Não iniciada após a anomalia de quota. |
| United Emirates League | `cmt9bx8dt01yvukuc00bxtnka` | Não iniciada após a anomalia de quota. |
| LPF | `cmt9b3q3i00alukuc087t3u4x` | Não iniciada após a anomalia de quota. |
| SUPERLIGA | `cmt9gcakd03tm1sucmbno6tuo` | Não iniciada após a anomalia de quota. |
| Libertadores | `cmt9c3i3502dgukuc28vz7prp` | Não iniciada após a anomalia de quota. |
| Sudamericana | `cmtdae90p04wlogucj7s3c2in` | Não iniciada após a anomalia de quota. |

LPF, SUPERLIGA, Libertadores e Sudamericana estão nesse grupo. Nenhum país, alcance ou tipo League/Cup foi presumido para classificá-las. IDs do plano de consulta são somente candidatos, não associações confirmadas. Não foram solicitadas suas imagens.

### Evidência técnica e visual das imagens desta rodada

Cada imagem abaixo recebeu exatamente um GET HTTP 200, MIME image/png, assinatura PNG e inspeção visual local; SHA-256 dos bytes originais. Não houve transformação ou publicação dos assets. O escopo é a correspondência com a competição, não a certificação do patrocinador vigente: imagens servidas pela API podem usar branding histórico, explicitado quando observado. Disponibilidade técnica não é licença; direitos e autorização operacional permanecem separados e sem alteração no Registry.

| Provedor | Dimensões | SHA-256 | Inspeção visual |
| --- | --- | --- | --- |
| 42 | 128 × 150 | `71b07c52379f24fe2fad4e5fa94e665184ccf3b29a5b3a251f2bc36c47967264` | Escudo EFL, Sky Bet, LEAGUE TWO legíveis |
| 144 | 150 × 150 | `989c52997e4aaef7bd60013c73a39061e3f08bc3489b58b81509794dbfe5b144` | Emblema Jupiler Pro League e touro; corresponde à competição |
| 119 | 150 × 150 | `822825b5ad80e14114587f184e5ff9c959c6b089d24f2a4754b701c4e45761d9` | Símbolo geométrico da Superliga; arte escura/transparente com contraste baixo |
| 113 | 119 × 150 | `4a26eb08bd2d0430bdf0d8a3eb7269af26b5c3794e77a80ab17a6dab09617c4b` | ALLSVENSKAN e UNIBET legíveis |
| 207 | 150 × 150 | `ba4176d8beb7c6dd45ec8f900dc42cf58fa54cc4fff321802185ffa7ce6884c3` | Imagem exibe CREDIT SUISSE Super League; título local BRACK. Revisar versão visual/patrocínio, sem negar a identidade da competição |
| 345 | 305 × 150 | `d345ebe74f190ec506231ed93017d7bfe6f71b990dc5bd7c5273733feab39941` | HET LIGA, símbolo azul; identidade da liga tcheca. Branding servido pode ser histórico; não certifica patrocínio vigente |
| 169 | 318 × 150 | `26244b5c68f3f09c801d5858f1136377afc1c034e202af0079f40dd2708fd141` | Símbolo vermelho/amarelo CSL e letras CSL |
| 103 | 250 × 150 | `3f77dbd384f6c59b45b8661fae2bb7be2067317840449008112d7ec3b3fc438c` | ELITESERIEN, azul e leão |
| 244 | 305 × 150 | `e23b08c9291074fc7716f3d387754c1dea116c01d69d62a72c80e41fa06b3f06` | VEIKKAUSLIIGA legível e troféu |
| 197 | 150 × 150 | `21e5da7d6bbb5d581b5b1faf4941d0813a1d1443244424bc54f7af4944b470c1` | SUPER LEAGUE ELLADA, faixas azuis |
| 292 | 123 × 150 | `1dd7b7165243110490ef0348dc41b9df4a0ace368e8a3eb71036a64e2641770a` | K LEAGUE 1 legível, símbolo K vermelho/azul |
| 265 | 150 × 150 | `2bb22b636a77ae1c40c8764a01492c62e768f7e47dfa95ef454d5b24fe964717` | ANFP Campeonato Nacional Petrobras; corresponde à competição chilena. Não certifica patrocínio vigente |

URLs exatas, MIME, HTTP, timestamps, todos os participantes locais/provedor e a comparação individual constam em `round04/consolidated.json` e nos arquivos `league-ID.json`, `teams-ID-2025.json`, `logo-ID.json/png`. A logo 62 e seu hash anteriores não foram alterados.

### Retomada e arquivos auditáveis

Validação final desta rodada: **68 testes passaram**, `npx tsc --noEmit`, `npm run lint` e `git diff --check` passaram. Os quatro arquivos pendentes foram revisados e também verificados quanto a whitespace e ausência de URLs de conexão. A exceção de destino indeterminado exige autorização explícita de leitura e não ignora falha da proteção READ ONLY, HTTP 429 ou falha sistêmica. Nenhum arquivo foi commitado.

1. Inspecionar offline o histórico de quota já salvo antes de autorizar qualquer chamada nova. Não afirmar consumo extra apenas pelo salto do header e não desativar o limite silenciosamente.
2. Reutilizar metadados 318 já recebidos, e 419 após a correção local da grafia. Consultar somente lacunas quando a continuidade estiver liberada. Não baixar novamente nenhuma imagem.
3. Manter todas as revisões de participantes na fila; não usar matches por nome para substituir IDs. Continuar lotes pequenos com limite contado pelo ledger, mesmo que o header do provedor oscile.

Diretório de evidências: `audit/output/leagues34-20260923/round04/` (ignorado pelo Git), com `budget.json`, `STOP.json`, `batch-1.json` a `batch-5.json`, resultados individuais, intenções e `consolidated.json`. O relatório versionável contém as 34 classificações acima. O código do preflight permanece entre os quatro arquivos novos pendentes; o runner temporário não contém segredos nem realiza consultas SQL.

Fingerprints dos checkpoints reutilizados:

- audit/output/leagues34-20260923/batch-01-resumed.json: `10e58da51d69cccd4b48579327ce6436f2cd250e8dcf2e1a08f03b80f5df0dc3`
- audit/output/leagues34-20260923/review-queue.json: `98df1e3d369e3feee0a2ce6a0a3d0f294a60ffdd4378553d395792d8b8d2c74d`
- audit/output/leagues34-20260923/round04-snapshot.json: `8fd27c45ee8b476338d685153c7a523906efe84a1137f0962e68ae66d1036c46`


## Histórico — controle revisto, destino ainda não comprovado

**Estado: STOP_DESTINATION_UNVERIFIED.** A nova política trata divergência de participante ou falta de evidência como REVIEW_CONTINUE, sem impedir a liga seguinte. HTTP 429, falha sistêmica, destino incerto ou proteção de leitura não confirmada continuam a interromper globalmente. Os quatro arquivos novos foram revisados; a função de controle é compartilhada pelos utilitários locais de consulta e imagem, e o preflight exige um checkpoint de controle antes de qualquer consulta. Falta de checkpoint interrompe sem acessar o banco. O controle não comprova identidade por si: destinationVerified só pode ser marcado após revisão de evidência oficial de correspondência exata da configuração. Não usar hostname, nome da chave ou sufixo mascarado como prova.

O Prisma Console foi consultado em modo leitura. A página Connection strings do database ID `rknsog8tmbl5u4xqbogxfux5`, projeto `m0f43nhdf2ylv4i1nvo6pwsj`, mostra nomes e valores mascarados; não permite comprovar a igualdade da credencial atual do `.env`. Nenhuma credencial foi criada, revelada ou substituída. Falta a correspondência oficial exata entre DATABASE_URL atual e database ID. O histórico de staging comprova apenas `jj51gk17l30qv1uibsj3g46u`, não o destino desta configuração. A condição de parada expressamente solicitada pelo proprietário aplica-se antes de novos lotes.

**Nesta rodada: zero consultas ao banco ou ao provedor e zero downloads.** Nenhuma consulta da Ligue 2 foi repetida. As duas pendências anteriores estão em `review-queue.json`, e o marcador original de divergência foi preservado como histórico; ele deixou de ser motivo global de parada. O bloqueio atual é exclusivamente o destino incerto, registrado em `continuation-control.json`. `round-03-status.json` consolida as 34 ligas.

### 1. Identidade e logo tecnicamente verificadas: 1

Ligue 2 BKT — `cmt9ekar7005c1suckjql1hd7`, provedor 62. Resultado anterior reutilizado: 16/16 participantes, logo PNG 127 × 150, hash e inspeção visual abaixo. Não é nova verificação nem licença.

### 2. Revisão com motivo específico: 2

- LALIGA HYPERMOTION — `cmt9d4pi304mtukucja4z7u2q`, candidato 141: 17/18 participantes; Real Sociedad B sem apiFootballId, sem associação automática a 9585.
- EFL League One — `cmta7vu7o02496wucuxpwquwr`, candidato 41: 23/24 participantes; Wigan local 22652 ausente e candidato 61 presente; nenhum ID corrigido. Essas pendências não bloqueiam as demais ligas pela política nova.

### 3. Não avaliadas por bloqueio operacional: 31

Motivo comum: **destino incerto**, não falha de identidade nem nova falha de conexão. Dados de país, tipo, divisão, temporada, participantes e logo destas ligas não foram inferidos. LPF, SUPERLIGA, Libertadores e Sudamericana permanecem sem atribuição presumida de país ou League/Cup.

| Liga | League.id | Resultado |
| --- | --- | --- |
| EFL League Two | `cmtaeiyxf06iv9gucrl6c0tgf` | NÃO AVALIADA — STOP_DESTINATION_UNVERIFIED |
| 3. Liga | `cmtad946t03lq9gucelzi806s` | NÃO AVALIADA — STOP_DESTINATION_UNVERIFIED |
| 1A Pro League | `cmt9bm48f01cyukuceuen03tr` | NÃO AVALIADA — STOP_DESTINATION_UNVERIFIED |
| 3F Superliga | `cmt9ctsxc03xvukucfasxm83t` | NÃO AVALIADA — STOP_DESTINATION_UNVERIFIED |
| A-League | `cmt9i85450055q4ucarbpij51` | NÃO AVALIADA — STOP_DESTINATION_UNVERIFIED |
| Allsvenskan | `cmt9fu0ae02rd1sucnoizd50d` | NÃO AVALIADA — STOP_DESTINATION_UNVERIFIED |
| Brack Super League | `cmt9cdhm202ycukuc9eatc0la` | NÃO AVALIADA — STOP_DESTINATION_UNVERIFIED |
| Česká Liga | `cmt9c5bdm02gkukucb8hsabf1` | NÃO AVALIADA — STOP_DESTINATION_UNVERIFIED |
| CSL | `cmt9f016a011q1suczc7j6xy8` | NÃO AVALIADA — STOP_DESTINATION_UNVERIFIED |
| Eliteserien | `cmt9coo6003nbukuc6lkgnwmb` | NÃO AVALIADA — STOP_DESTINATION_UNVERIFIED |
| Finnliiga | `cmtacixca01ve9gucjr6aozya` | NÃO AVALIADA — STOP_DESTINATION_UNVERIFIED |
| Hellas Liga | `cmt9blzhv01clukucvic0ft70` | NÃO AVALIADA — STOP_DESTINATION_UNVERIFIED |
| ISL | `cmtacvytc02r59guc438hbrlo` | NÃO AVALIADA — STOP_DESTINATION_UNVERIFIED |
| K League 1 | `cmt9eyo4u00y41suczayaz18g` | NÃO AVALIADA — STOP_DESTINATION_UNVERIFIED |
| Liga Azerbaijan | `cmtaask4c006bgguc2j5lxa3m` | NÃO AVALIADA — STOP_DESTINATION_UNVERIFIED |
| Liga Chile | `cmt9gmvaa04g41suc5iyzcop4` | NÃO AVALIADA — STOP_DESTINATION_UNVERIFIED |
| Liga Cyprus | `cmt9gj2es04801sucqqr7lpq7` | NÃO AVALIADA — STOP_DESTINATION_UNVERIFIED |
| Liga Hrvatska | `cmt9bga6b00zkukucbiqk0hj7` | NÃO AVALIADA — STOP_DESTINATION_UNVERIFIED |
| Magyar Liga | `cmt9cgwsv0362ukuc54mlun2o` | NÃO AVALIADA — STOP_DESTINATION_UNVERIFIED |
| Ö. Bundesliga | `cmt9f4vwv01c91suc25b5ctd1` | NÃO AVALIADA — STOP_DESTINATION_UNVERIFIED |
| PKO BP Ekstraklasa | `cmt9fwhb402wv1suchlrareu6` | NÃO AVALIADA — STOP_DESTINATION_UNVERIFIED |
| ROSHN Saudi League | `cmt99f99p005gvsuclbx5elkf` | NÃO AVALIADA — STOP_DESTINATION_UNVERIFIED |
| Scottish Prem | `cmt9bqcur01lrukucj5mdg07t` | NÃO AVALIADA — STOP_DESTINATION_UNVERIFIED |
| SSE Airtricity PD | `cmtakrz8k05hlq0ucue6rdb9a` | NÃO AVALIADA — STOP_DESTINATION_UNVERIFIED |
| Trendyol Süper Lig | `cmt99979i00brt4uc8h2cv0d2` | NÃO AVALIADA — STOP_DESTINATION_UNVERIFIED |
| Ukrayina Liha | `cmt9c5mh102hfukucxmmcjf8z` | NÃO AVALIADA — STOP_DESTINATION_UNVERIFIED |
| United Emirates League | `cmt9bx8dt01yvukuc00bxtnka` | NÃO AVALIADA — STOP_DESTINATION_UNVERIFIED |
| LPF | `cmt9b3q3i00alukuc087t3u4x` | NÃO AVALIADA — STOP_DESTINATION_UNVERIFIED |
| SUPERLIGA | `cmt9gcakd03tm1sucmbno6tuo` | NÃO AVALIADA — STOP_DESTINATION_UNVERIFIED |
| Libertadores | `cmt9c3i3502dgukuc28vz7prp` | NÃO AVALIADA — STOP_DESTINATION_UNVERIFIED |
| Sudamericana | `cmtdae90p04wlogucj7s3c2in` | NÃO AVALIADA — STOP_DESTINATION_UNVERIFIED |

### Retomada mínima

Validações desta rodada: **67 testes passaram**, TypeScript, lint e `git diff --check` passaram. Um teste adicional do CLI, com configuração fictícia apontada para loopback e sem evidência de destino, retornou `STOP_DESTINATION_UNVERIFIED` antes de tentar conexão; não foi configurado banco real nesse teste. Foram revisados documento, script, serviço e testes novos. As pendências de participante não alteram IDs nem autorizam imagens.

Comprovar, por evidência do provedor, qual database ID está vinculado à configuração atual, sem registrar segredos; revisar e atualizar o checkpoint de controle com a referência dessa evidência. Só então executar preflight protegido e lotes de até quatro, reutilizando os arquivos de intenção/resposta e salvando checkpoint após cada liga. Não repetir intenção sem resposta automaticamente. A fila de Real Sociedad B/Wigan é independente. O comando do preflight agora recebe `CAMINHO_NOVO.json CAMINHO_CONTROLE.json` como argumentos; a transação reconfirma READ ONLY mesmo após o controle inicial. Não houve commit, push, deploy, migration, cadastro de asset, alteração de IDs ou variáveis.


## Histórico da rodada anterior — retomada com preflight corrigido

**1 VERIFIED, 2 REVIEW por identidade/evidência de participantes, 0 impedidas por falha operacional nesta rodada e 31 não iniciadas após parada preventiva por divergência.** As 31 não foram marcadas como incorretas nem como falha de acesso: o acesso já funcionou. Os estados das seções históricas abaixo são preservados como trilha da investigação e superados por este resultado. Nenhuma associação, asset, variável ou migration foi gravada; não houve push ou deploy.

O preflight agora está em `scripts/leagueReconciliationPreflight.ts`, com todas as consultas implementadas em `services/leagueReconciliationPreflight.ts` dentro de `withPrismaReadOnly`. Reutiliza exclusivamente o cliente de `lib/prisma.ts`; não cria conexão própria, não usa DIRECT_URL e não envia a opção de startup suspeita. O entry point antigo, ignorado pelo Git, apenas encaminha a execução ao script novo. O helper existente foi inspecionado e preservado: RepeatableRead, `SET TRANSACTION READ ONLY`, confirmação `SHOW transaction_read_only`, rollback por sentinel inclusive no sucesso; falha de rollback não é confundida com sucesso. Somente após esse fluxo é publicado um snapshot. Falhas encerram com `STOP_OPERATIONAL / NOT_EVALUATED_ACCESS_FAILURE`, sem snapshot parcial ou retry.

O snapshot `audit/output/leagues34-20260923/snapshot-resume.json` retornou `READ_CONFIRMED`. Foi usado o caminho pooled do localhost, exclusivamente em leitura protegida; esta retomada não comprova seu database ID nem presume isolamento de Production. A lista de ligas, clubes e Registry foi fotografada em uma transação; obter esse inventário não equivale a reconciliar as outras 31 competições.

| Liga | League.id | Provedor / abrangência / tipo / divisão | Temporada e participantes | Registry | Resultado |
| --- | --- | --- | --- | --- | --- |
| Ligue 2 BKT | `cmt9ekar7005c1suckjql1hd7` | 62, Ligue 2 / France / League / 2 | 2025/26: 16/16 IDs locais encontrados; endpoint retorna 19 equipes, sem alegar que sejam 19 da fase regular | Nenhuma identidade local ou externa 62 no Registry de ligas | VERIFIED |
| LALIGA HYPERMOTION | `cmt9d4pi304mtukucja4z7u2q` | Candidato 141, Segunda División / Spain / League / 2 | 2025/26: 17/18 IDs; Real Sociedad B sem apiFootballId | Nenhuma identidade local ou externa 141 | REVIEW — evidência de participante incompleta, não conflito comprovado |
| EFL League One | `cmta7vu7o02496wucuxpwquwr` | Candidato 41, League One / England, sistema com clubes galeses / League / 3 | 2025/26: 23/24 IDs; Wigan local 22652 ausente, Wigan 61 presente | Nenhuma identidade local ou externa 41 | REVIEW — divergência de participante; execução interrompida |

Os três registros exatos do provedor também oferecem temporada 2026/27 marcada como atual. A comparação foi explicitamente com 2025/26, coerente com a composição do catálogo EA e com a auditoria anterior; não é certificação dos participantes atuais de 2026/27. `League.externalId` não foi usado como ID do provedor. O país local da Ligue 2 continua `Não informado`; França é corroborada pelos dados do provedor e pelos participantes, não por preenchimento inventado.

### Ligue 2 e Red Star

Red Star local `cmt9g1wkq037v1sucum6ntyxn`: apiFootballId 104, EA 111273, mesma Ligue 2. Os IDs dos **25 jogadores** coincidem exatamente com `after.playerIds` do recibo da correção. Identidade histórica `cmuczcaug0000dcuc8nlf6dn5`: BLOCKED v2; escudo v2 REVOKED/DISPLAY_BLOCKED. Nenhuma nova identidade/escudo 104 foi criada. O participante 104 é RED Star FC 93, France, fundado em 1897, Stade Bauer, Saint-Ouen.

IDs dos 16 clubes locais encontrados: `82, 90, 93, 99, 101, 102, 104, 110, 433, 1063, 1297, 1298, 1299, 1301, 1304, 3012`. Respostas exatas arquivadas em `ligue2-id62.json` e `ligue2-teams2025.json`. Não foi localizado arquivo de imagem/hash anterior da liga nos artefatos consultados; essa lacuna foi preenchida com **um único GET**, sem retry.

Logo: `https://media.api-sports.io/football/leagues/62.png`, HTTP 200, MIME image/png, assinatura PNG, 127 × 150, SHA-256 `5439731020eece2d31640a1a4d4de45583ff84a859e6da47f89c0f07ae7b38e7`, observada em `2026-09-23T18:43:39.767Z`. Inspeção visual do arquivo local confirmou o símbolo estilizado da Ligue 2; a arte preta/transparente tem baixo contraste sobre fundo escuro. Nenhuma transformação/publicação da imagem foi realizada. Direitos permanecem separados: VERIFIED técnico não representa licença nem autorização operacional; não foi alterado rightsStatus no banco.

### Pendências e ponto exato de parada

Real Sociedad B local `cmtaomvzv05wbtwucnpukho0o`, EA 110711, tem apiFootballId null. O provedor lista Real Sociedad II 9585. A auditoria não associou esses registros apenas por nome; requer evidência própria de identidade antes de retirar a pendência.

Wigan Athletic local `cmtaiv2mt00ovq0ucxcv1hdth`, EA 1917, tem apiFootballId **22652**. Esse ID não está na resposta `teams?league=41&season=2025`; a resposta inclui **61**, Wigan, England, fundado em 1932. Isso é uma divergência de participante a investigar, não prova suficiente para substituir automaticamente o ID. Não foi consultado `teams?id=22652` após detectar a divergência, nem corrigido o clube. O checkpoint `batch-02-stopped.json` e o marcador `provider-stop.json` impedem novas requisições por esse runner até revisão explícita.

As outras **31 ligas**, inclusive EFL League Two, 3. Liga, LPF, SUPERLIGA, Libertadores e Sudamericana, permanecem NÃO INICIADAS APÓS PARADA. Seus IDs locais e a ordem proposta seguem na tabela histórica abaixo, mas a causa atual de não avaliação é a parada por divergência da League One. Nenhum país, tipo League/Cup ou ID exato foi atribuído por suposição a essas competições.

### Checkpoints, limites e testes

Nesta rodada: **6 requisições API-Football** (metadados e participantes de 62, 141 e 41) e **1 GET de imagem** (62). Todas retornaram HTTP 200; nenhum 429 ou retry. Cada requisição tem arquivo de intenção anterior à chamada e resposta/hash posterior. A existência de intenção sem resultado impede repetição automática. Não foram baixadas logos 141/41 enquanto a identidade estava em revisão. As respostas já salvas devem ser reutilizadas na retomada.

Artefatos em `audit/output/leagues34-20260923/`: `snapshot-resume.json`, `batch-01-resumed.json`, `batch-02-progress.json`, `batch-02-stopped.json`, `provider-stop.json`, respostas `ligue2-*`, `laliga2-*`, `leagueone-*` e `logo-62.{json,png}`. O checkpoint inicial e o recibo do Red Star foram preservados. Os artefatos não contêm conexão ou credencial.

Teste real separado no PostgreSQL descartável, com o mesmo `withPrismaReadOnly`: `CREATE TABLE readonly_probe_must_not_exist` foi rejeitado com Prisma P2010 / PostgreSQL **25006**, mensagem `cannot execute CREATE TABLE in a read-only transaction`; leitura posterior confirmou contagem zero da tabela. O servidor descartável foi encerrado. Duas tentativas preliminares não alcançaram esse servidor por usarem a porta antiga 55439; o log confirmou que havia iniciado em loopback:5432 e o teste então passou nessa porta. Nenhuma dessas tentativas utilizou o banco FutScout ou suas conexões.

Testes unitários cobrem execução de todas as consultas no tx protegido, modo de leitura não confirmado sem executar queries, rejeição de escrita, falhas de conexão/query/rollback, ausência de retry e ausência de classificação de identidade após falha operacional. O código não altera `withPrismaReadOnly` nem outros consumidores. Validação final: **65 testes passaram**, `npx tsc --noEmit`, `npm run lint` e `git diff --check` passaram; os quatro arquivos novos também foram verificados quanto a whitespace e ausência de URLs de conexão. Os utilitários locais ignorados pelo Git tiveram somente adequação de imports para lint e encaminhamento ao novo preflight; não são alterações do runtime público.

Comando de preflight para uma futura retomada autorizada (usar caminho novo de checkpoint, nunca sobrescrever): `node --env-file=.env --import tsx scripts/leagueReconciliationPreflight.ts CAMINHO_NOVO.json`. Antes disso, resolver a divergência de participante em etapa própria; não reexecutar automaticamente o lote interrompido.

## Historico: parada inicial e limite da auditoria

**STOP_READ_INDETERMINATE, no preflight do lote 1. 0 ligas reavaliadas e 34 classificadas como **não reavaliada por falha de acesso**; nenhum lote concluído.** Isso não comprova incorreção das 34 associações: as demais ligas não foram iniciadas após a parada. Nenhuma consulta ao provedor ou à imagem foi feita. Nenhuma escrita no banco, migration, sincronização, mudança de configuração, commit, push ou deploy foi executado.

A primeira tentativa de leitura foi bloqueada pelo sandbox (EACCES). A execução com acesso autorizado também falhou e expôs somente `name=error`, sem código diagnóstico. A causa raiz não está determinada. Não foi publicado snapshot do banco; resultados parciais não foram usados. As consultas estavam protegidas por `default_transaction_read_only=on` e `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`. Não houve nova tentativa após essa falha. Este foi o estado observado na execução original. O diagnóstico pontual posterior está registrado abaixo; não houve retomada do lote nem retry automático.

## Diagnóstico pontual da falha de acesso — 23/09/2026

Diagnóstico autorizado separadamente, iniciado em `2026-09-23T18:29:05.528Z`: reprodução somente do handshake original, sem consultas ao catálogo, seguida de **um único SELECT de diagnóstico**, pelo cliente Prisma usado pelo localhost. Não houve retry ou retomada de nenhuma liga.

| Caminho | Resultado exato |
| --- | --- |
| `pg.Client`, configuração original com startup `options: -c default_transaction_read_only=on` | Falha em `connect()`: constructor `DatabaseError`, name `error`, sem código SQLSTATE; mensagem: `Failed to connect to upstream database. Please contact Prisma support if the problem persists.` |
| `lib/prisma.ts` → `@prisma/adapter-pg`, mesma DATABASE_URL, sem opção extra de startup | Transação aberta; `SET TRANSACTION READ ONLY`; único SELECT `SELECT 1 AS ok, current_setting('transaction_read_only') AS read_only` retornou `[ { "ok": 1, "read_only": "on" } ]` |

O handshake falhou **antes de BEGIN, SHOW ou qualquer SELECT do lote**. O retorno estruturado do serviço afasta uma falha de carregamento da configuração ou simples ausência de DNS/TCP; a mensagem aponta para a conexão upstream intermediada pelo proxy/pool. A leitura Prisma bem-sucedida comprova que a configuração permite acesso pelo caminho do runtime naquele instante. Não houve erro de consulta SQL ou Prisma no teste. Não há evidência de senha inválida; a mensagem genérica não permite distinguir internamente autenticação upstream, capacidade do pool ou rejeição de parâmetro de startup. O aviso local sobre a futura semântica de SSL do pacote pg não é esse erro e não impediu a leitura Prisma.

A diferença conhecida é o parâmetro `options` acrescentado pelo script de auditoria, ausente em `lib/prisma.ts`. Ele é a principal hipótese de incompatibilidade no startup do proxy, **não uma causa interna comprovada**: os caminhos também diferem entre conexão pg avulsa e adapter/pool Prisma. Não foram feitos testes adicionais para isolar essas variáveis, respeitando o limite autorizado. O erro original havia sido reduzido a `e.code || e.name`; o diagnóstico atual reproduziu esse `name=error` e recuperou sua mensagem.

### Configuração e identidade do destino

O preflight lê `.env` com `dotenv.parse` e passa **DATABASE_URL** diretamente ao pg.Client. Não usa DIRECT_URL, `.env.futscout-staging` nem o carregador do Next. O runtime em `lib/prisma.ts` também utiliza somente `process.env.DATABASE_URL`, por `@prisma/adapter-pg`, sem fallback para DIRECT_URL. Não há `.env.local` ou `.env.development` neste checkout; o processo de diagnóstico não herdou DATABASE_URL e recebeu explicitamente o valor do `.env`. O ambiente em memória do processo Next já iniciado não foi extraído: sua igualdade exata com o arquivo atual não é presumida.

A comparação local, sem expor valores, mostrou que DATABASE_URL do `.env` difere tanto da conexão pooled quanto da direct em `.env.futscout-staging`. **URLs diferentes não comprovam databases diferentes.** A evidência oficial arquivada identifica staging como `jj51gk17l30qv1uibsj3g46u` e Production como `rknsog8tmbl5u4xqbogxfux5`; esta investigação não recuperou uma associação oficial entre a credencial atual do `.env` e um database ID. Portanto, o destino do preflight **pode ser Production e não deve ser tratado como isolado**. Nenhuma identidade foi inferida pelo hostname, pelo nome DATABASE_URL ou pelos dados retornados.

### Estado do localhost e menor correção proposta

O listener TCP na porta 3000 pertence ao PID 2252, identificado como processo Next, com processo pai 29492 também identificado como Next dev. Ambos estavam ativos. O log local contém erros históricos `TypeError: fetch failed` e avisos de hidratação, mas não fornece evidência de que o servidor tenha parado ou de que essas mensagens sejam a falha de banco reproduzida. Não foi feita requisição HTTP a páginas para evitar leituras adicionais e possíveis efeitos de renderização. O SELECT de controle usou o módulo Prisma do runtime em processo isolado; não foi uma consulta executada dentro do processo Next existente.

A menor correção proposta é fazer o preflight futuro reutilizar `lib/prisma.ts` e `withPrismaReadOnly`, que aplica `SET TRANSACTION READ ONLY` dentro da transação, verifica o modo e termina pelo caminho de rollback; remover desse preflight a opção extra enviada no startup. Preservar o `.env`, não trocar automaticamente para DIRECT_URL e não relaxar TLS. Acrescentar diagnóstico sanitizado de fase, tipo, código e mensagem. **Nenhuma dessas mudanças de código foi implementada nesta investigação.** Antes de retomar, confirmar o database ID oficial vinculado à configuração e manter autorização estritamente de leitura.

As 34 linhas passam a **não reavaliada por falha de acesso**. A Ligue 2 teve apenas o acesso investigado; as outras 33 não foram iniciadas. Isso não significa conflito ou divergência de identidade. O JSON `batch-01-stopped.json` e as evidências originais foram preservados como registro histórico; seus campos REVIEW são superados por esta classificação documental, sem apagar o ponto de parada original. Não houve API-Football, imagens, alterações no banco, código, ambiente ou Vercel.

## Evidências reutilizadas

O inventário foi reconstruído dos 38 fallbacks em `audit/output/league-logo-final.json`, retirando as quatro ligas cadastradas no segundo lote (94, 40, 79, 136). O resultado contém exatamente 34 IDs locais. O inventário anterior de lotes não foi localizado nos arquivos consultados; a ordem abaixo é a proposta de retomada, não uma reprodução não comprovada desse inventário.

`docs/league-logo-second-batch-2026-09-23.md` registra Ligue 2 BKT local `cmt9ekar7005c1suckjql1hd7`, candidato API-Football 62. Seu motivo antigo de revisão citava Red Star 4396. O recibo posterior de correção registra `COMMITTED / INDEPENDENT_READ_CONFIRMED`, em 2026-09-23T15:55:03.873Z, para o clube `cmt9g1wkq037v1sucum6ntyxn`, com passagem a 104, identidade histórica 4396 bloqueada e escudo revogado. Esse recibo histórico não substitui um preflight atual nem a comparação dos demais participantes.

Não foram recuperados hashes ou inspeções visuais arquivadas suficientes das 34 logos para certificá-las. Não se reutilizou evidência de imagem das quatro ligas já cadastradas para outras competições. `League.externalId` não foi usado como identidade do provedor.

## Inventario da parada inicial (historico; resultados atuais acima)

Em todas as linhas: temporada e correspondência completa dos participantes **não reconfirmadas**; Registry indica somente fallback **histórico**, sem preflight atual; HTTP/formato/dimensões/SHA-256/inspeção visual da logo **não verificados nesta execução**. O JSON complementar explicita cada campo individualmente. IDs locais abaixo provêm do snapshot arquivado, não de leitura atual.

| Lote | Liga local | League.id | ID provedor / país ou abrangência / tipo / divisão | Decisão e pendência específica |
| --- | --- | --- | --- | --- |
| 1 | Ligue 2 BKT | `cmt9ekar7005c1suckjql1hd7` | 62 histórico / França histórica / tipo a confirmar / 2 histórica | não reavaliada por falha de acesso — READ_SNAPSHOT_FAILED: preflight atual indisponível; falta reconciliar participantes, Registry e logo após correção |
| 2 | LALIGA HYPERMOTION | `cmt9d4pi304mtukucja4z7u2q` | Não confirmados | não reavaliada por falha de acesso — NOT_STARTED_AFTER_STOP: sem preflight atual ou evidência suficiente para associação exata e logo |
| 2 | EFL League One | `cmta7vu7o02496wucuxpwquwr` | Não confirmados | não reavaliada por falha de acesso — NOT_STARTED_AFTER_STOP: sem preflight atual ou evidência suficiente para associação exata e logo |
| 2 | EFL League Two | `cmtaeiyxf06iv9gucrl6c0tgf` | Não confirmados | não reavaliada por falha de acesso — NOT_STARTED_AFTER_STOP: sem preflight atual ou evidência suficiente para associação exata e logo |
| 2 | 3. Liga | `cmtad946t03lq9gucelzi806s` | Não confirmados | não reavaliada por falha de acesso — NOT_STARTED_AFTER_STOP: sem preflight atual ou evidência suficiente para associação exata e logo |
| 3 | 1A Pro League | `cmt9bm48f01cyukuceuen03tr` | Não confirmados | não reavaliada por falha de acesso — NOT_STARTED_AFTER_STOP: sem preflight atual ou evidência suficiente para associação exata e logo |
| 3 | 3F Superliga | `cmt9ctsxc03xvukucfasxm83t` | Não confirmados | não reavaliada por falha de acesso — NOT_STARTED_AFTER_STOP: sem preflight atual ou evidência suficiente para associação exata e logo |
| 3 | A-League | `cmt9i85450055q4ucarbpij51` | Não confirmados | não reavaliada por falha de acesso — NOT_STARTED_AFTER_STOP: sem preflight atual ou evidência suficiente para associação exata e logo |
| 3 | Allsvenskan | `cmt9fu0ae02rd1sucnoizd50d` | Não confirmados | não reavaliada por falha de acesso — NOT_STARTED_AFTER_STOP: sem preflight atual ou evidência suficiente para associação exata e logo |
| 4 | Brack Super League | `cmt9cdhm202ycukuc9eatc0la` | Não confirmados | não reavaliada por falha de acesso — NOT_STARTED_AFTER_STOP: sem preflight atual ou evidência suficiente para associação exata e logo |
| 4 | Česká Liga | `cmt9c5bdm02gkukucb8hsabf1` | Não confirmados | não reavaliada por falha de acesso — NOT_STARTED_AFTER_STOP: sem preflight atual ou evidência suficiente para associação exata e logo |
| 4 | CSL | `cmt9f016a011q1suczc7j6xy8` | Não confirmados | não reavaliada por falha de acesso — NOT_STARTED_AFTER_STOP: sem preflight atual ou evidência suficiente para associação exata e logo |
| 4 | Eliteserien | `cmt9coo6003nbukuc6lkgnwmb` | Não confirmados | não reavaliada por falha de acesso — NOT_STARTED_AFTER_STOP: sem preflight atual ou evidência suficiente para associação exata e logo |
| 5 | Finnliiga | `cmtacixca01ve9gucjr6aozya` | Não confirmados | não reavaliada por falha de acesso — NOT_STARTED_AFTER_STOP: sem preflight atual ou evidência suficiente para associação exata e logo |
| 5 | Hellas Liga | `cmt9blzhv01clukucvic0ft70` | Não confirmados | não reavaliada por falha de acesso — NOT_STARTED_AFTER_STOP: sem preflight atual ou evidência suficiente para associação exata e logo |
| 5 | ISL | `cmtacvytc02r59guc438hbrlo` | Não confirmados | não reavaliada por falha de acesso — NOT_STARTED_AFTER_STOP: sem preflight atual ou evidência suficiente para associação exata e logo |
| 5 | K League 1 | `cmt9eyo4u00y41suczayaz18g` | Não confirmados | não reavaliada por falha de acesso — NOT_STARTED_AFTER_STOP: sem preflight atual ou evidência suficiente para associação exata e logo |
| 6 | Liga Azerbaijan | `cmtaask4c006bgguc2j5lxa3m` | Não confirmados | não reavaliada por falha de acesso — NOT_STARTED_AFTER_STOP: sem preflight atual ou evidência suficiente para associação exata e logo |
| 6 | Liga Chile | `cmt9gmvaa04g41suc5iyzcop4` | Não confirmados | não reavaliada por falha de acesso — NOT_STARTED_AFTER_STOP: sem preflight atual ou evidência suficiente para associação exata e logo |
| 6 | Liga Cyprus | `cmt9gj2es04801sucqqr7lpq7` | Não confirmados | não reavaliada por falha de acesso — NOT_STARTED_AFTER_STOP: sem preflight atual ou evidência suficiente para associação exata e logo |
| 6 | Liga Hrvatska | `cmt9bga6b00zkukucbiqk0hj7` | Não confirmados | não reavaliada por falha de acesso — NOT_STARTED_AFTER_STOP: sem preflight atual ou evidência suficiente para associação exata e logo |
| 7 | Magyar Liga | `cmt9cgwsv0362ukuc54mlun2o` | Não confirmados | não reavaliada por falha de acesso — NOT_STARTED_AFTER_STOP: sem preflight atual ou evidência suficiente para associação exata e logo |
| 7 | Ö. Bundesliga | `cmt9f4vwv01c91suc25b5ctd1` | Não confirmados | não reavaliada por falha de acesso — NOT_STARTED_AFTER_STOP: sem preflight atual ou evidência suficiente para associação exata e logo |
| 7 | PKO BP Ekstraklasa | `cmt9fwhb402wv1suchlrareu6` | Não confirmados | não reavaliada por falha de acesso — NOT_STARTED_AFTER_STOP: sem preflight atual ou evidência suficiente para associação exata e logo |
| 7 | ROSHN Saudi League | `cmt99f99p005gvsuclbx5elkf` | Não confirmados | não reavaliada por falha de acesso — NOT_STARTED_AFTER_STOP: sem preflight atual ou evidência suficiente para associação exata e logo |
| 8 | Scottish Prem | `cmt9bqcur01lrukucj5mdg07t` | Não confirmados | não reavaliada por falha de acesso — NOT_STARTED_AFTER_STOP: sem preflight atual ou evidência suficiente para associação exata e logo |
| 8 | SSE Airtricity PD | `cmtakrz8k05hlq0ucue6rdb9a` | Não confirmados | não reavaliada por falha de acesso — NOT_STARTED_AFTER_STOP: sem preflight atual ou evidência suficiente para associação exata e logo |
| 8 | Trendyol Süper Lig | `cmt99979i00brt4uc8h2cv0d2` | Não confirmados | não reavaliada por falha de acesso — NOT_STARTED_AFTER_STOP: sem preflight atual ou evidência suficiente para associação exata e logo |
| 8 | Ukrayina Liha | `cmt9c5mh102hfukucxmmcjf8z` | Não confirmados | não reavaliada por falha de acesso — NOT_STARTED_AFTER_STOP: sem preflight atual ou evidência suficiente para associação exata e logo |
| 9 | United Emirates League | `cmt9bx8dt01yvukuc00bxtnka` | Não confirmados | não reavaliada por falha de acesso — NOT_STARTED_AFTER_STOP: sem preflight atual ou evidência suficiente para associação exata e logo |
| 9 | LPF | `cmt9b3q3i00alukuc087t3u4x` | Não confirmados | não reavaliada por falha de acesso — NOT_STARTED_AFTER_STOP: exige identificar por participantes a abrangência, o ID exato, tipo e temporada; nome não determina país nem League/Cup |
| 9 | SUPERLIGA | `cmt9gcakd03tm1sucmbno6tuo` | Não confirmados | não reavaliada por falha de acesso — NOT_STARTED_AFTER_STOP: exige identificar por participantes a abrangência, o ID exato, tipo e temporada; nome não determina país nem League/Cup |
| 9 | Libertadores | `cmt9c3i3502dgukuc28vz7prp` | Não confirmados | não reavaliada por falha de acesso — NOT_STARTED_AFTER_STOP: exige identificar por participantes a abrangência, o ID exato, tipo e temporada; nome não determina país nem League/Cup |
| 10 | Sudamericana | `cmtdae90p04wlogucj7s3c2in` | Não confirmados | não reavaliada por falha de acesso — NOT_STARTED_AFTER_STOP: exige identificar por participantes a abrangência, o ID exato, tipo e temporada; nome não determina país nem League/Cup |

## Procedimento para retomada

1. Diagnosticar a falha de acesso com saída sanitizada, sem registrar URLs, tokens ou senhas. Retomar somente após resolução explícita, em nova leitura protegida; não reaproveitar um snapshot parcial. Confirmar lista das 34, Registry por chave local e externa e Red Star 104, EA 111273, Ligue 2, histórico 4396 bloqueado/revogado e vínculos preservados.
2. Lote 1: Ligue 2; lote 2: quatro divisões inferiores indicadas; demais lotes de até quatro conforme tabela. Salvar recibo e estado por lote antes de começar o seguinte. Os lotes posteriores permanecem NÃO INICIADOS.
3. Procurar primeiro respostas e imagens arquivadas ou cache válido. Registrar origem, data e hash do artefato reutilizado. Não chamar sincronizadores, pois podem persistir dados ou fazer retry. Não repetir uma consulta documentada suficiente.
4. Para lacunas, orçamento máximo por liga: uma consulta de descoberta direcionada, uma consulta ao ID exato quando necessária e uma consulta de participantes para a temporada escolhida. No máximo uma requisição à imagem por candidato reconciliado, sem redirects/retries automáticos. Não consumir todo o orçamento se a evidência já existir. Registrar intenção e resultado de cada requisição; em interrupção entre ambos, marcar indeterminado e não repetir automaticamente.
5. Confrontar ID exato, país/abrangência, tipo League/Cup, divisão e temporada com participantes por Club.apiFootballId; registrar ausentes, não mapeados e discrepâncias. Falta de evidência produz REVIEW; conflito comprovado, HTTP 429 ou resultado indeterminado interrompe todos os lotes imediatamente. Não enfraquecer os critérios para obter VERIFIED.
6. LPF e SUPERLIGA exigem desambiguação por clubes e abrangência, sem presumir país. Libertadores e Sudamericana exigem confirmar alcance continental, tipo e fase/temporada, sem presumir League ou interpretar clubes de países diferentes como erro. Não atribuir um ID apenas pelo nome.
7. Para logo tecnicamente elegível, registrar URL exata, HTTP, MIME e formato decodificado, dimensões e SHA-256 dos bytes. Inspecionar visualmente e registrar a correspondência com a competição; não confundir disponibilidade técnica com licença. VERIFIED técnico não autoriza publicação; direitos permanecem separados e sem alteração do Registry.

## Artefatos e integridade

Progresso detalhado local: `audit/output/leagues34-20260923/batch-01-stopped.json` (ignorado pelo Git). Script de leitura: `audit/output/leagues34-readonly.cjs`; gerador offline do relatório: `audit/output/leagues34-report.cjs`. Nenhum deles é rotina de sincronização. O script de leitura não deve ser reexecutado automaticamente. O documento é o registro versionável para retomada; os JSONs de origem devem ser preservados.

| Fonte | SHA-256 |
| --- | --- |
| audit/output/league-logo-final.json | `ffee292013dfa8eda9525abcb7b768ec84a10411cfacff6fde6e5db4c9d1e5c8` |
| audit/output/league-batch2-evidence.json | `2763322c207a30612cdd21ee0c83e458adc181affd9797445800dc45d515c4a1` |
| docs/league-logo-second-batch-2026-09-23.md | `f508441cac803a30807124cf96e882c238ff6eaf8dce143f77d9b80da6e57711` |
| C:\Users\Antonio\AppData\Local\Temp\red-star-receipt-execute-20260923-final.json | `593798658e042b4a4ff7c7fedaf3e41258b0baa5a96301266eee7a696e66867f` |
