# Lote 7.4 — Fase B: schema/adapters preparados

Esta fase preserva e integra o trabalho da [Fase A](official-lineups-phase-a.md). As propostas de schema/capability naquela auditoria são históricas; o contrato final está aqui e em `prisma/schema.prisma`.

**Migration NÃO aplicada. Piloto NÃO executado. Nenhum PostgreSQL real ou endpoint operacional acessado na Fase B.** A tabela não foi criada no banco real por este trabalho. Não foi feita uma nova consulta para verificar alterações de terceiros desde a auditoria A.

## Modelo final

`ClubOfficialLineupSnapshot`: id, clubId, provider, fixtureExternalId, teamExternalId, fixtureDate, formation, revision, payloadVersion, payload, contentHash, fetchedAt, createdAt.

Campos de consulta são escalares. Contexto restante fica num único JSON v1 tipado: fixture (adversário, ordem home/away, competição, status/data), startXI e substitutes com IDs API, nomes, posições, grid e camisa. Não persistimos IDs locais de Player, OVR, potencial ou valor: a identidade histórica não fica amarrada ao catálogo mutável. Sem join table de Player.

`Club.officialLineupSnapshots` é a única relação nova. FK `onDelete: Restrict` impede excluir clube com snapshots; nenhum cascade remove histórico. O seed existente usa upserts e não precisa mudar; não foi executado. Não alteramos relações preexistentes. Futuras rotinas de exclusão devem respeitar a restrição, nunca limpar snapshots implicitamente.

## Unicidade e deduplicação

Decisão: **histórico de mudanças**, não toda consulta nem conjunto global de hashes únicos.

- `@@unique([provider, fixtureExternalId, teamExternalId, revision])`.
- Mesmo conteúdo da última revisão: `duplicate`, sem insert, update ou alteração de fetchedAt.
- Conteúdo diferente e captura posterior: append de revision + 1.
- A→B→A: três revisões; a terceira é uma correção nova, não uma consulta repetida. Unique por contentHash impediria representar essa sequência corretamente sem atualizar timestamps históricos ou criar uma segunda tabela de observações.
- Índice não único provider/fixture/team/contentHash mantém suporte à pesquisa de conteúdo. Índice clubId/fixtureDate DESC/fetchedAt DESC suporta a leitura mais recente.
- Transação SERIALIZABLE e chave de revisão previnem gravações simultâneas na mesma revisão. P2002/P2034 interrompem sem retry; operador reavalia. Não afirmamos execução de concorrência em PostgreSQL real: testes de adapter são fakes.
- Não se permite captura diferente com fetchedAt menor/igual à última. Captura igual deduplica sem alterar a ordem histórica.

## Hash e payload

SHA-256 com ordem de campos explícita: versão, provider, team, fixture/contexto, formação, XI, banco e grids. fetchedAt/timestamps locais não entram. Ordem dos jogadores entra, pois é usada no fallback visual quando falta grid. Reordenação de propriedades de objetos não muda o hash; troca de conteúdo relevante muda. Entrada é revalidada e reconstruída antes de persistir; campos desconhecidos não atravessam a allowlist.

Versão atual 1. Decoder ignora versões desconhecidas, dados corrompidos e divergência entre JSON/hash/colunas. A leitura não ressuscita revisão antiga da mesma fixture se a mais recente for inválida; pode buscar outra fixture válida dentro da janela. Não há limpeza automática de histórico.

## Migration offline

Arquivo: `prisma/migrations/20260911000000_add_official_lineup_snapshots/migration.sql`.

SQL manual aditivo: 1 CREATE TABLE, 1 UNIQUE INDEX, 2 INDEXES e 1 ALTER TABLE da tabela nova para ADD FOREIGN KEY. Sem DML, DROP ou alteração de tabela existente.

Método de equivalência: Prisma `migrate diff --from-empty --to-schema prisma/schema.prisma --script`, com DIRECT_URL fictícia em 127.0.0.1:1. Foram extraídas somente as cinco instruções referentes à nova tabela e comparadas ao SQL preparado, ignorando comentários/whitespace/ordem entre instruções independentes. Resultado: equivalentes. Não houve datasource, shadow database ou SQL executado. validate/generate também usaram URL fictícia.

Isso valida estrutura gerada, não comprova aplicação real, privilégios, locks ou ausência de drift. Essas verificações pertencem à autorização de aplicação. Antes de aplicar, revisar todas as migrations pendentes — não executar deploy às cegas se houver pendências além desta.

## Read repository e capability

