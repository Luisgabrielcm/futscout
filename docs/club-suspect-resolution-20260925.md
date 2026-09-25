# Dez associações de clubes — resolução de identidade

Auditoria de 25/09/2026. Este documento registra decisões de identidade, não execução no banco nem validação dos bytes dos novos escudos. Zero chamadas novas à API-Football; respostas exatas e participantes de 2025 foram reutilizados. Fontes web primárias atuais complementam a identidade EA, sem atribuir a temporada FC27 retroativamente ao catálogo FC26. Ocupação, versões, jogadores e hash da imagem exigem preflight independente antes de qualquer transação.

Resultado: sete associações comprovadamente incompatíveis com o clube local; uma normalização para o registro canônico da mesma identidade (APOEL); duas associações mantidas, sem substituir equipe principal por reserva ou rebranding temporal automaticamente.

| Clube / ID local | EA | API atual → decisão | Evidência exata e motivo |
|---|---|---|---|
| Wigan / `cmtaiv2mt00ovq0ucxcv1hdth` | 1917 | **CORRIGIR 22652 → 61** | EA exata identifica Wigan Athletic na EFL League One. Consulta arquivada `leagues?team=22652` retorna FA Women's Cup 698, temporada 2023. Participantes exatos `league=41&season=2025` identificam 61, England, fundação 1932, DW Stadium/Wigan. Categoria feminina do ID antigo é incompatível; não é comparação apenas nominal. |
| Punjab / `cmtbpdgt2009zpkuc9j70jvc8` | 115202 | **CORRIGIR 7179 → 3466** | EA exata Punjab FC/ISL; 7179 participa da Santosh Trophy 325/2025. O próprio Punjab distingue a seleção estadual da equipe profissional e documenta Minerva → RoundGlass → Punjab. API 3466 aparece na ISL 323/2025, nome legado Minerva Punjab, estádio Jawaharlal Nehru/New Delhi, consistente com o perfil oficial ISL. Imagem 3466 ainda precisa corresponder ao branding atual, não basta o nome legado do provedor. |
| Al Hilal / `cmt99ho3e00aivsuchz4fddri` | 605 | **CORRIGIR 8097 → 2932** | EA exata situa Al Hilal na ROSHN Saudi League. API 8097 é Libya, fundação 1952, Benghazi; API 2932 é Saudi-Arabia, 1957, Kingdom Arena/Riyadh e participante 307/2025. País, cidade e competição incompatíveis no ID antigo. |
| Central Coast / `cmtakuew205n6q0ucfkjqrmms` | 111396 | **CORRIGIR 19008 → 941** | EA exata Central Coast/A-League. API 19008 é Solomon-Islands; 941 é Central Coast Mariners, Australia, 2004, Gosford, participante 188/2025. |
| Estudiantes / `cmt9by8hf021jukucpa6u2ifp` | 101083 | **CORRIGIR 27751 → 450** | EA exata Estudiantes/LPF. API 27751 é Aruba; 450 é Estudiantes L.P., Argentina, 1905, La Plata, participante 128/2025 e Libertadores 13/2025. |
| Unión / `cmta7is7w01ao6wuchv2tf1x7` | 111716 | **CORRIGIR 21371 → 441** | EA exata Unión/LPF. API 21371 é Latvia; 441 é Union Santa Fe, Argentina, 1907, Estadio 15 de Abril/Santa Fe, participante 128/2025 e Sudamericana 11/2025. |
| Central Córdoba / `cmtaby9ul00jq9gucapdbciar` | 112965 | **CORRIGIR 790 → 1065** | EA exata Central Córdoba/LPF; página oficial LPF confirma Santiago del Estero, Alfredo Terrera e fundação 1919. API 790 é Rosario, 1906, Gabino Sosa; 1065 é Santiago del Estero, 1919, Alfredo Terrera, participante 128/2025. Não são o mesmo clube. |
| APOEL / `cmt9gj2j404811suc2ug3rreg` | 100135 | **NORMALIZAR 557 → 2247** | EA exata APOEL/Liga Cyprus, CFA 2025/26 e site oficial do clube identificam Nicosia, fundação 1926 e GSP. API 2247 coincide nesses atributos e participa de 318/2025. API 557 tem apenas Apoel/Cyprus e campos de estádio/fundação nulos; consulta de competições vazia. **Não há prova de que 557 represente outro clube**: tratar como associação não canônica/esparsa, preservando seu histórico e motivo correto. Ausência de competições, isoladamente, não comprova erro de identidade. |
| East Bengal / `cmtanjzzq035wtwucgpaok8fr` | 111629 | **MANTER 3463; rejeitar substituição por 21137** | API 3463: East Bengal, 1920, Kolkata, Vivekananda Yuba Bharati Krirangan, compatível com perfil oficial da ISL e competições Super Cup/Calcutta PL arquivadas. API 21137 chama-se explicitamente East Bengal II. A lista 323/2025 do provedor contém a reserva, portanto não é critério seguro de troca. Página EA exata não ficou acessível pelo leitor web nesta rodada; isso não torna a associação existente incorreta. |
| Hyderabad / `cmtauvmrq02wlzsuceruvv04b` | 113301 | **MANTER 7763 para o clube EA Hyderabad** | Página EA exata atual ainda é Hyderabad FC. API 7763: Hyderabad, 2019, GMC Balayogi/Hyderabad, compatível com perfil oficial ISL e calendário 2024/25. SC Delhi 26963 aparece em 323/2025; seu site se apresenta como clube estabelecido em 2025. A continuidade/relocalização não autoriza silenciosamente mudar a identidade temporal e a marca do registro EA Hyderabad. Se o catálogo migrar explicitamente para SC Delhi, preparar operação temporal separada com evidência e vínculos; não usar ausência na lista atual para revogar escudo histórico legítimo. |

