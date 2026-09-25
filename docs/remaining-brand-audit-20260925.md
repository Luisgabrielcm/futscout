# Logos restantes e escudos — checkpoint de evidências

Somente leitura de identidade; nenhum ID de clube corrigido nesta rodada. Snapshot Production: `audit/output/brack-isl-existing-registry-baseline.json`, 24/09/2026 15:03:47Z. Os cadastros posteriores de Brack/ISL preservaram hashes Club/League/Player. 574 escudos elegíveis pelo estado do Registry **não significa 574 identidades corretas**. Oito clubes continuam sem escudo elegível.

## Ligas

| Liga local | Evidência e decisão | Pendência concreta |
|---|---|---|
| Brack `cmt9cdhm202ycukuc9eatc0la` | Publicada e confirmada; recibo `brack-registration-approved-v2-20260924.json` | Nenhuma de cadastro; disponibilidade remota permanece variável |
| ISL `cmtacvytc02r59guc438hbrlo` | Publicada e confirmada; recibo `isl-registration-approved-v2-20260924.json` | Divergências dos clubes não foram corrigidas nem usadas para invalidar a identidade independente da liga |
| ROSHN `cmt99f99p005gvsuclbx5elkf` | Marca atual 2026/27 autorizada, cadastrada e confirmada no público em 25/09; recibo `roshn-registration-20260925.json` | Nenhuma de cadastro; decisão e deployments em `roshn-operational-decision.md` |
| A-League `cmt9i85450055q4ucarbpij51` | Competição masculina Austrália/Nova Zelândia API 188 reconciliada; arquivo oficial horizontal PNG 2693×301 | **REVIEW visual**: a 24/48/72 px, conteúdo tem 2,68/5,36/8,05 px de altura. Texto ilegível no menor tamanho e preto some no fundo escuro. Obter versão oficial compacta ou aprovar uma apresentação própria ampla sem cortar/redesenhar; comprovar temporalidade da arte escolhida. Marca de aniversário 2024/25 não substitui automaticamente 2025/26 |
| Liga Cyprus `cmt9gj2es04801sucqqr7lpq7` | Vínculo local avançou por EA exata: APOEL 100135 na Liga Cyprus; clube local `cmt9gj2j404811suc2ug3rreg` pertence à liga. CFA lista APOEL na Cyprus League 2025/26; API competição 318 | **REVIEW visual/entrega**: JPEG oficial 800×337 é composição com troféu, texto, patrocinador, +18 e selo CFA; a 24 px fica com 10,11 px de altura e assinatura ilegível. Obter variante compacta oficial ou revisar slot maior. Entrega JPEG ainda não implementada/testada; não rotular como PNG/SVG. API do clube 557 versus 2247 permanece separado |