`OFFICIAL_LINEUPS_ENABLED=false` por padrão; somente a string `true` ativa. `.env.example` documenta; nenhum .env real foi alterado. Capability off sequer carrega Prisma por esse caminho.

Capability on: verifica apiFootballId atual do clube, lê até 20 snapshots nos últimos 90 dias, prioriza última revisão por fixture, valida versão/hash e resolve todos os IDs numa única consulta ao catálogo. Não há consultas por jogador. Em geral 3 leituras (club, snapshots, players), além das consultas existentes do overview. Datas acima de 30 dias têm aviso stale.

Tabela ausente (P2021) → fallback seguro. Outros erros de DB propagam; não são mascarados e não acionam API/retry de HTTP. Não há gravação de SyncError no request público. O módulo de leitura não importa o repositório de escrita, runner ou fetch guard. Snapshot válido → painel oficial; ausente/off → FutScout XI.

## Write repository

O único método mutante exposto é saveOfficialLineupSnapshot. Revalida lineup/tempo, verifica Club↔team, calcula hash, deduplica última revisão ou cria snapshot novo dentro da transação. Não atualiza Club/Player, não executa matcher, não cria attempts ou erros de sync. Não guarda cópia de métricas atuais do catálogo.

`resolveOfficialLineupPlayers` é puro: ID API único → resolved; ausente → unresolved; múltiplas associações → conflict. Sem busca por nome/fuzzy. UI apresenta conflito como não associado; piloto bloqueia persistência se houver conflito. Unresolved legítimo não é preenchido artificialmente.

## Runner preparado — NÃO executar nesta fase

`scripts/runOfficialLineupBarcelonaPilot.ts`, exigindo a flag exata `--execute-barcelona-official-lineup` antes de carregar env/DB. Futuro comando, **somente após autorização separada**:

```text
npx tsx scripts/runOfficialLineupBarcelonaPilot.ts --execute-barcelona-official-lineup
```

Precheck: tabela acessível antes de HTTP; Barcelona por id/slug e apiFootballId 529. DIRECT_URL para administração local, API_FOOTBALL_KEY exclusivamente no transporte; nunca imprimir valores. Não depende de ativar UI no Preview.

Fluxo: precheck → hashes protegidos → seleção limitada → associação local → hashes novamente → no máximo um save → hashes finais → contagem de snapshots before/after → disconnect. Mesmo em falha/429/conflict, cleanup roda. Nenhum arquivo de relatório é escrito automaticamente: saída sanitizada no terminal. Captura de fixture/lineup real desta fase: zero.

Guard isolado, não monkey-patch global: host HTTPS fixo; somente /fixtures e /fixtures/lineups; equipe fixa; query allowlist sem extras/repetições; fixture conhecida da consulta anterior; redirects bloqueados; timeout 15s; nenhuma repetição do mesmo fixture. Máximo 1 chamada fixtures (last=5, UTC), 3 lineups, 4 globais, contabilizadas antes do fetch. Qualquer violação/erro fecha o transporte; nenhum retry. Não usar o runner em paralelo com sync/administração.

Tabelas protegidas: Player, Club, ApiFootballTeamRosterCache, ApiFootballPlayerMatchAttempt, SyncState, SyncError, PlayerAttributes. Cada auditoria usa transação REPEATABLE READ READ ONLY. Conta linhas e calcula digest MD5 agregado ordenado por id (detecção de alterações operacionais, não assinatura criptográfica adversarial). Nenhuma linha/credencial é impressa, apenas contagens/digests.

Hashes detectam mudanças, não constituem um sistema de privilégios SQL. Alterações concorrentes de terceiros podem causar parada; não são revertidas pelo runner. Se detectadas após commit do snapshot, este pode já existir: exigir auditoria manual e nunca fazer retry cego. A segurança de escrita vem também do único caminho `.create` na tabela de snapshots, ausência de triggers na migration preparada e revisão pré-piloto de permissões/triggers do banco real.

## Rollback e próxima autorização

Rollback funcional: capability false, preservar snapshots, sem DROP/reset. Rollback de migration exige autorização/backup específico. Nenhum reset, alteração de IDs ou seeds para desfazer piloto.

Próximo passo: autorizar aplicação da migration aditiva após preflight de pendências/backup. Aplicar NÃO autoriza executar piloto nem ligar a capability. Só depois: autorização explícita para um piloto Barcelona (máximo 4 requests / uma revisão), auditoria posterior e ativação da leitura em Preview. Não mergear master nem deploy Production.
