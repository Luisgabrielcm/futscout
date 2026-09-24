# Red Star FC — execução do escudo 104

Resultado: **COMMITTED / INDEPENDENT_READ_CONFIRMED**, em `2026-09-24T00:53:15.974Z` (23/09/2026 em America/Cuiaba). Database ID Production: `rknsog8tmbl5u4xqbogxfux5`. Uma transação pelo writer existente, sem retry. Conexão direct confirmada no Prisma Console para esse ID, mantida somente em memória; nenhuma conexão do `.env` foi usada.

Decisão: `owner-decision:red-star-104-remote-crest-2026-09-23`, documentada em [autorização operacional](red-star-104-operational-authorization.md). Exibição remota sob risco operacional, não licença de marca.

## Preflight e imagem

As 20 migrations estavam concluídas, incluindo `20260923170000_brand_identity_blocked_history`, com checksums conferidos e índice de unicidade parcial vigente. Snapshot comparado à confirmação independente da migration: mesmos dados protegidos e mesmos 610 registros de identidade e asset. Provider 104 e posição local não bloqueada estavam livres. Clube `cmt9g1wkq037v1sucum6ntyxn`, EA `111273`, apiFootballId `104`, Ligue 2 `cmt9ekar7005c1suckjql1hd7` e os mesmos 25 IDs de jogadores confirmados antes, dentro da transação e após o commit.

Uma requisição de auditoria, sem retry, a `https://media.api-sports.io/football/teams/104.png`: HTTP 200, image/png, PNG 150 × 150, 25.381 bytes, em `2026-09-24T00:44:26.968Z`. SHA-256: `b73f17d20d59d3bf0bb060afdd572b82f3e297a1910038657750ddfc4159f2f7`, idêntico ao auditado. Inspeção visual: anel verde RED STAR FC, estrela vermelha e 1897. O carregamento posterior pelo site público é uma verificação de exibição separada.

## Registros confirmados

| Registro | Antes | Depois |
| --- | --- | --- |
| Identidade 104 | Ausente | `cmuetiqmf0000r4ucmswo4tao`, VERIFIED, versão 1 |
| Escudo 104 | Ausente | `cmuetiqqu0001r4ucib8nrkwf`, ACTIVE, versão 1 |
| Identidade 4396 | `cmuczcaug0000dcuc8nlf6dn5`, BLOCKED, versão 2 | Integralmente preservada |
| Escudo 4396 | `cmuczcaz60001dcucwvus8unq`, REVOKED / DISPLAY_BLOCKED, versão 2; lifecycle ACTIVE | Integralmente preservado, sem elegibilidade de exibição |

O novo asset mantém `rightsStatus=REVIEW_REQUIRED`, `storageUrl=null`, `displayPolicy=DISPLAY_ALLOWED`, `operationalDecision=OWNER_AUTHORIZED_REMOTE_USE` e `revocable=true`. Timestamp de autorização: `2026-09-24T00:53:06.531Z`.

| Tabela / cobertura | Antes | Depois |
| --- | ---: | ---: |
| Club | 582 | 582 |
| League | 45 | 45 |
| Player | 16.228 | 16.228 |
| BrandAssetIdentity | 610 | 611 |
| BrandAsset | 610 | 611 |
| Escudos elegíveis pelo reader | 573/582 | 574/582 |
| Logos de liga elegíveis | 36/45 | 36/45 |

Hashes MD5 agregados de linhas completas, ordenados deterministicamente, permanecem iguais: Club `5edcd3ec9b4ba7d655bb8f74dda7ba95`; League `d6abf94b92514885587f60b7645d5ec2`; Player `9a93e18ad061587e3b36b7d85d2d0bea`. Identidades: `88839c1d0d2efbdf5993a738752f5186` → `4ea2dc70b92e97f5c0afeea572022314`. Assets: `4695c61babead7b653292647cb52b54f` → `2f18e06389cc21e006556a17b1b4850f`. Excluída somente a nova identidade e seu asset, todos os registros anteriores foram comparados integralmente e permaneceram iguais. Histórico de migrations, índices, constraints, triggers e colunas inalterados.

## Confirmação pública e recibos

Em `https://futscout.vercel.app/pt/clubes/red-star-fc`, o navegador confirmou a imagem otimizada com origem `teams/104.png`, carregada (`complete=true`, naturalWidth/naturalHeight 75 × 75), sem imagem 4396 no DOM. Inspeção visual confirmou o escudo correto. A página mostra Ligue 2 BKT e 25 jogadores; foram encontrados 25 links distintos de jogadores. A preservação dos mesmos vínculos foi comprovada pelos IDs no banco, não apenas pela contagem da página.