Fontes primárias da Cyprus: [EA APOEL / 100135](https://www.ea.com/zh-hans/games/ea-sports-fc/ratings/teams-ratings/apoel-fc/100135), [EA Liga Cyprus / 2210](https://www.ea.com/tr/games/ea-sports-fc/ratings/leagues-ratings/liga-cyprus/2210), [CFA sorteio 2025/26 e participantes](https://www.cfa.com.cy/En/news/51350). A página EA da liga já pode mostrar FC27; não foi atribuída retroativamente a FC26. O vínculo por IDs EA e o anúncio CFA 2025/26 são evidências distintas. League.externalId não foi preenchido ou usado como API-Football.

Arquivos originais e hashes: `audit/output/five-current-branding-20260924/{188,318,307}.json`; revisão visual local a 24/48/72 px, fundos claro/escuro, sem alterar os bytes. A-League: SHA `875736909a53b648a8beac5444ceccb551d9c4d785e448aee80f3c64414a8fac`, URL `https://aleagues.com.au/wp-content/uploads/sites/17/2023/08/A-Leagues-Logo_Men_Horizontal_Colour_Black_RGB_061021-1.webp` (MIME/bytes PNG). Cyprus: SHA `3adf4cca488288be34dc0a505a5c6490e376671c3d4a66aa1958eafb736139d3`, URL `https://www.cfa.com.cy/images/SponsorPics/1765366878.jpg` (JPEG). [Portal de imprensa A-Leagues](https://aleagues.com.au/more/media/) não forneceu nesta investigação uma variante compacta pública comprovada. Nenhuma mensagem foi enviada a terceiros.

## Oito clubes sem escudo elegível

| Clube / Club.id | EA | Evidência / ação segura |
|---|---|---|
| Bayer Leverkusen / `cmt7qsels0001ugucswpzr3dd` | `mock-bayer-leverkusen` | Placeholder, não identidade EA legítima. Manter visual genérico; não associar pelo nome |
| Lombardia FC / `cmt987wb8005fxoucc0gdugcc` | 131682 | Alias fictício EA; não usar automaticamente marca de Inter |
| Milano FC / `cmt998lop00ajt4ucd1plg0j2` | 131681 | Alias fictício EA; não usar automaticamente marca de Milan |
| Latium / `cmt99mt09002quguc7ndm8llq` | 115841 | Alias fictício EA; não usar automaticamente marca de Lazio |
| Bergamo Calcio / `cmt99obde005vuguc7mu6u702` | 115845 | Alias fictício EA; não usar automaticamente marca de Atalanta |
| Real Sociedad B / `cmtaomvzv05wbtwucnpukho0o` | 110711 | EA exata e cache API 9585, Espanha, Zubieta/Donostia, participante 141/2025. ID estava livre em Club/Registry no snapshot; apiFootballId local continua null |
| TSG Hoffenheim II / `cmtar6hia00o2dcuc2062khh9` | 110685 | EA exata e cache API 9364, Alemanha, Dietmar-Hopp/Sinsheim, participante 80/2025. ID livre no snapshot; apiFootballId local null |
| VfB Stuttgart II / `cmtaroykv01tsdcucom3yilwa` | 110697 | EA exata e cache API 12867, Alemanha, Robert-Schlienz/Stuttgart, participante 80/2025. ID livre no snapshot; apiFootballId local null |

Fontes EA exatas: [Real Sociedad B 110711](https://www.ea.com/games/ea-sports-fc/ratings/teams-ratings/real-sociedad-b/110711), [Hoffenheim II 110685](https://www.ea.com/games/ea-sports-fc/ratings/teams-ratings/tsg-hoffenheim-ii/110685), [Stuttgart II 110697](https://www.ea.com/games/ea-sports-fc/ratings/teams-ratings/vfb-stuttgart-ii/110697). Páginas atuais FC27 confirmam a entidade; temporada 2025 vem do cache arquivado, não de inferência da página atual. Respostas exatas reutilizadas: `audit/output/coverage-20260923/team-{9585,9364,12867}.json`; zero novas chamadas API-Football nesta investigação.

Para os três reservas, preparar associação individual com precondição apiFootballId=null, EA/League.id e conjunto de jogadores pinados, ocupação novamente conferida, transação sem retry e leitura independente. O writer de escudo exige o ID do clube correspondente, portanto não contornar essa proteção. Validar imagem exata antes de cadastro e aplicar decisão individual. Não executar associação automática nesta auditoria.

Solução visual para registros sem marca legítima: manter o escudo neutro de `BrandAssetFallback` (contorno de escudo e três traços, sem iniciais ou cores que imitem terceiros). Identificá-lo como **“Representação genérica — escudo oficial indisponível”** na apresentação/revisão; nunca registrá-lo como marca VERIFIED ou contá-lo na cobertura de escudos oficiais. A UI existente já anuncia imagem indisponível; proposta de texto mais explícito não foi implantada nesta auditoria.

## Dez associações existentes em revisão

Todos possuem identidade VERIFIED v1 e asset ACTIVE v1 no snapshot. Isso é estado persistido histórico, não aprovação desta auditoria. Nenhum foi sobrescrito, excluído ou corrigido.

| Clube / Club.id | EA / API atual → candidato | Divergência e condição para correção |
|---|---|---|
| Wigan / `cmtaiv2mt00ovq0ucxcv1hdth` | 1917 / 22652 → 61 | Registro atual associado à FA Women's Cup 698/2023; fechar equipe masculina EA/cidade/participantes e ocupação antes de trocar |
| Punjab / `cmtbpdgt2009zpkuc9j70jvc8` | 115202 / 7179 → 3466 | Atual Santosh Trophy 325/2025, candidato Minerva Punjab; provar continuidade da entidade profissional e EA |
| Al Hilal / `cmt99ho3e00aivsuchz4fddri` | 605 / 8097 → 2932 | Atual Líbia/Benghazi, não clube saudita. Confirmar candidato exato e ocupação |
| Central Coast / `cmtakuew205n6q0ucfkjqrmms` | 111396 / 19008 → 941 | Atual Ilhas Salomão, não Austrália; confirmar candidato/EA |
| Estudiantes / `cmt9by8hf021jukucpa6u2ifp` | 101083 / 27751 → 450 | Atual Aruba, candidato La Plata; fechar EA/cidade/estádio |
| Unión / `cmta7is7w01ao6wuchv2tf1x7` | 111716 / 21371 → 441 | Atual Letônia, candidato Santa Fe; fechar EA/cidade/estádio |
| Central Córdoba / `cmtaby9ul00jq9gucapdbciar` | 112965 / 790 → 1065 | Atual Rosario/1906 versus Santiago del Estero/1919; fechar EA |
| APOEL / `cmt9gj2j404811suc2ug3rreg` | 100135 / 557 → 2247 | EA APOEL confirmada; comparar registros API exatos e histórico de temporada, sem inferir pela ausência no elenco |
| East Bengal / `cmtanjzzq035wtwucgpaok8fr` | 111629 / 3463 versus 21137 | 21137 é II; não substituir equipe principal por reserva. Atual aparece em Super Cup/Calcutta PL 2025 |
| Hyderabad / `cmtauvmrq02wlzsuceruvv04b` | 113301 / 7763 versus 26963 | SC Delhi exige evidência temporal/jurídica de continuidade; não trocar apenas pelo participante atual |

Evidência detalhada e origens: `audit/output/nine-league-review-20260924/report.md`, `docs/league-logos-review-queue-2026-09-23.md` e snapshot integral acima (IDs/versões/escudos). Para cada correção comprovada, bloquear identidade antiga e revogar escudo preservando histórico, retirar tupla errada da allowlist, manter EA/liga/jogadores, reconciliar qualquer indeterminação. Não usar a publicação de logos de liga para autorizar silenciosamente essas correções de clubes.

Red Star permanece separado: identidade 4396 bloqueada, escudo revogado; 104 correto previamente cadastrado. O baseline foi comparado integralmente com os recibos anteriores, sem novas alterações nesse clube.

Atualização final de 25/09: `audit/output/official-final-registry-20260925.json` compara integralmente Club e Registry com o baseline + recibos Brack/ISL/ROSHN. Mesmos oito faltantes e mesmos registros suspeitos; 43 logos elegíveis e confirmadas publicamente, 574 escudos elegíveis. A figura genérica proposta está em `audit/output/generic-crest-preview.svg`, derivada do fallback neutro existente, explicitamente identificada como representação genérica e excluída da cobertura oficial.
