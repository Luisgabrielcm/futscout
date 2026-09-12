# Lote 9, Fase A — identidade automática por clube (DRY_RUN)

> Registro da arquitetura da Fase A. A Fase B adicionou o adapter guardado e
> substituiu a política de truncamento por rejeição de excesso. Consulte
> [o contrato operacional vigente](club-identity-auto-write.md). O core abaixo
> continua DRY_RUN; somente um novo dispatcher explicitamente autorizado pode
> chamar o adapter de escrita. Nenhum write real foi executado na Fase B.

Esta fase entrega classificação e planejamento, não um executor de escrita.
`AUTO_WRITE` é rejeitado antes de abrir transação; o executável não importa o
adapter atômico, resolver, sync ou serviço de roster HTTP. Nenhum token dos
pilotos anteriores autoriza uma execução deste pipeline.

## Arquitetura e operação

```text
CLI fechado para Barcelona/beta-next
  → configuração tipada e pins revisados
  → PostgreSQL RepeatableRead + SET TRANSACTION READ ONLY
  → hashes BEFORE + cache válido + catálogo/owners/attempts em bulk + snapshot
  → core puro: Player local × roster inteiro, ranking e classificação
  → relatório + fila de revisão + summary v1 + plano futuro DESABILITADO
  → hashes AFTER + confirmação de invariância
```

Comando operacional desta fase, somente quando houver autorização para leitura:

```sh
npx tsx scripts/runClubPlayerIdentityPipeline.ts --dry-run --club fc-barcelona --season 2026
```

O runner registra HEAD e estado Git, permite árvore suja para validar esta
implementação antes do commit e rejeita outra branch, clube, temporada ou modo.
Usa `DIRECT_URL` exclusivamente nesta operação administrativa local, sem imprimir
credenciais. O runtime público continua inalterado. Bloqueia `fetch` antes de
carregar o client e não disponibiliza nenhum dependency de escrita ao core.

`ClubIdentityConfig` vincula clubId, slug, apiFootballTeamId, season, mode,
cache (TTL/pin), snapshot (presença obrigatória, participação, pin opcionais),
writePolicy e budgets. IDs do Barcelona ficam apenas no arquivo de pilot config.
City e Real são exercitados exclusivamente com fixtures/fakes.

## Leituras e limites

- Uma seleção agregada de Club detecta também duplicidade de team ID.
- Uma leitura do cache e uma consulta parametrizada calculam seu hash de linha.
- Um `player.findMany` carrega os Players do clube, donos globais dos provider IDs
  e candidatos com as mesmas datas de nascimento (intervalos de dia UTC). Club e
  Attempt são relações selecionadas em bulk; não há consulta por provider no loop.
- Uma seleção pega o snapshot mais recente do clube. Snapshot inválido não é
  contornado escolhendo silenciosamente uma versão anterior.
- Uma contagem de associados e nove hashes integrais BEFORE/AFTER completam a
  auditoria. São consultas constantes por execução, não N+1; os hashes integrais
  têm custo proporcional ao banco e deverão ser reavaliados antes de escala maior.

Budgets iniciais: 200 provider players, 2.000 Players relevantes, TTL máximo de
7 dias, summary recente por até 15 minutos. Exceder orçamento, cache vazio,
expirado, duplicado, incompatível, de outro clube/season ou com hash alterado
interrompe sem refresh. Não se faz matching global: owners/candidatos externos
são evidência de conflito/stale club para o roster do clube selecionado.

## Classificação e evidências

O core reutiliza `evaluateCandidate` e
`evaluateApiFootballPlayerCandidateRanking`, sem alterar pesos, normalização,
thresholds ou margem. Preserva o sentido Player local → roster completo para
não esconder o segundo provider candidato ao inverter a busca. Aplica também
os gates conservadores do piloto: posição, identidade local do clube, rival
local/global com mesmo nascimento e nome >=80, e ausência de segundo MATCH FORTE.

O score histórico de clube do evaluator pode ser positivo por encontrar o team ID
nas estatísticas do roster, mesmo quando o Player pertence a outro clube local.
Por isso a verificação explícita de `clubId` e `Club.apiFootballId` é indispensável:
score 100 NÃO supera `REVIEW_STALE_CLUB`.

| Categoria | Tratamento nesta fase / planejamento futuro |
| --- | --- |
| ALREADY_MATCHED | Associação coerente, no-op; nunca cria ou repara Attempt |
| AUTO_MATCH | Todos os gates passaram, apenas candidato no relatório |
| REVIEW | Evidência ambígua, stale club, posição/lineup ou attempt pendente; skip |
| UNRESOLVED | Sem evidência local suficiente; nenhum Player é inventado |
| CONFLICT | ID ocupado/contraditório, owners duplicados ou estado inconsistente; stop |

Uma coincidência fraca de token no clube não oculta um candidato externo forte
com mesmo nascimento: este é exibido como stale club e continua não gravável.
Scores fracos permanecem disponíveis em `localTop1/localTop2` para auditoria.
Joan não tem exceção por ID/nome: o bloqueio é a mesma regra de candidatos rivais
aplicada a qualquer identidade.

