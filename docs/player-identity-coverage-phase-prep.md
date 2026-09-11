# Lote 8 — preparação de cobertura de identidade

## Escopo e limites

Baseline de código: beta-next, 45e31f4. Auditoria READ ONLY em 2026-09-11T21:04:58.257Z.
Nenhuma API operacional, nenhum matcher/sync, nenhum dry-run real e nenhuma escrita de dados foram executados nesta preparação.
Consulta à documentação pública não utilizou credenciais nem endpoints operacionais.

## Baseline auditado

- Players: 16.228; associados: 74 (0,456%); sem associação: 16.154.
- Attempts: 73; matched 62, not_resolved 7, weak 4, demais 0.
- SyncErrors: 2 preexistentes (não são novos erros deste lote).
- RosterCaches: 15, todos season=2024. Os caches dos três pilotos estão expirados.
- Matcher SyncState: offset=59, batchSize=25, status=idle, último sucesso 2026-09-04T19:01:18.299Z.
- EA SyncState: offset=16228, batchSize=50, completed. Não reiniciar/resetar.
- Duplicidade atual de Player.apiFootballId: nenhuma encontrada; schema já contém @unique.

| Clube | Total | Associados | Sem ID | Com attempt | Nunca tentados |
|---|---:|---:|---:|---:|---:|
| fc-barcelona | 23 | 9 | 14 | 7 | 16 |
| manchester-city | 26 | 7 | 19 | 6 | 20 |
| real-madrid | 26 | 8 | 18 | 6 | 20 |

"Nunca tentado" conta ausência de Attempt, inclusive jogadores associados anteriormente por outros fluxos. Não equivale a "sem ID".

## Snapshots e tabelas protegidas

Hashes da linha inteira (incluindo payload e timestamps) foram incluídos no hash agregado da tabela. Estes contentHash individuais são a referência adicional:

| Clube | Snapshot | Fixture | Revision | Content hash |
|---|---|---:|---:|---|
| fc-barcelona | cmtxdolfu0000ckuc5xr4whbf | 1635628 | 1 | 1d82442da572f610d2565dec8010d44afbb044737dd5b6d4c31ff80068d1dd11 |
| manchester-city | cmtxf4ek50000l4ucnrcm9d3e | 1635654 | 1 | c2ff883579915265a7338de7073a019b5e8dcc91212d95eff62459f54977acd0 |
| real-madrid | cmtxfmn4n0000rcucs3r7muyi | 1635714 | 1 | dc266789f05d7a96eb27d87e192862abbece5cc0503a2423a5a2e2d52d9a0562 |

| Tabela | Count | Hash agregado before |
|---|---:|---|
| Player | 16228 | f508d70668d66cba66b6ba014e26bcb3 |
| Club | 582 | df3175ae882032081e4e8385717da428 |
| League | 45 | 3cf5ca9f367dcb77940f1bd194ded616 |
| PlayerAttributes | 16228 | 4d98721ba56923404f12895da5677872 |
| ApiFootballTeamRosterCache | 15 | 0b729d46cc854b73e676c433756fdb4b |
| ApiFootballPlayerMatchAttempt | 73 | 9f73763507962483930b9719109112d6 |
| SyncState | 2 | 8f728496d565422cce4e01c7299bcf46 |
| SyncError | 2 | 5c369989fc8bb5d9f634dd554f98dc18 |
| ClubOfficialLineupSnapshot | 3 | ef22bacc6c7b68d936993311f93b151f |

## Unresolved dos snapshots — diagnóstico, não matching

48 participantes unresolved: Barcelona 16, City 17, Real 15. Denominador diferente do elenco EA por clube.
A = candidato único plausível no clube local, ID nulo; B = ID divergente; C = não localizado pelos critérios consultados; D = ambíguo; E = possível clube desatualizado; F = variante de nome; G = outro.
Categorias primárias para triagem, não confirmação de identidade. Nomes/iniciais serviram apenas para localizar candidatos; nenhuma regra nova de score ou alias foi persistida no matcher.
Mesmo A exige roster fresco, nascimento e todos os gates. Homônimos fora do clube podem exigir revisão adicional.

