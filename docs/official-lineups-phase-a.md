# Official lineups — Lote 7.4 / Fase A

Registro histórico da Fase A. A preparação de schema, adapters e capability evoluiu na [Fase B](official-lineups-phase-b.md); consultar esse documento para o contrato final. Os resultados da auditoria read-only abaixo permanecem preservados.

Status: implementação independente e mockada; **schema, adapter PostgreSQL e piloto pendentes de autorização**. Sem commit, migration, escrita no banco ou chamadas operacionais. A página continua no fallback até existir store aprovado. A ausência de store NÃO indica que uma consulta ao banco encontrou zero lineups: a feature está explicitamente desativada no código.

## Auditoria (11/09/2026)

Baseline beta-next `38b109d`, clean. Nenhuma entidade fixture/lineup no schema ou nas tabelas public consultadas. `PlayerRealLifeStat.lineups` é contagem agregada, não titularidade por partida. Transação PostgreSQL REPEATABLE READ / READ ONLY, conferida com `SHOW transaction_read_only`, encerrada com ROLLBACK.

| Clube | club.id | apiFootballId | Elenco | Player.apiFootballId presente |
|---|---|---:|---:|---:|
| FC Barcelona | cmt94sq79001l5guc4g4zj7y3 | 529 | 23 | 9 |
| Manchester City | cmt94sibe001a5guc60z2rphl | 50 | 26 | 7 |
| Real Madrid | cmt7hnsah0004z0ucqy6yoeqz | 541 | 26 | 8 |

Caches de roster: season 2024, respectivamente 56/66/62 jogadores, fetchedAt 02/09/2026 e expiresAt 09/09/2026, já vencidos. Não são fonte de titulares. Não foram atualizados.

Infraestrutura existente: `/teams` em resolveApiFootballClub; `/players` em getApiFootballTeamPlayers com paginação e memória → PostgreSQL → API / TTL 7 dias; cacheOnly interrompe antes de fetch. apiFootballErrors centraliza HTTP 429 e payloads de quota. Batch possui fail-stop/cache-only/stopOnFirstError. Attempts têm retries 7/14/30/30/1 dias; matched não volta à fila. databaseRetry trata falhas transitórias de DB; SyncError possui persistência própria. Não há cliente fixtures/lineups nem budget global reutilizável; os fetches atuais são locais aos serviços. Nada disso foi reescrito. Não executar matcher para resolver titulares: usar identidades persistidas.

## Contrato da fonte

Referências públicas consultadas, sem API key:

