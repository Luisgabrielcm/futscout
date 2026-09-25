# Oito clubes sem escudo — resolução técnica

Auditoria em 25/09/2026. Nenhuma escrita no banco executada por esta etapa. A autorização operacional ampla do proprietário já cobre imagens comprovadas; não constitui licença. Novos assets exigem `REVIEW_REQUIRED`, `storageUrl=null`, decisão auditável e revogação individual.

## Três reservas comprovados

| Club.id / nome | EA / API | Evidência de identidade | Imagem exata / SHA-256 |
|---|---|---|---|
| `cmtaomvzv05wbtwucnpukho0o` / Real Sociedad B | 110711 / 9585 | EA identifica a equipe B na LALIGA HYPERMOTION; API exata Espanha, Zubieta, Donostia. Cache de participantes 141/2025 identifica 9585 | `https://media.api-sports.io/football/teams/9585.png` / `f23143f4d64b151bc64280ed191d938393692a464d8856faf56dad6d917b81e5` |
| `cmtar6hia00o2dcuc2062khh9` / TSG Hoffenheim II | 110685 / 9364 | EA equipe II; API exata Alemanha, Dietmar-Hopp-Stadion, Sinsheim; participantes 80/2025 | `https://media.api-sports.io/football/teams/9364.png` / `11ff4b825b60218e6d5f9e12d29df75451b59ab3cd036f4465bae23cbe5426d4` |
| `cmtaroykv01tsdcucom3yilwa` / VfB Stuttgart II | 110697 / 12867 | EA equipe II; API exata Alemanha, Robert-Schlienz-Stadion, Stuttgart; participantes 80/2025 | `https://media.api-sports.io/football/teams/12867.png` / `30784bb6fa46d807fe6da8654a44b53ae5508d77781377e74d19f9c4f9784259` |

Fontes EA reabertas por ID exato: [Real Sociedad B](https://www.ea.com/games/ea-sports-fc/ratings/teams-ratings/real-sociedad-b/110711), [TSG Hoffenheim II](https://www.ea.com/games/ea-sports-fc/ratings/teams-ratings/tsg-hoffenheim-ii/110685), [VfB Stuttgart II](https://www.ea.com/games/ea-sports-fc/ratings/teams-ratings/vfb-stuttgart-ii/110697). As páginas atuais FC27 confirmam identidade; a temporada 2025 vem da evidência arquivada e não foi inferida da edição atual da EA.

Reutilizados `audit/output/coverage-20260923/team-{9585,9364,12867}.json` e evidências de participantes da auditoria das 34 ligas. Zero novas chamadas autenticadas à API-Football. Foram feitas exatamente três requisições HTTP de imagem, uma por URL, sem retry HTTP: 200 `image/png`, PNG 150×150, respectivamente 15.167, 23.376 e 31.649 bytes. A primeira execução em sandbox foi bloqueada por EACCES antes de qualquer HTTP; a execução autorizada fora do sandbox realizou os três GETs. Recibos e bytes em `audit/output/missing-crests-20260925/{id}.{json,png}`.

Participantes exatos conferidos nos arquivos `audit/output/leagues34-20260923/laliga2-teams2025.json` (`teams?league=141&season=2025`, hash de resposta `064f2bf3085bf171e75c93f3c3d2d730e1fae5d18fdfc49771b289bf1945991a`) e `audit/output/leagues34-20260923/round04/teams-80-2025.json` (`teams?league=80&season=2025`, hash de resposta `4a5370c83605425cd55a3474a8dfc7c7df678886a7ddaf4104380eb968778c52`). Nenhuma associação foi feita apenas pela semelhança de nome.

Inspeção visual dos bytes arquivados: Real Sociedad apresenta bola, coroa e bandeira azul/branca; TSG apresenta escudo azul/branco com TSG 1899 Hoffenheim; VfB apresenta vermelho/branco, 1893 e três galhadas pretas em faixa dourada. Corresponde à marca do clube empregada pelo provedor para a reserva exata, sem substituir identidade da reserva pela equipe principal. Decisão técnica: **VERIFIED**, condicionada ao preflight novo de ocupação de IDs e de vínculos antes de associar/cadastrar. Associação deve partir de `apiFootballId=null`, conservar EA, League.id e conjunto exato de jogadores, uma transação por vez e leitura independente.

## Cinco representações genéricas

| Club.id | Nome / razão |
|---|---|
| `cmt7qsels0001ugucswpzr3dd` | Bayer Leverkusen: externalId `mock-bayer-leverkusen` é placeholder, não identidade EA comprovada |
| `cmt987wb8005fxoucc0gdugcc` | Lombardia FC / EA 131682: alias fictício, não atribuir automaticamente marca de Inter |
| `cmt998lop00ajt4ucd1plg0j2` | Milano FC / EA 131681: alias fictício, não atribuir automaticamente marca de Milan |
| `cmt99mt09002quguc7ndm8llq` | Latium / EA 115841: alias fictício, não atribuir automaticamente marca de Lazio |
| `cmt99obde005vuguc7mu6u702` | Bergamo Calcio / EA 115845: alias fictício, não atribuir automaticamente marca de Atalanta |

`ClubBadge` conserva o ícone neutro existente e identifica o fallback em PT/EN pelo nome do clube e “representação genérica — escudo oficial indisponível”, tanto no texto acessível quanto no título exibido ao apontar. `data-generic-crest` permite distinguir o estado na confirmação pública. A identificação também vale após falha da imagem; um escudo disponível mantém sua apresentação normal. Nenhum asset genérico é cadastrado no Registry nem contado como escudo oficial. Nenhum desenho imita uma marca fictícia ou real.

Cobertura esperada se as três transações e exibição forem confirmadas: 574→577 escudos elegíveis, com cinco representações genéricas separadas. Isso não resolve automaticamente as dez associações suspeitas, cuja revisão é independente.

Execução posterior concluída: os três reservas foram cadastrados por operações individuais, com leitura independente, preservando EA, liga e jogadores. As três páginas e imagens públicas retornaram HTTP 200; os cinco casos genéricos apresentam identificação explícita e nenhum escudo oficial. Evidência `audit/output/public-missing-clubs-confirmation-20260925.json`; resultado consolidado em [remaining-images-operational-execution-20260925.md](remaining-images-operational-execution-20260925.md).