Recibos e snapshots, com acesso restrito e fora do repositório:

`C:/Users/Antonio/AppData/Local/FutScoutBackups/production-20260923-recovery/red-star-104/`

Arquivos: `connection-provenance.json`, `before.json`, `image.pending.json`, `image.json`, `104.png`, `preflight.json`, `write.pending.json`, `writer-result.json`, `after.json`, `receipt.json`. O marcador de tentativa foi preservado; o recibo final foi publicado por arquivo temporário e rename. Nenhum segredo foi incluído.

## Validação e escopo

- 53 testes passaram: writer, histórico bloqueado, reader e migrations; incluem sucesso e rollback de 104, preservação de 4396, conflitos e ausência de retry.
- `npx tsc --noEmit`: passou.
- `git diff --check`: passou.
- `npm run lint`: falhou com 106 erros e 4 avisos nos helpers operacionais ignorados em `audit/output`, incluindo o executor desta operação. `npx eslint . --ignore-pattern "audit/output/**"`: passou. Não foram alteradas regras para ocultar esses resultados.
- Allowlist: somente a identidade exata 104 foi adicionada; 4396 permanece proibido. Testes e autorização atualizados, mais este relatório. As nove ligas REVIEW não foram alteradas.
- Nenhuma migration, alteração de Vercel, commit, push ou deploy nesta operação.

## Revisão final e diagnóstico do lint

A revisão posterior reproduziu 106 erros e quatro avisos, todos em dez helpers locais de operações concluídas, ignorados por `/audit/output/` no Git. Nenhum era código versionado. ESLint não usa `.gitignore` como exclusão automática: esses executores temporários permaneciam dentro da árvore examinada pelo lint geral.

| Caminho relativo a audit/output | Diagnóstico |
| --- | --- |
| brand-history-production-20260923/guard.cjs | 3 `no-require-imports`, linha 1, colunas 10/29/47 |
| brand-history-production-20260923-readonly-investigation/guard.cjs | 3 `no-require-imports`, linha 1, colunas 10/29/47 |
| brand-history-recovery-receipt.cjs | 3 `no-require-imports`, linha 1, colunas 10/36/66 |
| brand-history-production-20260923/production-isolated.config.ts | `import/no-anonymous-default-export`, 1:1 |
| brand-history-production-20260923-readonly-investigation/production-isolated.config.ts | `import/no-anonymous-default-export`, 1:1 |
| brand-history-production-final.ts | 21 `no-explicit-any`, linhas 35 e 54–59 |
| brand-history-production.ts | 21 `no-explicit-any`, linhas 30 e 49–54; `no-unused-vars` para deploy, 53:16 |
| brand-history-recovery.ts | 23 `no-explicit-any`, linhas 31, 50–55 e 62; `no-unused-vars` para rootCertificates, 7:9 |
| prisma-recovery-test.ts | 10 `no-explicit-any`, linhas 25–26, 29 e 48 |
| red-star-104-production.ts | 22 `no-explicit-any`, linhas 20, 22–25, 27, 29 e 31–32 |

Correção mínima: arquivamento dos dez executores concluídos, sem modificar seus bytes, em `C:/Users/Antonio/AppData/Local/FutScoutBackups/red-star-104-lint-archive-20260924/`, com acesso restrito. `manifest.json` contém cada caminho original e de arquivo, SHA-256 conferido após a movimentação e todas as mensagens com linha/coluna exatas. Cópia local do manifesto: `audit/output/red-star-lint-archive-manifest.json`; diagnóstico original: `audit/output/red-star-lint-diagnostic.json`. Os scripts arquivados são evidência histórica, não comandos prontos para reexecução: imports relativos dependiam do checkout original. Nenhum recibo, snapshot ou imagem foi apagado ou movido; nenhuma regra ESLint, ignore ou configuração de aplicação foi alterada.

Após o arquivamento: `npm run lint` geral passou, sem exclusão adicional; os 53 testes pertinentes passaram novamente; `npx tsc --noEmit` e `git diff --check` passaram. O diff final contém somente allowlist, testes, autorização e este relatório do Red Star. Commit autorizado separadamente nesta revisão; nenhum push ou deploy.