- [Documentação v3](https://www.api-football.com/documentation-v3#tag/Fixtures/operation/get-fixtures-lineups)
- [Guia oficial: fixtures/lineups](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide)
- [Grid oficial](https://www.api-football.com/news/post/players-positions-on-the-grid)

O endpoint `/fixtures/lineups?fixture=ID&team=ID` registra XI e banco da partida, não uma previsão. Formation e grid têm cobertura variável. Grid `linha:coluna` começa pelo goleiro, colunas da esquerda para a direita. Disponibilidade varia por competição; contrato documentado não comprova acesso/cobertura da conta atual, que só poderá ser verificada no piloto autorizado.

Campos consumidos: fixture.id/date/status.short; teams.home/away.id/name; league.id/name; lineup.team.id, formation, startXI/substitutes[].player.id/name/number/pos/grid. Não consumimos URLs, coach, cores ou metadados de autenticação. Não inferimos placar/estádio. Nomes próprios preservados. JSON do parser não guarda headers/chaves.

## Seleção e budget (decisão conservadora para o piloto)

- Futuro runner: um clube, Barcelona, uma execução serial sem concorrência.
- Uma requisição `/fixtures?team=529&last=5&timezone=UTC`. Validar resposta; filtrar somente FT/AET/PEN, clube correto, data passada, janela de 90 dias. Outros estados ficam fora desta beta.
- Ordenar data desc / fixture ID desc; deduplicar; consultar no máximo 3 fixtures no endpoint lineups. Máximo **4 requests totais**, sem paginação extra/retry.
- Cada callback do seletor representa exatamente uma requisição; o adapter futuro deverá impor timeout 15s, sem retries internos, e contabilizar cada fetch antes do envio. Nenhum adapter HTTP/runner foi criado nesta fase.
- Primeira lineup válida vence: 11 titulares, IDs positivos quando presentes, nomes não vazios, equipe correta, sem ID duplicado entre XI/banco. Arrays parciais são rejeitados, nunca completados por OVR.
- HTTP 429 / quota em errors/message usa erro compartilhado; erro genérico/JSON inválido também interrompe. Resposta válida sem lineup permite recuo limitado. Nenhuma attempt, SyncState ou SyncError é escrita na Fase A.
- Runner futuro deve reutilizar registerSyncError com contexto sanitizado para falha operacional comum; não registrar match attempt nem erro genérico de jogador em quota. Isso ainda não foi implementado.

## Leitura, associação e UI

`officialLineupService` é server-only e recebe store de leitura injetável; sem store retorna null sem banco/rede. Revalida clube, fixture, timestamp e payload. Uma consulta de snapshots + uma consulta agrupada por IDs (incluindo jogadores que possam ter mudado de clube); não N+1. Adapter futuro deve filtrar provider/club/90 dias e limitar a 20 snapshots ordenados por fixtureDate, fetchedAt. Erros de DB não disparam busca HTTP.

Associação exclusiva por Player.apiFootballId único. Nenhum match por nome ou gravação automática. ID inexistente/ambíguo resulta em nome da fonte, imagem neutra, sem link e sem métricas inventadas. EA externalId não é modificado. OVR é o atual do catálogo, não rating da partida; potencial/valor preservam null/zero.

XI oficial substitui visualmente o FutScout XI sem executar o motor OVR. Grid válido tem prioridade. Sem grid, formation + categorias G/D/M/F só posicionam quando a distribuição em três linhas de campo é inequívoca. Caso contrário, os 11 são mostrados em lista visual na ordem da fonte, com aviso de posicionamento indisponível; não fingimos uma formação. Formation ausente fica `—` mesmo se grid permitir posicionar. Banco é apenas substitutes; null/vazio exibe indisponibilidade, não o restante do elenco.

Painel completo permanece independente, sem marcadores “XI FutScout” quando há oficial. PT/EN usam labels próprios. Mobile herda uma coluna: contexto/campo → banco da partida → elenco → informações. Fallback Lote 7.3 continua intacto. Data é exibida em UTC explicitamente. Acima de 30 dias a lineup tem aviso stale; acima de 90 não é elegível e volta ao fallback. fetchedAt recente não disfarça idade da partida. Política proposta é configurável em futura revisão, sem limpeza automática do histórico.

## Schema gate — proposta, NÃO aplicada

Uma entidade append-only por revisão da escalação de um clube numa fixture. JSONs explicitamente versionados preservam campos da fonte e permitem reprocessar sem HTTP. Não reutilizar roster cache ou SyncError.payload como banco de lineups.

```prisma
model ClubOfficialLineupSnapshot {
  id                String   @id @default(cuid())
  provider          String
  fixtureExternalId Int
  apiTeamId         Int
  clubId            String
  club              Club     @relation(fields: [clubId], references: [id], onDelete: Restrict)
  fixtureDate       DateTime
  competitionId     Int
  competitionName   String
  opponentId        Int
  opponentName      String
  isHome            Boolean
  formation         String?
  fixture           Json
  lineup            Json
  payloadVersion    Int      @default(1)
  contentHash       String
  fetchedAt         DateTime
  createdAt         DateTime @default(now())

  @@unique([provider, fixtureExternalId, apiTeamId, fetchedAt])
  @@index([clubId, provider, fixtureDate(sort: Desc), fetchedAt(sort: Desc)])
  @@index([provider, fixtureExternalId])
}
```

Adicionar relação inversa `Club.officialLineupSnapshots ClubOfficialLineupSnapshot[]`. `fixture` contém contexto home/away/status/league; `lineup` contém item team/formation/startXI/substitutes com IDs/pos/grid/number e nomes, sem segredos. Hash SHA-256 sobre campos canônicos versionados para auditoria. Cada captura gera revisão, nunca sobrescrita cega. Retry da mesma gravação reutiliza o fetchedAt original; a unicidade impede duplicar essa captura. Não impor unicidade por hash: a fonte pode corrigir A→B→A e a última captura de A deve continuar sendo a atual. A última revisão válida tem prioridade; histórico de partidas permanece. Validar correspondência clubId↔apiTeamId numa transação antes da inserção; nunca atualizar Club/Player nesse fluxo. Uma única tabela mantém rollback/impacto pequenos; estatísticas históricas derivadas ficam para depois.

Impacto: tabela/índices novos, cliente regenerado e adapter de leitura novo; nenhuma transformação de jogadores existentes. Sem backfill automático. Antes de aplicar: revisar SQL aditivo, backup e validate/generate sob autorização própria. Rollback operacional: desativar store e voltar ao fallback mantendo tabela/dados. Não DROP automático; remoção estrutural exige autorização e exportação prévia. Não modificar IDs para desfazer piloto.

## Próxima autorização

### Validação da Fase A

- 26 testes novos; suíte completa: 426 testes, 418 PASS, 0 FAIL, 8 skips conhecidos de SSR 404.
- TypeScript, lint (0 erros/0 warnings), build com URLs fictícias de banco e diff check aprovados.
- npm test exigiu execução fora do sandbox por ENOMEM do os.userInfo/tsx; nenhum patch ambiental aplicado.
- Smoke local sintético PT/EN a 390px: 11 titulares, 1 reserva da fonte, 12 no elenco, sem overflow; sequência campo → banco → elenco → informações confirmada. Sem chamadas de banco/API; servidor encerrado. Não é homologação de dados reais ou Preview remoto.
- Busca no JS público do build sem ocorrências de API_FOOTBALL_KEY, domínio operacional da API ou seletor operacional. As dependências públicas novas não importam HTTP/env/Prisma. Nenhuma alegação de auditoria universal de segredos: checagem restrita ao diff e à fronteira deste lote.

Autorizar separadamente schema/migration aditiva e adapter de leitura/persistência. Depois revisar runner para **1 clube / até 4 requests / write apenas de snapshot validado**, com before/after read-only e fail-stop. Execução operacional exige autorização posterior e específica. Não iniciar Barcelona/City/Real em lote, não commit/push/deploy nesta fase.