| Clube fonte | Grupo | Provider ID | Nome da fonte | Posição fonte | Categoria | Diagnóstico local |
|---|---|---:|---|---|---|---|
| fc-barcelona | startXI | 182718 | J. Garcia | G | A | Joan García |
| fc-barcelona | startXI | 396623 | P. Cubarsi | D | A | Pau Cubarsí |
| fc-barcelona | startXI | 2282 | A. Christensen | D | A | Andreas Christensen |
| fc-barcelona | startXI | 855 | J. Cancelo | D | E | João Cancelo — Al Hilal |
| fc-barcelona | startXI | 7334 | K. Adeyemi | F | E | Karim Adeyemi — Dortmund |
| fc-barcelona | substitutes | 851 | W. Szczesny | G | A | Wojciech Szczęsny |
| fc-barcelona | substitutes | 1305 | D. Livakovic | G | E | Dominik Livaković — Girona |
| fc-barcelona | substitutes | 181701 | G. Martin | D | A | Gerard Martín |
| fc-barcelona | substitutes | 161928 | A. Balde | D | F | Balde; abreviação não confirma identidade |
| fc-barcelona | substitutes | 568001 | X. Espart | D | C | Não localizado |
| fc-barcelona | substitutes | 296667 | Gavi | M | A | Gavi |
| fc-barcelona | substitutes | 574799 | B. Farinas | M | C | Não localizado |
| fc-barcelona | substitutes | 340626 | Fermín | M | A | Fermín |
| fc-barcelona | substitutes | 643 | Gabriel Jesus | F | E | Gabriel Jesus — Arsenal |
| fc-barcelona | substitutes | 138787 | A. Gordon | F | D | Anthony Gordon / Ashton Gordon; requer evidência adicional |
| fc-barcelona | substitutes | 550547 | H. Abdelkarim | F | C | Não localizado |
| manchester-city | startXI | 1622 | G. Donnarumma | G | A | Gianluigi Donnarumma; retry somente em 02/10 |
| manchester-city | startXI | 41621 | M. Nunes | D | A | Matheus Nunes |
| manchester-city | startXI | 67971 | M. Guehi | D | E | Marc Guéhi — Crystal Palace |
| manchester-city | startXI | 129033 | J. Gvardiol | D | A | Joško Gvardiol |
| manchester-city | startXI | 438688 | A. Bouaddi | M | E | Ayyoub Bouaddi — Lille |
| manchester-city | startXI | 156477 | R. Cherki | M | A | Rayan Cherki |
| manchester-city | startXI | 19281 | A. Semenyo | M | E | Antoine Semenyo — Bournemouth |
| manchester-city | substitutes | 19012 | M. Bettinelli | G | A | Marcus Bettinelli |
| manchester-city | substitutes | 47296 | G. Rulli | G | E | Gerónimo Rulli — OM |
| manchester-city | substitutes | 21138 | R. Ait-Nouri | D | A | Rayan Aït-Nouri |
| manchester-city | substitutes | 284230 | R. Lewis | D | A | Rico Lewis |
| manchester-city | substitutes | 414359 | Vitor Reis | D | E | Vitor Reis — Girona |
| manchester-city | substitutes | 442048 | R. McAidoo | F | C | Não localizado |
| manchester-city | substitutes | 2291 | M. Kovacic | M | A | Mateo Kovačić |
| manchester-city | substitutes | 138908 | E. Anderson | M | E | Elliot Anderson — Nottingham Forest |
| manchester-city | substitutes | 425714 | Allan Elias | F | C | Não localizado; coincidências por Elias não bastam |
| manchester-city | substitutes | 18592 | I. Ndiaye | F | E | Iliman Ndiaye — Everton |
| real-madrid | startXI | 226 | D. Dumfries | D | E | Denzel Dumfries — Lombardia FC |
| real-madrid | startXI | 361497 | D. Huijsen | D | A | Dean Huijsen |
| real-madrid | startXI | 283 | T. Alexander-Arnold | M | A | Trent Alexander-Arnold; posição da partida difere |
| real-madrid | startXI | 744 | B. Diaz | M | F | Brahim é hipótese, sem associação confirmada |
| real-madrid | startXI | 762 | Vinicius Junior | M | F | Vini Jr. é hipótese; retry somente em 02/10 |
| real-madrid | substitutes | 47400 | A. Lunin | G | A | Andriy Lunin |
| real-madrid | substitutes | 386872 | S. Mestre | G | C | Não localizado |
| real-madrid | substitutes | 284300 | A. Carreras | D | A | Álvaro Carreras |
| real-madrid | substitutes | 456014 | M. Rivas | D | C | Nenhum Rivas com inicial M localizado |
| real-madrid | substitutes | 1271 | A. Tchouameni | M | A | Aurélien Tchouaméni |
| real-madrid | substitutes | 509470 | T. Pitarch | M | C | Não localizado |
| real-madrid | substitutes | 560905 | J. Cestero Sancho | M | C | Não localizado; Jadon Sancho não é evidência suficiente |
| real-madrid | substitutes | 377122 | Endrick | F | A | Endrick |
| real-madrid | substitutes | 450497 | C. Espi | F | E | Carlos Espí — Levante |
| real-madrid | substitutes | 513776 | Y. Diomande | F | E | Yan Diomande — RB Leipzig |

Resumo: A=21, B=0, C=9, D=1, E=14, F=3, G=0. B=0 significa nenhum conflito identificado entre os candidatos diagnósticos, não certificação global de todas as identidades.