Snapshot é auxiliar. Participar da última partida não é requisito global.
Quando presente, o snapshot é decodificado/validado; nome contraditório para o
mesmo provider ID veta AUTO_MATCH. `requireParticipation` pode estreitar um piloto,
mas é false aqui. Um `expectedHash` explícito exige o snapshot pinado mesmo com
`required=false`: ausência não pode apagar evidência previamente vinculada.

Associações legadas sem Attempt são no-op com motivo explícito, não reparo
automático. Attempt contraditório é conflito. Para Player sem ID, qualquer
Attempt existente leva a revisão (ou conflito se matched); retry não é executado
mesmo quando vencido. A política do sync antigo permanece intocada.

O relatório tem uma linha por provider com identidade candidata, ID/slug/clube,
nome, nascimento, nacionalidade, posição, confidence, top1/top2/margin, rivais,
cache/lineup, decisão e motivo. `counts` usa o denominador do roster;
`localAssociations` e `coverage` usam o catálogo local. Um associado ausente do
roster continua no inventário local, mas não se inventa uma linha de provider.

## ClubIdentityAuthorizationSummary v1

O resumo contém versão/escopo, clube/slug/team/season, instante UTC, validade,
cacheRowHash, snapshotHash ou null, inputHash e política. A lista AUTO_MATCH é
ordenada pelo provider ID e inclui playerId, slug, providerId, confidence,
margin e expectedUpdatedAt (UTC, milissegundos). Objetos do summary têm campos
construídos explicitamente, inclusive a política; JSON UTF-8 → SHA-256.

`candidateListHash` vincula a ordem e conteúdo da lista; `summaryHash` vincula
todo o resumo. `inputHash` inclui catálogo relevante e estado de attempts, além
dos hashes da evidência. Mesmos inputs/instante geram o mesmo resultado; reordenar
a lista autorizada ou alterar um campo protegido muda o hash. Validade é o menor
prazo entre expiração do cache e generatedAt + maxDryRunAgeMs.

O hash não é segredo, permissão nem token aceito pelo CLI. Não há verificador de
autorização de write conectado nesta fase. Um futuro executor deverá validar
versão, prazo e autorização explícita, reler/recalcular o conjunto e comparar a
evidência ANTES da primeira escrita. Não comparar ingenuamente um novo
generatedAt com o anterior: o envelope autorizado e sua validade devem ser
preservados, enquanto o estado protegido é revalidado.

## Escrita futura — somente desenho e simulação

`planClubIdentityAutoWrite` produz NO_OP, SKIP, STOP, ATOMIC_CANDIDATE ou
DEFER_BUDGET. `writeEnabled` é sempre false. `maxAutoWrites=10` limita candidatos,
não autoriza dez gravações. Conflito no preflight bloqueia todo o plano.

A persistência existente `persistPlayerApiFootballMatchAtomically` continua
fechada aos dois pilotos autorizados anteriores. Não pode receber candidatos
genéricos apenas trocando IDs: sua política e seus pins são específicos. Uma
fase separada deverá parametrizar o contrato de autorização com revisão e testes,
reutilizando os invariantes transacionais existentes, sem ampliar os tokens antigos.

Contrato esperado para essa fase futura:

1. Releitura e autorização recente do conjunto; zero API, zero retry.
2. Uma transação Serializable por Player; releitura da identidade completa,
   owner global e Attempt; comparação de expectedUpdatedAt, cache e snapshot.
3. Update condicional de apiFootballId null + updatedAt esperado e criação de
   Attempt matched na mesma transação; @updatedAt é efeito esperado autorizado.
4. NO_OP nos já associados, SKIP em classificação não-auto. Se candidato
   anteriormente autorizado deixar de ser auto por alteração de estado, STOP
   para nova revisão, não reautorização silenciosa.
5. STOP em conflito inesperado, falha de Attempt, concurrent modification,
   schema/state mismatch, audit mismatch ou INDETERMINATE_COMMIT. Preservar
   commits anteriores; jamais retry automático ou compensação destrutiva.
6. Resultado indeterminado NÃO prova rollback: auditar o jogador atual antes
   de qualquer tentativa futura. Recalcular estado esperado do próprio lote
   após cada commit sem reutilizar cegamente o inputHash anterior.

Os testes de simulação usam apenas fakes em memória, consomem o resultado real
do core/plano e modelam o loop futuro. Não executam Prisma, não provam locks de
PostgreSQL e não tornam a escrita operacionalmente disponível.

## Validação

Testes unitários exercitam as cinco categorias, stale club, owners/attempts
inconsistentes, ambiguity/Joan, os sete pares preservados, cache/pins/TTL,
ranking integral, optional lineup, City/Real fakes, hashes/order, budgets,
READ ONLY e ausência de N+1. Gates: npm test, tsc, lint, build, prisma validate
e diff check. Os gates usam placeholders, nunca credenciais reais.

Uma auditoria READ ONLY RepeatableRead demonstra invariância dentro de seu
snapshot e impossibilidade de writes por aquela transação; não afirma que
nenhum outro cliente poderia escrever concorrentemente. O relatório operacional
deve comparar também a baseline anterior independente e informar o instante.
