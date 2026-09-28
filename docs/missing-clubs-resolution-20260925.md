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

## Bayer Leverkusen — alias de rota verificado (2026-09-25)

O preflight READ ONLY confirmou que o slug legado `bayer-leverkusen` pertence
ao placeholder EA `mock-bayer-leverkusen`, sem jogadores, enquanto o registro
populado tem EA `externalId=32`, API-Football `apiFootballId=168` e 26 jogadores.
O serviço de detalhe resolve o slug legado ao registro populado somente quando
EA ID, API ID e Bundesliga coincidem exatamente; mantém a URL legada e usa o
`Club.id` populado para o elenco. Nenhuma relação ou histórico foi movido.

O sync EA de clubes agora procura primeiro por `Club.externalId` da EA, usa
cache separado por essa identidade e bloqueia um slug ocupado por outra
identidade. O ID 168 permanece exclusivamente `apiFootballId`; ele nunca é
interpretado como ID EA. Nenhuma escrita no banco foi necessária para esta
correção de alias.

## Fechamento Bayer / GK / TypeScript — 2026-09-28

### Código local e validação Bayer

Base de revisão: branch `beta-next`, HEAD `14db9f0`. As correções desta seção
continuam no diff local; não foram commitadas, publicadas ou implantadas nesta
revisão. O conteúdo anterior sobre escudos/reservas foi preservado.

O teste de integração local com Prisma mockado executa `getClubBySlug` e
`getClubRoster`: `bayer-leverkusen` resolve ao Club populado de identidade EA
`32` / API-Football `168`, mantém a URL legada e consulta seus 26 jogadores pelo
ID interno. Os testes também rejeitam identidades/liga divergentes e colisões
de slug, e verificam o vínculo `Player.clubId` no sync. A contagem real de 26
vem do preflight READ ONLY já documentado acima, não de nova consulta em
2026-09-28. O teste mockado não é apresentado como novo smoke HTTP/Production.

O layout utiliza `LayoutProps<"/[locale]">` e o getter `locale()` de
`next/root-params`, conforme a documentação instalada do Next.js 16.3.4
(`next-root-params.md`). Não houve edição de tipos gerados ou supressão de erros.

### GK já persistido em Production

Resultado operacional de 2026-09-27 reutilizado nesta revisão, sem nova
sincronização nem auditoria completa do banco:

| Indicador | Resultado confirmado |
|---|---|
| Cobertura GK | 1.816 / 1.816 goleiros primários |
| Lotes | 37, incluindo o primeiro; no máximo 50 goleiros por transação |
| Criações | 50 no primeiro lote + 1.766 na retomada |
| UPDATE / NO_OP / INVALID / CONFLICT na retomada | 0 / 0 / 0 / 0 |
| Falhas / retries na execução concluída | 0 / 0 |
| Cursor GK | 16.228, `completed` |
| Checkpoints EA / posições | 16.228, `completed`, preservados |
| Observações de catálogo | 325 antes do primeiro lote; 330 após ele; 484 ao final |
| Observações de jogador | 16.228 antes do primeiro lote; 16.278 após ele; 18.044 ao final |

Os cinco atributos, hashes e vínculos de origem foram conferidos em leitura.
Player, Club, League, atributos de linha, PlayStyles, Current Club V1/V2,
TransferObservations e Brand Assets permaneceram intactos na auditoria
operacional. Não foi criado GK Speed nem reinterpretado PAC.

O writer local preserva `Serializable`, timeout de 30 segundos, CAS, leitura e
criação em lote, provenance, read-back e cursor atômico, rollback e zero retries.
`AUDIT_FAILED`/`AUDIT_MISMATCH` após commit mantêm `COMMIT_CONFIRMED`, quantidade
e IDs de provenance; o runner continua encerrando com erro, sem repetir o lote.
Commit realmente desconhecido permanece `COMMIT_INDETERMINATE`.

