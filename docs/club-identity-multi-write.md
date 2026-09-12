# Lote 9 — Fase D: preparação multi-player, zero writes reais

## Contrato

- `maxAutoWrites` aceita inteiros de 1 a 5. Zero, fração, negativo e 6+ abortam.
- O dry-run conserva todas as classificações. Se houver 6 AUTO_MATCH para limite
  5, não há summary/token/plano autorizável; nunca escolher os primeiros cinco.
- Summary v1 preserva clube, team, season, pins, prazo, inputHash, limite e lista
  exata/ordenada com playerId, slug, providerId, confidence, margin e updatedAt.
- Uma transação Serializable por Player, sequencial, sem retry. O adapter e o
  corpo transacional existentes são reutilizados sem nova implementação.
- Falha conhecida no terceiro: commits 1/2 preservados, 3 rollback, 4/5 não
  iniciados. Commit indeterminado não implica rollback: parar e auditar em leitura.
- Conflito, divergência de versão/conjunto ou auditoria interrompem o lote.
- Somente AUTO_MATCH entra na autorização. REVIEW, REVIEW_STALE_CLUB e
  UNRESOLVED são skip; ALREADY_MATCHED é no-op. Matcher/thresholds não mudaram.
- Auditoria permite apenas apiFootballId + updatedAt dos commits confirmados e
  seus novos attempts matched. Demais Players/Attempts e sete tabelas: idênticos.
- Após commit, o token antigo não autoriza o estado novo. Novo dry-run/envelope
  registra ALREADY_MATCHED e pode resultar em no-op, sem duplicar attempts.

## Limite operacional da CLI

O adapter genérico é testado para até cinco; isso não concede autorização para
operá-lo. `--write` e `--preflight` continuam limitados ao piloto fechado
Eric/Barcelona com max=1. City/Real aceitam somente `--dry-run`, season=2026,
com snapshots existentes pinados. Não existe fallback de API/season nem refresh.

Com cache 2026 válido, os comandos de leitura preparados são:

```sh
npx tsx scripts/runClubPlayerIdentityPipeline.ts --dry-run --club manchester-city --season 2026
npx tsx scripts/runClubPlayerIdentityPipeline.ts --dry-run --club real-madrid --season 2026
```

Não executados na Fase D: a inspeção de caches anterior aos comandos detectou
ausência de roster 2026. `VALID_ROSTER_REQUIRED` no código é um bloqueio, não
licença para usar 2024. Classificação operacional: **NEEDS_FRESH_ROSTER**.

## Auditoria real READ ONLY — 12/09/2026

Baseline: 16.228 Players, 82 associados, 81 Attempts; Barcelona 17/23 (73,91%).
Eric/619 e os sete writes anteriores continuam intactos; Joan null/sem attempt.
O dry-run Barcelona de regressão confirmou 14 ALREADY_MATCHED, 0 AUTO_MATCH,
7 REVIEW, 6 UNRESOLVED e 0 CONFLICT. Eric está ALREADY_MATCHED e Joan REVIEW.
Auditoria final: hashes das nove tabelas idênticos ao BEFORE; zero writes em
Player, Attempt, cache ou snapshot e zero chamadas operacionais às APIs.

| Clube | Team | Total local | Associados | Sem ID | Cobertura | Cache 2026 |
|---|---:|---:|---:|---:|---:|---|
| Manchester City | 50 | 26 | 7 | 19 | 26,92% | Ausente |
| Real Madrid | 541 | 26 | 8 | 18 | 30,77% | Ausente |

Só existem caches 2024, vencidos em 09/09/2026: City 66 registros, Real 62.
Não foram usados para matching. TOTAL provider 2026, categorias, candidatos e
cobertura projetada são **indisponíveis**, não zero, para ambos os clubes.

Snapshots existentes, sem alteração:

- City: fixture 1635654, 4-2-3-1, payloadVersion 1;
  `c2ff883579915265a7338de7073a019b5e8dcc91212d95eff62459f54977acd0`.
- Real: fixture 1635714, 4-3-3, payloadVersion 1;
  `dc266789f05d7a96eb27d87e192862abbece5cc0503a2423a5a2e2d52d9a0562`.

Snapshot é evidência auxiliar; participação não é obrigatória, mas divergência
de nome/identidade continua bloqueando auto-match. Sem roster atual, não há
corroboração de candidatos nova a apresentar.

## Próxima decisão

Próximo clube pronto para write: **NENHUM**. É necessária autorização separada
para obter roster 2026, seguida de dry-run completo, revisão dos AUTO_MATCH e
habilitação operacional específica do clube escolhido. City pode ser priorizado
na investigação pela menor cobertura, mas isso não prova qualidade de matching.

Não há base para autorizar cinco clubes por lote ainda. Primeiro validar City e
Real com evidência fresca e pilotos controlados, depois revisar um lote de clubes
com budgets e auditorias próprios. Não processar liga inteira.

## Evidência dos testes

Fakes copy-on-write exercitam o callback Serializable real: sucesso 1/2/3/4/5,
falha de attempt 1/3/5, commit indeterminado 1/3/5 com e sem commit no servidor,
conflito intermediário, updatedAt no quarto, lista adicionada/removida/reordenada,
preservação de deltas e rejeição de mudança fora do escopo. A suíte existente
preserva Eric/Joan, stale club e critérios do matcher. Nenhum teste usa banco/API.

Isso valida o contrato, não mede desempenho, contenção ou taxa real de matches
em cinco jogadores. O timeout transacional existente continua em 15 segundos.
