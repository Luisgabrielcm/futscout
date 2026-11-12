# Migration de Club Contexts

Preparada a partir de `5a68f7d55314c61ad7e0fafeb9c4a4e03fe1417e` (PR #24).
Migration: `20261112001000_club_contexts`.

## Escopo

O corpo integral de `prisma/club-contexts.candidate.sql` foi preservado, incluindo
constraints, triggers, funções, índices e referências. Somente `BEGIN`/`COMMIT` foram
acrescentados ao redor do SQL para tornar a aplicação transacional. O candidato fica
como referência congelada; aplicar somente a migration pelo histórico Prisma.

São criadas três tabelas vazias: `EaRosterReference`, `PlayerClubContextRevision` e
`PlayerClubContextSelection`. Nenhum backfill, correção de clube, seleção de revisão,
importação, alteração de Player/Club ou ativação de leitor faz parte desta migration.
O build e o postinstall continuam sem executar migrations.

`CLUB_CONTEXTS_READ_ENABLED` permanece ausente/desativada por padrão. A referência
canônica do elenco Career Mode ainda não foi escolhida. Os quatro casos NG - FA,
577 propostas, 184 inéditos, 240 UNVERIFIED, 27 homônimos e 3.040 divergências ficam
fora desta operação.

## Aplicação futura, após autorização específica

1. Confirmar identidade do banco, backup/restauração disponíveis e conexão administrativa
   `DIRECT_URL`; manter a flag de leitura desativada. Não usar credenciais em logs.
2. Executar `npx prisma migrate status`. O único novo pendente esperado é
   `20261112001000_club_contexts`; reconciliar qualquer outro pendente antes de aplicar.
3. Executar `npx prisma migrate deploy` e depois `npx prisma migrate status`.
4. Executar `npx prisma generate`. Confirmar recibo/checksum da migration, três tabelas
   sem registros, 11 constraints, quatro triggers e cinco índices (dois UNIQUE) dessas tabelas.

Não executar o candidato separadamente nem regenerar esta migration apenas pelo diff
do schema: a modelagem Prisma não representa todos os checks e triggers customizados.
O histórico Prisma torna a reaplicação um no-op; o DDL bruto não é rerunnable.
Instalar o schema não autoriza inserir propostas nem habilitar os leitores.

## Rollback operacional

Manter/desabilitar `CLUB_CONTEXTS_READ_ENABLED` e voltar à aplicação anterior se houver
problema. Conservar as tabelas aditivas e os recibos/evidências; o leitor legado não
depende delas. Não há dados preexistentes a reverter, pois a migration não os altera.

Se a primeira aplicação falhar, a transação deve abortar integralmente. Verificar a
ausência dos novos objetos e o estado do recibo antes de usar, sob autorização,
`npx prisma migrate resolve --rolled-back 20261112001000_club_contexts` e reaplicar a
mesma migration corrigindo o impedimento externo. Não marcar como rolled-back uma
migration concluída nem editar o checksum/histórico de uma migration já aplicada.
Qualquer remoção posterior de schema exige uma mudança separada e aprovada.

## Validação focada

`tests/unit/prisma/clubContextsMigration.test.ts` garante equivalência integral com
o candidato validado e ausência de escrita/backfill em tabelas legadas.

`scripts/validateClubContextsMigration.mts` cria banco novo em PostgreSQL descartável
localhost:54339, recusa a identidade conhecida de Production e aplica o histórico
real anterior do repositório. Insere **23.063 fixtures sintéticas** públicas com
potencial, salário, contrato, revisões/heads manuais e estados/observações/currents
econômicos. Aplica a migration versionada, compara hashes de todas as tabelas antigas,
simula uma falha tardia, confirma rollback integral, resolve apenas o recibo falho
no descartável, aplica novamente e compara recibos/checksums e dados. As três novas
tabelas devem permanecer vazias.

Reprodução em PowerShell, com cluster descartável já iniciado:

```powershell
$env:CLUB_CONTEXTS_DISPOSABLE_TEST = '1'
node --import tsx scripts/validateClubContextsMigration.mts
node --import tsx --test tests/unit/prisma/clubContextsMigration.test.ts
```

Resultados locais: `audit/output/club-contexts-migration/result.private.json`.
O teste não lê dados ou credenciais de Production; os valores sintéticos não são
salários/contratos reais dos atletas. A contagem de Production não foi extraída
novamente. A preservação é validada pelo caráter aditivo e pelo ensaio de volume;
nenhuma operação foi executada em Production nesta preparação.

Resultado do ensaio: **MIGRATION_READY**. Histórico anterior de 29 migrations aplicado;
23.063 jogadores sintéticos e 45 tabelas legadas preservados; 11 constraints, quatro
triggers e cinco índices criados; falha induzida revertida integralmente; recuperação
e reaplicação via Prisma aprovadas, com recibos/checksums inalterados no replay e
nenhum registro nas novas tabelas. Testes focados, Prisma, TypeScript e lint aprovados.
