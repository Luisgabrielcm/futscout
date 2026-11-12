# Reconciliação do histórico Prisma

Dois arquivos originais já aplicados em Production foram recuperados do workspace,
sem edição, renomeação, recriação ou reaplicação do SQL:

| Migration | SHA-256 do arquivo e do recibo de Production |
|---|---|
| `20261102000000_wage_strategy_a_release` | `db8aa7720d814a45f0fa152bb8d4186220554515d30454155e7f6e4842d257a1` |
| `20261104000000_wage_reference_classification` | `2daadc8fc09df703a61170cc175af169bceb94ed575ea9485e4c6d4c345df88c` |

As regras específicas em `.gitattributes` preservam os bytes em qualquer checkout;
os testes focados fixam os checksums já registrados. Nenhuma mudança em schema,
runtime, leitores, dados ou scripts de build/deploy faz parte desta recuperação.

A verificação usa o endpoint direto de Production com
`default_transaction_read_only=on` e consulta apenas identidade técnica e histórico
de migrations. `prisma migrate status` deve indicar somente
`20261112001000_club_contexts` como pendente, sem migrations aplicadas ausentes no
repositório ou migrations falhas. Seu exit code 1 é esperado enquanto houver essa
pendência; não representa autorização para aplicá-la.

Não executar novamente os dois SQL recuperados nem usar `migrate resolve`: os recibos
já existem e permanecem intactos. A futura aplicação de Club Contexts continua
dependendo de autorização separada e do [runbook](./club-contexts-migration.md).
Leitores continuam desativados, sem correções automáticas ou operação em Production.

Resultado READ ONLY de 12/11/2026: **HISTORY_RECONCILED**. São 31 migrations
aplicadas e 32 versionadas; nenhuma aplicada ausente localmente, nenhuma falha e
somente `20261112001000_club_contexts` pendente. Os checksums dos dois arquivos e
dos blobs no índice Git conferem com os recibos. `prisma migrate status` retornou
exit code 1 exclusivamente pela migration pendente, sem divergência de histórico.
Nenhuma migration foi reaplicada e nenhum recibo/dado de Production foi alterado.