Tempos de transação são separados das auditorias; incluem espera para iniciar a
transação. O overhead não medido não é interpretado como tempo isolado de commit.
Nos 35 recibos completos disponíveis da retomada, as transações duraram
1,95–5,09 segundos. O lote **27 da retomada** teve a saída original truncada:
seus 50 registros e a provenance foram reconciliados em READ ONLY, mas o tempo
original não foi recuperado. Também faltam trechos dos planos originais dos
lotes 16, 19, 24 e 28; isso não foi ocultado nem reconstruído como payload EA.

Evidências operacionais externas ao repositório: `gk-first50-confirmed-20260927.json`,
`gk-remaining-20260927-summary.json`, recibos por lote e
`gk-remaining-20260927-batch-27-reconciliation.json`. Não incluir esses artefatos
no commit. O manifesto local `audit/gk-first-batch-transcribed-20260927.json`
contém apenas IDs transcritos do histórico, não payload/CAS aprovado; também
fica fora da proposta de commit, preservado no disco.

### Gates do fechamento

Sem novas consultas operacionais à EA/API-Football ou ao banco. Os comandos
usam placeholders locais de CI para as conexões e `SITE_URL=https://example.invalid`,
somente no ambiente dos processos; nenhum arquivo `.env` foi alterado.

- Suíte completa, conforme CI, `npm test -- --test-concurrency=1`: 1.638 casos,
  1.626 PASS, 4 FAIL e 8 SSR skipped, em 185,96 s. As quatro falhas eram mocks
  ausentes de `next/root-params` nos testes de layout, não falhas do writer GK.
- Correção restrita aos mocks de `i18n.test.ts` e `productionConfig.test.ts`:
  reexecução dos dois arquivos, 33 PASS / 0 FAIL, em 7,19 s. Os demais testes,
  incluindo Bayer/sync/GK, passaram na execução completa e seu código não mudou
  depois dela. Essa evidência é reutilizada; não se declara uma segunda execução
  completa inexistente. Os oito testes SSR dependem de servidor HTTP e permanecem
  skipped nesta revisão sem smoke Production.
- `npx next typegen`: PASS.
- `npx tsc --noEmit`: PASS.
- `git diff --check`: PASS; avisos de conversão LF/CRLF não são erros de diff.
- `npm run lint`: PASS, sem erros ou warnings.
- `npm run build`: PASS, com `Collecting page data using 2 workers`, 5/5 páginas
  estáticas geradas e otimização concluída; sem OOM, erros ou warnings. Sem
  alterar `next.config.ts`. Nesta
  instalação, `config-shared.js` calcula o default de `experimental.cpus` como
  `CIRCLE_NODE_TOTAL - 1`; foi usado `CIRCLE_NODE_TOTAL=3` apenas no processo.
  Esse mecanismo foi conferido no código instalado, não presumido como API
  pública estável. Não houve aumento de heap ou supressão de TypeScript.

### Proposta de commit (não executada)

Mensagem sugerida: `fix: resolve Bayer identity and harden goalkeeper sync`.
Lista explícita de arquivos da etapa:

```text
app/[locale]/layout.tsx
docs/missing-clubs-resolution-20260925.md
services/clubIdentityAliases.ts
services/clubService.ts
services/eaGoalkeeperAttributesSync.ts
services/prismaEaGoalkeeperAttributesSyncStore.ts
services/syncPlayers.ts
sync/runEAGoalkeeperAttributesSync.ts
tests/unit/lib/i18n.test.ts
tests/unit/lib/productionConfig.test.ts
tests/unit/services/clubIdentityAliases.test.ts
tests/unit/services/clubExperienceServices.test.ts
tests/unit/services/currentClubCompatibility.test.ts
tests/unit/services/directoryServices.test.ts
tests/unit/services/eaGoalkeeperAttributesSync.test.ts
tests/unit/services/eaSemanticSyncPersistence.test.ts
```

Os ajustes dos três testes de catálogo/Current Club são adaptações de mocks à
nova dependência de identidade; não representam outro trabalho de produto.
Os dois novos arquivos de código/teste de alias foram revisados. Nenhum segredo,
credencial real ou recibo temporário pertence à lista proposta. O manifesto
operacional não rastreado é preservado e explicitamente excluído; não usar
`git add .`. Aprovação de commit ainda é necessária.