## Matcher existente: reutilização e riscos

- Reutilizados sem mudar comportamento: normalização, avaliação de candidato, pesos 40/35/10/15, thresholds 75/90, nameScore>=80, nascimento e clube obrigatórios, margem mínima 10.
- Extração mecânica em services/apiFootballPlayerCandidate.ts. Resolver produtivo continua consumindo exatamente essa avaliação; não há segundo algoritmo de scoring.
- Defaults produtivos ainda são 2024; não foram trocados silenciosamente. Runner exige 2026 explícito.
- resolveApiFootballPlayer(save=false) NÃO é dry-run livre de efeitos: chama resolver de clube com save=true; carregamento de roster pode gravar cache. Não usar esse caminho nesta preparação.
- syncApiFootballPlayerMatches sempre pode escrever SyncState/Attempts/SyncError e pede save=true. Não é um dry-run.
- Rate limit e cache-only miss param o batch antes de attempt do jogador interrompido. failFast para exceções não é igual a parar em todo outcome review/weak.
- Retry existente: not_resolved 7d, review 14d, weak/conflict 30d, error 1d. matched não é retentado. Preservar.
- Risco antes do WRITE: verificação de dono e Player.update não são um compare-and-set transacional; write de Player e recorder matched são separados. @unique protege um ID em dois Players, mas não impede sobrescrever uma associação concorrente do MESMO Player. Não habilitar write até corrigir/testar atomicidade ou apresentar mecanismo equivalente aprovado.
- Club/League, atributos, potential, form, marketValue e snapshots fora do write scope. Nenhuma mudança nesses serviços foi feita.

## Temporada e estratégia de roster

Usar **2026** para a temporada europeia **2026/27** (LaLiga/Premier League/Champions League): o identificador é o ano inicial, conforme [guia oficial API-Football](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide).
Isso não comprova cobertura/disponibilidade no plano da conta. Antes do refresh, confirmar season=2026 e coverage no endpoint autorizado; sem fallback automático para 2024/2025.
Os snapshots normalizados v1 não preservam league.season nem nascimento/nacionalidade. Não permitem reconstruir esses campos nem justificar auto-save por nome+lineup.

Estratégia C: roster fresco completo fornece identidade/birth/nationality/statistics; snapshot oficial existente corrobora provider ID e nome. Não atualizar snapshots.
Os caches (529,2024), (50,2024), (541,2024) são históricos expirados, com 56/66/62 jogadores respectivamente. Eles não são elencos atuais só porque foram fetched em setembro de 2026. /players por season inclui participantes/estatísticas da temporada, não garantia isolada de vínculo atual.
Criar futuramente (529,2026) em autorização separada, sem sobrescrever/deletar 2024. Preservar team, season, fetchedAt, expiresAt, playerCount e payload. Se 2026 já existir, parar para revisar em vez de substituir silenciosamente.

Budget proposto para fase separada: no máximo 1 GET /leagues?id=140&season=2026 para cobertura + 4 GET /players?team=529&season=2026&page=N, total 5, retry=0. Nenhum /players por nome. GET HTTPS host oficial, páginas únicas/sequenciais, validar paginação e parar imediatamente em 429/erro/payload inválido. Se paging.total>4, abortar sem persistir cache parcial; exigir nova autorização para ampliar budget. Guard deve ser instalado antes do fetch e cache salvo só após todas as páginas válidas/merge por ID sem metadados de identidade conflitantes.
Nenhum refresh implementado/executado neste lote. City/Real exigirão autorizações posteriores.

## Runner Barcelona e decisões

Arquivo: scripts/runBarcelonaPlayerIdentityPilot.ts. **Preparado, não executado.**

1. Aceita somente --dry-run, season=2026 e 1–5 IDs locais explícitos, sem duplicatas.
2. Exige beta-next clean antes de carregar env/DB; captura HEAD.
3. Fetch bloqueado; não importa resolver/sync/recorder. Conexão administrativa via DIRECT_URL sem expor valor.
4. Uma transação RepeatableRead READ ONLY; lê apenas dados, audita nove tabelas, valida identidade única 529 e os três snapshots com decoder/hash v1.
5. Exige cache 2026 fresco, coerente, não vazio, contagem íntegra e IDs únicos; sem API fallback.
6. Reutiliza avaliação/ranking existentes em todos os candidatos do roster, sem prefixo limitante. Confronta possíveis concorrentes locais e propriedade global do ID.
7. Emite player/sourcePlayerId/candidate/score/nameScore/margin/evidências/decision/reason; preserva IDs restantes em fail-fast.
8. Audita novamente e não possui caminho de escrita. --write é rejeitado antes de env/DB. AUTO_MATCH é apenas proposta para autorização posterior, não ordem de persistência.

