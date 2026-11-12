# HTTP 500 do Preview: causa e correção focada

Fonte da reprodução: SHA `ae4f42d67e3035f186fecad464fe1def8a06f6f3`.
Deployment removido: `dpl_DPNZtiYn7PnQ4Kko3mLhfBb1dqbV`.

## Evidência

O log histórico Vercel de 12/11/2026 às 22:38:31.442 UTC registra GET
`/pt/jogadores/gustavo-gomez-218191` com
`PREVIEW_READ_ONLY_CONTROL_SQL_DENIED`, originado em `executeRaw` do adapter.
A consulta histórica foi somente leitura e não recriou o deployment.

A rota HTTP completa foi reproduzida localmente no mesmo código, com clone
PostgreSQL descartável, quatro identidades/evidências do piloto e economia
sintética. O transporte do teste permite exclusivamente o banco local e não
recebe credenciais de Production. O diagnóstico temporário capturou a instrução
rejeitada: `SET TRANSACTION READ ONLY`, em uma transação já protegida. O resultado
antes da correção foi HTTP 500; depois, em um novo processo, HTTP 200.

O filtro genérico proibia qualquer SET, incluindo essa reafirmação defensiva.
Não houve falha de TCP/TLS, autenticação do banco nem corrupção de dados. A
validação anterior dos serviços isolados não cobria esse caminho HTTP adicional.

## Mudança

Aceitar exclusivamente `SET TRANSACTION READ ONLY` sem argumentos, por
executeRaw de uma transação protegida ainda aberta. Variações de caixa/espaços
e ponto e vírgula final são equivalentes. O comando é encaminhado ao PostgreSQL
na mesma conexão; a proteção inicial continua aplicada antes de qualquer query.

Não permitir no adapter raiz, queryRaw, transação fechada, SQL composto,
comentários anexados, argumentos inesperados, READ WRITE, SET de sessão ou
set_config. As demais proibições e o rollback/cleanup permanecem intactos.
Não há alteração em Prisma schema, URLs compartilhadas, quatro IDs/hashes,
flags padrão, configuração de deploy, vínculos ou valores econômicos.

## Validação focada

- 18 testes de adapter, helper de rollback, política e configuração Prisma.
- Integração local com a reafirmação READ ONLY, helper com rollback obrigatório,
  transações concorrentes e testes negativos INSERT/UPDATE/DELETE. O controle
  PostgreSQL nativo continua rejeitando as três operações com SQLSTATE 25006.
- Smoke HTTP real: oito páginas do piloto (EA e Vida real) mais dois controles
  legados, todos HTTP 200. O caso que falhava permanece como regressão unitária
  e no runner PostgreSQL `scripts/validateClubContextReadOnly.mts`.
- Hashes de todas as tabelas dos fixtures iguais antes/depois. Valores sintéticos
  não representam os salários/contratos reais dos jogadores.
- TypeScript, lint dos arquivos afetados e git diff --check.

Recibos ignorados: `audit/output/preview-500-local/` e
`audit/output/club-contexts-readonly-runtime/`. Logs históricos sanitizados no
worktree de preparação anterior: `audit/output/preview-500-diagnosis/`.
O diagnóstico temporário de SQL foi removido do código versionado. Reiniciar
o processo local ao alterar o adapter, pois o hot reload reutiliza PrismaClient.

Nenhum novo deploy, acesso ao banco Production ou alteração remota foi feito
nesta correção. O código precisa de revisão/integração antes de outra tentativa
autorizada de Preview protegido; o deployment removido não foi restaurado.