## Evidências arquivadas e fontes primárias

Registros atuais exatos: `audit/output/coverage-20260923/team-{22652,7179,8097,19008,27751,21371,790,557,3463,7763}.json`. Cada arquivo preserva resposta, parâmetros, data e SHA-256 da resposta. Consultas de competição específicas: `audit/output/league25-production-20260923/review/{wigan-competitions,punjab-2025,apoel-competitions,eastbengal-2025}.json`.

Candidatos exatos extraídos dos participantes, nunca inferidos por posição ou nome aproximado:

- `audit/output/leagues34-20260923/leagueone-teams2025.json`: 61, parâmetros 41/2025.
- `audit/output/leagues34-20260923/round04/teams-188-2025.json`: 941.
- `audit/output/leagues34-20260923/round04/teams-323-2025.json`: 3466, 21137, 26963.
- `audit/output/leagues34-20260923/round05/teams-128-2025.json`: 450, 441, 1065.
- `audit/output/leagues34-20260923/round05/teams-307-2025.json`: 2932.
- `audit/output/leagues34-20260923/round05/teams-318-2025.json`: 2247.

Páginas EA exatas consultadas em 25/09 (identidade atual, não fonte de temporada 2025):

- [Wigan 1917](https://www.ea.com/games/ea-sports-fc/ratings/teams-ratings/wigan-athletic/1917).
- [Punjab 115202](https://www.ea.com/games/ea-sports-fc/ratings/teams-ratings/punjab-fc/115202).
- [Al Hilal 605](https://www.ea.com/games/ea-sports-fc/ratings/teams-ratings/al-hilal/605).
- [Central Coast 111396](https://www.ea.com/games/ea-sports-fc/ratings/teams-ratings/central-coast/111396).
- [Estudiantes 101083](https://www.ea.com/games/ea-sports-fc/ratings/teams-ratings/estudiantes/101083).
- [Unión 111716](https://www.ea.com/games/ea-sports-fc/ratings/teams-ratings/union/111716).
- [Central Córdoba 112965](https://www.ea.com/games/ea-sports-fc/ratings/teams-ratings/central-cordoba/112965).
- [APOEL 100135, página FC26](https://www.ea.com/zh-hans/games/ea-sports-fc/ratings/teams-ratings/apoel-fc/100135).
- [Hyderabad 113301](https://www.ea.com/games/ea-sports-fc/ratings/teams-ratings/hyderabad-fc/113301).

Fontes complementares:

- [Punjab, história publicada pelo próprio clube em 18/10/2023](https://rgpunjabfc.com/isl-2023-24-punjab-fc-a-club-reminiscent-of-jct-mills-hopes-to-create-its-own-brand/): diferencia seleção estadual/Santosh de clube profissional e confirma os nomes históricos.
- [ISL, entrada do Punjab em 2023/24](https://www.indiansuperleague.com/press-releases/indian-super-league-welcomes-punjab-fc-as-its-12th-club).
- [LPF, Central Córdoba](https://www.ligaprofesional.ar/clubes/central-cordoba/): estádio, cidade, ano de fundação.
- [APOEL, identidade institucional](https://apoelfc.com.cy/article/taytotita) e [estádio GSP](https://www.apoelfc.com.cy/article/stadio-gsp-0); [CFA, sorteio 2025/26](https://www.cfa.com.cy/En/news/51350).
- [ISL, East Bengal](https://www.indiansuperleague.com/clubs/1102-sc-east-bengal-profile) e [clubes/estádios oficiais](https://www.indiansuperleague.com/clubs).
- [ISL, calendário 2024/25](https://www.indiansuperleague.com/static-assets/pdfs/ISLFixtures2024-25.pdf?v=100.65): Hyderabad/GMC Balayogi.
- [SC Delhi, apresentação institucional](https://www.scdelhi.in/our-club): versão atual, não usada para renomear EA Hyderabad.

## Controles para a execução coordenada

As sete correções e a normalização APOEL exigem estado/versões esperados, ocupação livre do ID alvo em Club e Registry, preservação de `Club.id`, EA, liga e conjunto exato dos jogadores. Bloquear identidade antiga, revogar/bloquear entrega de seu asset sem apagá-los; retirar tupla antiga da allowlist. Nova identidade/escudo só após auditoria dos bytes e confirmação do novo `Club.apiFootballId`, pelo writer transacional, com recibo e leitura independente. Falha de cadastro do novo escudo deixa fallback e histórico intactos; reversão segura não restaura ID comprovadamente errado.

Nenhum candidato de imagem foi baixado por esta subauditoria. A decisão técnica de identidade não aprova automaticamente o escudo atual do endpoint, especialmente Punjab (nome legado) e casos com marca temporal. East Bengal e Hyderabad não devem sofrer mudança apenas para eliminar a divergência de participantes. A autorização operacional do proprietário já registrada continua separada de licença de marca e de prova de identidade.

## Complemento: oito imagens auditadas em 25/09, 15:50 UTC

Após a auditoria de identidade acima, foram executados oito GETs de imagem sem retry, todos HTTP 200, `image/png`, PNG 150×150. Nenhuma chamada autenticada API-Football. Uma tentativa inicial de abrir conexão foi negada pelo sandbox (`EACCES`) antes de qualquer resposta HTTP; intento preservado, execução seguinte explicitamente escalada. Não houve retry de resposta HTTP. Arquivos originais, intents, metadados e manifesto: `audit/output/suspect-crests-20260925/`. Cada original foi inspecionado visualmente.

| API | Bytes | SHA-256 | Decisão visual |
|---|---:|---|---|
| 61 | 41257 | `7a74016ec1ecf3cac0234389dcb7cb68c95e1df509bd045d07c85a0d2744f5ba` | VERIFIED: Wigan Athletic, árvore, círculo azul/branco e 1932 |
| 3466 | 8284 | `1dfa7d003fabdaace250d397be5b5d2b5b0c994eb9e836a6bc18a55ee37b5da4` | **REVIEW temporal**: inscrição ROUNDGLASS PUNJAB FC. Identidade 3466 comprovada, mas não publicar esta arte como marca atual de Punjab FC sem evidência temporal |
| 2932 | 9808 | `f3e8c8f3257aee302f9e329b5a0bdf13de6d3e01d15efe58734ea907d5f20b4d` | VERIFIED: monograma azul Al Hilal; contraste exige conferência do componente real, preferivelmente apoio claro sem alterar bytes |
| 941 | 36621 | `20e4bfd234828ace095b96b399005680794230fc3f39b3d69df4469a2c6e4218` | VERIFIED: Central Coast Mariners, onda/bola azul e amarela |
| 450 | 10243 | `be95865f56bdbe8714f32e4fe6dd2d06268e547760c981b044269e08dc869f7c` | VERIFIED: Estudiantes, escudo vermelho/branco E de LP |
| 441 | 18787 | `f05360cfc3cd26232144b02b779fb3b5a43d49c0f32ff4cee143483fe69566d8` | VERIFIED: Unión, escudo vermelho/branco CAU |
| 1065 | 90381 | `03e5a3016fdd46ac33a91c14aa737719b79be071590fa2b3f500e7443cbbc1ec` | VERIFIED: Central Córdoba, escudo listrado preto/branco e monograma central |
| 2247 | 10555 | `7c49ba4329e9eb39c22d0538a3a3b40bee43f3952b4627553c2b7e025654c0db` | VERIFIED: APOEL azul/amarelo e duas estrelas |

URLs exatas: `https://media.api-sports.io/football/teams/{ID}.png`, com ID da linha; nenhuma variante ou redirecionamento utilizado. Os sete VERIFIED são decisões técnicas para preparação, não recibos de cadastro ou licença. Punjab deve ter a associação corrigida sem reaproveitar automaticamente a marca RoundGlass; fallback é seguro enquanto se fecha uma fonte atual. O site oficial fornece referência de marca em `https://rgpunjabfc.com/wp-content/uploads/website-logo-3.svg`, ainda não auditada em bytes nem habilitada como fonte do Registry.

### Punjab: candidata oficial atual fechada em separado

Às 15:54:01Z, um único GET à URL exata `https://rgpunjabfc.com/wp-content/uploads/website-logo-3.svg` retornou HTTP 200, `image/svg+xml`, 14442 bytes, SHA-256 `9913f9994757e5af31302428699afa8bd28c2d489ebc0b3d83ba2894b17bd472`. O link foi extraído do rodapé da página oficial de história do clube acima; não é associação de domínio por suposição. SVG com `viewBox="0 0 182.7 163.3"`, paths/grupos/polygon e duas classes de preenchimento. Inspeção por rasterização local exclusivamente para QA mostra tigre laranja e inscrição PUNJAB FC branca, distinta da arte RoundGlass do API 3466. Original preservado em `punjab-official.svg`; preview não é asset publicado. Marca atual do site em 25/09/2026, sem afirmação retroativa de que o mesmo arquivo existia em 2025.

Candidata tecnicamente identificada; ainda exige entrega SVG fechada, hash/URL exatos, provider oficial próprio (não api-football), liberação individual e testes antes de cadastro. Contraste no fundo escuro é favorável; verificar tamanhos 24/32/72/96 no componente. O histórico bloqueado de 7179 deve permanecer, sem reaparecer por mudança de fonte e sem veto indevido ao novo provider para a identidade corrigida. Total deste complemento: nove GETs de imagens (oito API-Sports e um SVG oficial); zero API autenticada.

East Bengal/Hyderabad: cache disponível contém respostas de identidade e estado/hash do Registry, mas nenhum arquivo original `3463.png`/`7763.png` foi localizado. Portanto a manutenção da identidade foi decidida por evidência institucional/temporal; **não declarar nova inspeção visual desses dois escudos nesta subauditoria** sem obter os bytes correspondentes. Isso é lacuna visual, não prova de identidade incorreta.

### East Bengal e Hyderabad: verificação visual posterior e divergência de hash

Dois GETs adicionais autorizados, um por ID, sem retry, concluídos às 15:55:59Z/15:56:00Z. Ambos HTTP 200, PNG 150×150. East Bengal 3463: 41758 bytes, SHA-256 `d0a7a16385d2c59cd2efb86b50c81badf28bc44c659a65a19dac49cdcab72261`; círculo vermelho/amarelo EAST BENGAL FC, tocha central. Hyderabad 7763: 90381 bytes, SHA-256 `07e81411225ac0188c698d1458bc7b3514b3adcf9dadfb5ad28fa95cf7d2a084`; escudo amarelo/preto HYDERABAD FC. Visual compatível com as identidades mantidas, incluindo a versão histórica Hyderabad, não SC Delhi.

**Os hashes diferem do Registry arquivado.** East Bengal asset `cmuczcswz0003xguc6trpxmge` v1 registra `568e64f4cbf215fb472545de92ef8915df25baa7409ebe81a0d5ae481aaad193`; Hyderabad asset `cmuczdxup0001kguct8fz48zj` v1 registra `37a0a42ec301c0996f6a9467894ee22cc233329d7057f9f7f86583561bb025ec`. Sem os originais antigos não se conclui se houve recompressão ou mudança visual. Não sobrescrever hash nem afirmar igualdade: reconciliar o estado vivo e, se aplicável, atualizar versionadamente pelo writer preservando histórico. Identidade correta e consistência do hash são gates separados. Total final desta subauditoria: onze GETs de imagens (dez API-Sports e um SVG oficial), zero chamadas autenticadas API-Football, zero escrita no banco.

### Execução posterior confirmada

As sete associações erradas foram corrigidas e APOEL normalizado ao ID canônico por operações individuais com precondições transacionais e leitura independente. Oito identidades/escudos antigos ficaram BLOCKED e REVOKED/DISPLAY_BLOCKED, preservados. East Bengal e Hyderabad mantiveram seus IDs; o writer criou assets v2 e preservou os anteriores como STALE. Punjab recebeu exclusivamente o SVG oficial atual, não a arte RoundGlass do endpoint API-Football. EA, liga e jogadores permaneceram iguais. Recibos individuais em `audit/output/club-resolution-20260925/`; execução e confirmação pública em [remaining-images-operational-execution-20260925.md](remaining-images-operational-execution-20260925.md). As ressalvas acima descrevem a fase anterior de auditoria, não pendências atuais desses dez clubes.