AUTO_MATCH: Player ID nulo; único dono possível; clube local e team ID do roster 529; nascimento exato; confiança>=90; nameScore>=80; margem>=10 (ou candidato único), sem segundo candidato MATCH FORTE mesmo com margem suficiente; posição EA/roster corroborada; mesmo provider ID e nome compatível no snapshot recente; retry liberado. As restrições adicionais são exclusivas do piloto e não flexibilizam o matcher produtivo.
REVIEW: evidência insuficiente, score/margem, concorrente local, posição não corroborada, divergência roster/lineup, retry bloqueado ou associação já existente. Clube incoerente/ambiguidade param imediatamente este piloto.
UNRESOLVED: nenhuma evidência nominal para candidato. Não equivale ao status persistido not_resolved nesta fase.
CONFLICT: ID existente divergente ou provider ID de outro Player; fail-fast antes do seguinte. Duplicidade/estrutura inválida aborta todo preflight.

## Simulação de cobertura SEM executar dry-run real

Auditoria qualitativa dos 16 unresolved Barcelona: **AUTO_MATCH=0 comprovados; REVIEW=13; UNRESOLVED=3; CONFLICT=0 identificado**. Não é saída do novo runner nem previsão de score futuro. Hoje o runner deve bloquear por falta do cache 2026, sem classificar/registrar attempts.
Há 7 candidatos A e 1 variante F no clube que podem merecer evidência nova; nenhum ganho é garantido. Não executar automaticamente todos os 14 jogadores sem ID do elenco EA.
Primeiro allowlist sugerido para aprovação: Joan García, Pau Cubarsí, Andreas Christensen, Wojciech Szczęsny, Gerard Martín. Todos sem ID e sem attempt na auditoria. Gavi/Fermín/Balde ficam para depois; não introduzir aliases só para fazê-los passar.

Comando futuro (NÃO executado; requer autorização após cache fresco):

```powershell
npx tsx scripts/runBarcelonaPlayerIdentityPilot.ts --dry-run --season 2026 --player-ids cmt9an38y000m2kucc9izxn4h,cmt9b643t00eiukuchqi60m1e,cmt9bpzg701l3ukuc1tm32vwa,cmt99mm7z002buguc11z8p9vy,cmt9g7t3d03ki1suchanfvlu5
```

## Futuro WRITE — NÃO habilitado

Exigir nova autorização após revisar o dry-run, lista exata de pares e hashes/revisões do roster/snapshot. Revalidar freshness, retry, clube e unicidade dentro da transação. Usar compare-and-set id + apiFootballId=null, guardar Player.apiFootballId + Attempt matched atomicamente, respeitar @unique e abortar em concorrência. Reutilizar os statuses/semântica de Attempt, não criar paralelo.
Somente Player.apiFootballId + Attempt; updatedAt técnico deve ser explicitado. SyncState/SyncError apenas se o adaptador aprovado exigir. Preservar os hashes das colunas não autorizadas e todos os snapshots. Sem alterações no catálogo para fabricar evidência.
Auditoria AFTER de escopo global; parar no primeiro conflito. Não chamar o sync atual diretamente como write gate, pois ele não implementa todas essas garantias.

## Testes e gates

Testes determinísticos de contrato e policy em tests/unit/services/playerIdentityCoverage.test.ts, sem banco/rede; checagem estática do runner sem executá-lo. Não substituem futura validação operacional autorizada.
Cobrem candidato único, exact ID, duplicidade, mismatch/stale, homônimos, null, ID divergente, roster/lineup acordo e desacordo, quatro decisões, margem, retry, cache e fail-fast.
Gates: npm test; npx tsc --noEmit; npm run lint; npm run build; git diff --check; npx prisma validate. Executar com placeholders de banco inacessíveis, flag official lineups desligada; nenhum dado real necessário.

Validação desta preparação: 498 testes, 490 PASS, 0 FAIL, 8 SSR 404 opt-in skipped; 29 testes novos. TypeScript, lint (zero erros/warnings), build, diff check e Prisma validate PASS. O ENOMEM de os.userInfo ocorreu no sandbox antes dos testes; a suíte passou fora dele, sem workaround no projeto.
Auditoria final READ ONLY: contagens e hashes das nove tabelas exatamente iguais ao baseline acima, incluindo os três snapshots. API operacional=0, writes=0, novos Attempts=0, dry-run real não executado.
Classificação: B operacional (roster 2026 ausente e confirmação de cobertura pendente); preparação de código testada. A atomicidade é um bloqueio adicional somente para a futura fase WRITE.

## Próxima autorização

Aprovar primeiro a confirmação de season/cobertura e refresh exclusivamente Barcelona com budget explícito acima. Depois autorizar separadamente o dry-run dos cinco candidatos. WRITE permanece bloqueado até revisão e fortalecimento de atomicidade. Não expandir official lineups, não atualizar apiFootballId, não mergear master, não deploy Production.
