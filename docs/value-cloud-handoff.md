# Value: handoff sanitizado para Cloud

O código local foi publicado seletivamente; o inventário abaixo substitui a pendência anterior de caminhos. O checkout original permanece preservado. A branch mantém os gates Cloud já existentes.

## Escopo

Coleta offline, validação de journals/recibos e preparação de lotes staging, com dependências transitivas de código. Matching e alias de nacionalidade foram relocados para junto do importador sem mudar o comportamento. As quarentenas manuais continuam vinculadas ao jogador, tentativa, hash e referência de aprovação exatos através de configuração local não versionada. As fixtures nominais são sintéticas. Formato e bloqueios: `experiments/futscout-value-global-v01/LOCAL_BINDINGS.md`.

SQLs *.candidate.sql são propostas para revisão, não migrations instaladas. A preparação exige selectCurrent=false. Este PR não promove valores nem autoriza coleta, importação ou alteração de banco.

## Inventário publicado

- experiments/futscout-value-global-v01/README.md
- experiments/futscout-value-global-v01/LOCAL_BINDINGS.md
- experiments/futscout-value-global-v01/local-bindings.ts
- experiments/futscout-value-global-v01/local-bindings.test.ts
- experiments/futscout-value-global-v01/synthetic-bindings.fixture.ts
- experiments/futscout-value-global-v01/assertion.test.ts
- experiments/futscout-value-global-v01/auto-balance-recovery.test.ts
- experiments/futscout-value-global-v01/auto-quarantine.test.ts
- experiments/futscout-value-global-v01/balance.ts
- experiments/futscout-value-global-v01/collect-offline.mts
- experiments/futscout-value-global-v01/diagnostics.test.ts
- experiments/futscout-value-global-v01/diagnostics.ts
- experiments/futscout-value-global-v01/execute.mts
- experiments/futscout-value-global-v01/executor.test.ts
- experiments/futscout-value-global-v01/executor.ts
- experiments/futscout-value-global-v01/final-bindings.test.ts
- experiments/futscout-value-global-v01/fourth-quarantine.test.ts
- experiments/futscout-value-global-v01/generation-binding.ts
- experiments/futscout-value-global-v01/generation-connections.test.mts
- experiments/futscout-value-global-v01/generation-connections.ts
- experiments/futscout-value-global-v01/generation-install.candidate.sql
- experiments/futscout-value-global-v01/generation-writer-role.candidate.sql
- experiments/futscout-value-global-v01/global-lock.ts
- experiments/futscout-value-global-v01/identity-alias.ts
- experiments/futscout-value-global-v01/integration.test.ts
- experiments/futscout-value-global-v01/integration.ts
- experiments/futscout-value-global-v01/matching.cjs
- experiments/futscout-value-global-v01/offline-import-prep.test.ts
- experiments/futscout-value-global-v01/offline-import-prep.ts
- experiments/futscout-value-global-v01/offline.test.ts
- experiments/futscout-value-global-v01/operational.ts
- experiments/futscout-value-global-v01/postgres-gate.ts
- experiments/futscout-value-global-v01/prepare-offline-import.mts
- experiments/futscout-value-global-v01/quarantine-policy.ts
- experiments/futscout-value-global-v01/quarantine.test.ts
- experiments/futscout-value-global-v01/response-v02.ts
- experiments/futscout-value-global-v01/runner.test.ts
- experiments/futscout-value-global-v01/runner.ts
- experiments/futscout-value-global-v01/second-quarantine.test.ts
- experiments/futscout-value-global-v01/stability-v02.test.ts
- experiments/futscout-value-global-v01/third-quarantine.test.ts
- experiments/futscout-value-global-v01/transaction-postgres-test.mts
- experiments/futscout-value-global-v01/transaction-trace.test.ts
- experiments/futscout-value-global-v01/transaction-trace.ts
- tsconfig.json

## Exclusões e validação

Nenhum arquivo audit/output, seleção privada, dataset, resposta real, recibo, journal, checkpoint, backup, .env ou credencial foi incluído. Referências a evidências locais continuam intencionais e falham sem os arquivos exigidos; esses arquivos não são necessários aos testes mockados.

Correção de segurança: 129 testes globais Value aprovados, incluindo vínculos exatos sintéticos, ausência de configuração e retomada/idempotência. Os vínculos operacionais reais saíram da árvore publicada e ficaram somente em configuração ignorada. Com autorização do proprietário, o histórico desta branch foi reconstruído em um único commit sanitizado sobre beta-next; commits antigos não compõem a nova ancestralidade do PR, mas podem continuar acessíveis por referências antigas ou caches do GitHub. Harnesses PostgreSQL descartáveis não foram executados. Não houve acesso a Production, migrations, importações, APIs pagas ou deploy.

Limites: testes mockados não comprovam importação produtiva nem autorizam execução. npm ci reportou 15 vulnerabilidades nas dependências do lockfile existente (14 high e uma critical); versões não foram alteradas neste handoff. O gate test:value existente cobre os quatro arquivos previamente configurados; a suíte global nova foi executada separadamente.
