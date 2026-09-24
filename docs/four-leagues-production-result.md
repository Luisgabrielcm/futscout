# Quatro logos — resultado em Production

Database ID `rknsog8tmbl5u4xqbogxfux5`, conexão direct obtida no Console com pooling Off e mantida em memória. Sem uso do `.env`, staging, migration, alteração de Vercel, commit, push ou deploy. Execução concluída em 24/09/2026 UTC (23/09/2026 America/Cuiaba).

Autorização: [decisão específica](four-leagues-operational-authorization.md), referência `owner-decision:four-independent-league-logos-2026-09-23`. Todos mantêm REVIEW_REQUIRED, storageUrl=null, OWNER_AUTHORIZED_REMOTE_USE, DISPLAY_ALLOWED e revocable=true. Não é licença de marca.

## Preflight e preservação

20 migrations concluídas, checksums locais idênticos, nenhuma pendente, índice parcial de histórico bloqueado e unicidade de asset ativo presentes. Os quatro League.id, URLs e hashes correspondem ao relatório auditado e ao manifesto local `audit/output/four-leagues-manifest.json`. Identidade da competição verificada por ID exato, país/tipo/divisão/temporada e evidências independentes das divergências de clubes. Não se usou League.externalId como ID do provedor.

Antes da operação, 611 identidades e 611 assets iguais ao snapshot independente posterior ao Red Star; nenhuma identidade local/externa conflitante nas quatro ligas. Club/League/Player comparados por hash de linhas completas, não só contagem. Antes de cada transação: estado protegido/Registry reconferido, arquivo remoto requisitado uma vez (quatro HTTP 200 no total), assinatura PNG e SHA-256 idênticos aos autorizados. O writer existente fez uma transação Serializable por liga, com estado esperado vazio; nenhuma repetição automática.

| Liga / API | Identity ID | Asset ID | Resultado |
| --- | --- | --- | --- |
| LALIGA HYPERMOTION / 141 | cmuevroi80000foucjalu2nfr | cmuevron30001foucd7hqu2zh | COMMITTED / INDEPENDENT_READ_CONFIRMED |
| EFL League One / 41 | cmuevs1go0002foucvvefcwjl | cmuevs1kv0003foucw2yt3jof | COMMITTED / INDEPENDENT_READ_CONFIRMED |
| 3. Liga / 80 | cmuevsgbt0004foucwm6m63ld | cmuevsgft0005fouctdxoytip | COMMITTED / INDEPENDENT_READ_CONFIRMED |
| LPF / 128 | cmuevsv1n0006fouccg6a8rfp | cmuevsv5k0007foucfnmbex0b | COMMITTED / INDEPENDENT_READ_CONFIRMED |

Cada nova identidade é VERIFIED/v1 e cada asset ACTIVE/v1. Todos os campos operacionais foram comparados com o candidato na leitura independente após cada commit. Os 611 registros anteriores de identidade, incluindo seus assets completos, permaneceram iguais; total após a operação: 615 identidades e 615 assets. O histórico Red Star 4396 bloqueado/revogado e o novo 104 foram preservados.

| Dados protegidos | Quantidade antes/depois | MD5 agregado antes = depois |
| --- | --- | --- |
| Club | 582 | 5edcd3ec9b4ba7d655bb8f74dda7ba95 |
| League | 45 | d6abf94b92514885587f60b7645d5ec2 |
| Player | 16228 | 9a93e18ad061587e3b36b7d85d2d0bea |

Nenhum ID ou escudo dos participantes foi alterado. Os mesmos 25 vínculos do Red Star também foram comparados. A-League, Brack Super League, ISL, Liga Cyprus e ROSHN Saudi League permanecem fora da allowlist e sem cadastro.

## Cobertura e interface

Reader: **36/45 → 40/45**. Confirmação final em `2026-09-24T01:57:14.290Z`. Interface pública `https://futscout.vercel.app/pt/ligas`: quatro URLs exatas 80/41/141/128 carregadas com complete=true e naturalWidth>0. Paginação completa: 21 imagens na página 1 e 19 na página 2, todas carregadas; os cinco fallbacks correspondem às cinco revisões visuais. Nenhum deploy foi necessário.

## Recibos e validação

Diretório ignorado pelo Git: `audit/output/four-leagues-production-20260924/`. Contém `connection-provenance.json` sem segredo, `preflight.json`, `image-ID.intent.json`, `image-ID.json`, `write-ID.pending.json`, `write-ID.writer.json`, `write-ID.receipt.json`, quatro checkpoints e `final-coverage.json`. IDs: 141, 41, 80, 128. Marcadores preservados e recibos publicados por arquivo temporário/rename; não repetir escrita a partir de marcador. Conexão encerrada após confirmação.

54 testes pertinentes, TypeScript, lint geral e `git diff --check` passaram. Teste novo fixa as quatro entradas exatas, exclui as cinco em revisão e exercita o writer sem retry. Allowlist ganhou somente quatro entradas; contagem: 574 clubes + 40 ligas. Código de writer/reader não foi alterado. Artefatos operacionais locais não contêm credenciais.

Investigação posterior das cinco fontes oficiais: [relatório separado](five-leagues-current-branding-review.md). Nenhuma dessas imagens foi publicada.
