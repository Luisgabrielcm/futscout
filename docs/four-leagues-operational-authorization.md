# Quatro logos de ligas — autorização operacional

Decisão explícita do proprietário em 23/09/2026 (America/Cuiaba), para Production rknsog8tmbl5u4xqbogxfux5. Referência: owner-decision:four-independent-league-logos-2026-09-23.

| Liga | League.id | API-Football | URL | SHA-256 |
|---|---|---|---|---|
| LALIGA HYPERMOTION | cmt9d4pi304mtukucja4z7u2q | 141 | https://media.api-sports.io/football/leagues/141.png | a9fb5006f156dd2046e97dfea6fc49ebe09cfe5de722e9fc028a314a771e910c |
| EFL League One | cmta7vu7o02496wucuxpwquwr | 41 | https://media.api-sports.io/football/leagues/41.png | 9b64108673e40888a243e276edadc9f484941c5c4c369775e49746d3049f03b2 |
| 3. Liga | cmtad946t03lq9gucelzi806s | 80 | https://media.api-sports.io/football/leagues/80.png | 7fed04fa403e0117e25544bdbbfa8aa1cb4f84e62d28e80a0bfe2db49e139ffe |
| LPF | cmt9b3q3i00alukuc087t3u4x | 128 | https://media.api-sports.io/football/leagues/128.png | 79906ead72d2bed614b9774a6391297db5912b14e478319b3d4bde9284481d7d |

Autoriza somente LEAGUE / api-football / LOGO para essas quatro identidades e bytes: OWNER_AUTHORIZED_REMOTE_USE, DISPLAY_ALLOWED, rightsStatus=REVIEW_REQUIRED, storageUrl=null, revocable=true. Revogação individual por REVOKED / DISPLAY_BLOCKED, preservando histórico. A decisão aceita risco operacional de exibição remota; não representa licença de marca ou comprovação de direitos.

Evidência: audit/output/nine-league-review-20260924/report.md e imagens com hashes acima. A identidade das competições foi verificada independentemente das pendências dos clubes; isso não aprova suas associações. Preservar Club, League, Player e todo Registry existente. A-League, Brack, ISL, Cyprus e ROSHN ficam fora.

Exigir conexão Console vinculada ao ID Production, 20 migrations concluídas, compatibilidade do writer, quatro IDs locais exatos, ausência de conflito e bytes remotos idênticos. Uma liga por transação existente, sem retry; leitura independente e recibo após cada commit; parar em conflito ou indeterminação. Nenhum push ou deploy.
